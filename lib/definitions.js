"use strict";
/**
 * Types & structs definitions used by ftp client
 */
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * FTP transfer mode
 */
var FtpTransferMode;
(function (FtpTransferMode) {
    /**
     * Binary mode to transfer binaries & utf8 files
     */
    FtpTransferMode[FtpTransferMode["BINARY"] = 0] = "BINARY";
    /**
     * Text mode
     */
    FtpTransferMode[FtpTransferMode["TEXT"] = 1] = "TEXT";
})(FtpTransferMode = exports.FtpTransferMode || (exports.FtpTransferMode = {}));
//# sourceMappingURL=definitions.js.map