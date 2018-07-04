import { FtpCommand, FtpResponse, FtpCommandConnectionInterface, FtpDataConnectionInterface, FtpTransferMode, ProgressCallback, FtpFeatures } from './definitions';
import { FtpDataConnection } from './connection';
/**
 * Internal FTP commands implementation
 */
export declare class FtpLoginCommand implements FtpCommand {
    expectResponse: boolean;
    login: string;
    password: string;
    constructor(login: string, pass: string);
    execute(connection: FtpCommandConnectionInterface): Promise<void>;
}
export declare class FtpPasswordCommand implements FtpCommand {
    password: string;
    constructor(password: string);
    execute(connection: FtpCommandConnectionInterface): Promise<void>;
}
export declare class FtpUserCommand implements FtpCommand {
    user: string;
    constructor(user: string);
    execute(connection: FtpCommandConnectionInterface): Promise<void>;
}
export declare class TransferModeCommand implements FtpCommand {
    mode: FtpTransferMode;
    constructor(mode: FtpTransferMode);
    execute(connection: FtpCommandConnectionInterface): Promise<void>;
}
export declare class CwdCommand implements FtpCommand {
    path: string;
    constructor(path: string);
    execute(connection: FtpCommandConnectionInterface): Promise<boolean>;
}
export declare class PwdCommand implements FtpCommand {
    execute(connection: FtpCommandConnectionInterface): Promise<string>;
}
export declare class FtpDisconnectCommand implements FtpCommand {
    execute(connection: FtpCommandConnectionInterface): Promise<void>;
}
export declare class FtpFeaturesCommand implements FtpCommand {
    execute(connection: FtpCommandConnectionInterface): Promise<FtpFeatures>;
}
export declare class FtpWelcomeCommand implements FtpCommand {
    execute(connection: FtpCommandConnectionInterface): Promise<void>;
}
export declare class StoreCommand implements FtpCommand {
    localPath: string;
    filename?: string;
    progress?: ProgressCallback;
    fileSize?: number;
    constructor(localPath: string, filename?: string, progress?: ProgressCallback);
    execute(connection: FtpCommandConnectionInterface): Promise<boolean>;
}
export declare class FtpRetrieveFileCommand implements FtpCommand {
    sourceFile: string;
    targetFile: string;
    progress?: ProgressCallback;
    psvConnection: FtpDataConnectionInterface;
    constructor(sourceFile: string, targetFile: string, progress?: ProgressCallback);
    execute(connection: FtpCommandConnectionInterface): Promise<void>;
}
export declare class FtpListCommand implements FtpCommand {
    path: string;
    constructor(path?: string);
    execute(connection: FtpCommandConnectionInterface): Promise<any[]>;
}
export declare class FtpPassiveModeCommand implements FtpCommand {
    execute(connection: FtpCommandConnectionInterface): Promise<FtpDataConnection>;
}
export declare class FtpOptionCommand implements FtpCommand {
    option: string;
    value: string;
    constructor(option: string, value: string);
    execute(connection: FtpCommandConnectionInterface): Promise<void>;
}
export declare class RenameCommand implements FtpCommand {
    from: string;
    to: string;
    constructor(from: string, to: string);
    execute(connection: FtpCommandConnectionInterface): Promise<void>;
}
export declare class RenameToCommand implements FtpCommand {
    to: string;
    constructor(to: string);
    execute(connection: FtpCommandConnectionInterface): Promise<void>;
}
export declare class RenameFromCommand implements FtpCommand {
    from: string;
    constructor(from: string);
    execute(connection: FtpCommandConnectionInterface): Promise<void>;
}
export declare class DeleteFileCommand implements FtpCommand {
    path: string;
    constructor(path: string);
    execute(connection: FtpCommandConnectionInterface): Promise<void>;
}
export declare class GoUpDirectoryCommand implements FtpCommand {
    execute(connection: FtpCommandConnectionInterface): Promise<void>;
}
export declare class DeleteDirectoryCommand implements FtpCommand {
    path: string;
    constructor(path: string);
    execute(connection: FtpCommandConnectionInterface): Promise<void>;
    onResponse(response: FtpResponse): Promise<void>;
}
export declare class ChangeModificationTime implements FtpCommand {
    path: string;
    newDate: Date;
    constructor(path: string, newDate: Date);
    execute(connection: FtpCommandConnectionInterface): Promise<void>;
}
export declare class LastModifiedTimeCommand implements FtpCommand {
    path: string;
    constructor(path: string);
    execute(connection: FtpCommandConnectionInterface): Promise<Date>;
}
export declare class SizeCommand implements FtpCommand {
    path: string;
    constructor(path: string);
    execute(connection: FtpCommandConnectionInterface): Promise<number>;
}
export declare class MkDirCommand implements FtpCommand {
    path: string;
    recursive: boolean;
    nextRun: boolean;
    cwdDir: string;
    constructor(path: string, recursive: boolean, cwdDir?: string);
    execute(connection: FtpCommandConnectionInterface): Promise<void>;
}
