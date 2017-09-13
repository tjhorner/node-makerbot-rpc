const EventEmitter = require('events')
const request = require('request')
const JsonRpc = require('./lib/jsonrpc')
const fs = require('fs')
const crc = require('crc')
const Reflector = require('makerbot')
const path = require('path')
const bufferSplit = require('node-split').split

// Client ID/secret, for LAN access
const AUTH_CLIENT_ID = "MakerWare"
const AUTH_CLIENT_SECRET = "secret"

/**
 * A client to interact with a MakerBot printer via JSON-RPC.
 * 
 * @class MakerbotRpcClient
 * @extends {EventEmitter}
 */
class MakerbotRpcClient extends EventEmitter {
  constructor(options = { }) {
    super()

    this.connected = false
    this.currentPrintBuffers = [ ]
    this.currentPrintCrc32 = ""
    this.currentPrintByteLength = 0
    this._connect(options)

    this.options = options
  }

  _connect(options) {
    if(options.authMethod === "reflector")
      this._initReflector(options)
    else
      this._initLocal(options)
  }

  reconnect() {
    this.client.conn.end()
    this.client.conn.destroy()

    this.connected = false
    this.emit("disconnected")
    this._connect(this.options)
  }

  _setupConnection(options) {
    // Set up autorescue
    if(options.autoRescue) {
      this.client.conn.on("timeout", () => {
        this.emit("timeout")
        
        this.client.conn.end()
        this.client.conn.destroy()

        this.connected = false
        this.emit("disconnected")
        this._connect(options)
      })

      this.client.conn.on("close", err => {
        // only reconnect in case of connection error
        if(err) {
          this.connected = false
          this.emit("disconnected")
          this._connect(options)
        }
      })
    }
    
    this.client.on("response", res => {
      // console.log("Sys notif", res)
      if(res.method === "system_notification") {
        this.state = res.params.info
        this.emit("state", res)
      }
    })

    this.client.on("binary-data", data => {
      this.emit("camera-frame", data)
    })

    this.client.on("disconnected", () => {
      this.connected = false
      this.emit("disconnected")
    })
  }

  /**
   * Initialize a connection with the printer remotely via MakerBot Reflector.
   * 
   * @param {any} options 
   * 
   * @memberOf MakerbotRpcClient
   */
  _initReflector(options) {
    this.reflector = new Reflector(options.accessToken)

    this.reflector.callPrinter(options.printerId)
      .catch(err => this.emit("connect-error", err))
      .then(res => {
        if(res.call) {
          return res.call
        } else {
          this.emit("connect-error", res)
        }
      })
      .then(res => {
        var ip = res.relay.split(":")[0]
        var port = parseInt(res.relay.split(":")[1])

        this.client = new JsonRpc(ip, port)
        this._setupConnection(options)

        return this.client.request("auth_packet", {
          call_id: res.id,
          client_code: res.client_code,
          printer_id: options.printerId
        })
      })
      .then(res => {
        if(res && res.result === true)
          return true
        else
          this.emit("connect-error")
      })
      .catch(err => this.emit("connect-error", err))
      .then(connResult => {
        return this.client.request("handshake", { })
      })
      .then(handshakeRes => {
        if(handshakeRes.result) {
          this.emit("connected", handshakeRes.result)
          this.emit("authenticated")
        } else {
          this.emit("connect-error", handshakeRes)
        }
      })
  }

  /**
   * Initialize a connection with the printer via LAN.
   * 
   * @param {any} options 
   * 
   * @memberOf MakerbotRpcClient
   */
  _initLocal(options) {
    this.client = new JsonRpc(options.ip, options.port || 9999)
    this._setupConnection(options)

    this.client.request("handshake", { })
      .then(res => {
        this.emit("connected", res.result)
        this.printerInfo = res.result
        this.connected = true

        switch(options.authMethod){
          case "thingiverse":
            this._authenticateThingiverse(options.thingiverseToken, options.username)
            break
          case "access_token":
            this._authenticateAccessToken(options.accessToken)
            break
          case "local_authorization":
          default:
            this._authenticateLocal()
            break
        }
      })
  }

  /**
   * Authenticate locally by pushing the knob on the printer.
   * 
   * @memberOf MakerbotRpcClient
   */
  _authenticateLocal() {
    request(`http://${this.printerIp}/auth`, {
      qs: {
        response_type: "code",
        client_id: AUTH_CLIENT_ID,
        client_secret: AUTH_CLIENT_SECRET
      },
      json: true
    }, (err, res, codeBody) => {
      // poll every 5s until request is either accepted or rejected
      this.emit("auth-push-knob")

      var poll = setInterval(function() {
        request(`http://${this.printerIp}/auth`, {
          qs: {
            response_type: "answer",
            client_id: AUTH_CLIENT_ID,
            client_secret: AUTH_CLIENT_SECRET,
            answer_code: body.answer_code
          },
          json: true
        }, (err, res, answerBody) => {
          if(answerBody.answer === "accepted") {
            // we don't need to poll anymore
            clearInterval(poll)

            request(`http://${this.printerIp}/auth`, {
              qs: {
                response_type: "token",
                client_id: AUTH_CLIENT_ID,
                client_secret: AUTH_CLIENT_SECRET,
                context: "jsonrpc",
                auth_code: answerBody.code
              },
              json: true
            }, (err, res, tokenBody) => {
              // complete the JSON-RPC authentication
              _authenticateAccessToken(tokenBody.access_token)
            })
          }
        })
      }, 5000)
    })
  }

  _authenticateThingiverse(thingiverseToken, username) {
    request(`http://${this.printerIp}/auth`, {
      qs: {
        response_type: "code",
        client_id: AUTH_CLIENT_ID,
        client_secret: AUTH_CLIENT_SECRET,
        thingiverse_token: thingiverseToken,
        username: username
      },
      json: true
    }, (err, res, codeBody) => {
      request(`http://${this.printerIp}/auth`, {
        qs: {
          response_type: "answer",
          client_id: AUTH_CLIENT_ID,
          client_secret: AUTH_CLIENT_SECRET,
          answer_code: codeBody.answer_code
        },
        json: true
      }, (err, res, answerBody) => {
        if(answerBody.answer === "accepted") {
          request(`http://${this.printerIp}/auth`, {
            qs: {
              response_type: "token",
              client_id: AUTH_CLIENT_ID,
              client_secret: AUTH_CLIENT_SECRET,
              context: "jsonrpc",
              auth_code: answerBody.code
            },
            json: true
          }, (err, res, tokenBody) => {
            // complete the JSON-RPC authentication
            this._authenticateAccessToken(tokenBody.access_token)
          })
        }
      })
    })
  }

  /**
   * Authenticate to JSON-RPC with an `access_token`.
   * 
   * @param {string} accessToken The `access_token` obtained via the printer's HTTP API.
   * 
   * @memberOf MakerbotRpcClient
   */
  _authenticateAccessToken(accessToken) {
    this.client.request("authenticate", { access_token: accessToken })
      .then(res => {
        this.emit("authenticated", res)
      })
  }

  getMachineConfig() {
    return this.client.request("get_machine_config")
  }

  changeMachineName(machine_name) {
    return this.client.request("change_machine_name", { machine_name })
  }

  loadFilament(tool_index = 0) {
    return this.client.request("load_filament", { tool_index })
  }

  unloadFilament(tool_index = 0) {
    return this.client.request("unload_filament", { tool_index })
  }

  cancel() {
    return this.client.request("cancel")
  }

  startCameraStream() {
    console.warn("!!! GETTING CAMERA DATA IS HIGHLY EXPERIMENTAL AND NOT PRODUCTION READY !!!\nYOU HAVE BEEN WARNED!")
    return this.client.request("request_camera_stream", { })
  }

  endCameraStream() {
    // this.client.flushMemory()
    return this.client.request("end_camera_stream", { })
  }

  getSingleCameraFrame() {
    return new Promise((resolve, reject) => {
      this.client.once("binary-data", data => {
        this.endCameraStream()
        resolve(data)
      })

      this.startCameraStream()
    })
  }

  printUrl(url) {
    // TODO do we know if this works?
    // I mean, technically it should, right?
    return new Promise((resolve, reject) => {
      this.client.request("print", {
        filepath: url
      }).catch(reject).then(resolve)
    })
  }

  sendPrintPart(index) {
    if(index === this.currentPrintBuffers.length) {
      // console.log("Done sending print!")
      this.client.request("put_term", {
        crc: this.currentPrintCrc32,
        file_id: "1",
        length: this.currentPrintByteLength
      })
        .then(res => {
          this.currentPrintBuffers = [ ]
          this.currentPrintByteLength = 0
          this.currentPrintCrc32 = ""
          // console.log("put_term res", res)
        })
    } else {
      // console.log(`Sending print part ${index + 1}/${this.currentPrintBuffers.length}`)
      this.client.request("put_raw", {
        file_id: "1",
        length: this.currentPrintBuffers[index].byteLength
      })
        .then(() => {
          this.client.conn.write(this.currentPrintBuffers[index], () => {
            // console.log(`Done with ${index + 1}/${this.currentPrintBuffers.length}`)
            this.sendPrintPart(index + 1)
          })
        })
    }
  }

  initPrint(data, filename) {
    // Split the buffer into multiple pieces
    bufferSplit(data, {
      bytes: 50000
    }, (err, buffers) => {
      this.currentPrintBuffers = buffers
      this.currentPrintByteLength = data.byteLength
      this.currentPrintCrc32 = crc.crc32(data)

      this.client.request("print", {
        filepath: filename,
        transfer_wait: true
      })
      .then(res => {
        // emulate pressing the "start print" button
        this.client.request("process_method", {
          method: "build_plate_cleared"
        })
  
        return this.client.request("put_init", {
          block_size: 50000,
          file_id: "1",
          file_path: `/current_thing/${filename}`,
          length: data.byteLength
        })
      })
      .then(() => {
        this.sendPrintPart(0)
      })
    })
    // .then(res => {
    //   this.client.conn.write(data, () => {
    //     this.client.request("put_term", {
    //       crc: crc.crc32(data),
    //       file_id: "1",
    //       length: data.length
    //     })
    //   })
    // })
  }

  printFile(file) {
    // TODO what's the max length of the file name?
    var filename = path.parse(file).base

    // TODO handle errors in this promise
    return new Promise((resolve, reject) => {
      fs.readFile(file, (err, data) => {
        if(err)
          reject(err)
        else
          resolve(this.initPrint(data, filename))
      })
    })
  }
}

module.exports = MakerbotRpcClient