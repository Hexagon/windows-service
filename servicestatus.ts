const SERVICE_WIN32_OWN_PROCESS = 0x10
const SERVICE_START_PENDING = 0x00000002
const SERVICE_STOP_PENDING = 0x00000003
const SERVICE_RUNNING = 0x00000004
const SERVICE_STOPPED = 0x00000001
const SERVICE_CONTROL_STOP = 0x00000001
const SERVICE_CONTROL_PAUSE = 0x00000002
const SERVICE_CONTROL_CONTINUE = 0x00000003
const SERVICE_PAUSED = 0x00000007

let advapi32: Record<string, any>

switch (Deno.build.os) {
  case "windows":
    advapi32 = Deno.dlopen("advapi32.dll", {
      SetServiceStatus: {
        parameters: ["pointer", "pointer"],
        result: "u64",
      },
    })
    break
  default:
    throw new Error("Unsupported OS")
}

class WindowsServiceStatus {
  // Service status struct members
  private dwServiceType: number
  private dwCurrentState: number
  private dwControlsAccepted: number
  private dwWin32ExitCode: number
  private dwServiceSpecificExitCode: number
  private dwCheckPoint: number
  private dwWaitHint: number

  // Other
  private hServiceStatus?: bigint
  private statusBuffer?: ArrayBuffer

  constructor(hServiceStatus: bigint) {
    // Service status struct members
    this.dwServiceType = SERVICE_WIN32_OWN_PROCESS
    this.dwCurrentState = SERVICE_START_PENDING
    this.dwControlsAccepted = SERVICE_CONTROL_STOP
    this.dwWin32ExitCode = 0
    this.dwServiceSpecificExitCode = 0
    this.dwCheckPoint = 0
    this.dwWaitHint = 0

    // Other
    this.hServiceStatus = hServiceStatus
  }
  /**
   * Sets the service status.
   *
   * @param serviceStatus - The service status object.
   * @private
   */
  private dispatch() {
    const statusBuffer = new ArrayBuffer(28)
    const statusView = new DataView(statusBuffer)
    statusView.setUint32(0, this.dwServiceType, true)
    statusView.setUint32(4, this.dwCurrentState, true)
    statusView.setUint32(8, this.dwControlsAccepted, true)
    statusView.setUint32(12, this.dwWin32ExitCode, true)
    statusView.setUint32(16, this.dwServiceSpecificExitCode, true)
    statusView.setUint32(20, this.dwCheckPoint, true)
    statusView.setUint32(24, this.dwWaitHint, true)
    this.statusBuffer = statusBuffer
    if (this.hServiceStatus) {
      return advapi32.symbols.SetServiceStatus(
        Deno.UnsafePointer.create(this.hServiceStatus),
        Deno.UnsafePointer.of(this.statusBuffer),
      )
    }
  }

  public stopPending() {
    this.dwCurrentState = SERVICE_STOP_PENDING
    this.dwCheckPoint = 0
    this.dispatch()
  }

  public servicePaused() {
    this.dwCurrentState = SERVICE_PAUSED
    this.dwCheckPoint = 0
    this.dispatch()
  }

  public serviceRunning() {
    this.dwCurrentState = SERVICE_RUNNING
    this.dwCheckPoint = 0
    this.dispatch()
  }

  public startPending() {
    this.dwCurrentState = SERVICE_START_PENDING
    this.dwCheckPoint = 0
    this.dispatch()
  }

  public serviceStopped() {
    this.dwCurrentState = SERVICE_STOPPED
    this.dwCheckPoint = 0
    this.dispatch()
  }
}

export { WindowsServiceStatus }
export { SERVICE_CONTROL_CONTINUE, SERVICE_CONTROL_PAUSE, SERVICE_CONTROL_STOP }
