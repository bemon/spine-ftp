import * as net from 'net';
import * as iconv from 'iconv-lite';
import * as _ from 'lodash';
import * as fs from 'fs';
import { RE_CMD_LINE, NEW_LINE } from './expressions';
import { FtpNetworkException, FtpTimeoutException, FtpException } from './exceptions';
import { FtpFeatures, FtpCommandConnectionInterface, FtpConnectionConfiguration, FtpDataConnectionInterface, FtpCommand, FtpResponse } from './definitions';
import { FtpLoginCommand, FtpDisconnectCommand, FtpPassiveModeCommand } from './commands';
import { EventEmitter } from 'events';

const debug = require('debug')('spine-ftp');

/**
 * Internal command connection & data connection implementation
 */

class FtpConnection {
    /**
     * Connection config
    */
    configuration: FtpConnectionConfiguration;

    protected socket: net.Socket;

    constructor() {
        this.socket = new net.Socket();
    }

    async connect() {
        const self = this;
        this.socket.setTimeout(this.configuration.timeout);

        return new Promise<void>((res, rej) => {

            this.socket.connect(this.configuration.port, this.configuration.host, () => {
                this.socket.removeListener("error", _onConnectionError);
                this.socket.removeListener("timeout", _onConnectionTimeout);
                this.socket.setTimeout(0);


                debug("Connected to server")

                res();
            });

            this.socket.on("error", _onConnectionError);
            this.socket.on("timeout", _onConnectionTimeout);

            function _onConnectionTimeout() {
                self.socket.destroy();
                rej(new FtpTimeoutException(`Cannot connect to: ${self.configuration.host}:${self.configuration.port}, reason: timeout (${self.configuration.timeout} ms)`));
            }
            function _onConnectionError(err: Error) {
                rej(new FtpNetworkException(`Cannot connect to ftp data socket at: ${self.configuration.host}:${self.configuration.port}`, null, err));
            }
        });
    }

    protected onClose(_hadError: boolean) {
        if (_hadError) {
            debug("[ ERROR ] Connection lost due error in socket");
        }

        this.dispose();
    }

    protected onEnd() {
        this.socket.end();
    }

    protected onError() {
        this.dispose();
    }

    protected onData(_data: Buffer) {

    }

    protected dispose() {

        debug("Disconnected from server")

        this.socket.destroy();
        this.socket.removeListener("data", this.onData);
        this.socket.removeListener("error", this.onError);
        this.socket.removeListener("end", this.onEnd);
        this.socket.removeListener("close", this.onClose);
    }
}

export class FtpDataConnection extends FtpConnection implements FtpDataConnectionInterface {

    constructor(configuration?: FtpConnectionConfiguration) {
        super();

        if (_.isNil(configuration.host) || !_.isString(configuration.host) || _.isEmpty(configuration.host)) {
            throw new FtpException("You must provide host for data connection !")
        }

        if (_.isNil(configuration.port) || !_.isNumber(configuration.port) || configuration.port <= 0) {
            throw new FtpException("You must provide port for data connection !")
        }

        this.socket = new net.Socket();
        this.configuration = _.defaults(configuration, {
            timeout: 10000
        });
    }

    async disconnect() {
        this.dispose();
    }

    download(toFile: string, progress?: (bytesDownload: number) => void): Promise<void> {

        const fStream = fs.createWriteStream(toFile);

        this.socket.pipe(fStream);
        this.socket.on("data", _progressFn);
        return new Promise<void>((res, rej) => {
            this.socket.once("close", () => {
                this.disconnect();
                res();
            });
            this.socket.once("error", rej);
            fStream.once("error", rej);
        });

        function _progressFn(data: Buffer | string) {
            if (!_.isNil(progress) && _.isFunction(progress)) {
                progress(data.length);
            }
        }
    }

    upload(file: string, progress?: (bytesSend: number) => void): Promise<void> {

        const fStream = fs.createReadStream(file);
        let totalRead = 0;
        fStream.on("data", function (chunk: Buffer | string | any) {
            if (!_.isNil(progress) && _.isFunction(progress)) {
                totalRead += chunk.length;
                progress(totalRead);
            }
        });
        fStream.pipe(this.socket);

        return new Promise<void>((res, rej) => {
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

    async readToEnd(): Promise<Buffer> {
        const chunkSize = 1024; // 1 kb
        let marker = 0;
        let result: Buffer = Buffer.alloc(chunkSize);

        return new Promise<Buffer>((res, rej) => {

            this.socket.on("data", (buffer: Buffer) => {

                if (marker + buffer.length > result.length) {
                    let tmpBuffer = new Buffer(result.length * 2);
                    result.copy(tmpBuffer, 0, 0, marker);
                    result = tmpBuffer;
                } else {
                    buffer.copy(result, marker, 0, buffer.length);
                    marker += buffer.length;
                }
            });

            this.socket.once("end",_onEnd);
            this.socket.once("error", (err: Error) => {
                rej(err);
            });

            function _onEnd(_hadError?: boolean) {
                if (_hadError) {
                    rej(new FtpNetworkException("Data socket error"));
                    return;
                }
    
                const finalBuffer = new Buffer(marker);
                result.copy(finalBuffer, 0, 0, marker);
    
                this.dispose();
                res(finalBuffer);
            };
        });

        
    }
}

export class FtpCommandConnection extends FtpConnection implements FtpCommandConnectionInterface {

    protected totalBytesWritten: number = 0;
    protected responseBuffer: string[] = [];
    protected commandBuffer: string = "";
    protected responseQueue: FtpResponse[] = [];

    protected dataEvents: EventEmitter = new EventEmitter();

    /**
     * Server feature list. 
     */
    public features: FtpFeatures = {
        MDTM: false,
        MFMT: false,
        MLSD: false,
        MLST: false,
        SIZE: false,
        UTF8: false,
        EPSV: false
    };

    /**
     * Connection config
     */
    public configuration: FtpConnectionConfiguration;

    constructor(configuration?: FtpConnectionConfiguration) {
        super();

        this.configuration = _.defaults(configuration, {
            host: "localhost",
            port: 21,
            user: "anonymous",
            password: "anonymous",
            timeout: 10000,
            keepAlive: 10000
        });

    }

    public async connect(): Promise<void> {
        this.socket.on("data", this.onData.bind(this));
        this.socket.on("error", this.onError.bind(this));
        this.socket.on("end", this.onEnd.bind(this));
        this.socket.on("close", this.onClose.bind(this));

        await super.connect();
        await this.send(new FtpLoginCommand(this.configuration.user, this.configuration.password));
    }

    public async disconnect() {
        await this.send(new FtpDisconnectCommand());
    }

    public async getPassiveConnection(): Promise<FtpDataConnectionInterface> {
        const connection = await this.send(new FtpPassiveModeCommand());
        return connection;
    }

    public async send(command: FtpCommand): Promise<any> {

        if (this.socket.destroyed || !this.socket.writable) {
            throw new FtpNetworkException(`Cannot send command when connection is closed`);
        }

        if (this.socket.connecting) {
            throw new FtpNetworkException(`Cannot send command when connection is not established`);
        }

        return await command.execute(this);
    }

    public async write(data: string): Promise<number> {

        debug('[ WRITE ] %s', data);

        const toSend = iconv.encode(data + "\r\n", 'utf8');

        return new Promise<number>((res, rej) => {
            const result = this.socket.write(toSend, null, (err: any) => {
                if (err) {
                    rej(new FtpNetworkException(`Error sending command to server`, null, err));
                    return;
                }

                const bytesWritten = this.socket.bytesWritten - this.totalBytesWritten;
                this.totalBytesWritten = this.socket.bytesWritten;

                if (bytesWritten != toSend.length) {
                    rej(new FtpNetworkException(`Error sending command to server, bytes send mismatch`));
                    return;
                }

                res(bytesWritten);
            });

            if (!result) {
                rej(new FtpNetworkException(`Error sending command to server, cannot write all bytes to socket`));
            }
        })
    }

    /**
   * parse response from ftp server, also handles multi line response
   * 
   * @param data - raw data buffer
   */
    private parseResponse(data: Buffer): FtpResponse[] {

        const response = [];

        this.responseBuffer = this.responseBuffer.concat(data.toString("binary").split(NEW_LINE).filter(l => l.trim() != ""));

        while (true) {

            const line = this.responseBuffer.shift();

            if (!line) {
                break;
            }

            const match = RE_CMD_LINE.exec(line);
            this.commandBuffer += (match[6] || match[7]) + NEW_LINE;

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

    public async getResponse(): Promise<FtpResponse> {


        return new Promise<FtpResponse>((res, rej) => {

            const responseInterval = setInterval(() => {
                if (this.responseQueue.length != 0) {
                    clearTimeout(timeout);
                    clearInterval(responseInterval);

                    res(this.responseQueue.shift());
                }
            }, 100);

            const timeout = setTimeout(() => {
                clearInterval(responseInterval);
                rej(new FtpTimeoutException("Command response timeout"))
            }, this.configuration.timeout);

        });
    }

    protected onData(data: Buffer) {

        const response = this.parseResponse(data);

        for (let r of response) {
            this.responseQueue.push(r);
        }
    }
} 