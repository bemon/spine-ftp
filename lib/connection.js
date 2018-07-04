"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const net = require("net");
const iconv = require("iconv-lite");
const _ = require("lodash");
const fs = require("fs");
const expressions_1 = require("./expressions");
const exceptions_1 = require("./exceptions");
const commands_1 = require("./commands");
const events_1 = require("events");
const debug = require('debug')('spine-ftp');
/**
 * Internal command connection & data connection implementation
 */
class FtpConnection {
    constructor() {
        this.socket = new net.Socket();
    }
    async connect() {
        const self = this;
        this.socket.setTimeout(this.configuration.timeout);
        return new Promise((res, rej) => {
            this.socket.connect(this.configuration.port, this.configuration.host, () => {
                this.socket.removeListener("error", _onConnectionError);
                this.socket.removeListener("timeout", _onConnectionTimeout);
                this.socket.setTimeout(0);
                debug("Connected to server");
                res();
            });
            this.socket.on("error", _onConnectionError);
            this.socket.on("timeout", _onConnectionTimeout);
            function _onConnectionTimeout() {
                self.socket.destroy();
                rej(new exceptions_1.FtpTimeoutException(`Cannot connect to: ${self.configuration.host}:${self.configuration.port}, reason: timeout (${self.configuration.timeout} ms)`));
            }
            function _onConnectionError(err) {
                rej(new exceptions_1.FtpNetworkException(`Cannot connect to ftp data socket at: ${self.configuration.host}:${self.configuration.port}`, null, err));
            }
        });
    }
    onClose(_hadError) {
        if (_hadError) {
            debug("[ ERROR ] Connection lost due error in socket");
        }
        this.dispose();
    }
    onEnd() {
        this.socket.end();
    }
    onError() {
        this.dispose();
    }
    onData(_data) {
    }
    dispose() {
        debug("Disconnected from server");
        this.socket.destroy();
        this.socket.removeListener("data", this.onData);
        this.socket.removeListener("error", this.onError);
        this.socket.removeListener("end", this.onEnd);
        this.socket.removeListener("close", this.onClose);
    }
}
class FtpDataConnection extends FtpConnection {
    constructor(configuration) {
        super();
        if (_.isNil(configuration.host) || !_.isString(configuration.host) || _.isEmpty(configuration.host)) {
            throw new exceptions_1.FtpException("You must provide host for data connection !");
        }
        if (_.isNil(configuration.port) || !_.isNumber(configuration.port) || configuration.port <= 0) {
            throw new exceptions_1.FtpException("You must provide port for data connection !");
        }
        this.socket = new net.Socket();
        this.configuration = _.defaults(configuration, {
            timeout: 10000
        });
    }
    async disconnect() {
        this.dispose();
    }
    download(toFile, progress) {
        const fStream = fs.createWriteStream(toFile);
        this.socket.pipe(fStream);
        this.socket.on("data", _progressFn);
        return new Promise((res, rej) => {
            this.socket.once("close", () => {
                this.disconnect();
                res();
            });
            this.socket.once("error", rej);
            fStream.once("error", rej);
        });
        function _progressFn(data) {
            if (!_.isNil(progress) && _.isFunction(progress)) {
                progress(data.length);
            }
        }
    }
    upload(file, progress) {
        const fStream = fs.createReadStream(file);
        let totalRead = 0;
        fStream.on("data", function (chunk) {
            if (!_.isNil(progress) && _.isFunction(progress)) {
                totalRead += chunk.length;
                progress(totalRead);
            }
        });
        fStream.pipe(this.socket);
        return new Promise((res, rej) => {
            fStream.once("end", () => {
                this.disconnect();
                fStream.removeAllListeners();
                res();
            });
            fStream.once("error", (err) => {
                fStream.removeAllListeners();
                rej(err);
            });
        });
    }
    async readToEnd() {
        const chunkSize = 1024; // 1 kb
        let marker = 0;
        let result = Buffer.alloc(chunkSize);
        return new Promise((res, rej) => {
            this.socket.on("data", (buffer) => {
                if (marker + buffer.length > result.length) {
                    let tmpBuffer = new Buffer(result.length * 2);
                    result.copy(tmpBuffer, 0, 0, marker);
                    result = tmpBuffer;
                }
                else {
                    buffer.copy(result, marker, 0, buffer.length);
                    marker += buffer.length;
                }
            });
            this.socket.once("close", (_hadError) => {
                if (_hadError) {
                    rej(new exceptions_1.FtpNetworkException("Data socket error"));
                    return;
                }
                const finalBuffer = new Buffer(marker);
                result.copy(finalBuffer, 0, 0, marker);
                this.dispose();
                res(finalBuffer);
            });
            this.socket.once("error", (err) => {
                rej(err);
            });
        });
    }
}
exports.FtpDataConnection = FtpDataConnection;
class FtpCommandConnection extends FtpConnection {
    constructor(configuration) {
        super();
        this.totalBytesWritten = 0;
        this.responseBuffer = [];
        this.commandBuffer = "";
        this.responseQueue = [];
        this.dataEvents = new events_1.EventEmitter();
        /**
         * Server feature list.
         */
        this.features = {
            MDTM: false,
            MFMT: false,
            MLSD: false,
            MLST: false,
            SIZE: false,
            UTF8: false,
            EPSV: false
        };
        this.configuration = _.defaults(configuration, {
            host: "localhost",
            port: 21,
            user: "anonymous",
            password: "anonymous",
            timeout: 10000,
            keepAlive: 10000
        });
    }
    async connect() {
        this.socket.on("data", this.onData.bind(this));
        this.socket.on("error", this.onError.bind(this));
        this.socket.on("end", this.onEnd.bind(this));
        this.socket.on("close", this.onClose.bind(this));
        await super.connect();
        await this.send(new commands_1.FtpLoginCommand(this.configuration.user, this.configuration.password));
    }
    async disconnect() {
        await this.send(new commands_1.FtpDisconnectCommand());
    }
    async getPassiveConnection() {
        const connection = await this.send(new commands_1.FtpPassiveModeCommand());
        return connection;
    }
    async send(command) {
        if (this.socket.destroyed || !this.socket.writable) {
            throw new exceptions_1.FtpNetworkException(`Cannot send command when connection is closed`);
        }
        if (this.socket.connecting) {
            throw new exceptions_1.FtpNetworkException(`Cannot send command when connection is not established`);
        }
        return await command.execute(this);
    }
    async write(data) {
        debug('[ WRITE ] %s', data);
        const toSend = iconv.encode(data + "\r\n", 'utf8');
        return new Promise((res, rej) => {
            const result = this.socket.write(toSend, null, (err) => {
                if (err) {
                    rej(new exceptions_1.FtpNetworkException(`Error sending command to server`, null, err));
                    return;
                }
                const bytesWritten = this.socket.bytesWritten - this.totalBytesWritten;
                this.totalBytesWritten = this.socket.bytesWritten;
                if (bytesWritten != toSend.length) {
                    rej(new exceptions_1.FtpNetworkException(`Error sending command to server, bytes send mismatch`));
                    return;
                }
                res(bytesWritten);
            });
            if (!result) {
                rej(new exceptions_1.FtpNetworkException(`Error sending command to server, cannot write all bytes to socket`));
            }
        });
    }
    /**
   * parse response from ftp server, also handles multi line response
   *
   * @param data - raw data buffer
   */
    parseResponse(data) {
        const response = [];
        this.responseBuffer = this.responseBuffer.concat(data.toString("binary").split(expressions_1.NEW_LINE).filter(l => l.trim() != ""));
        while (true) {
            const line = this.responseBuffer.shift();
            if (!line) {
                break;
            }
            const match = expressions_1.RE_CMD_LINE.exec(line);
            this.commandBuffer += (match[6] || match[7]) + expressions_1.NEW_LINE;
            if (match[3]) {
                const result = {
                    code: parseInt(match[3], 10),
                    message: this.commandBuffer
                };
                this.commandBuffer = "";
                response.push(result);
                debug('[ READ ] code: %s, message: %s', result.code, result.message);
            }
        }
        return response;
    }
    async getResponse() {
        return new Promise((res, rej) => {
            const responseInterval = setInterval(() => {
                if (this.responseQueue.length != 0) {
                    clearTimeout(timeout);
                    clearInterval(responseInterval);
                    res(this.responseQueue.shift());
                }
            }, 100);
            const timeout = setTimeout(() => {
                clearInterval(responseInterval);
                rej(new exceptions_1.FtpTimeoutException("Command response timeout"));
            }, this.configuration.timeout);
        });
    }
    onData(data) {
        const response = this.parseResponse(data);
        for (let r of response) {
            this.responseQueue.push(r);
        }
    }
}
exports.FtpCommandConnection = FtpCommandConnection;
//# sourceMappingURL=connection.js.map