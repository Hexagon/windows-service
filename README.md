# Windows Service for Deno

A Deno library that provides a simple way to create Windows services using Deno applications without any external tools.

## Features

- Run Deno applications as Windows services
- React to events like "stop", "pause", and "continue" from the Windows Service Manager
- Extensible class to customize the behavior of your Windows service

## Installation

To use the `windows-service` library in your project, add the following import statement:

`import { WindowsService } from "https://deno.land/x/windows_service/mod.ts";`

## Usage

`import { WindowsService } from "https://deno.land/x/windows_service/mod.ts";

class MyService extends WindowsService { // Implement your service logic here // ... }

const myService = new MyService("MyService"); await myService.run(/* ... */);`

For more details and examples, please refer to the [example implementation](https://deno.land/x/windows_service/example.ts).

## License

This project is licensed under the MIT License. See [LICENSE.md](LICENSE.md) for more details.
