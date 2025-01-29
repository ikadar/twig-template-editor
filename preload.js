const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    sendValueToMain: (value) => ipcRenderer.send('send-value', value)
});
