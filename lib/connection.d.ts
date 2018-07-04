/// <reference types="node" />
import * as net from 'net';
import { FtpFeatures, FtpCommandConnectionInterface, FtpConnectionConfiguration, FtpDataConnectionInterface, FtpCommand, FtpResponse } from './definitions';
import { EventEmitter } from 'events';
/**
 * Internal command connection & data connection implementation
 */
declare class FtpConnection {
    /**
     * Connection config
    */
    configuration: FtpConnectionConfiguration;
    protected socket: net.Socket;
    constructor();
    connect(): Promise<void>;
    protected onClose(_hadError: boolean): void;
    protected onEnd(): void;
    protected onError(): void;
    protected onData(_data: Buffer): void;
    protected dispose(): void;
}
export declare class FtpDataConnection extends FtpConnection implements FtpDataConnectionInterface {
    constructor(configuration?: FtpConnectionConfiguration);
    disconnect(): Promise<void>;
    download(toFile: string, progress?: (bytesDownload: number) => void): Promise<void>;
    upload(file: string, progress?: (bytesSend: number) => void): Promise<void>;
    readToEnd(): Promise<Buffer>;
}
export declare class FtpCommandConnection extends FtpConnection implements FtpCommandConnectionInterface {
    protected totalBytesWritten: number;
    protected responseBuffer: string[];
    protected commandBuffer: string;
    protected responseQueue: FtpResponse[];
    protected dataEvents: EventEmitter;
    /**
     * Server feature list.
     */
    features: FtpFeatures;
    /**
     * Connection config
     */
    configuration: FtpConnectionConfiguration;
    constructor(configuration?: FtpConnectionConfiguration);
    connect(): Promise<void>;
    disconnect(): Promise<void>;
    getPassiveConnection(): Promise<FtpDataConnectionInterface>;
    send(command: FtpCommand): Promise<any>;
    write(data: string): Promise<number>;
    /**
   * parse response from ftp server, also handles multi line response
   *
   * @param data - raw data buffer
   */
    private parseResponse;
    getResponse(): Promise<FtpResponse>;
    protected onData(data: Buffer): void;
}
export {};
