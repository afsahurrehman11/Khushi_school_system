const { ipcRenderer, contextBridge } = require('electron')

// --------- Expose some API to the Renderer process ---------
// Expose both `window.ipcRenderer` and a compatibility `window.electron`
// (some renderer code may reference `window.electron.ipcRenderer`).
const exposed = {
  on(...args: any[]) {
    const [channel, listener] = args
    return ipcRenderer.on(channel, (event: any, ...args: any[]) => listener(event, ...args))
  },
  off(...args: any[]) {
    const [channel, ...omit] = args
    return ipcRenderer.off(channel, ...omit)
  },
  send(...args: any[]) {
    const [channel, ...omit] = args
    return ipcRenderer.send(channel, ...omit)
  },
  invoke(...args: any[]) {
    const [channel, ...omit] = args
    return ipcRenderer.invoke(channel, ...omit)
  },
}

contextBridge.exposeInMainWorld('ipcRenderer', exposed)
contextBridge.exposeInMainWorld('electron', { ipcRenderer: exposed })

// You can expose other APIs you need here.

// Expose a runtimeConfig object by reading a JSON file placed next to the executable.
// This allows the packaged EXE to use a runtime override for things like the API URL
// without rebuilding the app.
try {
  const fs = require('fs')
  const path = require('path')
  const execPath = process.execPath
  const execDir = path.dirname(execPath)
  const cfgName = 'khushi-runtime-config.json'
  const cfgPath = path.join(execDir, cfgName)
  let runtimeConfig = {}
  if (fs.existsSync(cfgPath)) {
    try {
      const raw = fs.readFileSync(cfgPath, 'utf8')
      runtimeConfig = JSON.parse(raw)
    } catch (e) {
      // ignore parse errors
      runtimeConfig = {}
    }
  }
  contextBridge.exposeInMainWorld('runtimeConfig', runtimeConfig)
} catch (e) {
  // If not running in Electron or fs not available, skip exposing runtimeConfig
}
