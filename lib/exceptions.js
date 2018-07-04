"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const debug = require('debug')('spine-ftp');
/**
 * Base class for all ftp related errors & exceptions
 */
class FtpException {
    /**
     *
     * @param message exception message
     * @param code exception code if possible
     * @param innerException original error/exception if avaible
     */
    constructor(message, code, innerException) {
        debug('[ ERROR ] %s: Error ocurred: %s, code: %s, inner exception: %s', this.constructor.name, message, code || 'n/a', innerException ? innerException.message : 'n/a');
        this.message = message;
        this.code = code;
        this.innerException = innerException;
    }
    static FromResponse(message, response) {
        return new FtpException(message, response.code, new Error(response.message));
    }
}
exports.FtpException = FtpException;
/**
 * Exception thrown when file is not found on ftp server
 */
class FtpFileNotFoundException extends FtpException {
}
exports.FtpFileNotFoundException = FtpFileNotFoundException;
/**
 * Exception thrown when connection timeout occurs
 */
class FtpTimeoutException extends FtpException {
}
exports.FtpTimeoutException = FtpTimeoutException;
/**
 * Exception thrown when directory is not found on server
 */
class FtpDirectoryNotFoundException extends FtpException {
}
exports.FtpDirectoryNotFoundException = FtpDirectoryNotFoundException;
/**
 * Generic network error
 */
class FtpNetworkException extends FtpException {
}
exports.FtpNetworkException = FtpNetworkException;
/**
 * Exception thrown when cannot authorize user
 */
class FtpAuthorizationException extends FtpException {
}
exports.FtpAuthorizationException = FtpAuthorizationException;
//# sourceMappingURL=exceptions.js.map