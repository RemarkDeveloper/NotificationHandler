const API_URL = "https://remarkpanel.com/api";
const WEBSOCKET_URL = "wss://remarkpanel.com";
const PANEL_URL = "https://remarkpanel.com";

const { app, BrowserWindow, ipcMain, shell, screen, dialog } = require("electron");
const path = require("path");
const request = require("request");
const fs = require("fs");
const forge = require("node-forge");
const io = require("socket.io-client");
const sound = require("sound-play");

const MAX_NOTIFICATIONS = 3;
const notificationWindows = [];
const NOTIFICATION_WIDTH = 500;
const NOTIFICATION_HEIGHT = 120;
const NOTIFICATION_SPACING = 0;

function showError(title, message) {
    dialog.showErrorBox(title, message);
}

function createNotificationWindow() {
    const { width, height } = screen.getPrimaryDisplay().workAreaSize;

    if (notificationWindows.length >= MAX_NOTIFICATIONS) {
        return;
    }

    const newNotificationWindow = new BrowserWindow({
        width: NOTIFICATION_WIDTH,
        height: NOTIFICATION_HEIGHT,
        x: width - (NOTIFICATION_WIDTH + 10),
        y: height - ((NOTIFICATION_HEIGHT + NOTIFICATION_SPACING) * (notificationWindows.length + 1)),
        alwaysOnTop: true,
        frame: false,
        transparent: true,
        resizable: false,
        show: false,
        skipTaskbar: true,
        focusable: false,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false
        }
    });

    newNotificationWindow.loadFile(path.join(__dirname, "views/notification.html"));

    notificationWindows.push(newNotificationWindow);
    return newNotificationWindow;
}

function showNotification(title, message, icon, type = null) {
    let notificationWindow = createNotificationWindow();
    if (!notificationWindow) return;

    notificationWindow.show();

    let soundPath = path.join(process.resourcesPath, "app.asar.unpacked", "sounds", "ping.mp3");

    if (type === "connect") {
        soundPath = path.join(process.resourcesPath, "app.asar.unpacked", "sounds", "2.mp3");
    } else if (type === "opened") {
        soundPath = path.join(process.resourcesPath, "app.asar.unpacked", "sounds", "1.mp3");
    } else if (type === "confirmed") {
        soundPath = path.join(process.resourcesPath, "app.asar.unpacked", "sounds", "3.mp3");
    } else if (type === "rejected") {
        soundPath = path.join(process.resourcesPath, "app.asar.unpacked", "sounds", "4.mp3");
    }

    sound.play(soundPath).catch(e => {
        // do nothing
    });

    notificationWindow.webContents.send("new-notification", {
        title: title,
        content: message,
        icon: icon,
        id: notificationWindow.id.toString()
    });

    setTimeout(() => {
        removeNotificationWindow(notificationWindow);
    }, 4000);
}

function removeNotificationWindow(notificationWindow) {
    const index = notificationWindows.indexOf(notificationWindow);
    if (index !== -1) {
        notificationWindows.splice(index, 1);
        notificationWindow.close();
    }
    repositionNotifications();
}

function repositionNotifications() {
    const { width, height } = screen.getPrimaryDisplay().workAreaSize;

    notificationWindows.forEach((win, index) => {
        if (!win.isDestroyed()) {
            const targetX = width - (NOTIFICATION_WIDTH + 10);
            const targetY = height - ((NOTIFICATION_HEIGHT + NOTIFICATION_SPACING) * (index + 1));

            const currentBounds = win.getBounds();
            let currentY = currentBounds.y;

            const interval = setInterval(() => {
                if (Math.abs(currentY - targetY) < 2) {
                    win.setPosition(targetX, targetY, true);
                    clearInterval(interval);
                } else {
                    currentY += (targetY - currentY) * 0.2;
                    win.setPosition(targetX, Math.round(currentY), true);
                }
            }, 16);
        }
    });
}


ipcMain.on("launch-panel", (event, id) => {
    if (id) {
        try {
            notificationWindows.forEach((notificationWindow) => {
                if (notificationWindow.id.toString() == id.toString()) {
                    removeNotificationWindow(notificationWindow);
                };
            });
        } catch (error) {}
    };
    shell.openExternal(PANEL_URL);
});

let failedStartCount = 0;

function startNotificationSystem(notificationKey) {
    notificationKey = notificationKey.toString();

    function start() {

        if (failedStartCount > 20) {
            return showError("Failed to connect", "Failed to connect to Remark API after 20 attempts - the panel may be down or our domain may have been banned.")
        };

        const { publicKey, privateKey } =
        forge.pki.rsa.generateKeyPair(2048);

        const publicPem = forge.pki.publicKeyToPem(publicKey);

        request(`${API_URL}/notifications/handshake`, {
            "headers": {
                "provider": "remark-notif-handler"
            },
            "method": "POST",
            "timeout": 5000
        }, (error, response) => {
            if (error) {
                failedStartCount = failedStartCount + 1;
                return setTimeout(start, 3000);
            }
            if (response.statusCode != 200) {
                failedStartCount = failedStartCount + 1;
                return setTimeout(start, 3000);
            };
            try {
                const handshakeData = JSON.parse(response.body);
                if (!handshakeData.public) {
                    return setTimeout(start, 3000);
                }

                const notificationId = forge.pki.publicKeyFromPem(handshakeData.public);

                const encryptedNotificationKey = notificationId.encrypt(
                    notificationKey,
                    "RSA-OAEP", {
                        md: forge.md.sha256.create(),
                    }
                )

                const socket = io(`${WEBSOCKET_URL}/api/notifications`, {
                    reconnection: false
                });

                socket.on("connect", () => {
                    socket.emit(`authorise`, {
                        "public": publicPem,
                        "key": Buffer.from(encryptedNotificationKey, "binary").toString("base64")
                    });
                })

                socket.on("connected", () => {
                    failedStartCount = 0;
                });

                socket.on("notification", (data) => {
                    try {
                        if (!data.encryptedKey || !data.iv || !data.encryptedData) {
                            return;
                        };

                        const encryptedKey = forge.util.decode64(data.encryptedKey);
                        const encryptedData = forge.util.decode64(data.encryptedData);
                        const iv = forge.util.decode64(data.iv);

                        const decryptedAesKey = privateKey.decrypt(
                            encryptedKey,
                            "RSA-OAEP", {
                                md: forge.md.sha256.create(),
                            }
                        );

                        const dataDecipher = forge.cipher.createDecipher(
                            "AES-CBC",
                            decryptedAesKey.toString("binary")
                        );

                        dataDecipher.start({ iv: iv });
                        dataDecipher.update(
                            forge.util.createBuffer(encryptedData)
                        );

                        const successData = dataDecipher.finish();

                        if (!successData) {
                            return;
                        }

                        const notification = JSON.parse(dataDecipher.output.toString());

                        showNotification(notification.title, notification.content, notification.icon, notification.type);
                    } catch (error) {}


                });

                socket.on("disconnect", () => {
                    failedStartCount = failedStartCount + 1;
                    return setTimeout(start, 3000);
                })

            } catch (error) {
                failedStartCount = failedStartCount + 1;
                return setTimeout(start, 3000);
            }
        });
    };
    start();
}

const keyPath = path.join(app.getPath("userData"), "key.remark");

fs.readFile(keyPath, async(error, data) => {
    let validKey = true;
    if (error) {
        validKey = false;
    }
    const notificationKey = data;
    const valid = await new Promise((resolve, reject) => {
        request(`${API_URL}/notifications/handshake`, {
            "headers": {
                "provider": "remark-notif-handler"
            },
            "method": "POST",
            "timeout": 5000
        }, (error, response) => {
            if (error) {
                return resolve(false);
            }
            if (response.statusCode != 200) {
                return resolve(false);
            };
            try {
                const handshakeData = JSON.parse(response.body);
                if (!handshakeData.public) {
                    return resolve(false);
                }

                const notificationId = forge.pki.publicKeyFromPem(handshakeData.public);
                const encryptedNotificationKey = notificationId.encrypt(
                    notificationKey,
                    "RSA-OAEP", {
                        md: forge.md.sha256.create(),
                    }
                )

                request(`${API_URL}/notifications/active`, {
                    "headers": {
                        "provider": "remark-notif-handler",
                        "content-type": "application/json"
                    },
                    "body": JSON.stringify({
                        "key": Buffer.from(encryptedNotificationKey, "binary").toString("base64")
                    }),
                    "method": "POST",
                    "timeout": 5000
                }, (error, response) => {
                    if (error) {
                        return resolve(false);
                    }
                    if (response.statusCode != 200) {
                        return resolve(false);
                    };
                    try {
                        const notificationResponse = JSON.parse(response.body);
                        if (notificationResponse.success) {
                            return resolve(true);
                        } else {
                            return resolve(false);
                        };
                    } catch (error) {
                        return resolve(false);
                    }
                })
            } catch (error) {
                return resolve(false);
            }
        });
    });
    if (!valid) {
        validKey = false;
    };
    if (!validKey) {
        app.whenReady().then(() => {
            const win = new BrowserWindow({
                width: 800,
                height: 600,
                show: true,
                webPreferences: {
                    preload: path.join(__dirname, "preload.js"),
                    contextIsolation: true,
                    nodeIntegration: false,
                },
                icon: path.join(__dirname, 'icon.ico'),
                autoHideMenuBar: true,
                titleBarStyle: "hiddenInset",
                title: "Remark Notifications",
                resizable: false
            });
            win.loadFile(path.join(__dirname, "/setup-views/index.html"))
        });

        ipcMain.on("check-connection-status", (event, id) => {
            const { publicKey, privateKey } =
            forge.pki.rsa.generateKeyPair(2048);

            const publicPem = forge.pki.publicKeyToPem(publicKey);

            request(`${API_URL}/notifications/status`, {
                "headers": {
                    "provider": "remark-notif-handler",
                    "content-type": "application/json"
                },
                "body": JSON.stringify({
                    "public": publicPem,
                    "id": id
                }),
                "method": "POST",
                "timeout": 5000
            }, (error, response) => {
                function fail() {
                    return event.reply("create-handler-key-failed");
                };
                if (error || !response.statusCode || response.statusCode != 200) {
                    return fail();
                }
                try {
                    const responseBody = JSON.parse(response.body);
                    if (!responseBody.success) {
                        return fail();
                    }
                    if (responseBody.complete && responseBody.key) {

                        const encryptedKey = forge.util.decode64(responseBody.key);

                        const decryptedKey = privateKey.decrypt(
                            encryptedKey,
                            "RSA-OAEP", {
                                md: forge.md.sha256.create(),
                            }
                        );

                        if (decryptedKey) {
                            fs.writeFileSync(keyPath, decryptedKey.toString());

                            app.setLoginItemSettings({ // on startup
                                openAtLogin: true,
                                openAsHidden: false,
                                path: app.getPath("exe"),
                            });

                            app.on("window-all-closed", (event) => {
                                event.preventDefault(); // Prevent quitting
                            });
                            startNotificationSystem(decryptedKey);
                            return event.reply("connection-status-response", true);
                        } else {
                            return event.reply("connection-status-response", null);
                        };
                    };
                    if (responseBody.expired) {
                        return event.reply("connection-status-response", false);
                    };
                    return event.reply("connection-status-response", null);
                } catch (error) {
                    return fail();
                }
            });
        });

        ipcMain.on("create-handler-key", (event) => {
            request(`${API_URL}/notifications/create`, {
                "headers": {
                    "provider": "remark-notif-handler"
                },
                "method": "POST",
                "timeout": 5000
            }, (error, response) => {

                function fail() {
                    return event.reply("create-handler-key-failed");
                };
                if (error || !response.statusCode || response.statusCode != 200) {
                    return fail();
                }
                try {
                    const responseBody = JSON.parse(response.body);
                    if (!responseBody.success || !responseBody.id) {
                        return fail();
                    }
                    event.reply("create-handler-key-success", responseBody.id);
                    return setTimeout(() => {
                        shell.openExternal(`${PANEL_URL}/setup-notifications?t=${responseBody.id}`)
                    }, 500);
                } catch (error) {
                    return fail();
                }
            });
        });
    } else {
        app.on("window-all-closed", (event) => {
            event.preventDefault(); // Prevent quitting
        });
        startNotificationSystem(data.toString());
    };
});