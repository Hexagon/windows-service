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

  const env: Record<string, string> = {}
  if (Deno.env.get("PATH")) {
    env.PATH = Deno.env.get("PATH") as string
  }

  // Pass path and CWD
  const cmd = new Deno.Command("cmd", {
    args: ["/C",command,...commandArgs],
    env: env,
    cwd: Deno.cwd(),
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
