import { FtpException, FtpFileNotFoundException, FtpDirectoryNotFoundException, FtpAuthorizationException } from './exceptions';
import { FtpCommand, FtpResponse, FtpCommandConnectionInterface, FtpDataConnectionInterface, FtpTransferMode, FtpEntryInfo, ProgressCallback, FtpFeatures } from './definitions';
import { FtpDataConnection } from './connection';
import { RE_PWD, NEW_LINE, RE_SEP, RE_EQ, RE_EPSV, RE_LAST_MOD_TIME } from './expressions';
import * as fs from "fs";
import * as _ from 'lodash';
import * as fspath from "path";
import { parseListLine } from './parseList';
const debug = require('debug')('spine-ftp');

/**
 * Internal FTP commands implementation
 */

export class FtpLoginCommand implements FtpCommand {

    expectResponse = false;

    login: string;
    password: string;

    constructor(login: string, pass: string) {
        this.login = login;
        this.password = pass;
    }

    async execute(connection: FtpCommandConnectionInterface): Promise<void> {

        await connection.send(new FtpWelcomeCommand());
        await connection.send(new FtpUserCommand(this.login));
        await connection.send(new FtpPasswordCommand(this.password));

        const features = await connection.send(new FtpFeaturesCommand());
        _.assign(connection.features, features);

        if (connection.features.UTF8) {
            await connection.send(new FtpOptionCommand("UTF8", "ON"));
        }

        await connection.send(new TransferModeCommand(FtpTransferMode.BINARY));
    }
}

export class FtpPasswordCommand implements FtpCommand {

    password: string;

    constructor(password: string) {
        this.password = password;
    }

    async execute(connection: FtpCommandConnectionInterface): Promise<void> {
        await connection.write(`PASS ${this.password}`);

        const response = await connection.getResponse();
        if (response.code === 530) {
            throw new FtpAuthorizationException("Login failed", 530, new Error(response.message));
        }
    }
}

export class FtpUserCommand implements FtpCommand {

    user: string;

    constructor(user: string) {
        this.user = user;
    }

    async execute(connection: FtpCommandConnectionInterface): Promise<void> {
        await connection.write(`USER ${this.user}`);

        const response = await connection.getResponse();
        if (response.code != 331) {
            throw new FtpException("Cannot login to ftp server");
        }
    }
}


export class TransferModeCommand implements FtpCommand {
    mode: FtpTransferMode;

    constructor(mode: FtpTransferMode) {
        this.mode = mode;
    }

    async execute(connection: FtpCommandConnectionInterface) {
        switch (this.mode) {
            case FtpTransferMode.BINARY:
                await connection.write("TYPE I");
                break;
            case FtpTransferMode.TEXT:
                await connection.write("TYPE A");
                break;
        }

        const response = await connection.getResponse();
        if (response.code != 200) {
            throw new FtpException(`Cannot set transfer mode to ${this.mode === FtpTransferMode.BINARY ? 'binary' : 'ascii'}`);
        }
    }
}

export class CwdCommand implements FtpCommand {

    path: string = "";
    constructor(path: string) {
        this.path = path;
    }

    async execute(connection: FtpCommandConnectionInterface) {
        await connection.write(`CWD ${this.path}`);

        const response = await connection.getResponse();
        if (response.code >= 300) {
            return false;
        }

        return true;
    }
}

export class PwdCommand implements FtpCommand {

    async execute(connection: FtpCommandConnectionInterface) {
        await connection.write("PWD");

        const response = await connection.getResponse();
        if (response.code >= 300) {
            throw new FtpException("Cannot get current directory. Server returned 'not implemented' error code");
        }

        const match = RE_PWD.exec(response.message);
        return (match[1]) ? match[1] : null
    }
}


export class FtpDisconnectCommand implements FtpCommand {

    async execute(connection: FtpCommandConnectionInterface) {
        await connection.write("QUIT");

        const response = await connection.getResponse();
        if (response.code != 221) {
            throw new FtpException("QUIT command failed", response.code);
        }
    }
}


export class FtpFeaturesCommand implements FtpCommand {

    async execute(connection: FtpCommandConnectionInterface) {
        await connection.write("FEAT");

        const response = await connection.getResponse();

        if (response.code !== 211) {
            throw FtpException.FromResponse("Cannot retrieve server features", response);
        }

        const features: FtpFeatures = {
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

export class FtpWelcomeCommand implements FtpCommand {

    async execute(connection: FtpCommandConnectionInterface): Promise<void> {
        const response = await connection.getResponse();

        if (response.code != 220) {
            throw new FtpException(`Welcome response code invalid, aborting`);
        }
    }
}

export class StoreCommand implements FtpCommand {

    localPath: string;

    filename?: string;

    progress?: ProgressCallback;

    fileSize?: number;

    constructor(localPath: string, filename?: string, progress?: ProgressCallback) {

        this.localPath = localPath;
        this.filename = filename;
        this.progress = progress;

        if (!fs.existsSync(localPath)) {
            throw new FtpFileNotFoundException(`File ${localPath} not found.`);
        }

        if (!_.isNil(progress) && _.isFunction(progress)) {
            const stat = fs.statSync(this.localPath);
            this.fileSize = stat.size;
        }
    }

    async execute(connection: FtpCommandConnectionInterface) {

        const filename = (this.filename && this.filename.length !== 0) ? this.filename : fspath.basename(this.localPath);
        const psvConnection = await connection.send(new FtpPassiveModeCommand());

        await connection.write("STOR " + filename);
        const response = await connection.getResponse();
        if (response.code !== 150) {
            psvConnection.disconnect();
            throw new FtpException(`Cannot upload file ${this.localPath}`, response.code, new Error(response.message));
        }
        await psvConnection.upload(this.localPath, (bytesSend: number) => {
            if (!_.isNil(this.progress) && _.isFunction(this.progress)) {
                this.progress(bytesSend, this.fileSize);
            }
        });

        const transferResponse = await connection.getResponse();
        if (transferResponse.code >= 400) {
            throw FtpException.FromResponse(`Cannot upload file ${this.localPath}`, transferResponse);
        }

        debug("[ FILE ] Uploaded file " + this.localPath);

        return true;
    }
}

export class FtpRetrieveFileCommand implements FtpCommand {
    sourceFile: string;
    targetFile: string;
    progress?: ProgressCallback;


    psvConnection: FtpDataConnectionInterface;

    constructor(sourceFile: string, targetFile: string, progress?: ProgressCallback) {
        this.sourceFile = sourceFile;
        this.targetFile = targetFile
        this.progress = progress;
    }

    async execute(connection: FtpCommandConnectionInterface) {

        let serverFileSize = 0;

        if (!_.isNil(this.progress) && _.isFunction(this.progress)) {
            serverFileSize = await connection.send(new SizeCommand(this.sourceFile));
        }


        const psvConnection = await connection.send(new FtpPassiveModeCommand());
        await connection.write(`RETR ${this.sourceFile}`);

        const response = await connection.getResponse();
        if (response.code != 150) {
            psvConnection.disconnect();
            throw new FtpException(`Cannot download file ${this.sourceFile}`, response.code, new Error(response.message));
        }

        await psvConnection.download(this.targetFile, (bytesDownload: number) => {
            if (!_.isNil(this.progress) && _.isFunction(this.progress)) {
                this.progress(bytesDownload, serverFileSize);
            }
        });

        debug("[ FILE ] Downloaded file " + this.sourceFile + " to " + this.targetFile);

        const transferResponse = await connection.getResponse();
        if (transferResponse.code >= 400) {
            throw new FtpException(`Cannot download file ${this.sourceFile}`, response.code, new Error(response.message));
        }
    }

}


export class FtpListCommand implements FtpCommand {

    path: string;


    constructor(path?: string) {
        this.path = path;
    }

    async execute(connection: FtpCommandConnectionInterface) {
        const path = this.path && this.path.trim() !== "" ? this.path : '';

        const psvConnection = await connection.send(new FtpPassiveModeCommand());

        if (connection.features.MLSD) {
            await connection.write(`MLSD ${path}`);
        } else {
            await connection.write(`LIST ${path}`);
        }

        const response = await connection.getResponse();
        if (response.code != 150) {
            psvConnection.disconnect();
            throw new FtpException("Cannot get directory listing", response.code, new Error(response.message));
        }

        const result: Buffer = await psvConnection.readToEnd();

        const listing = result.toString((connection.features.UTF8 ? 'utf8' : 'binary')).split(NEW_LINE).filter(l => l !== "");
        const entries = [];

        for (let l of listing) {
            const rows = l.split(RE_SEP);

            if (connection.features.MLSD) {
                const entry: any = {
                    name: rows.pop().substring(1)
                };

                for (let r of rows) {
                    const props = r.split(RE_EQ);
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
            } else {
                for (let r of rows) {
                    const entry = parseListLine(r);
                    if (entry !== undefined) {
                        entries.push(entry);
                    }
                }
            }
        }
        return entries;
    }
}

export class FtpPassiveModeCommand implements FtpCommand {
    async execute(connection: FtpCommandConnectionInterface) {
        await connection.write("EPSV");

        const response = await connection.getResponse();
        const match = RE_EPSV.exec(response.message);
        const port = parseInt(match[0]);

        const pasvConnection = new FtpDataConnection({
            host: connection.configuration.host,
            port: port,
        });

        await pasvConnection.connect();
        return pasvConnection;
    }
}

export class FtpOptionCommand implements FtpCommand {

    option: string;
    value: string;

    constructor(option: string, value: string) {
        this.option = option;
        this.value = value;
    }

    async execute(connection: FtpCommandConnectionInterface) {
        await connection.write(`OPTS ${this.option.toUpperCase()} ${this.value.toUpperCase()}`);

        const response = await connection.getResponse();
        if (response.code >= 300) {
            throw new FtpException(`Cannot set option ${this.option}:${this.value}`, response.code, new Error(response.message));
        }
    }
}

export class RenameCommand implements FtpCommand {
    from: string = "";
    to: string = "";

    constructor(from: string, to: string) {
        if (to === undefined || to === null || to.length === 0) {
            throw new FtpException("Argument `to` cannot be null or empty");
        }

        if (from === undefined || from === null || from.length === 0) {
            throw new FtpException("Argument `from` cannot be null or empty");
        }

        this.to = to;
        this.from = from;

    }

    async execute(connection: FtpCommandConnectionInterface) {
        await connection.send(new RenameFromCommand(this.from));
        await connection.send(new RenameToCommand(this.to));
    }
}

export class RenameToCommand implements FtpCommand {

    to: string = "";

    constructor(to: string) {
        if (to === undefined || to === null || to.length === 0) {
            throw new FtpException("Argument `to` cannot be null");
        }

        this.to = to;
    }

    async execute(connection: FtpCommandConnectionInterface) {
        await connection.write("RNTO " + this.to);

        const response = await connection.getResponse();
        if (response.code !== 250) {
            throw new FtpException(`Cannot rename ${this.to}`, response.code, new Error(response.message));
        }
    }
}


export class RenameFromCommand implements FtpCommand {

    from: string = "";

    constructor(from: string) {
        if (from === undefined || from === null || from.length === 0) {
            throw new FtpException("Argument `from` cannot be null");
        }

        this.from = from;
    }

    async execute(connection: FtpCommandConnectionInterface) {
        await connection.write("RNFR " + this.from);

        const response = await connection.getResponse();
        if (response.code === 550) {
            throw new FtpFileNotFoundException(`Cannot rename ${this.from}`, 550, new Error(response.message));
        }
        if (response.code !== 350) {
            throw FtpException.FromResponse(`Cannot rename ${this.from}`, response);
        }
    }
}

export class DeleteFileCommand implements FtpCommand {
    path: string = "";

    constructor(path: string) {
        this.path = path;
    }

    async execute(connection: FtpCommandConnectionInterface) {
        await connection.write("DELE " + this.path);

        const response = await connection.getResponse();
        if (response.code === 550) {
            throw new FtpFileNotFoundException(`File ${this.path} not found on server`, response.code, new Error(response.message));
        }

        if (response.code !== 250) {
            throw new FtpException(`Cannot delete file ${this.path} from server`, response.code, new Error(response.message));
        }
    }
}

export class GoUpDirectoryCommand implements FtpCommand {
    async execute(connection: FtpCommandConnectionInterface) {
        await connection.write("CDUP");

        const response = await connection.getResponse();
        if (response.code >= 400) {
            throw new FtpException("Cannot change directory");
        }
    }
}

export class DeleteDirectoryCommand implements FtpCommand {

    path: string = "";

    constructor(path: string) {

        this.path = path;
    }

    async execute(connection: FtpCommandConnectionInterface) {

        const cwd = await connection.send(new PwdCommand());

        const exists = await connection.send(new CwdCommand(this.path));
        if (!exists) {
            throw new FtpDirectoryNotFoundException(`Directory ${this.path} not found or on server`);
        }
        const dirContent: FtpEntryInfo[] = await connection.send(new FtpListCommand());
        const files = dirContent.filter(f => f.type === "file");

        for (let f of files) {
            await connection.send(new DeleteFileCommand(f.name), true);
        }

        await connection.send(new GoUpDirectoryCommand(), true);
        connection.write("RMD " + this.path);

        const response = await connection.getResponse();
        if (response.code >= 400) {
            throw FtpException.FromResponse("Cannot delete directory", response);
        }

        await connection.send(new CwdCommand(cwd));
    }

    async onResponse(response: FtpResponse) {
        if (response.code === 550) {
            throw new FtpDirectoryNotFoundException(`Directory ${this.path} not found or not empty on server`, response.code, new Error(response.message));
        }

        if (response.code !== 250) {
            throw new FtpException(`Cannot delete directory ${this.path} from server`, response.code, new Error(response.message));
        }
    }
}

export class ChangeModificationTime implements FtpCommand {
    path: string;
    newDate: Date;

    constructor(path: string, newDate: Date) {
        this.path = path;
        this.newDate = newDate;
    }

    async execute(connection: FtpCommandConnectionInterface) {
        if (connection.features.MDTM) {
            connection.write(`MFMT ${formatDate(this.newDate)} ${this.path}`);
        } else {
            throw new FtpException("MFMT feature not avaible on FTP server");
        }

        const response = await connection.getResponse();
        if (response.code != 213) {
            throw new FtpException(`Cannot get last modification time of file ${this.path}`, response.code, new Error(response.message));
        }

        function formatDate(date: Date) {


            return date.getUTCFullYear() + _.padStart(date.getUTCMonth().toString(), 2, "0")
                + _.padStart(date.getUTCDate().toString(), 2, "0")
                + _.padStart(date.getUTCHours().toString(), 2, "0")
                + _.padStart(date.getUTCMinutes().toString(), 2, "0")
                + _.padStart(date.getUTCSeconds().toString(), 2, "0")

        }
    }
}

export class LastModifiedTimeCommand implements FtpCommand {
    path: string;

    constructor(path: string) {
        this.path = path;
    }

    async execute(connection: FtpCommandConnectionInterface) {
        if (connection.features.MDTM) {
            connection.write("MDTM " + this.path);
        } else {
            throw new FtpException("MDTM feature not avaible on FTP server");
        }

        const response = await connection.getResponse();

        if (response.code === 550) {
            throw new FtpFileNotFoundException(`Cannot get modifitacion time for ${this.path}`, 550, new Error(response.message));
        }

        if (response.code != 213) {
            throw FtpException.FromResponse(`Cannot get last modification time of file ${this.path}`, response);
        }

        const m = RE_LAST_MOD_TIME.exec(response.message.trim());
        const date = new Date(parseInt(m[1]), parseInt(m[2]), parseInt(m[3]), parseInt(m[4]), parseInt(m[5]), parseInt(m[6]));

        // adjust timezone
        return new Date(date.getTime() - date.getTimezoneOffset() * 60 * 1000);
    }
}

export class SizeCommand implements FtpCommand {

    path: string;

    constructor(path: string) {
        this.path = path;
    }

    async execute(connection: FtpCommandConnectionInterface) {
        if (connection.features.SIZE) {
            connection.write("SIZE " + this.path);
        } else {
            throw new FtpException("SIZE feature not avaible on FTP server");
        }

        const response = await connection.getResponse();
        if (response.code === 550) {
            throw new FtpFileNotFoundException(`File ${this.path} not found on server`, 550, new Error(response.message));
        } else if (response.code != 213) {
            throw FtpException.FromResponse(`Cannot retrieve file ${this.path} size`, response);
        }

        return parseInt(response.message);
    }
}

export class MkDirCommand implements FtpCommand {

    path: string;
    recursive: boolean;

    nextRun: boolean = false;

    cwdDir: string = "";

    constructor(path: string, recursive: boolean, cwdDir?: string) {
        this.path = path;
        this.recursive = recursive;
        this.cwdDir = cwdDir !== undefined ? cwdDir : "";
    }

    async execute(connection: FtpCommandConnectionInterface) {

        // ensure that we are at root directory
        if (this.cwdDir.length === 0) {
            await connection.send(new CwdCommand("/"));
        }

        if (!this.recursive) {
            const dir = this.path.split("/").pop();
            await connection.send(new CwdCommand(this.path));
            await connection.write("MKD " + dir);
            await checkResponse();
        } else {

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

            throw new FtpException(`Cannot create directory ${this.path}`, response.code, new Error(response.message));
        }
    }

}