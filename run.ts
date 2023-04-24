import { WindowsService } from "./mod.ts"
import { parse } from "https://deno.land/std@0.184.0/flags/mod.ts"

// Parse command line arguments
const args = parse(Deno.args, { "--": true })

// Get the command and its arguments from the command line
const commandWithArgs = args["--"] || []
const command = commandWithArgs[0]
const commandArguments = commandWithArgs.slice(1)

let process: Deno.ChildProcess | undefined

async function executeCommand() {
  const env: Record<string, string> = {}
  if (Deno.env.get("PATH")) {
    env.PATH = Deno.env.get("PATH") as string
  }
  // Pass path and CWD
  const cmd = new Deno.Command(command, {
    args: [...commandArguments],
    env: env,
    cwd: Deno.cwd(),
    stdout: "piped",
    stderr: "piped",
  })
  process = cmd.spawn()
  process.ref()
  const result = await process.output()
  return result
}

if (args.debug) {
  await executeCommand()
} else {
  const service = new WindowsService(args.serviceName || "generic-service")
  service.on("stop", () => {
    // Try to kill child process using taskkill
    if (process?.pid) process.kill()
  })
  await service.run(async () => {
    await executeCommand()
    // Automatically stop service when the comand returns
    service.stop()
  })
}
