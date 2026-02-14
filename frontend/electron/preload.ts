import { ipcRenderer, contextBridge } from 'electron'

// --------- Expose some API to the Renderer process ---------
// Expose both `window.ipcRenderer` and a compatibility `window.electron`
// (some renderer code may reference `window.electron.ipcRenderer`).
const exposed = {
  on(...args: Parameters<typeof ipcRenderer.on>) {
    const [channel, listener] = args
    return ipcRenderer.on(channel, (event, ...args) => listener(event, ...args))
  },
  off(...args: Parameters<typeof ipcRenderer.off>) {
    const [channel, ...omit] = args
    return ipcRenderer.off(channel, ...omit)
  },
  send(...args: Parameters<typeof ipcRenderer.send>) {
    const [channel, ...omit] = args
    return ipcRenderer.send(channel, ...omit)
  },
  invoke(...args: Parameters<typeof ipcRenderer.invoke>) {
    const [channel, ...omit] = args
    return ipcRenderer.invoke(channel, ...omit)
  },
}

contextBridge.exposeInMainWorld('ipcRenderer', exposed)
contextBridge.exposeInMainWorld('electron', { ipcRenderer: exposed })

// You can expose other APIs you need here.
