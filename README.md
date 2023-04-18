# Windows Service for Deno

A Deno library that provides a simple way to create Windows services using Deno applications without any external tools.

## Features

- Run Deno applications as Windows services
- React to events like "stop", "pause", and "continue" from the Windows Service Manager

## Installation

To use the `windows-service` library in your project, add the following import statement:

    import { WindowsService } from "https://deno.land/x/windows_service/mod.ts"

## Usage

    // Create a new WindowsService instance
    const service = new WindowsService("MyDenoServiceWithCallbacks")

    // Define the main function for your service
    async function main() {
      console.log("Service started.")
      // Your service logic here...
    }

    // Set the main function as the entry point
    service.on("main", async () => {
      await main()

      // This sends a message to SCM that the service has stopped, and makes some cleanup
      exampleService.stop()
    })

    // This is a request from the SCM to stop the service
    exampleService.on("stop", () => {
      // Do stuff ...

      // Do stop the service
      // - This is done automatically if no handler for 'stop' event is defined.
      //   But included here for demonstration.
      exampleService.stop()
    })

    // Start the service
    service.start()

For more details and examples, please refer to the [example implementation](https://deno.land/x/windows_service/example.ts).

Install the service with

    sc.exe create my-test-service binPath= "c:\full\path\to\deno.exe run" -A --unstable --allow-ffi "C:/path/to/windows-service/example.ts"

**Or** compile it using

    deno compile -A --unstable --allow-ffi example.ts --include dispatcher.js --output my-test-service.exe

And install using

    sc.exe create my-test-service binPath= "C:/path/to/windows-service/my-test-service.ts"

Note that dispatcher.ts need to be included using `--include` at compile time, else the service worker wont work.

> **Note** Both --unstable and --allow-ffi is required at the moment

## Using `run.ts` as a Generic Service Runner

You can use the `run.ts` file as a generic service runner without downloading or installing anything. The file accepts command-line arguments for the service name, the `--debug` flag, and the command
to run with its arguments after `--`.

To run the generic service runner with a command:

```
deno run -A --allow-ffi --unstable https://deno.land/x/windows_service/run.ts --serviceName your-service -- your_command your_arguments
```

If you want to debug (execute the command directly without the Windows service part), pass the `--debug` flag:

```
deno run -A --allow-ffi --unstable your_script.ts --serviceName your-service --debug -- your_command your_arguments
```

To install a service using this library and a generic command

```
sc.exe create your-service binPath= "c:/full/path/to/deno.exe run -A --unstable --allow-ffi https://deno.land/x/windows_service/run.ts --serviceName your-service -- your_command your_arguments"
```

## License

This project is licensed under the MIT License. See [LICENSE.md](LICENSE.md) for more details.
