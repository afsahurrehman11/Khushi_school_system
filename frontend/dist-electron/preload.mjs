"use strict";
const { ipcRenderer, contextBridge } = require("electron");
const exposed = {
  on(...args) {
    const [channel, listener] = args;
    return ipcRenderer.on(channel, (event, ...args2) => listener(event, ...args2));
  },
  off(...args) {
    const [channel, ...omit] = args;
    return ipcRenderer.off(channel, ...omit);
  },
  send(...args) {
    const [channel, ...omit] = args;
    return ipcRenderer.send(channel, ...omit);
  },
  invoke(...args) {
    const [channel, ...omit] = args;
    return ipcRenderer.invoke(channel, ...omit);
  }
};
contextBridge.exposeInMainWorld("ipcRenderer", exposed);
contextBridge.exposeInMainWorld("electron", { ipcRenderer: exposed });
try {
  const fs = require("fs");
  const path = require("path");
  const execPath = process.execPath;
  const execDir = path.dirname(execPath);
  const cfgName = "khushi-runtime-config.json";
  const cfgPath = path.join(execDir, cfgName);
  let runtimeConfig = {};
  if (fs.existsSync(cfgPath)) {
    try {
      const raw = fs.readFileSync(cfgPath, "utf8");
      runtimeConfig = JSON.parse(raw);
    } catch (e) {
      runtimeConfig = {};
    }
  }
  contextBridge.exposeInMainWorld("runtimeConfig", runtimeConfig);
} catch (e) {
}
