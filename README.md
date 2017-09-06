# MakerBot JSON-RPC Library for Node.js

## THIS LIBRARY GRADUATED TO 1.0.0!

With every new feature comes breaking changes. [See here](https://github.com/tjhorner/node-makerbot-rpc/releases/tag/v1.0.0) for more info.

This library acts as an abstraction layer for the JSON-RPC methods that MakerBot 3D printers use. At the moment, it supports doing the following:

- **Authentication.** You can authenticate with a Thingiverse OAuth token or locally by pressing on the knob.
- **Remote control.** Control a printer remotely with a Thingiverse token and the printer's ID.
- **Get realtime camera stream (experimental).** Get the realtime camera stream out of the printer.
- **Get realtime printer status.** You can get the real-time status of the printer (what it's doing, info about the extruder, and much more).
- **Load/unload filament.** You can instruct your printer to start the filament loading/unloading process.
- **Cancel current process.** You can instruct your printer to cancel the current process (unloading/loading filament, printing, assisted calibration, etc.)
- **Print a file.** You can instruct your printer to print a `.makerbot` file remotely.

## Projects using this library

- [MakerBot WebUI](https://github.com/tjhorner/MakerbotWebUI)

## Example

```javascript
const MakerbotRpc = require('makerbot-rpc')
const fs = require('fs')

var printer = new MakerbotRpc({
  authMethod: "reflector",
  accessToken: "thingiverseAccessToken",
  printerId: "yourPrinterId"
})

printer.on("connected", printerInfo => {
  console.log(`Connected to ${printerInfo.machine_name}, attempting authentication`)
})

printer.on("connect-error", err => {
  console.log("error connecting!", err)
})

printer.on("auth-push-knob", () => {
  console.log("To finish authentication, press the knob on your printer.")
})

printer.on("authenticated", res => {
  console.log("Authenticated!")
  printer.startCameraStream()
})

printer.on("camera-frame", frame => {
  printer.endCameraStream()
  fs.writeFile("testimg/test.jpg", frame, () => { })
})

printer.on("state", notif => {
  console.log(printer.state)
})
```