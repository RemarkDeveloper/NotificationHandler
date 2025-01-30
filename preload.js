const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("handler", {
    createHandlerKey: () => ipcRenderer.send("create-handler-key"),
    onHandlerKeySuccess: (callback) => ipcRenderer.on("create-handler-key-success", (_, key) => callback(key)),
    onHandlerKeyFailed: (callback) => ipcRenderer.on("create-handler-key-failed", callback),
    checkConnectionStatus: (connectionId) => {
        ipcRenderer.send("check-connection-status", connectionId);
    },
    onConnectionStatusResponse: (callback) => {
        ipcRenderer.on("connection-status-response", (_, status) => callback(status));
    }
});