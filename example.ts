import { WindowsService } from "./mod.ts"

const exampleService = new WindowsService("test-service-45")
await exampleService.run(async () => {
  Deno.writeFileSync("c:\\temp\\fail.txt", new TextEncoder().encode(`Error code: 100`), { create: true, append: true })
  console.log("Running service logic...")

  // Run an external command using Deno.Command
  const cmd = new Deno.Command("cmd", {
    args: ["/C", "echo", "hello"],
    stdout: "piped",
    stderr: "piped",
  })

  const status = await cmd.output()

  // Read the output of the external command
  const output = new TextDecoder().decode(status.stdout)
  console.log("Output of the external command:", output)
}, {
  "start": () => {
    Deno.writeFileSync("c:\\temp\\fail.txt", new TextEncoder().encode(`Error code: 101`), { create: true, append: true })
  },
})
