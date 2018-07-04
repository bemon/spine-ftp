
import 'mocha';
//import * as sinon from 'sinon';
import { expect, use } from 'chai';
import * as chaAsPromise from 'chai-as-promised';
import { FtpClient } from './../src/index';
import { FtpCommandConnection } from './../src/connection';
import { FakeFtpServer, FTP_FAKE_HOST, FTP_FAKE_PORT } from './mocks/FakeFtpServer';

use(chaAsPromise);

function srv(callback: (server: FakeFtpServer) => Promise<void>) {
    const srv = new FakeFtpServer();
    srv.start();
    return callback(srv).then(() => {
        srv.stop();
    });
}

function fullSrv(callback: (server: FakeFtpServer) => Promise<void>) {
    const srv = new FakeFtpServer();
    srv.start();
    srv.fakeResponse(331, "Password required for anonymous");
    srv.fakeResponse(230, "Logged on");
    srv.fakeResponseMultiline(211, "-Features\r\nMDTM\r\nREST STREAM\r\nSIZE\r\nMLSD\r\nMLST\r\nUTF8\r\nCLNT\r\nMFMT\r\nEPSV\r\n211 End\r\n");
    srv.fakeResponse(202, "UTF8 mode is always enabled. No need to send this command.");
    srv.fakeResponse(200, "Type set to I");

    return callback(srv).then(() => {
        srv.stop();
    });
}


describe("Ftp client tests", () => {

    it("Should set default configuration", () => {
        const client = new FtpCommandConnection();

        expect(client.configuration).to.deep.equal({
            host: "localhost",
            port: 21,
            user: "anonymous",
            password: "anonymous",
            timeout: 10000,
            keepAlive: 10000
        });
    });

    it("Should set configuration", () => {

        const client = new FtpCommandConnection({
            host: "127.0.0.1",
            port: 22,
            user: "foo",
            password: "bar",
            timeout: 500,
            keepAlive: 500
        });

        expect(client.configuration).to.deep.equal({
            host: "127.0.0.1",
            port: 22,
            user: "foo",
            password: "bar",
            timeout: 500,
            keepAlive: 500
        });
    });

    it("Should connect", async function () {
        await srv(async (server: FakeFtpServer) => {
            server.fakeResponse(331, "Password required for anonymous");
            server.fakeResponse(230, "Logged on");
            server.fakeResponseMultiline(211, "-Features\r\nMDTM\r\nREST STREAM\r\nSIZE\r\nMLST\r\nMLSD\r\nUTF8\r\nCLNT\r\nMFMT\r\nEPSV\r\n211 End\r\n");
            server.fakeResponse(202, "UTF8 mode is always enabled. No need to send this command.");
            server.fakeResponse(200, "Type set to I");

            const client = await FtpClient.connect({
                host: FTP_FAKE_HOST,
                port: FTP_FAKE_PORT
            });

            expect(server.commands.length).to.eq(5);
            expect(server.commands[0]).to.eq("USER anonymous\r\n");
            expect(server.commands[1]).to.eq("PASS anonymous\r\n");
            expect(server.commands[2]).to.eq("FEAT\r\n");
            expect(server.commands[3]).to.eq("OPTS UTF8 ON\r\n");
            expect(server.commands[4]).to.eq("TYPE I\r\n");
            expect(client.CommandConnection.features).to.deep.equal({
                MDTM: true,
                MFMT: true,
                MLSD: true,
                MLST: true,
                SIZE: true,
                UTF8: true,
                EPSV: true
            });
        });
    });

    it("Should throw on user error", async function () {
        await srv(async (server: FakeFtpServer) => {
            server.fakeResponse(500, "Cannot login to ftp server");

            await expect(async function () {
                await FtpClient.connect({
                    host: FTP_FAKE_HOST,
                    port: FTP_FAKE_PORT
                })
            }()).to.be.rejectedWith("Cannot login to ftp server");

            expect(server.commands.length).to.eq(1);
            expect(server.commands[0]).to.eq("USER anonymous\r\n");
        });
    });

    it("Should throw on incorrect password", async function () {
        await srv(async (server: FakeFtpServer) => {
            server.fakeResponse(331, "Password required for anonymous");
            server.fakeResponse(530, "Login or password incorrect!");

            await expect(async function () {
                await FtpClient.connect({
                    host: FTP_FAKE_HOST,
                    port: FTP_FAKE_PORT
                })
            }()).to.be.rejectedWith("Login failed");

            expect(server.commands.length).to.eq(2);
            expect(server.commands[0]).to.eq("USER anonymous\r\n");
            expect(server.commands[1]).to.eq("PASS anonymous\r\n");
        });
    });

    it("Should throw on incorrect features", async function () {
        await fullSrv(async (server: FakeFtpServer) => {
            server.fakeResponse(500, "Fake response");

            await expect(async function () {

                const client = await FtpClient.connect({
                    host: FTP_FAKE_HOST,
                    port: FTP_FAKE_PORT
                });

                await client.getFeatures();

            }()).to.be.rejectedWith("Cannot retrieve server features");

            expect(server.commands.length).to.eq(6);
            expect(server.commands[5]).to.eq("FEAT\r\n");
        });
    });

    it("Should file exists", async function () {
        await fullSrv(async (server: FakeFtpServer) => {
            server.fakeResponse(213, "123");

            const client = await FtpClient.connect({
                host: FTP_FAKE_HOST,
                port: FTP_FAKE_PORT
            });

            const exists = await client.fileExists("/someFile.txt");

            expect(exists).to.eq(true);
            expect(server.commands.length).to.eq(6);
            expect(server.commands[5]).to.eq("SIZE /someFile.txt\r\n");
        });
    });

    it("Should file not exists", async function () {
        await fullSrv(async (server: FakeFtpServer) => {
            server.fakeResponse(550, "File not found\r\n");

            const client = await FtpClient.connect({
                host: FTP_FAKE_HOST,
                port: FTP_FAKE_PORT
            });

            const exists = await client.fileExists("/someFile.txt");

            expect(exists).to.eq(false);
            expect(server.commands.length).to.eq(6);
            expect(server.commands[5]).to.eq("SIZE /someFile.txt\r\n");
        });
    });


    it("Should throw on file exists", async function () {
        await fullSrv(async (server: FakeFtpServer) => {
            server.fakeResponse(500, "Unknown error\r\n");

            await expect(async function () {
                const client = await FtpClient.connect({
                    host: FTP_FAKE_HOST,
                    port: FTP_FAKE_PORT
                });

                await client.fileExists("/someFile.txt");

            }()).to.be.rejectedWith("Cannot retrieve file /someFile.txt size");
            expect(server.commands.length).to.eq(6);
            expect(server.commands[5]).to.eq("SIZE /someFile.txt\r\n");
        });
    });

    it("Should directory exists", async function () {
        await fullSrv(async (server: FakeFtpServer) => {
            server.fakeResponse(257, `"/" is current directory.`);
            server.fakeResponse(250, `CWD successful. "/foo" is current directory.`);
            server.fakeResponse(250, `CWD successful. "/" is current directory.`);


            const client = await FtpClient.connect({
                host: FTP_FAKE_HOST,
                port: FTP_FAKE_PORT
            });

            const exists = await client.directoryExists("/foo");

            expect(exists).to.eq(true);
            expect(server.commands.length).to.eq(8);
            expect(server.commands[5]).to.eq("PWD\r\n");
            expect(server.commands[6]).to.eq("CWD /foo\r\n");
            expect(server.commands[7]).to.eq("CWD /\r\n");

        });
    });

    it("Should directory not exists", async function () {
        await fullSrv(async (server: FakeFtpServer) => {
            server.fakeResponse(257, `"/" is current directory.`);
            server.fakeResponse(550, `CWD failed. "/foo": directory not found.`);
            server.fakeResponse(250, `CWD successful. "/" is current directory.`);


            const client = await FtpClient.connect({
                host: FTP_FAKE_HOST,
                port: FTP_FAKE_PORT
            });

            const exists = await client.directoryExists("/foo");

            expect(exists).to.eq(false);
            expect(server.commands.length).to.eq(8);
            expect(server.commands[5]).to.eq("PWD\r\n");
            expect(server.commands[6]).to.eq("CWD /foo\r\n");
            expect(server.commands[7]).to.eq("CWD /\r\n");

        });
    });

    it("Should rename", async function () {
        await fullSrv(async (server: FakeFtpServer) => {
            server.fakeResponse(350, `File exists, ready for destination name.`);
            server.fakeResponse(250, `file renamed successfully`);


            const client = await FtpClient.connect({
                host: FTP_FAKE_HOST,
                port: FTP_FAKE_PORT
            });

            await client.rename("/foo.txt", "/foo2.txt");

            expect(server.commands.length).to.eq(7);
            expect(server.commands[5]).to.eq("RNFR /foo.txt\r\n");
            expect(server.commands[6]).to.eq("RNTO /foo2.txt\r\n");
        });
    });

    it("Should rename throw on invalid arguments", async function () {
        await fullSrv(async (server: FakeFtpServer) => {
            server.fakeResponse(350, `File exists, ready for destination name.`);
            server.fakeResponse(250, `file renamed successfully`);

            const client = await FtpClient.connect({
                host: FTP_FAKE_HOST,
                port: FTP_FAKE_PORT
            });

            await expect(async function () {
                await client.rename("", "/foo2.txt");
            }()).to.eventually.rejectedWith("Argument `from` cannot be null");

            await expect(async function () {
                await client.rename("foo.txt", "");
            }()).to.eventually.rejectedWith("Argument `to` cannot be null");
        });
    });

    it("Should rename throw on not existing file", async function () {
        await fullSrv(async (server: FakeFtpServer) => {
            server.fakeResponse(550, ` file/directory not found.`);

            const client = await FtpClient.connect({
                host: FTP_FAKE_HOST,
                port: FTP_FAKE_PORT
            });

            await expect(async function () {
                await client.rename("/foo.txt", "/foo2.txt");
            }()).to.eventually.rejectedWith("Cannot rename /foo.txt");

            expect(server.commands.length).to.eq(6);
            expect(server.commands[5]).to.eq("RNFR /foo.txt\r\n");
        });
    });

    it("Should get modification time", async function () {
        await fullSrv(async (server: FakeFtpServer) => {
            server.fakeResponse(213, `20180608233854`);

            const client = await FtpClient.connect({
                host: FTP_FAKE_HOST,
                port: FTP_FAKE_PORT
            });

            const time = await client.getLastModificationTime("/foo.txt");
            expect(time.toUTCString()).to.equal("Sun, 08 Jul 2018 23:38:54 GMT");
            expect(server.commands.length).to.eq(6);
            expect(server.commands[5]).to.eq("MDTM /foo.txt\r\n");
        });
    });

    it("Should throw on modification time when file not exists", async function () {
        await fullSrv(async (server: FakeFtpServer) => {
            server.fakeResponse(550, `File not found`);

            const client = await FtpClient.connect({
                host: FTP_FAKE_HOST,
                port: FTP_FAKE_PORT
            });

            await expect(async function () {
                await client.getLastModificationTime("/foo.txt");
            }()).to.eventually.rejectedWith("Cannot get modifitacion time for /foo.txt");

            expect(server.commands.length).to.eq(6);
            expect(server.commands[5]).to.eq("MDTM /foo.txt\r\n");
        });
    });

    it("Should list directory files", async function () {
        this.timeout(3000000);
        await fullSrv(async (server: FakeFtpServer) => {
            server.fakeResponse(150, `Opening data channel for directory listing of "/SteamLibrary"`,
                function () {
                    this.fakeData(`type=file;modify=20180608233854;size=419616; steam.dll\r\ntype=dir;modify=20180702203936; steamapps\r\n`);
                }
            );
            const client = await FtpClient.connect({
                host: FTP_FAKE_HOST,
                port: FTP_FAKE_PORT
            });

            const files = await client.getFiles("/test");

            expect(files.length).to.eq(1);
            expect(files[0].name).to.eq("steam.dll");

            expect(server.commands.length).to.eq(7);
            expect(server.commands[5]).to.eq("EPSV\r\n");
            expect(server.commands[6]).to.eq("MLSD /test\r\n");
        });
    });

    it("Should list subdirectories in directory", async function () {
        this.timeout(3000000);
        await fullSrv(async (server: FakeFtpServer) => {
            server.fakeResponse(150, `Opening data channel for directory listing of "/SteamLibrary"`,
                function () {
                    this.fakeData(`type=file;modify=20180608233854;size=419616; steam.dll\r\ntype=dir;modify=20180702203936; steamapps\r\n`);
                }
            );
            const client = await FtpClient.connect({
                host: FTP_FAKE_HOST,
                port: FTP_FAKE_PORT
            });

            const files = await client.getDirectories("/test");

            expect(files.length).to.eq(1);
            expect(files[0].name).to.eq("steamapps");

            expect(server.commands.length).to.eq(7);
            expect(server.commands[5]).to.eq("EPSV\r\n");
            expect(server.commands[6]).to.eq("MLSD /test\r\n");
        });
    });



});