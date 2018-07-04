"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const exceptions_1 = require("./exceptions");
const definitions_1 = require("./definitions");
const connection_1 = require("./connection");
const expressions_1 = require("./expressions");
const fs = require("fs");
const _ = require("lodash");
const fspath = require("path");
const debug = require('debug')('spine-ftp');
/**
 * Internal FTP commands implementation
 */
class FtpLoginCommand {
    constructor(login, pass) {
        this.expectResponse = false;
        this.login = login;
        this.password = pass;
    }
    async execute(connection) {
        await connection.send(new FtpWelcomeCommand());
        await connection.send(new FtpUserCommand(this.login));
        await connection.send(new FtpPasswordCommand(this.password));
        const features = await connection.send(new FtpFeaturesCommand());
        _.assign(connection.features, features);
        if (connection.features.UTF8) {
            await connection.send(new FtpOptionCommand("UTF8", "ON"));
        }
        await connection.send(new TransferModeCommand(definitions_1.FtpTransferMode.BINARY));
    }
}
exports.FtpLoginCommand = FtpLoginCommand;
class FtpPasswordCommand {
    constructor(password) {
        this.password = password;
    }
    async execute(connection) {
        await connection.write(`PASS ${this.password}`);
        const response = await connection.getResponse();
        if (response.code === 530) {
            throw new exceptions_1.FtpAuthorizationException("Login failed", 530, new Error(response.message));
        }
    }
}
exports.FtpPasswordCommand = FtpPasswordCommand;
class FtpUserCommand {
    constructor(user) {
        this.user = user;
    }
    async execute(connection) {
        await connection.write(`USER ${this.user}`);
        const response = await connection.getResponse();
        if (response.code != 331) {
            throw new exceptions_1.FtpException("Cannot login to ftp server");
        }
    }
}
exports.FtpUserCommand = FtpUserCommand;
class TransferModeCommand {
    constructor(mode) {
        this.mode = mode;
    }
    async execute(connection) {
        switch (this.mode) {
            case definitions_1.FtpTransferMode.BINARY:
                await connection.write("TYPE I");
                break;
            case definitions_1.FtpTransferMode.TEXT:
                await connection.write("TYPE A");
                break;
        }
        const response = await connection.getResponse();
        if (response.code != 200) {
            throw new exceptions_1.FtpException(`Cannot set transfer mode to ${this.mode === definitions_1.FtpTransferMode.BINARY ? 'binary' : 'ascii'}`);
        }
    }
}
exports.TransferModeCommand = TransferModeCommand;
class CwdCommand {
    constructor(path) {
        this.path = "";
        this.path = path;
    }
    async execute(connection) {
        await connection.write(`CWD ${this.path}`);
        const response = await connection.getResponse();
        if (response.code >= 300) {
            return false;
        }
        return true;
    }
}
exports.CwdCommand = CwdCommand;
class PwdCommand {
    async execute(connection) {
        await connection.write("PWD");
        const response = await connection.getResponse();
        if (response.code >= 300) {
            throw new exceptions_1.FtpException("Cannot get current directory. Server returned 'not implemented' error code");
        }
        const match = expressions_1.RE_PWD.exec(response.message);
        return (match[1]) ? match[1] : null;
    }
}
exports.PwdCommand = PwdCommand;
class FtpDisconnectCommand {
    async execute(connection) {
        await connection.write("QUIT");
        const response = await connection.getResponse();
        if (response.code != 221) {
            throw new exceptions_1.FtpException("QUIT command failed", response.code);
        }
    }
}
exports.FtpDisconnectCommand = FtpDisconnectCommand;
class FtpFeaturesCommand {
    async execute(connection) {
        await connection.write("FEAT");
        const response = await connection.getResponse();
        if (response.code !== 211) {
            throw exceptions_1.FtpException.FromResponse("Cannot retrieve server features", response);
        }
        const features = {
            MDTM: false,
            MFMT: false,
            MLSD: false,
            MLST: false,
            SIZE: false,
            UTF8: false,
            EPSV: false
        };
        if (response.message.includes("MDTM")) {
            features.MDTM = true;
        }
        if (response.message.includes("SIZE")) {
            features.SIZE = true;
        }
        if (response.message.includes("MLST")) {
            features.MLST = true;
        }
        if (response.message.includes("MLSD")) {
            features.MLSD = true;
        }
        if (response.message.includes("UTF8")) {
            features.UTF8 = true;
        }
        if (response.message.includes("MFMT")) {
            features.MFMT = true;
        }
        if (response.message.includes("EPSV")) {
            features.EPSV = true;
        }
        return features;
    }
}
exports.FtpFeaturesCommand = FtpFeaturesCommand;
class FtpWelcomeCommand {
    async execute(connection) {
        const response = await connection.getResponse();
        if (response.code != 220) {
            throw new exceptions_1.FtpException(`Welcome response code invalid, aborting`);
        }
    }
}
exports.FtpWelcomeCommand = FtpWelcomeCommand;
class StoreCommand {
    constructor(localPath, filename, progress) {
        this.localPath = localPath;
        this.filename = filename;
        this.progress = progress;
        if (!fs.existsSync(localPath)) {
            throw new exceptions_1.FtpFileNotFoundException(`File ${localPath} not found.`);
        }
        if (!_.isNil(progress) && _.isFunction(progress)) {
            const stat = fs.statSync(this.localPath);
            this.fileSize = stat.size;
        }
    }
    async execute(connection) {
        const filename = (this.filename && this.filename.length !== 0) ? this.filename : fspath.basename(this.localPath);
        const psvConnection = await connection.send(new FtpPassiveModeCommand());
        await connection.write("STOR " + filename);
        const response = await connection.getResponse();
        if (response.code !== 150) {
            psvConnection.disconnect();
            throw new exceptions_1.FtpException(`Cannot upload file ${this.localPath}`, response.code, new Error(response.message));
        }
        await psvConnection.upload(this.localPath, (bytesSend) => {
            if (!_.isNil(this.progress) && _.isFunction(this.progress)) {
                this.progress(bytesSend, this.fileSize);
            }
        });
        const transferResponse = await connection.getResponse();
        if (transferResponse.code >= 400) {
            throw exceptions_1.FtpException.FromResponse(`Cannot upload file ${this.localPath}`, transferResponse);
        }
        debug("[ FILE ] Uploaded file " + this.localPath);
        return true;
    }
}
exports.StoreCommand = StoreCommand;
class FtpRetrieveFileCommand {
    constructor(sourceFile, targetFile, progress) {
        this.sourceFile = sourceFile;
        this.targetFile = targetFile;
        this.progress = progress;
    }
    async execute(connection) {
        let serverFileSize = 0;
        if (!_.isNil(this.progress) && _.isFunction(this.progress)) {
            serverFileSize = await connection.send(new SizeCommand(this.sourceFile));
        }
        const psvConnection = await connection.send(new FtpPassiveModeCommand());
        await connection.write(`RETR ${this.sourceFile}`);
        const response = await connection.getResponse();
        if (response.code != 150) {
            psvConnection.disconnect();
            throw new exceptions_1.FtpException(`Cannot download file ${this.sourceFile}`, response.code, new Error(response.message));
        }
        await psvConnection.download(this.targetFile, (bytesDownload) => {
            if (!_.isNil(this.progress) && _.isFunction(this.progress)) {
                this.progress(bytesDownload, serverFileSize);
            }
        });
        debug("[ FILE ] Downloaded file " + this.sourceFile + " to " + this.targetFile);
        const transferResponse = await connection.getResponse();
        if (transferResponse.code >= 400) {
            throw new exceptions_1.FtpException(`Cannot download file ${this.sourceFile}`, response.code, new Error(response.message));
        }
    }
}
exports.FtpRetrieveFileCommand = FtpRetrieveFileCommand;
class FtpListCommand {
    constructor(path) {
        this.path = path;
    }
    async execute(connection) {
        const path = this.path && this.path.trim() !== "" ? this.path : '';
        const psvConnection = await connection.send(new FtpPassiveModeCommand());
        if (connection.features.MLSD) {
            await connection.write(`MLSD ${path}`);
        }
        else {
            throw new exceptions_1.FtpException("MLSD not supported by server");
        }
        const response = await connection.getResponse();
        if (response.code != 150) {
            psvConnection.disconnect();
            throw new exceptions_1.FtpException("Cannot get directory listing", response.code, new Error(response.message));
        }
        const result = await psvConnection.readToEnd();
        const listing = result.toString((connection.features.UTF8 ? 'utf8' : 'binary')).split(expressions_1.NEW_LINE).filter(l => l !== "");
        const entries = [];
        for (let l of listing) {
            const rows = l.split(expressions_1.RE_SEP);
            const entry = {
                name: rows.pop().substring(1)
            };
            for (let r of rows) {
                const props = r.split(expressions_1.RE_EQ);
                entry[props[0].toLowerCase()] = props[1];
            }
            if (entry.size) {
                entry.size = parseInt(entry.size);
            }
            if (entry.modify) {
                const year = entry.modify.substr(0, 4);
                const month = entry.modify.substr(4, 2);
                const date = entry.modify.substr(6, 2);
                const hour = entry.modify.substr(8, 2);
                const minute = entry.modify.substr(10, 2);
                const second = entry.modify.substr(12, 2);
                entry.modify = new Date(`${year}-${month}-${date}T${hour}:${minute}:${second}`);
            }
            entries.push(entry);
        }
        return entries;
    }
}
exports.FtpListCommand = FtpListCommand;
class FtpPassiveModeCommand {
    async execute(connection) {
        await connection.write("EPSV");
        const response = await connection.getResponse();
        const match = expressions_1.RE_EPSV.exec(response.message);
        const port = parseInt(match[0]);
        const pasvConnection = new connection_1.FtpDataConnection({
            host: connection.configuration.host,
            port: port,
        });
        await pasvConnection.connect();
        return pasvConnection;
    }
}
exports.FtpPassiveModeCommand = FtpPassiveModeCommand;
class FtpOptionCommand {
    constructor(option, value) {
        this.option = option;
        this.value = value;
    }
    async execute(connection) {
        await connection.write(`OPTS ${this.option.toUpperCase()} ${this.value.toUpperCase()}`);
        const response = await connection.getResponse();
        if (response.code >= 300) {
            throw new exceptions_1.FtpException(`Cannot set option ${this.option}:${this.value}`, response.code, new Error(response.message));
        }
    }
}
exports.FtpOptionCommand = FtpOptionCommand;
class RenameCommand {
    constructor(from, to) {
        this.from = "";
        this.to = "";
        if (to === undefined || to === null || to.length === 0) {
            throw new exceptions_1.FtpException("Argument `to` cannot be null or empty");
        }
        if (from === undefined || from === null || from.length === 0) {
            throw new exceptions_1.FtpException("Argument `from` cannot be null or empty");
        }
        this.to = to;
        this.from = from;
    }
    async execute(connection) {
        await connection.send(new RenameFromCommand(this.from));
        await connection.send(new RenameToCommand(this.to));
    }
}
exports.RenameCommand = RenameCommand;
class RenameToCommand {
    constructor(to) {
        this.to = "";
        if (to === undefined || to === null || to.length === 0) {
            throw new exceptions_1.FtpException("Argument `to` cannot be null");
        }
        this.to = to;
    }
    async execute(connection) {
        await connection.write("RNTO " + this.to);
        const response = await connection.getResponse();
        if (response.code !== 250) {
            throw new exceptions_1.FtpException(`Cannot rename ${this.to}`, response.code, new Error(response.message));
        }
    }
}
exports.RenameToCommand = RenameToCommand;
class RenameFromCommand {
    constructor(from) {
        this.from = "";
        if (from === undefined || from === null || from.length === 0) {
            throw new exceptions_1.FtpException("Argument `from` cannot be null");
        }
        this.from = from;
    }
    async execute(connection) {
        await connection.write("RNFR " + this.from);
        const response = await connection.getResponse();
        if (response.code === 550) {
            throw new exceptions_1.FtpFileNotFoundException(`Cannot rename ${this.from}`, 550, new Error(response.message));
        }
        if (response.code !== 350) {
            throw exceptions_1.FtpException.FromResponse(`Cannot rename ${this.from}`, response);
        }
    }
}
exports.RenameFromCommand = RenameFromCommand;
class DeleteFileCommand {
    constructor(path) {
        this.path = "";
        this.path = path;
    }
    async execute(connection) {
        await connection.write("DELE " + this.path);
        const response = await connection.getResponse();
        if (response.code === 550) {
            throw new exceptions_1.FtpFileNotFoundException(`File ${this.path} not found on server`, response.code, new Error(response.message));
        }
        if (response.code !== 250) {
            throw new exceptions_1.FtpException(`Cannot delete file ${this.path} from server`, response.code, new Error(response.message));
        }
    }
}
exports.DeleteFileCommand = DeleteFileCommand;
class GoUpDirectoryCommand {
    async execute(connection) {
        await connection.write("CDUP");
        const response = await connection.getResponse();
        if (response.code >= 400) {
            throw new exceptions_1.FtpException("Cannot change directory");
        }
    }
}
exports.GoUpDirectoryCommand = GoUpDirectoryCommand;
class DeleteDirectoryCommand {
    constructor(path) {
        this.path = "";
        this.path = path;
    }
    async execute(connection) {
        const cwd = await connection.send(new PwdCommand());
        const exists = await connection.send(new CwdCommand(this.path));
        if (!exists) {
            throw new exceptions_1.FtpDirectoryNotFoundException(`Directory ${this.path} not found or on server`);
        }
        const dirContent = await connection.send(new FtpListCommand());
        const files = dirContent.filter(f => f.type === "file");
        for (let f of files) {
            await connection.send(new DeleteFileCommand(f.name), true);
        }
        await connection.send(new GoUpDirectoryCommand(), true);
        connection.write("RMD " + this.path);
        const response = await connection.getResponse();
        if (response.code >= 400) {
            throw exceptions_1.FtpException.FromResponse("Cannot delete directory", response);
        }
        await connection.send(new CwdCommand(cwd));
    }
    async onResponse(response) {
        if (response.code === 550) {
            throw new exceptions_1.FtpDirectoryNotFoundException(`Directory ${this.path} not found or not empty on server`, response.code, new Error(response.message));
        }
        if (response.code !== 250) {
            throw new exceptions_1.FtpException(`Cannot delete directory ${this.path} from server`, response.code, new Error(response.message));
        }
    }
}
exports.DeleteDirectoryCommand = DeleteDirectoryCommand;
class ChangeModificationTime {
    constructor(path, newDate) {
        this.path = path;
        this.newDate = newDate;
    }
    async execute(connection) {
        if (connection.features.MDTM) {
            connection.write(`MFMT ${formatDate(this.newDate)} ${this.path}`);
        }
        else {
            throw new exceptions_1.FtpException("MFMT feature not avaible on FTP server");
        }
        const response = await connection.getResponse();
        if (response.code != 213) {
            throw new exceptions_1.FtpException(`Cannot get last modification time of file ${this.path}`, response.code, new Error(response.message));
        }
        function formatDate(date) {
            return date.getUTCFullYear() + _.padStart(date.getUTCMonth().toString(), 2, "0")
                + _.padStart(date.getUTCDate().toString(), 2, "0")
                + _.padStart(date.getUTCHours().toString(), 2, "0")
                + _.padStart(date.getUTCMinutes().toString(), 2, "0")
                + _.padStart(date.getUTCSeconds().toString(), 2, "0");
        }
    }
}
exports.ChangeModificationTime = ChangeModificationTime;
class LastModifiedTimeCommand {
    constructor(path) {
        this.path = path;
    }
    async execute(connection) {
        if (connection.features.MDTM) {
            connection.write("MDTM " + this.path);
        }
        else {
            throw new exceptions_1.FtpException("MDTM feature not avaible on FTP server");
        }
        const response = await connection.getResponse();
        if (response.code === 550) {
            throw new exceptions_1.FtpFileNotFoundException(`Cannot get modifitacion time for ${this.path}`, 550, new Error(response.message));
        }
        if (response.code != 213) {
            throw exceptions_1.FtpException.FromResponse(`Cannot get last modification time of file ${this.path}`, response);
        }
        const m = expressions_1.RE_LAST_MOD_TIME.exec(response.message.trim());
        const date = new Date(parseInt(m[1]), parseInt(m[2]), parseInt(m[3]), parseInt(m[4]), parseInt(m[5]), parseInt(m[6]));
        // adjust timezone
        return new Date(date.getTime() - date.getTimezoneOffset() * 60 * 1000);
    }
}
exports.LastModifiedTimeCommand = LastModifiedTimeCommand;
class SizeCommand {
    constructor(path) {
        this.path = path;
    }
    async execute(connection) {
        if (connection.features.SIZE) {
            connection.write("SIZE " + this.path);
        }
        else {
            throw new exceptions_1.FtpException("SIZE feature not avaible on FTP server");
        }
        const response = await connection.getResponse();
        if (response.code === 550) {
            throw new exceptions_1.FtpFileNotFoundException(`File ${this.path} not found on server`, 550, new Error(response.message));
        }
        else if (response.code != 213) {
            throw exceptions_1.FtpException.FromResponse(`Cannot retrieve file ${this.path} size`, response);
        }
        return parseInt(response.message);
    }
}
exports.SizeCommand = SizeCommand;
class MkDirCommand {
    constructor(path, recursive, cwdDir) {
        this.nextRun = false;
        this.cwdDir = "";
        this.path = path;
        this.recursive = recursive;
        this.cwdDir = cwdDir !== undefined ? cwdDir : "";
    }
    async execute(connection) {
        // ensure that we are at root directory
        if (this.cwdDir.length === 0) {
            await connection.send(new CwdCommand("/"));
        }
        if (!this.recursive) {
            const dir = this.path.split("/").pop();
            await connection.send(new CwdCommand(this.path));
            await connection.write("MKD " + dir);
            await checkResponse();
        }
        else {
            const dirs = this.path.split("/").filter(d => d.trim() !== "");
            let traverse = "";
            while (true) {
                traverse += "/" + dirs.shift();
                const exists = await connection.send(new CwdCommand(this.cwdDir + traverse));
                if (!exists) {
                    await connection.write("MKD " + traverse.split("/").pop());
                    await checkResponse();
                    await connection.send(new CwdCommand(this.cwdDir + traverse));
                    const nextPath = this.path.substr(traverse.length);
                    if (nextPath.length !== 0) {
                        await connection.send(new MkDirCommand(this.path.substr(traverse.length), true, this.cwdDir + traverse));
                    }
                    break;
                }
            }
        }
        async function checkResponse() {
            const response = await connection.getResponse();
            if (response.code === 257) {
                return true;
            }
            throw new exceptions_1.FtpException(`Cannot create directory ${this.path}`, response.code, new Error(response.message));
        }
    }
}
exports.MkDirCommand = MkDirCommand;
//# sourceMappingURL=commands.js.map