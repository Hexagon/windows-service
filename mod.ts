const worker = new Worker(new URL("./worker.ts", import.meta.url).href, { type: "module" })

let advapi32: Record<string, any>
let kernel32: Record<string, any>

switch (Deno.build.os) {
  case "windows":
    advapi32 = Deno.dlopen("advapi32.dll", {
      SetServiceStatus: {
        parameters: ["pointer", "pointer"],
        result: "u64",
      },
      RegisterServiceCtrlHandlerExA: {
        parameters: ["buffer", "pointer", "pointer"],
        result: "u64",
      },
    })
    kernel32 = Deno.dlopen("./kernel32.dll", {
      GetLastError: {
        parameters: [],
        result: "u32",
      },
    })
    break
  default:
    throw new Error("Unsupported OS")
}

interface WindowsServiceStatus {
  dwServiceType: number
  dwCurrentState: number
  dwControlsAccepted: number
  dwWin32ExitCode: number
  dwServiceSpecificExitCode: number
  dwCheckPoint: number
  dwWaitHint: number
}

const SERVICE_WIN32_OWN_PROCESS = 0x10
const SERVICE_START_PENDING = 0x00000002
const SERVICE_STOP_PENDING = 0x00000003
const SERVICE_RUNNING = 0x00000004
const SERVICE_STOPPED = 0x00000001
const SERVICE_CONTROL_STOP = 0x00000001
const SERVICE_CONTROL_PAUSE = 0x00000002
const SERVICE_CONTROL_CONTINUE = 0x00000003
const SERVICE_PAUSED = 0x00000007

/**
 * WindowsService class for managing Windows services.
 */
class WindowsService {
  private serviceName: string
  private serviceStatus: WindowsServiceStatus
  private hServiceStatus: bigint | null = null
  private handlerCallback:
    | Deno.UnsafeCallback<{
      parameters: ["u32", "u32", "pointer", "pointer"]
      struct: undefined
      result: "void"
    }>
    | null = null
  private callbackMap: Record<string, () => void> = {}
  private runFn?: () => Promise<void>
  private statusBuffer?: ArrayBuffer
  private waitForResponseSeconds = 10
  private unsafeRefs = new Map()
  private serviceMainStarted = false
  private debugCallback?: (message: string) => void
  private serviceMainCallback?: Deno.UnsafeCallback<{
    parameters: ["u64", "pointer"]
    result: "void"
  }>
  private worker: Worker

  /**
   * Creates a new WindowsService instance.
   *
   * @param serviceName - The name of the Windows service.
   */
  constructor(serviceName: string) {
    this.serviceName = serviceName
    this.serviceStatus = {
      dwServiceType: SERVICE_WIN32_OWN_PROCESS,
      dwCurrentState: SERVICE_START_PENDING,
      dwControlsAccepted: SERVICE_CONTROL_STOP | SERVICE_CONTROL_PAUSE | SERVICE_CONTROL_CONTINUE,
      dwWin32ExitCode: 0,
      dwServiceSpecificExitCode: 0,
      dwCheckPoint: 0,
      dwWaitHint: 0,
    }
    this.worker = new Worker(
      new URL("./worker.ts", import.meta.url).href,
      { type: "module" },
    )
  }

  /**
   * Sets the service status.
   *
   * @param serviceStatus - The service status object.
   * @private
   */
  private setServiceStatus(serviceStatus: WindowsServiceStatus) {
    const statusBuffer = new ArrayBuffer(28)
    const statusView = new DataView(statusBuffer)
    statusView.setUint32(0, serviceStatus.dwServiceType, true)
    statusView.setUint32(4, serviceStatus.dwCurrentState, true)
    statusView.setUint32(8, serviceStatus.dwControlsAccepted, true)
    statusView.setUint32(12, serviceStatus.dwWin32ExitCode, true)
    statusView.setUint32(16, serviceStatus.dwServiceSpecificExitCode, true)
    statusView.setUint32(20, serviceStatus.dwCheckPoint, true)
    statusView.setUint32(24, serviceStatus.dwWaitHint, true)
    this.statusBuffer = statusBuffer
    if (this.hServiceStatus) {
      return advapi32.symbols.SetServiceStatus(
        Deno.UnsafePointer.create(this.hServiceStatus),
        Deno.UnsafePointer.of(this.statusBuffer),
      )
    }
  }

  /**
   * Handles service control events.
   *
   * @param controlCode - The control code received.
   * @param eventType - The event type.
   * @private
   */
  private serviceCtrlHandler(controlCode: number, eventType: number) {
    this.logDebug("serviceCtrlHandler(): " + controlCode)
    if (controlCode === SERVICE_CONTROL_STOP) {
      this.serviceStatus.dwCurrentState = SERVICE_STOP_PENDING
      this.setServiceStatus(this.serviceStatus)
      this.callbackMap["stop"]?.()
    } else if (controlCode === SERVICE_CONTROL_PAUSE) {
      this.serviceStatus.dwCurrentState = SERVICE_PAUSED
      this.setServiceStatus(this.serviceStatus)
      this.callbackMap["pause"]?.()
    } else if (controlCode === SERVICE_CONTROL_CONTINUE) {
      this.serviceStatus.dwCurrentState = SERVICE_RUNNING
      this.setServiceStatus(this.serviceStatus)
      this.callbackMap["continue"]?.()
    }
  }

  /**
   * ServiceMain function called by Service Control Manager (SCM).
   *
   * @param argc - Number of arguments.
   * @param argv - Array of argument strings.
   * @public
   */
  public async ServiceMain(argc: number, argv: string[] | null) {
    this.logDebug("ServiceMain()")

    this.serviceMainStarted = true

    // Call RegisterServiceCtrlHandlerExA
    const handlerCallback = new Deno.UnsafeCallback(
      {
        parameters: ["u32", "u32", "pointer", "pointer"],
        struct: undefined,
        result: "void",
      },
      (
        controlCode: number,
        eventType: number,
        _eventDataPointer: Deno.PointerValue,
        _contextPointer: Deno.PointerValue,
      ) => {
        this.serviceCtrlHandler(controlCode, eventType)
      },
    )
    this.handlerCallback = handlerCallback
    this.hServiceStatus = advapi32.symbols.RegisterServiceCtrlHandlerExA(
      new TextEncoder().encode(this.serviceName),
      this.handlerCallback?.pointer,
      null,
    )
    if (this.hServiceStatus === BigInt(0)) {
      console.error("Failed to register service control handler")
      const error = kernel32.symbols.GetLastError()
      console.error(`Error code: ${error}`)
      this.stop()
    }

    // Set service status
    this.serviceStatus.dwCurrentState = SERVICE_START_PENDING
    this.serviceStatus.dwCheckPoint = 0 // Reset the checkpoint value
    this.setServiceStatus(this.serviceStatus)

    // Set service status
    this.serviceStatus.dwCurrentState = SERVICE_RUNNING
    this.serviceStatus.dwCheckPoint = 0 // Reset the checkpoint value
    this.setServiceStatus(this.serviceStatus)

    // Done, start the requested function
    this.runFn && await this.runFn()

    // Requested function done, stop service and quit
    this.stop()
  }

  /**
   * Main entrypoint for the service.
   *
   * @public
   */
  public async run() {


    // Define serviceMain callback
    const serviceMainCallback = new Deno.UnsafeCallback(
      {
        parameters: ["u64", "pointer"],
        result: "void",
      },
      (argc: number | bigint, argv: Deno.PointerValue) => {
        this.ServiceMain(Number(argc), null)
      },
    )

    // Store a reference to this callback
    this.serviceMainCallback = serviceMainCallback

    // Prepare a ServiceTable for StartServiceCtrlDispatcherA
    // - Make a null terminated version of service name, and encode it
    const serviceName = this.serviceName + "\0"
    const serviceNameEncoded = new TextEncoder().encode(serviceName)
    // - Create a 32 byte arraybuffer to accomodate 2 SERVICE_TABLE_ENTRY, where the last one is nulled
    const serviceTableBuffer = new ArrayBuffer(32)
    const serviceTableView = new DataView(serviceTableBuffer)
    serviceTableView.setBigUint64(0, BigInt(Deno.UnsafePointer.value(Deno.UnsafePointer.of(serviceNameEncoded))), true)
    serviceTableView.setBigUint64(8, BigInt(Deno.UnsafePointer.value(serviceMainCallback.pointer)), true)

    // Store a reference to the service table buffer to prevent GC
    const serviceTablePointerValue = Deno.UnsafePointer.value(Deno.UnsafePointer.of(serviceTableBuffer))
    this.unsafeRefs.set("serviceTableBuffer", serviceTableBuffer)

    // Call StartServiceCtrlDispatcherA through the worker
    worker.postMessage(serviceTablePointerValue)

    // Keep process alive while waiting for an answer
    let timeout = false
    const timeoutTimer = setTimeout(() => {
      timeout = true
    }, this.waitForResponseSeconds * 1000)
    while (!(this.serviceMainStarted || timeout)) {
      // Wait a bit
      await new Promise((r) =>
        setTimeout(() => {
          r(0)
        }, 250)
      )
    }
    clearTimeout(timeoutTimer)

    // Did we get an answer? If not, exit!
    if (!this.serviceMainStarted) {
      this.stop()
    }
  }

  /**
   * Logs a debug message.
   *
   * @param message - The message to log.
   * @private
   */
  private logDebug(message: string) {
    this.debugCallback?.(message)
  }

  /**
   * Stops the service.
   *
   * @public
   */
  public stop() {
    this.logDebug("stop()")
    if (this.handlerCallback) {
      this.serviceStatus.dwCurrentState = SERVICE_STOP_PENDING
      this.serviceStatus.dwCheckPoint = 0
      this.setServiceStatus(this.serviceStatus)
      this.serviceStatus.dwCurrentState = SERVICE_STOPPED
      this.serviceStatus.dwCheckPoint = 0
      this.setServiceStatus(this.serviceStatus)
      this.handlerCallback.close()
    }
    if (this.serviceMainCallback) {
      this.serviceMainCallback.close()
    }
    this.unsafeRefs.clear()
    worker.terminate()
  }

  /**
  *
  * Registers a callback function for a specific event.
  * @param eventName - The name of the event to register the callback for (debug, start, stop, continue).
  * @param callback - The callback function to be executed when the event is triggered.
  * @public
  */
  public on(eventName: string, callback: unknown): void {
    this.logDebug("on(): " + eventName)
    if (eventName === "debug") {
      this.debugCallback = callback as (message: string) => void
    } else if (["stop", "continue", "pause"].includes(eventName)) {
      this.callbackMap[eventName] = callback as () => void
    } else if (eventName === "main") {
      this.runFn = callback as (argc?: number, argv?: string[]) => Promise<void>
    } else {
      throw new Error("Tried to register unknown callback")
    }
  }
}
export { WindowsService }
