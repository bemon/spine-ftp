import { FtpConnectionConfiguration, FtpCommandConnectionInterface, ProgressCallback, FtpEntryInfo, FtpFeatures } from './definitions';
/**
 * Ftp client implementation
 */
export declare class FtpClient {
    /**
     * Command connection - its used to send FTP commands
     */
    protected commandConnection: FtpCommandConnectionInterface;
    /**
     * Gets underlying ftp command connection
     */
    readonly CommandConnection: FtpCommandConnectionInterface;
    /**
     * Connecto to server & returns ftp client instance
     *
     * @param { FtpConnectionConfiguration} configuration - connection configuration hots, password etc.
     */
    static connect(configuration?: FtpConnectionConfiguration): Promise<FtpClient>;
    /**
     * Creates FtpClient. Use FtpClient.connect() if you want to create simple ftp client.
     *
     * @param commandConnection - command connection implementation
     */
    constructor(commandConnection: FtpCommandConnectionInterface);
    /**
     * Connects to FTP server
     *
     * @throws { FtpException | Error | FtpTimeoutException } if cannot connect ( host not exists, timeout etc.)
     * @returns void
     */
    connect(): Promise<void>;
    /**
     * List all files on server at given path
     *
     * @param path - path on server to list files. If not set current directory is assumed
     * @return { FtpEntryInfo [] } - array with files found in directory
     * @throws { FtpException | Error} - if listing fails due connection error or path not exists on FTP server
     */
    getFiles(path?: string): Promise<FtpEntryInfo[]>;
    /**
     * List all files on server at given path
     *
     * @param path - path on server to list directories. If not set current directory is assumed
     * @return { FtpEntryInfo[] } - array with directories found
     * @throws { FtpException | Error} - if listing fails due connection error or path not exists on FTP server
     */
    getDirectories(path?: string): Promise<FtpEntryInfo[]>;
    /**
     * Creates directory on FTP server. After creation sets current directory to created dir.
     *
     * @param path - dir or path to create. Path must be absolute to root dir
     * @param recursive  - create subfolders recursively
     * @throws { FtpException } on invalid args or when cannot create specified dir
     */
    createDir(path: string, recursive?: boolean): Promise<void>;
    /**
     * Change file or dir name (must exists in current directory)
     *
     * @param from - name from (file or dir), must exists in current directory. Value cannot be absolute path
     * @param to - name that will be changed to. Value cannot be absolute path
     * @throws {FtpException} if cannot rename
     */
    rename(from: string, to: string): Promise<void>;
    /**
     * Deletes directory with all files in it. If recursive is set to true all subfolders will be deleted.
     *
     * @param path - dir to delete
     * @param recursive - delete subfolders
     * @throws {FtpDirectoryNotFoundException} if no directory is found on server
     * @throws {FtpException} every other problem
     */
    deleteDirectory(path?: string, recursive?: boolean): Promise<void>;
    /**
     * Deletes file from FTP server
     *
     * @param path - path to file
     * @throws {FtpFileNotFoundException} if file not exists on server
     * @throws {FtpException} every other problem eg. connection problem, etc.
     */
    deleteFile(path: string): Promise<void>;
    /**
     * Gets features list from server. It sends command to server. Feature list is also
     * avaible in `FtpCommandConnection.getFeatures()`
     *
     * @throws { FtpException } if cannot retrieve features
     * @returns { FtpFeatures } feature list
     */
    getFeatures(): Promise<FtpFeatures>;
    /**
     * Checks if file exists in server
     *
     * @param path - file to check. Absolute path or filename is supported. If filename is provided, current working working directory will be check
     * @throws {FtpException} when error occurs
     * @throws { FtpDirectoryNotFoundException} if file is not found in one of path dir
     * @returns { boolean } true if exists, error if not
     */
    fileExists(path: string): Promise<boolean>;
    /**
     * Checks if directory exists in server
     *
     * @param path - dir to check. Absolute path or dirname is supported. If dirname is provided, current working working directory will be check
     * @returns { boolean } true if exists, error if not
     * @throws { FtpException} if error occurs
     *
     */
    directoryExists(path?: string): Promise<boolean>;
    /**
     * Uploads file to server
     *
     * @param localPath - file to copy, absolute or relative path
     * @param target  - target filename, if not set filename from local path is taken
     * @param progress
     * @throws {FtpException} if cannot upload file eg. no acces to folder or connection problem
     */
    upload(localPath: string, target?: string, progress?: ProgressCallback): Promise<void>;
    /**
     * Gets file size in bytes
     *
     * @param path - path to file, absolute or relative.
     * @returns {number} file size in bytes
     * @throws { FtpException } if cannot retrieve file size
     */
    getFileSize(path: string): Promise<number>;
    /**
     * Returns last modification time of a file
     *
     * @param path - path to file, absolute or relative
     * @returns { Date } date of modicitaion time
     * @throws {FtpException} when cannot retrieve modification time
     */
    getLastModificationTime(path: string): Promise<Date>;
    /**
     * Change file modification time
     *
     * @param path - file path, absolute or file in current dir
     * @param newDate - date to set
     * @throws {FtpException} when cannot set new date
     */
    setModificationTime(path: string, newDate: Date): Promise<void>;
    /**
     * Retrieves current directory on server
     *
     * @return { string | null } - current directory on ftp server
     */
    getCurrentDirectory(): Promise<string>;
    /**
     * Sets current directory on server
     *
     * @param path - path to directory
     * @throws { FtpException } if no directory exists or problems with connection
     */
    setCurrentDirectory(path: string): Promise<any>;
    /**
     * Download file from FTP server
     *
     * @param source - source file name on server, must be file that exists in current directory
     * @param target - target file name or absolute path where file will be downloaded
     * @param overwrite - if true target file will be overwitten if exists
     * @param progress - callback function for progress. Called every time if bytes are send
     * @throws { FtpException } - on download fail / file not exists, connection problems or file exists & overwrite is set to false
     */
    download(source: string, target: string, overwrite?: boolean, progress?: ProgressCallback): Promise<void>;
    /**
     * Disconnects from FTP server gracefully
     */
    disconnect(): Promise<void>;
}
