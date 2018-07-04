"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const FtpCommands = require("./commands");
const connection_1 = require("./connection");
const exceptions_1 = require("./exceptions");
const fs = require("fs");
const fspath = require("path");
const _ = require("lodash");
/**
 * Ftp client implementation
 */
class FtpClient {
    /**
     * Creates FtpClient
     *
     * @param options - connection options (host, user, password etc.)
     */
    constructor(commandConnection) {
        /**
         * Command connection - its used to send FTP commands
         */
        this.commandConnection = null;
        this.commandConnection = commandConnection;
    }
    /**
     * Gets underlying ftp command connection
     */
    get CommandConnection() {
        return this.commandConnection;
    }
    static async connect(configuration) {
        const client = new FtpClient(new connection_1.FtpCommandConnection(configuration));
        await client.connect();
        return client;
    }
    /**
     * Connects to FTP server
     *
     * @throws { FtpException | Error | FtpTimeoutException } if cannot connect ( host not exists, timeout etc.)
     * @returns void
     */
    async connect() {
        await this.commandConnection.connect();
    }
    /**
     * List all files on server at given path
     *
     * @param path - path on server to list files. If not set current directory is assumed
     * @return { FtpEntryInfo [] } - array with files found in directory
     * @throws { FtpException | Error} - if listing fails due connection error or path not exists on FTP server
     */
    async getFiles(path) {
        const files = await this.commandConnection.send(new FtpCommands.FtpListCommand(path));
        return files.filter(f => f.type == "file");
    }
    /**
     * List all files on server at given path
     *
     * @param path - path on server to list directories. If not set current directory is assumed
     * @return { FtpEntryInfo[] } - array with directories found
     * @throws { FtpException | Error} - if listing fails due connection error or path not exists on FTP server
     */
    async getDirectories(path) {
        const files = await this.commandConnection.send(new FtpCommands.FtpListCommand(path));
        return files.filter(f => f.type == "dir");
    }
    /**
     * Creates directory on FTP server. After creation sets current directory to created dir.
     *
     * @param path - dir or path to create. Path must be absolute to root dir
     * @param recursive  - create subfolders recursively
     * @throws { FtpException } on invalid args or when cannot create specified dir
     */
    async createDir(path, recursive) {
        if (path.length === 0) {
            throw new exceptions_1.FtpException("Path cannot be empty");
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
    async rename(from, to) {
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
    async deleteDirectory(path, recursive) {
        const self = this;
        if (!recursive) {
            return await this.commandConnection.send(new FtpCommands.DeleteDirectoryCommand(path));
        }
        const dirs = await this.getDirectories(path);
        const rootDir = _.first(path.split(fspath.sep));
        for (let d of dirs) {
            await rmDir(fspath.join(rootDir, d.name));
        }
        async function rmDir(toRemove) {
            const dirListing = await self.getDirectories(toRemove);
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
    async deleteFile(path) {
        return await this.commandConnection.send(new FtpCommands.DeleteFileCommand(path));
    }
    /**
     * Gets features list from server. It sends command to server. Feature list is also
     * avaible in `FtpCommandConnection.getFeatures()`
     *
     * @throws { FtpException } if cannot retrieve features
     * @returns { FtpFeatures } feature list
     */
    async getFeatures() {
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
    async fileExists(path) {
        try {
            await this.getFileSize(path);
        }
        catch (err) {
            if (err instanceof exceptions_1.FtpFileNotFoundException) {
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
    async directoryExists(path) {
        let toCheck = "";
        const currentDir = await this.getCurrentDirectory();
        if (fspath.isAbsolute(path)) {
            toCheck = path;
        }
        else {
            toCheck = fspath.join(currentDir, path);
        }
        const pathExists = await this.commandConnection.send(new FtpCommands.CwdCommand(toCheck));
        await this.setCurrentDirectory(currentDir);
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
    async upload(localPath, target, progress) {
        return await this.commandConnection.send(new FtpCommands.StoreCommand(localPath, target, progress));
    }
    /**
     * Gets file size in bytes
     *
     * @param path - path to file, absolute or relative.
     * @returns {number} file size in bytes
     * @throws { FtpException } if cannot retrieve file size
     */
    async getFileSize(path) {
        return await this.commandConnection.send(new FtpCommands.SizeCommand(path));
    }
    /**
     * Returns last modification time of a file
     *
     * @param path - path to file, absolute or relative
     * @returns { Date } date of modicitaion time
     * @throws {FtpException} when cannot retrieve modification time
     */
    async getLastModificationTime(path) {
        return await this.commandConnection.send(new FtpCommands.LastModifiedTimeCommand(path));
    }
    /**
     * Change file modification time
     *
     * @param path - file path, absolute or file in current dir
     * @param newDate - date to set
     * @throws {FtpException} when cannot set new date
     */
    async setModificationTime(path, newDate) {
        return await this.commandConnection.send(new FtpCommands.ChangeModificationTime(path, newDate));
    }
    /**
     * Retrieves current directory on server
     *
     * @return { string | null } - current directory on ftp server
     */
    async getCurrentDirectory() {
        return this.commandConnection.send(new FtpCommands.PwdCommand());
    }
    /**
     * Sets current directory on server
     *
     * @param path - path to directory
     * @throws { FtpException } if no directory exists or problems with connection
     */
    async setCurrentDirectory(path) {
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
    async download(source, target, overwrite, progress) {
        if (!overwrite && fs.existsSync(target)) {
            throw new exceptions_1.FtpException(`File ${target} already exists, cannot download file`);
        }
        return this.commandConnection.send(new FtpCommands.FtpRetrieveFileCommand(source, target, progress));
    }
    /**
     * Disconnects from FTP server gracefully
     */
    async disconnect() {
        await this.commandConnection.disconnect();
    }
}
exports.FtpClient = FtpClient;
//# sourceMappingURL=index.js.map