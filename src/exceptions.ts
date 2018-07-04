import { FtpResponse } from "./definitions";

const debug = require('debug')('spine-ftp');


/**
 * Base class for all ftp related errors & exceptions
 */
export class FtpException {

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
    constructor(message: string, code?: number, innerException?: Error) {

        debug('[ ERROR ] %s: Error ocurred: %s, code: %s, inner exception: %s', this.constructor.name, message, code || 'n/a', innerException ? innerException.message : 'n/a');

        this.message = message;
        this.code = code;
        this.innerException = innerException;
    }

    
    public static FromResponse(message: string, response : FtpResponse){
        return new FtpException(message, response.code, new Error(response.message));
    }
}

/**
 * Exception thrown when file is not found on ftp server
 */
export class FtpFileNotFoundException extends FtpException {

}

/**
 * Exception thrown when connection timeout occurs
 */
export class FtpTimeoutException extends FtpException {

}

/**
 * Exception thrown when directory is not found on server
 */
export class FtpDirectoryNotFoundException extends FtpException {

}

/**
 * Generic network error
 */
export class FtpNetworkException extends FtpException {

}

/**
 * Exception thrown when cannot authorize user
 */
export class FtpAuthorizationException extends FtpException
{

}

 


