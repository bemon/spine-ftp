import { FtpResponse } from "./definitions";
/**
 * Base class for all ftp related errors & exceptions
 */
export declare class FtpException {
    /**
     * Error message
     */
    message: string;
    /**
     * Error code from FTP server if possible
     */
    code?: number;
    /**
     * Original exception if avaible eg. exception from socket.
     */
    innerException?: Error;
    /**
     *
     * @param message exception message
     * @param code exception code if possible
     * @param innerException original error/exception if avaible
     */
    constructor(message: string, code?: number, innerException?: Error);
    static FromResponse(message: string, response: FtpResponse): FtpException;
}
/**
 * Exception thrown when file is not found on ftp server
 */
export declare class FtpFileNotFoundException extends FtpException {
}
/**
 * Exception thrown when connection timeout occurs
 */
export declare class FtpTimeoutException extends FtpException {
}
/**
 * Exception thrown when directory is not found on server
 */
export declare class FtpDirectoryNotFoundException extends FtpException {
}
/**
 * Generic network error
 */
export declare class FtpNetworkException extends FtpException {
}
/**
 * Exception thrown when cannot authorize user
 */
export declare class FtpAuthorizationException extends FtpException {
}
