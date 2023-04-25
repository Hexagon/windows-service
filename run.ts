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
    args: ["/C", ...commandWithArgs],
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

async function killProcessTree(pid: number) {
  const killCmd = new Deno.Command("taskkill", {
    args: ["/F", "/T", "/PID", pid.toString()],
    stdout: "null",
    stderr: "null",
  })
  const killProcess = killCmd.spawn()
  killProcess.ref()
  const killResult = await killProcess.output()
  return killResult.success
}

if (args.debug) {
  console.log("DEBUG: Starting command")
  const result = await executeCommand()
  console.log("DEBUG: Command returned", new TextDecoder().decode(result.stderr), new TextDecoder().decode(result.stdout))
} else {
  const service = new WindowsService(args.serviceName || "generic-service")
  service.on("stop", async () => {
    // Try to kill child process using taskkill
    // - process.kill() won't work as it only kills the cmd process, not the actual
    //   process launched by cmd /c
    if (process?.pid) {
      await killProcessTree(process.pid)
    }
    // The command will now exit, and run service.stop() in the main function if successful.
  })
  await service.run(async () => {
    await executeCommand()
    // Automatically stop service when the comand returns
    service.stop()
  })
}
