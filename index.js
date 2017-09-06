const EventEmitter = require('events')
const request = require('request')
const JsonRpc = require('./lib/jsonrpc')
const fs = require('fs')
const crc = require('crc')
const path = require('path')

// MakerBot Reflector address, for remote access
const REFLECTOR_BASE = "https://reflector.makerbot.com"

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
  constructor(printerIp, options = { }) {
    super()

    this.printerIp = printerIp
    this.connected = false

    this.client = new JsonRpc(printerIp, 9999)

    this.client.on("response", res => {
      if(res.method === "system_notification") {
        this.state = res.params.info
        this.emit("state", res)
      }
    })
    
    // this.client.request("handshake", { })
    //   .then(res => {
    //     console.log("HANDSHAKE", res)
    //   })

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

  loadFilament(tool_index = 0) {
    return this.client.request("load_filament", { tool_index })
  }

  unloadFilament(tool_index = 0) {
    return this.client.request("unload_filament", { tool_index })
  }

  cancel() {
    return this.client.request("cancel")
  }

  printFile(file) {
    // TODO what's the max length of the file name?
    var filename = path.parse(file).base

    // TODO handle errors in this promise
    return new Promise((resolve, reject) => {
      fs.readFile(file, (err, data) => {
        this.client.request("print", {
          filepath: filename,
          transfer_wait: true
        })
        .then(res => {
          // resolve the promise with the new print data
          resolve(res)

          // emulate pressing the "start print" button
          this.client.request("process_method", {
            method: "build_plate_cleared"
          })

          return this.client.request("put_init", {
            block_size: data.length,
            file_id: "1",
            file_path: `/current_thing/${filename}`,
            length: data.length
          })
        })
        .then(res => {
          return this.client.request("put_raw", {
            file_id: "1",
            length: data.length
          })
        })
        .then(res => {
          this.client.conn.write(data, () => {
            this.client.request("put_term", {
              crc: crc.crc32(data),
              file_id: "1",
              length: data.length
            })
          })
        })
      })
    })
  }
}

module.exports = MakerbotRpcClient