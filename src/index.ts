import * as FtpCommands from './commands';
import { FtpConnectionConfiguration, FtpCommandConnectionInterface, ProgressCallback, FtpEntryInfo, FtpFeatures } from './definitions';
import { FtpCommandConnection } from './connection';
import { FtpException, FtpFileNotFoundException } from './exceptions';

import * as fs from "fs";
import * as fspath from "path";
import * as _ from 'lodash';

/**
 * Ftp client implementation
 */
export class FtpClient {

    /**
     * Command connection - its used to send FTP commands
     */
    protected commandConnection: FtpCommandConnectionInterface = null;

    /**
     * Gets underlying ftp command connection
     */
    public get CommandConnection() {
        return this.commandConnection;
    }

    /**
     * Connecto to server & returns ftp client instance
     * 
     * @param { FtpConnectionConfiguration} configuration - connection configuration hots, password etc.
     */
    public static async connect(configuration?: FtpConnectionConfiguration) {
        const client = new FtpClient(new FtpCommandConnection(configuration));

        await client.connect();

        return client;
    }

    /**
     * Creates FtpClient. Use FtpClient.connect() if you want to create simple ftp client.
     * 
     * @param commandConnection - command connection implementation
     */
    constructor(commandConnection: FtpCommandConnectionInterface) {
        this.commandConnection = commandConnection;
    }

    /**
     * Connects to FTP server
     * 
     * @throws { FtpException | Error | FtpTimeoutException } if cannot connect ( host not exists, timeout etc.)
     * @returns void
     */
    public async connect(): Promise<void> {
        await this.commandConnection.connect();
    }

    /**
     * List all files on server at given path
     * 
     * @param path - path on server to list files. If not set current directory is assumed
     * @return { FtpEntryInfo [] } - array with files found in directory
     * @throws { FtpException | Error} - if listing fails due connection error or path not exists on FTP server 
     */
    public async getFiles(path?: string): Promise<FtpEntryInfo[]> {
        const files: FtpEntryInfo[] = await this.commandConnection.send(new FtpCommands.FtpListCommand(path));
        return files.filter(f => f.type == "file");
    }

    /**
     * List all files on server at given path
     * 
     * @param path - path on server to list directories. If not set current directory is assumed
     * @return { FtpEntryInfo[] } - array with directories found
     * @throws { FtpException | Error} - if listing fails due connection error or path not exists on FTP server 
     */
    public async getDirectories(path?: string): Promise<FtpEntryInfo[]> {
        const files: FtpEntryInfo[] = await this.commandConnection.send(new FtpCommands.FtpListCommand(path));
        return files.filter(f => f.type == "dir");
    }

    /**
     * Creates directory on FTP server. After creation sets current directory to created dir.
     * 
     * @param path - dir or path to create. Path must be absolute to root dir
     * @param recursive  - create subfolders recursively
     * @throws { FtpException } on invalid args or when cannot create specified dir
     */
    public async createDir(path: string, recursive?: boolean): Promise<void> {

        if (path.length === 0) {
            throw new FtpException("Path cannot be empty");
        }

        return await this.commandConnection.send(new FtpCommands.MkDirCommand(path, recursive));
    }

    /**
     * Change file or dir name (must exists in current directory)
     * 
     * @param from - name from (file or dir), must exists in current directory. Value cannot be absolute path
     * @param to - name that will be changed to. Value cannot be absolute path
     * @throws {FtpException} if cannot rename
     */
    public async rename(from: string, to: string): Promise<void> {
        return await this.commandConnection.send(new FtpCommands.RenameCommand(from, to));
    }

    /**
     * Deletes directory with all files in it. If recursive is set to true all subfolders will be deleted.
     * 
     * @param path - dir to delete
     * @param recursive - delete subfolders
     * @throws {FtpDirectoryNotFoundException} if no directory is found on server
     * @throws {FtpException} every other problem
     */
    public async deleteDirectory(path?: string, recursive?: boolean): Promise<void> {
        const self = this;

        if (!recursive) {
            return await this.commandConnection.send(new FtpCommands.DeleteDirectoryCommand(path));
        }

        const dirs = await this.getDirectories(path);
        const rootDir = _.first(path.split(fspath.sep));

        for (let d of dirs) {
            await rmDir(fspath.join(rootDir, d.name));
        }

        async function rmDir(toRemove: string) {
            const dirListing: FtpEntryInfo[] = await self.getDirectories(toRemove);
            for (let d of dirListing) {
                await rmDir(fspath.join(toRemove, d.name));
            }

            await self.deleteDirectory(toRemove, false);
        }
    }

    /**
     * Deletes file from FTP server
     * 
     * @param path - path to file
     * @throws {FtpFileNotFoundException} if file not exists on server
     * @throws {FtpException} every other problem eg. connection problem, etc.
     */
    public async deleteFile(path: string): Promise<void> {
        return await this.commandConnection.send(new FtpCommands.DeleteFileCommand(path));
    }

    /**
     * Gets features list from server. It sends command to server. Feature list is also 
     * avaible in `FtpCommandConnection.getFeatures()`
     * 
     * @throws { FtpException } if cannot retrieve features
     * @returns { FtpFeatures } feature list
     */
    public async getFeatures(): Promise<FtpFeatures> {
        return await this.commandConnection.send(new FtpCommands.FtpFeaturesCommand());
    }


    /**
     * Checks if file exists in server
     * 
     * @param path - file to check. Absolute path or filename is supported. If filename is provided, current working working directory will be check
     * @throws {FtpException} when error occurs
     * @throws { FtpDirectoryNotFoundException} if file is not found in one of path dir
     * @returns { boolean } true if exists, error if not
     */
    public async fileExists(path: string): Promise<boolean> {
        try {
            await this.getFileSize(path);
        } catch (err) {
            if (err instanceof FtpFileNotFoundException) {
                return false;
            }

            throw err;
        }

        return true;
    }

    /**
     * Checks if directory exists in server
     * 
     * @param path - dir to check. Absolute path or dirname is supported. If dirname is provided, current working working directory will be check
     * @returns { boolean } true if exists, error if not
     * @throws { FtpException} if error occurs
     * 
     */
    public async directoryExists(path?: string): Promise<boolean> {
        let toCheck = "";
        const currentDir = await this.getCurrentDirectory();

        if (fspath.isAbsolute(path)) {
            toCheck = path;
        } else {
            toCheck = fspath.join(currentDir, path);
        }

        const pathExists = await this.commandConnection.send(new FtpCommands.CwdCommand(toCheck));
        await this.setCurrentDirectory(currentDir)
        return pathExists;
    }

    /**
     * Uploads file to server
     * 
     * @param localPath - file to copy, absolute or relative path
     * @param target  - target filename, if not set filename from local path is taken
     * @param progress 
     * @throws {FtpException} if cannot upload file eg. no acces to folder or connection problem
     */
    public async upload(localPath: string, target?: string, progress?: ProgressCallback): Promise<void> {
        return await this.commandConnection.send(new FtpCommands.StoreCommand(localPath, target, progress));
    }


    /**
     * Gets file size in bytes
     * 
     * @param path - path to file, absolute or relative.
     * @returns {number} file size in bytes
     * @throws { FtpException } if cannot retrieve file size
     */
    public async getFileSize(path: string): Promise<number> {
        return await this.commandConnection.send(new FtpCommands.SizeCommand(path));
    }

    /**
     * Returns last modification time of a file
     * 
     * @param path - path to file, absolute or relative
     * @returns { Date } date of modicitaion time
     * @throws {FtpException} when cannot retrieve modification time
     */
    public async getLastModificationTime(path: string): Promise<Date> {
        return await this.commandConnection.send(new FtpCommands.LastModifiedTimeCommand(path));
    }

    /**
     * Change file modification time
     * 
     * @param path - file path, absolute or file in current dir
     * @param newDate - date to set 
     * @throws {FtpException} when cannot set new date
     */
    public async setModificationTime(path: string, newDate: Date): Promise<void> {
        return await this.commandConnection.send(new FtpCommands.ChangeModificationTime(path, newDate));
    }


    /**
     * Retrieves current directory on server
     * 
     * @return { string | null } - current directory on ftp server
     */
    public async getCurrentDirectory(): Promise<string> {
        return this.commandConnection.send(new FtpCommands.PwdCommand());
    }

    /**
     * Sets current directory on server
     * 
     * @param path - path to directory
     * @throws { FtpException } if no directory exists or problems with connection
     */
    public async setCurrentDirectory(path: string) {
        return this.commandConnection.send(new FtpCommands.CwdCommand(path));
    }

    /**
     * Download file from FTP server
     * 
     * @param source - source file name on server, must be file that exists in current directory
     * @param target - target file name or absolute path where file will be downloaded
     * @param overwrite - if true target file will be overwitten if exists
     * @param progress - callback function for progress. Called every time if bytes are send
     * @throws { FtpException } - on download fail / file not exists, connection problems or file exists & overwrite is set to false
     */
    public async download(source: string, target: string, overwrite?: boolean, progress?: ProgressCallback): Promise<void> {

        if (!overwrite && fs.existsSync(target)) {
            throw new FtpException(`File ${target} already exists, cannot download file`);
        }

        return this.commandConnection.send(new FtpCommands.FtpRetrieveFileCommand(source, target, progress));
    }

    /**
     * Disconnects from FTP server gracefully
     */
    public async disconnect(): Promise<void> {
        await this.commandConnection.disconnect();
    }
}