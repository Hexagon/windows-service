/**
 * This script acts as the worker that communicates with the Windows Service Control Manager (SCM).
 * 
 * It runs StartServiceCtrlDispatcherA, which will run the servicemain callback function defined in the service table.
 * 
 * StartServiceCtrlDispatcherA will not return until the service has stopped.
 * 
 * @file
 */

/**
 * Handles incoming messages from the main script.
 *
 * @param event - A message event containing the unsafe pointer value for the service table.
 */
self.onmessage = (event: MessageEvent) => {
    const unsafePointerValue = BigInt(event.data);
  
    let advapi32: Record<string, any>;
  
    switch (Deno.build.os) {
      case "windows":
        advapi32 = Deno.dlopen("advapi32.dll", {
          StartServiceCtrlDispatcherA: {
            parameters: ["pointer"],
            result: "u64",
          },
        });
        break;
      default:
        throw new Error("Unsupported OS");
    }
  
    const unsafePointer = Deno.UnsafePointer.create(unsafePointerValue);
  
    const startServiceResult = advapi32.symbols.StartServiceCtrlDispatcherA(
      unsafePointer
    );
    if (startServiceResult === 0) {
      console.error("Failed to start service control dispatcher");
    }
  };