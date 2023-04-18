import { WindowsService } from "./mod.ts"
import { parse } from "https://deno.land/std/flags/mod.ts"

// Parse command line arguments
const args = parse(Deno.args, { "--": true })

// Get the command and its arguments from the command line
const commandWithArgs = args["--"] || []
const command = commandWithArgs[0] || "cmd"
const commandArgs = commandWithArgs.slice(1)

async function executeCommand() {
  console.log("Running command...")

  const cmd = new Deno.Command(command, {
    args: commandArgs,
    stdout: "piped",
    stderr: "piped",
  })

  const status = await cmd.output()
  const output = new TextDecoder().decode(status.stdout)
  console.log(output)
}

if (args.debug) {
  await executeCommand()
} else {
  const service = new WindowsService(args.serviceName || "generic-service")

  service.on("debug", (message: string) => {
    Deno.writeFileSync(
      "c:\\temp\\service.log",
      new TextEncoder().encode(`${new Date().toISOString()}> ${message}\n`),
      { create: true, append: true },
    )
  })

  service.on("stop", () => {
    service.stop()
  })

  await service.run(async () => {
    console.log("Running service logic...")

    await executeCommand()

    await new Promise((resolve) => {
      setTimeout(() => {
        resolve(0)
      }, 100000)
    })

    service.stop()
  })
}
