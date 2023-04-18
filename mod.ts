import { SERVICE_CONTROL_CONTINUE, SERVICE_CONTROL_PAUSE, SERVICE_CONTROL_STOP, WindowsServiceStatus } from "./servicestatus.ts"

interface WindowsServiceCallbacks {
  debug?: (message: string) => void
  stop?: () => void
  continue?: () => void
  pause?: () => void
  main?: (argc?: number, argv?: string[]) => Promise<void>
}

/**
 * WindowsService class for managing Windows services.
 */
class WindowsService {
  private serviceName: string
  private serviceStatus?: WindowsServiceStatus
  private callbackMap: WindowsServiceCallbacks = {}
  private waitForResponseSeconds = 10
  private unsafeRefs = new Map()
  private serviceMainStarted = false
  private debugCallback?: (message: string) => void

  // Win32 API
  private advapi32: Record<string, any>
  private kernel32: Record<string, any>

  // Win32 API implementation
  // - Callback from StartServiceCtrlDispatcherA)
  private serviceMainCallback?: Deno.UnsafeCallback<{
    parameters: ["u64", "pointer"]
    result: "void"
  }>
  // - Callback from RegisterServiceCtrlHandlerExA
  private handlerCallback:
    | Deno.UnsafeCallback<{
      parameters: ["u32", "u32", "pointer", "pointer"]
      struct: undefined
      result: "void"
    }>
    | null = null
  // - Service status handle
  private hServiceStatus: bigint | null = null
  // . Worker running a separate thread for StartServiceCtrlDispatcherA
  private dispatcherThread?: Worker

  /**
   * Creates a new WindowsService instance and initializes win32 api
   *
   * @param serviceName - The name of the Windows service.
   */
  constructor(serviceName: string) {
    this.serviceName = serviceName

    // Set up Win32 API functions through FFI
    switch (Deno.build.os) {
      case "windows":
        this.advapi32 = Deno.dlopen("advapi32.dll", {
          RegisterServiceCtrlHandlerExA: {
            parameters: ["buffer", "pointer", "pointer"],
            result: "u64",
          },
        })
        this.kernel32 = Deno.dlopen("./kernel32.dll", {
          GetLastError: {
            parameters: [],
            result: "u32",
          },
        })
        break
      default:
        throw new Error("Unsupported OS")
    }
  }

  /**
   * Handles service control events.
   *
   * @param controlCode - The control code received.
   * @param eventType - The event type.
   * @private
   */
  private serviceCtrlHandler(controlCode: number, _eventType: number) {
    this.logDebug("serviceCtrlHandler(): " + controlCode)
    if (controlCode === SERVICE_CONTROL_STOP) {
      this.serviceStatus?.stopPending()

      // Hand over the stopping to the calling program if a callback is registered
      // This program is expected to run .stop() when all is done
      if (this.callbackMap?.["stop"]) {
        this.callbackMap?.["stop"]?.()

        // Not callback registered, run .stop() instantly
      } else {
        this.stop()
      }
    } else if (controlCode === SERVICE_CONTROL_PAUSE) {
      this.serviceStatus?.servicePaused()
      this.callbackMap?.["pause"]?.()
    } else if (controlCode === SERVICE_CONTROL_CONTINUE) {
      this.serviceStatus?.serviceRunning()
      this.callbackMap?.["continue"]?.()
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
    const handlerCallback = Deno.UnsafeCallback.threadSafe(
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
    this.hServiceStatus = this.advapi32.symbols.RegisterServiceCtrlHandlerExA(
      new TextEncoder().encode(this.serviceName),
      this.handlerCallback?.pointer,
      null,
    )
    if (this.hServiceStatus === BigInt(0) || this.hServiceStatus === null) {
      this.logDebug("Failed to register service control handler")
      const error = this.kernel32.symbols.GetLastError()
      this.logDebug(`Error code: ${error}`)
      this.stop()
    }
    this.serviceStatus = new WindowsServiceStatus(this.hServiceStatus as bigint)

    // Set service status
    this.serviceStatus.startPending()

    // Set service status
    this.serviceStatus.serviceRunning()

    this.logDebug("starting Main")

    // Done, start the requested function
    if (this.callbackMap.main) {
      this.logDebug("Delegating to registered main function.")
      this.callbackMap.main()
    } else {
      this.logDebug("No main function registered, stopping instantly")
      this.stop()
    }
  }

  /**
   * Main entrypoint for the service.
   *
   * @public
   */
  public async run(mainFunction: (argc?: number, argv?: string[]) => Promise<void>) {
    // Store a reference to the supplied main function
    this.callbackMap["main"] = mainFunction

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
    //this.dispatcherThread = new Worker(`data:application/typescript;base64,${workerSource}`, { type: "module" })
    this.dispatcherThread = new Worker(new URL("./dispatcher.js", import.meta.url).href, { type: "module" })

    // Send start
    this.dispatcherThread.postMessage(serviceTablePointerValue)
    // Handle response
    this.dispatcherThread.onmessage = (e: MessageEvent) => {
      if (e.data === "done") {
        this.logDebug("worker: done")
        this.cleanup()
      }
    }

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
      this.logDebug("Start failed")
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
    if (this.handlerCallback && this.serviceStatus) {
      this.serviceStatus.serviceStopped()
    }
  }

  /**
   * Stops the service.
   *
   * Triggered when the dispatcher worker returns
   *
   * @private
   */
  private cleanup() {
    this.logDebug("cleanup()")
    this.serviceMainCallback?.close()
    this.handlerCallback?.close()
    this.unsafeRefs.clear()
  }

  /**
   * Registers a callback function for a specific event.
   * @param eventName - The name of the event to register the callback for (debug, start, stop, continue).
   * @param callback - The callback function to be executed when the event is triggered.
   * @public
   */
  public on(eventName: string, callback: unknown): void {
    this.logDebug("Callback registered: on(): " + eventName)
    if (eventName === "debug") {
      this.debugCallback = callback as (message: string) => void
    } else if (eventName === "stop") {
      this.callbackMap["stop"] = callback as () => void
    } else if (eventName === "continue") {
      this.callbackMap["continue"] = callback as () => void
    } else if (eventName === "pause") {
      this.callbackMap["pause"] = callback as () => void
    } else {
      this.logDebug("Tried to register unknown callback: " + eventName)
    }
  }
}
export { WindowsService }
