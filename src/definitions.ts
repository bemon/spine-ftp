/**
 * Types & structs definitions used by ftp client
 */

/**
 * FTP server command respone
 */
export interface FtpResponse {

    /**
     * Response code
     */
    code: number;

    /**
     * Response message
     */
    message: string;
}

/**
 * Base class for all ftp commands. Use it to implement any commands send to ftp server.
 * @example implementation of `FtpPasswordCommand`
 * @event end when command is finished
 * @event error when error occurred
 */
export interface FtpCommand {
    execute(_connection: FtpCommandConnectionInterface): Promise<any>
}

export interface FtpConnectionConfiguration {

    /**
     * Host adress, defaults to 'localhost'
     */
    host?: string;

    /**
     * Port address, default 21
     */
    port?: number;

    /**
     * Username, default is 'anonymous'
     */
    user?: string;

    /**
     * Password, default is 'anonymous'
     */
    password?: string;

    /**
     *  How long (in milliseconds) to wait for the control connection & data connection to be established
     */
    timeout?: number;

    /**
     * How often (in milliseconds) to send a 'dummy' (NOOP) command to keep the connection alive. 
     */
    keepAlive?: number;
}

export interface FtpConnectionInterface {

    /**
    * Connection config
    */
    configuration: FtpConnectionConfiguration;

    /**
         * Connects to ftp server
         * @throws { FtpTimeoutException } when timeout occurred when connecting to server
         * @throws { FtpNetworkException } when socket exception occurred
         * @throws { FtpException } when login/pass is invalid
         */
    connect(): Promise<void>;

    /**
     * Disconnects from server gracefully
     */
    disconnect(): Promise<void>
}

/**
 * Interface for FTP data connection. Data connection allows to send& receive files, get dir listin etc.
 */
export interface FtpDataConnectionInterface extends FtpConnectionInterface {

    /**
     * Download all data from socket to specified path
     * 
     * @param toFile - path to file 
     */
    download(toFile: string): Promise<void>;

    /**
    * Pipes readable stream to socket 
    * 
    * @param stream - stream to read data
    */
    upload(file: string, progress?: (bytesSend: number) => void): Promise<void>;

    /**
     * Reads all data from socket, until socket close. Use it for small amout of data eg. dir listing
     */
    readToEnd(): Promise<Buffer>;
}

/**
 * Interface of FTP command connection. used to send commands to ftp server & raw data
 */
export interface FtpCommandConnectionInterface extends FtpConnectionInterface {

    /**
     * Avaible connected ftp server feature list. 
     */
    features: FtpFeatures;

    /**
     * Sends ftp command to server & waits for response
     * 
     * @param command - command to send
     * @param priority - if true command is set at start of response queue. It allows to commands inside commands.
     * @returns { any } command result
     */
    send(command: FtpCommand, priority?: boolean): Promise<any>

    getResponse(): Promise<FtpResponse>;

    /**
     * Writes raw data to socket
     * 
     * @param data data to write
     * @returns { number } bytes written
     * @throws { FtpNetworkException } when cannot write to socket
     */
    write(data: string): Promise<number>;
}

/**
 * Progress callback definition.
 * 
 * @param current - current downloaded / uploaded bytes
 * @param total - total bytes to download / upload
 */
export type ProgressCallback = (current: number, total: number) => void;


/**
 * Enabled FTP server features. Some commands can be unavaible if some features are not set.
 */
export interface FtpFeatures {

    /**
     * Return the last-modified time of a specified file.
     */
    MDTM: boolean;

    /**
     * Return the size of a file.
     */
    SIZE: boolean;

    /**
     * Provides data about exactly the object named on its command line, and no others.
     */
    MLST: boolean;

    /**
     * Lists the contents of a directory if a directory is named.
     */
    MLSD: boolean;

    /**
     * Enable utf-8 transfer for text files
     */
    UTF8: boolean;

    /**
     * Can modify last modification time of a file
     */
    MFMT: boolean;

    /**
     * Extended passive mode
     */
    EPSV : boolean;
}

/**
 * FTP transfer mode
 */
export enum FtpTransferMode {

    /**
     * Binary mode to transfer binaries & utf8 files
     */
    BINARY,

    /**
     * Text mode
     */
    TEXT
}

/**
 * Internal interface to hold data connection options
 */
export interface FtpPassiveConfiguration {

    /**
     * Which host to connect to. Default we assume its original host speficied in config.
     */
    host: string;

    /**
     * Passive port number returned from FTP server
     */
    port: number;
}

/**
 * File/directory info from directory listing
 */
export interface FtpEntryInfo {

    /**
     * File size in bytes
     */
    size: number;

    /**
     * File name 
     */
    name: string;

    /**
     * Last modified date
     */
    modify: Date;

    /**
     * Type, for file its always "file", for dir its always `dir`, 'symlinc' for symbolic link unix only, `unknown` if cannot determine entry type
     */
    type: string;
}
