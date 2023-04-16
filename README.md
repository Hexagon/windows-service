# Windows Service for Deno

## Note - This is work in progress

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

For more details and examples, please refer to the [example implementation](https://deno.land/x/windows_service/example.ts).

Install the service with

```
sc.exe create test-s-62 binPath= "c:\full\path\to\deno.exe run -A --unstable --allow-ffi C:/path/to/windows-service/example.ts"
```

## License

This project is licensed under the MIT License. See [LICENSE.md](LICENSE.md) for more details.
