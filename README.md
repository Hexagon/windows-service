# Windows Service for Deno

## Note - This is work in progress

A Deno library that provides a simple way to create Windows services using Deno applications without any external tools.

## Features

- Run Deno applications as Windows services
- React to events like "stop", "pause", and "continue" from the Windows Service Manager

## Installation

To use the `windows-service` library in your project, add the following import statement:

```typescript
import { WindowsService } from "https://deno.land/x/windows_service/mod.ts";
```

## Usage

```typescript
// Create a new WindowsService instance
const service = new WindowsService("MyDenoServiceWithCallbacks");

// Define the main function for your service
async function main() {
  console.log("Service started.");
  // Your service logic here...
}

// Set the main function as the entry point
service.on("main", async () => {
  await main()

  // This sends a message to SCM that the service has stopped, and makes some cleanup
  exampleService.stop()
});

// This is a request from the SCM to stop the service
exampleService.on("stop", () => {
  // Do stuff ...

  // Do stop the service
  // - This is done automatically if no handler for 'stop' event is defined.
  //   But included here for demonstration.
  exampleService.stop()
})

// Start the service
service.start();
```

For more details and examples, please refer to the [example implementation](https://deno.land/x/windows_service/example.ts).

Install the service with

```
sc.exe create my-test-service binPath= "c:\full\path\to\deno.exe run -A --unstable --allow-ffi C:/path/to/windows-service/example.ts"s
```

> **Note** Both --unstable and --allow-ffi is required at the moment

> **Note 2** It is not possible to run a compiled binary as a windows service yet

## License

This project is licensed under the MIT License. See [LICENSE.md](LICENSE.md) for more details.
