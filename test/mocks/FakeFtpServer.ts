import * as net from 'net';
import * as iconv from 'iconv-lite';
import { Stream } from 'stream';

export const FTP_FAKE_PORT = 9434;
export const FTP_FAKE_HOST = "127.0.0.1";
export const FTP_FAKE_DATA_PORT = 9258;



export class FakeFtpServer {
    server: net.Server;

    socket: net.Socket;

    responses: any[] = [];

    dataServer: net.Server;

    dataSocket: net.Socket;

    protected responseBuffer: string[] = [];

    protected commandBuffer: string = "";

    public commands: string[] = [];

    constructor() {
        this.server = net.createServer((socket: net.Socket) => {
            this.socket = socket;

            this.send(`220 FtpFake server` + "\r\n");
            this.socket.on("data", this.onData.bind(this))
        });
    }

    send(message: string) {
        const toSend = iconv.encode(message, 'utf8');
        this.socket.write(toSend);
    }
    onData(data: Buffer) {


        if (data.toString().includes("EPSV")) {
            this.send(`229 Entering Extended Passive Mode (|||${FTP_FAKE_DATA_PORT}|)`);
            this.dataServer = net.createServer((socket: net.Socket) => {
                this.dataSocket = socket;
            });
            this.dataServer.listen(FTP_FAKE_DATA_PORT, FTP_FAKE_HOST);
        } else {
            const response = this.responses.shift();
            if (response == null) {
                throw Error("No response, check your test !");
            }

            if (response.multiline) {
                this.send(`${response.code}${response.message}` + "\r\n");
            } else {
                this.send(`${response.code} ${response.message}` + "\r\n");
            }

            if(response.callback){
                response.callback.call(this);
            }
        }



        this.commands.push(data.toString());
    }

    fakeData(data: string) {
        if (this.dataSocket) {
            this.dataSocket.write(iconv.encode(data, "utf8"));
            this.dataSocket.destroy();
            this.dataServer.close();
        }
    }

    fakeStream(data: Stream) {
        if (this.dataSocket) {
            data.pipe(this.dataSocket);
        }
    }

    fakeResponse(code: number, message: string, callback? : () => void) {
        this.responses.push({
            code,
            message,
            callback
        });
    }

    fakeResponseMultiline(code: number, message: string) {
        this.responses.push({
            code,
            message,
            multiline: true
        });
    }

    start() {
        this.server.listen(FTP_FAKE_PORT, FTP_FAKE_HOST);
    }

    stop() {
        this.socket.destroy();
        this.server.close();

        if (this.dataServer) {
            this.dataServer.close();
        }

        if (this.dataSocket) {
            this.dataSocket.destroy();
        }
    }
}