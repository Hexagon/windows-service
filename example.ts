import { WindowsService } from "./mod.ts"

const exampleService = new WindowsService("test-service")

// This ...
exampleService.on("debug", (message: string) => {
  Deno.writeFileSync(
    "c:\\temp\\service.log",
    new TextEncoder().encode(`${new Date().toISOString()}> ${message}\n`),
    { create: true, append: true },
  )
})

// This is a request from the SCM to stop the service
// - This is done automatically if no handler is defined.
//   But included here for demonstration.
exampleService.on("stop", () => {
  // Do stop the service
  exampleService.stop()
})

// This starts the service
await exampleService.run(async () => {
  console.log("Running service logic...")

  // Run an external command using Deno.Command
  const cmd = new Deno.Command("cmd", {
    args: ["/C", "echo", "hello"],
    stdout: "piped",
    stderr: "piped",
  })

  const status = await cmd.output()

  // Read the output of the external command
  const _output = new TextDecoder().decode(status.stdout)

  // Wait for a long running task (100s)
  await new Promise((r) => {
    setTimeout(() => {
      r(0)
    }, 100000)
  })

  // Stop the service
  // - This sends a message to SCM that the service has stopped, and makes some cleanup
  exampleService.stop()
})
