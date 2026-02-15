import { app as e, BrowserWindow as r } from "electron";
import { fileURLToPath as p } from "node:url";
import o from "node:path";
import s from "node:fs";
import l from "node:os";
e.disableHardwareAcceleration();
e.commandLine.appendSwitch("disable-gpu");
e.commandLine.appendSwitch("enable-software-rasterizer");
e.commandLine.appendSwitch("disable-gpu-compositing");
e.commandLine.appendSwitch("disable-gpu-sandbox");
e.commandLine.appendSwitch("disable-d3d11");
e.commandLine.appendSwitch("disable-dx12");
e.commandLine.appendSwitch("disable-accelerated-2d-canvas");
e.commandLine.appendSwitch("disable-direct-composition");
e.commandLine.appendSwitch("disable-gpu-memory-buffer-video-frames");
const t = o.dirname(p(import.meta.url));
process.env.APP_ROOT = o.join(t, "..");
try {
  const n = o.join(l.tmpdir(), "khushi-erps-electron");
  e.setPath("userData", n);
} catch {
}
const c = e.isPackaged ? void 0 : process.env.VITE_DEV_SERVER_URL, L = o.join(process.env.APP_ROOT, "dist-electron"), m = o.join(process.env.APP_ROOT, "frontend", "dist");
process.env.VITE_PUBLIC = c ? o.join(process.env.APP_ROOT, "public") : m;
let i;
const f = e.requestSingleInstanceLock();
f || (e.quit(), process.exit(0));
e.on("second-instance", () => {
  i && (i.isMinimized() && i.restore(), i.focus());
});
const a = () => {
  try {
    e.quit();
  } catch {
  }
  try {
    process.exit(0);
  } catch {
  }
};
process.on("SIGINT", a);
process.on("SIGTERM", a);
process.on("exit", a);
function d() {
  if (i = new r({
    icon: o.join(process.env.VITE_PUBLIC, "electron-vite.svg"),
    webPreferences: {
      // Prefer a CommonJS preload when available (preload.cjs) for maximum compatibility.
      preload: s.existsSync(o.join(t, "preload.cjs")) ? o.join(t, "preload.cjs") : o.join(t, "preload.mjs"),
      sandbox: !1,
      webSecurity: !1
    }
  }), i.webContents.on("did-finish-load", () => {
    i?.webContents.send("main-process-message", (/* @__PURE__ */ new Date()).toLocaleString());
  }), console.log("app.isPackaged:", e.isPackaged), console.log("VITE_DEV_SERVER_URL:", c), !e.isPackaged && c)
    i.loadURL(c);
  else {
    const n = o.join(process.resourcesPath, "app", "dist", "index.html");
    console.log("Loading production HTML from:", n), console.log("File exists:", s.existsSync(n)), s.existsSync(n) && console.log("File content preview:", s.readFileSync(n, "utf8").substring(0, 200)), i.loadFile(n);
  }
}
e.on("window-all-closed", () => {
  process.platform !== "darwin" && (e.quit(), i = null);
});
e.on("activate", () => {
  r.getAllWindows().length === 0 && d();
});
e.whenReady().then(d);
export {
  L as MAIN_DIST,
  m as RENDERER_DIST,
  c as VITE_DEV_SERVER_URL
};
