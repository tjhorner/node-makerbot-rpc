const MakerbotRpc = require('..')
const fs = require('fs')
const config = require('./reflectortestconfig.json')

var printer = new MakerbotRpc({
  authMethod: "reflector",
  accessToken: config.accessToken,
  printerId: config.printerId
})

console.log(`Attempting to connect to ${config.printerId}...`)

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
  // printer.printFile(__dirname + "/mei.makerbot")
  printer.startCameraStream()
})

printer.on("camera-frame", frame => {
  printer.endCameraStream()
  fs.writeFile("testimg/test.jpg", frame, () => { })
})

printer.on("state", notif => {
  // console.log(`Got new printer state from ${notif.params.info.machine_name}`)
  // console.log(`Current temp: ${printer.state.toolheads.extruder[0].current_temperature} C`)
  console.log(printer.state)
})