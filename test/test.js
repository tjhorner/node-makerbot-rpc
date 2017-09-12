const MakerbotRpc = require('..')
const config = require('./testconfig.json')

var printer = new MakerbotRpc(config.ip, {
  authMethod: "thingiverse",
  thingiverseToken: config.token,
  username: config.username,
  port: 9001
})

printer.on("connected", printerInfo => {
  console.log(`Connected to ${printerInfo.machine_name}, attempting authentication`)
})

printer.on("timeout", () => {
  console.log("Printer triggered timeout")
})

printer.on("disconnected", () => {
  console.log("Printer disconnected :(")
})

printer.on("connect-error", err => {
  console.log("error connecting!", err)
})

printer.on("auth-push-knob", () => {
  console.log("To finish authentication, press the knob on your printer.")
})

printer.on("authenticated", res => {
  console.log("Authenticated!")
  printer.printFile(__dirname + "/mei.makerbot")
})

printer.on("state", notif => {
  // console.log(`Got new printer state from ${notif.params.info.machine_name}`)
  // console.log(`Current temp: ${printer.state.toolheads.extruder[0].current_temperature} C`)
  // console.log(printer.state)
})