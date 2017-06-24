# MakerBot JSON-RPC Library for Node.js

(Before you go any further, note that **THIS LIBRARY IS SUPER INCOMPLETE** and will be updated fairly often. So before you complain about something that's missing, **DON'T.**)

This library acts as an abstraction layer for the JSON-RPC methods that MakerBot 3D printers use. At the moment, it supports doing the following:

- **Authentication.** You can authenticate with a Thingiverse OAuth token or locally by pressing on the knob.
- **Get realtime printer status.** You can get the real-time status of the printer (what it's doing, info about the extruder, and much more).
- **Load/unload filament.** You can instruct your printer to start the filament loading/unloading process.
- **Cancel current process.** You can instruct your printer to cancel the current process (unloading/loading filament, printing, assisted calibration, etc.)
- **Print a file.** You can instruct your printer to print a `.makerbot` file remotely.

## Projects using this library

- [MakerBot WebUI](https://github.com/tjhorner/MakerbotWebUI)

## Example

```javascript
const MakerbotRpc = require('makerbot-rpc')

var printer = new MakerbotRpc("192.168.1.100", {
  authMethod: "thingiverse",
  thingiverseToken: "asdasd123123",
  username: "tjhorner"
})

// Fired when the initial handshake with the printer is made
printer.on("connected", info => {
  console.log("We are connected to the printer!", info)
})

// Fired when authentication is successful, and you can now
// make privileged method calls
printer.on("authenticated", () => {
  console.log("We're now authenticated. Hooray!")
  // Print the file hello.makerbot
  printer.printFile(__dirname + "/hello.makerbot")
    .then(printInfo => {
      console.log("We have started printing! Here is some info about the print:", printInfo)
    })
})

// Fired when the printer sends a `system_notification` around
// every one second. It includes lots of useful stuff, and is
// stored in `MakerbotRpc.state` if you ever need it later
printer.on("state", newState => {
  console.log("The printer sent us a new state!", newState)
})
```