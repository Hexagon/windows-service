self.onmessage = (event: MessageEvent) => {
  const unsafePointerValue = BigInt(event.data)

  let advapi32: Record<string, any>

  switch (Deno.build.os) {
    case "windows":
      advapi32 = Deno.dlopen("advapi32.dll", {
        StartServiceCtrlDispatcherA: {
          parameters: ["pointer"],
          result: "u64",
        },
      })
      break
    default:
      throw new Error("Unsupported OS")
  }

  function DebugOut(t: string) {
    Deno.writeFileSync("c:\\temp\\test.txt", new TextEncoder().encode(`Debug: ${t}\n`), { create: true, append: true })
  }

  DebugOut(`Main 3.1 ${unsafePointerValue}`)
  try {
    const unsafePointer = Deno.UnsafePointer.create(unsafePointerValue)

    const startServiceResult = advapi32.symbols.StartServiceCtrlDispatcherA(unsafePointer)
    if (startServiceResult === 0) {
      DebugOut(`Main 3.1.1`)
      console.error("Failed to start service control dispatcher")
      //Deno.exit(1)
    }
  } catch (e) {
    DebugOut(`Main 3.1.1: ${e.message}`)
  }

  DebugOut(`Main 3.1.2`)
}
