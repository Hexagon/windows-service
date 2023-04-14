import { WindowsService } from "./mod.ts"

const exampleService = new WindowsService("ExampleService")
await exampleService.run(async () => {
    console.log("Running service logic...")

    // Run an external command using Deno.Command
    const cmd = new Deno.Command("cmd",{
      args: ["/C","echo","hello"],
      stdout: "piped",
      stderr: "piped",
    })

    const status = await cmd.output()

    // Read the output of the external command
    const output = new TextDecoder().decode(status.stdout)
    console.log("Output of the external command:", output)

})
