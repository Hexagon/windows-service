import { WindowsService } from "./mod.ts"
import { parse } from "https://deno.land/std/flags/mod.ts"

// Parse command line arguments
const args = parse(Deno.args, { "--": true })

// Get the command and its arguments from the command line
const commandWithArgs = args["--"] || []
const command = commandWithArgs[0] || "cmd"
const commandArgs = commandWithArgs.slice(1)

let process: Deno.ChildProcess | undefined

async function executeCommand() {
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
  process = cmd.spawn()
  const result = await process.output()
  console.log(new TextDecoder().decode(result.stdout), new TextDecoder().decode(result.stderr))
}

if (args.debug) {
  await executeCommand()
} else {
  const service = new WindowsService(args.serviceName || "generic-service")
  service.on("stop", () => {
    process?.kill()
    service.stop()
  })
  await service.run(async () => {
    await executeCommand()
    service.stop()
  })
}
