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
  await process.output()
}

async function killProcess(pid: number) {
  const cmd = new Deno.Command("taskkill", {
    args: ["/f","/pid",pid.toString()],
    stdout: "piped",
    stderr: "piped",
  })
  process = cmd.spawn()
  await process.output()
}
if (args.debug) {
  await executeCommand()
} else {
  const service = new WindowsService(args.serviceName || "generic-service")
  service.on("stop", () => {
    // Try to kill child process using Deno
    if (process?.pid) Deno.kill(process.pid)
    // Try to kill child process using taskkill
    if (process?.pid) killProcess(process.pid)
    service.stop()
  })
  await service.run(async () => {
    await executeCommand()
    service.stop()
  })
}
