import { WindowsService } from "./mod.ts"
import { parse } from "https://deno.land/std@0.184.0/flags/mod.ts"

// Parse command line arguments
const args = parse(Deno.args, { "--": true })

// Get the command and its arguments from the command line
const commandWithArgs = args["--"] || []

let process: Deno.ChildProcess | undefined

async function executeCommand() {
  const env: Record<string, string> = {}
  if (Deno.env.get("PATH")) {
    env.PATH = Deno.env.get("PATH") as string
  }
  // Pass path and CWD
  const cmd = new Deno.Command("cmd", {
    args: ["/C",...commandWithArgs],
    env: env,
    cwd: Deno.cwd(),
    stdout: "piped",
    stderr: "piped",
  })
  process = cmd.spawn()
  process.ref()
  await cmd.output()
}

if (args.debug) {
  await executeCommand()
} else {
  const service = new WindowsService(args.serviceName || "generic-service")
  service.on("stop", () => {
    // As the executed command is refed, it will automatically terminate when the service terminates
    service.stop()
  })
  await service.run(async () => {
    await executeCommand()
    // Automatically stop service when the comand returns
    service.stop()
  })
}
