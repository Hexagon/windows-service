import { WindowsService } from "./mod.ts"

const exampleService = new WindowsService("test-service")

exampleService.on("debug", (message: string) => {
  Deno.writeFileSync("c:\\temp\\service.log", new TextEncoder().encode(new Date().toISOString() + "> " + message), { create: true, append: true })
})

exampleService.on("stop", () => {
  exampleService.stop()
})

exampleService.on("main", async () => {
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

  // Wait a bit
  await new Promise((r) =>
    setTimeout(() => {
      r(0)
    }, 6000)
  )
})

/*
exampleService.on("pause", () => {
  ...
})
exampleService.on("continue",() => {
  ...
})
*/

await exampleService.run()
