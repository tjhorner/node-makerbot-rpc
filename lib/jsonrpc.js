const EventEmitter = require('events')
const net = require('net')

var generateId = function() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    var r = Math.random()*16|0, v = c == 'x' ? r : (r&0x3|0x8)
    return v.toString(16)
  })
}

class JsonRpc extends EventEmitter {
  constructor(host, port) {
    super()

    this.isConnected = false
    this.conn = net.connect({ host, port })

    this.conn.on("close", () => this.emit("disconnected"))
    
    this.requests = { }
    this.currentPacket = ""
    this.currentBinaryPacket = new Buffer([ ])

    this.isBinaryPacket = false

    this.conn.on("data", data => {
      this.currentBinaryPacket = Buffer.concat([ this.currentBinaryPacket, data ])

      // this is a json packet
      if(!this.isBinaryPacket && (this.currentPacket.indexOf("{") === 0 || this.currentPacket === "" && data.toString().indexOf("{") === 0)) {
        if(this.currentBinaryPacket.indexOf("FFD8FFDB", "hex") !== -1) {
          // throw out the ascii packet and start
          // parsing the binary data
          this.currentPacket = ""
          this.isBinaryPacket = true
          this.currentBinaryPacket = this.currentBinaryPacket.slice(this.currentBinaryPacket.indexOf("FFD8FFDB", "hex"))
        } else {
          this.currentBinaryPacket = new Buffer([ ])

          this.currentPacket += data
          var isFullPacket = true

          try{
            JSON.parse(this.currentPacket)
          }catch(e){
            isFullPacket = false
          }

          if(isFullPacket){
            var json = JSON.parse(this.currentPacket)
            this.currentPacket = ""
            this.currentBinaryPacket = new Buffer([ ])

            this.emit("response", json)

            if(this.requests[json.id]){
              this.requests[json.id](json)
              this.requests[json.id] = null
            }
          }
        }
      }

      if(this.isBinaryPacket) {
        if(this.currentBinaryPacket.indexOf("FFD9", "hex") !== -1) {
          this.emit("binary-data", this.currentBinaryPacket)

          this.currentPacket = this.currentBinaryPacket.slice(this.currentBinaryPacket.indexOf("FFD9", "hex") + 2).toString().trim()
          
          try {
            var json = JSON.parse(this.currentPacket)

            this.emit("response", json)

            if(this.requests[json.id]){
              this.requests[json.id](json)
              this.requests[json.id] = null
            }
          } catch (e) { }

          this.isBinaryPacket = false
          this.currentBinaryPacket = new Buffer([ ])
        }
      }
    })
  }

  request(method, params = { }) {
    return new Promise((resolve, reject) => {
      var id = generateId()
      this.requests[id] = resolve

      var req = {
        id,
        jsonrpc: "2.0",
        method, params
      }

      this.conn.write(JSON.stringify(req))
    })
  }
}

module.exports = JsonRpc