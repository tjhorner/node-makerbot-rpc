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
    
    this.requests = { }
    this.currentPacket = ""

    this.conn.on("data", data => {
      // this is a json packet
      if(this.currentPacket.indexOf("{") === 0 || this.currentPacket === "" && data.toString().indexOf("{") === 0){
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

          this.emit("response", json)

          if(this.requests[json.id]){
            this.requests[json.id](json)
            this.requests[json.id] = null
          }
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