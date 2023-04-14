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
        result: "pointer",
      },
      StartServiceCtrlDispatcherA: {
        parameters: ["pointer"],
        result: "bool",
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

class WindowsService {
  private serviceName: string
  private serviceStatus: WindowsServiceStatus
  private hServiceStatus: number | null = null
  private handlerCallback: Deno.UnsafeCallback<{ parameters: ["u32", "u32", "pointer", "pointer"]; struct: undefined; result: "void" }> | null = null

  constructor(serviceName: string) {
    this.serviceName = serviceName
    this.serviceStatus = {
      dwServiceType: SERVICE_WIN32_OWN_PROCESS,
      dwCurrentState: SERVICE_START_PENDING,
      dwControlsAccepted: SERVICE_CONTROL_STOP | SERVICE_CONTROL_PAUSE | SERVICE_CONTROL_CONTINUE,
      dwWin32ExitCode: 0,
      dwServiceSpecificExitCode: 0,
      dwCheckPoint: 0,
      dwWaitHint: 5000,
    }
  }

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

    if (this.hServiceStatus) {
      return advapi32.symbols.SetServiceStatus(this.hServiceStatus, statusBuffer)
    }
  }

  private serviceCtrlHandler(dwControl: number, callbackMap: Record<string, () => void>) {
    if (dwControl === SERVICE_CONTROL_STOP) {
      this.serviceStatus.dwCurrentState = SERVICE_STOP_PENDING
      this.setServiceStatus(this.serviceStatus)
      callbackMap["stop"]?.()
    } else if (dwControl === SERVICE_CONTROL_PAUSE) {
      this.serviceStatus.dwCurrentState = SERVICE_PAUSED
      this.setServiceStatus(this.serviceStatus)
      callbackMap["pause"]?.()
    } else if (dwControl === SERVICE_CONTROL_CONTINUE) {
      this.serviceStatus.dwCurrentState = SERVICE_RUNNING
      this.setServiceStatus(this.serviceStatus)
      callbackMap["continue"]?.()
    }
  }

  private async runService(mainFunction: () => Promise<void>) {
    this.serviceStatus.dwCurrentState = SERVICE_START_PENDING
    // Update the service status with the new current state and wait hint
    this.setServiceStatus(this.serviceStatus)

    this.serviceStatus.dwCurrentState = SERVICE_RUNNING
    this.serviceStatus.dwCheckPoint = 0 // Reset the checkpoint value
    this.setServiceStatus(this.serviceStatus)

    // Wait for the main function to complete
    await mainFunction()
  }

  public async run(
    mainFunction: () => Promise<void>,
    callbackMap: Record<string, () => void> = {},
  ) {
    const handlerCallback = new Deno.UnsafeCallback(
      {
        parameters: ["u32", "u32", "pointer", "pointer"],
        struct: undefined,
        result: "void",
      },
      (hServiceStatus: number, dwControl: number) => {
        this.serviceCtrlHandler(dwControl, callbackMap)
      },
    )

    this.handlerCallback = handlerCallback

    this.hServiceStatus = advapi32.symbols.RegisterServiceCtrlHandlerExA(
      new TextEncoder().encode(this.serviceName),
      this.handlerCallback?.pointer,
      null,
    )

    if (this.hServiceStatus === 0) {
      console.error("Failed to register service control handler")
      const error = kernel32.symbols.GetLastError()
      console.error(`Error code: ${error}`)
      Deno.exit(1)
    }

    const bua = BigUint64Array.of(
      BigInt(Deno.UnsafePointer.value(Deno.UnsafePointer.of(new TextEncoder().encode(this.serviceName + "\0")))),
      BigInt(Deno.UnsafePointer.value(this.handlerCallback.pointer)),
      BigInt(0),
      BigInt(0),
    )
    const u8a = new Uint8Array(bua.buffer)
    const startServiceResult = advapi32.symbols.StartServiceCtrlDispatcherA(Deno.UnsafePointer.of(u8a))
    if (startServiceResult === 0) {
      console.error("Failed to start service control dispatcher")
      const error = kernel32.symbols.GetLastError()
      console.error(`Error code: ${error}`)
      Deno.exit(1)
    }
    await this.runService(mainFunction)
  }

  public async stop() {
    if (this.handlerCallback) {
      this.serviceStatus.dwCurrentState = SERVICE_STOP_PENDING
      this.setServiceStatus(this.serviceStatus)
      this.handlerCallback.close()
      this.handlerCallback = null
      this.hServiceStatus = null
      this.serviceStatus.dwCurrentState = SERVICE_STOPPED
      this.setServiceStatus(this.serviceStatus)
    }
  }
}

export { WindowsService }
