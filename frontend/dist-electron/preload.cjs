const { contextBridge, ipcRenderer } = require('electron')

const exposed = {
  on(channel, listener) {
    return ipcRenderer.on(channel, (event, ...args) => listener(event, ...args))
  },
  off(channel, listener) {
    return ipcRenderer.off(channel, listener)
  },
  send(channel, ...args) {
    return ipcRenderer.send(channel, ...args)
  },
  invoke(channel, ...args) {
    return ipcRenderer.invoke(channel, ...args)
  },
}

contextBridge.exposeInMainWorld('ipcRenderer', exposed)
contextBridge.exposeInMainWorld('electron', { ipcRenderer: exposed })
