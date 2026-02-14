import { app as e, BrowserWindow as c } from "electron";
import { fileURLToPath as p } from "node:url";
import n from "node:path";
import m from "node:fs";
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
const s = n.dirname(p(import.meta.url));
process.env.APP_ROOT = n.join(s, "..");
try {
  const i = n.join(l.tmpdir(), "khushi-erps-electron");
  e.setPath("userData", i);
} catch {
}
const t = process.env.VITE_DEV_SERVER_URL, u = n.join(process.env.APP_ROOT, "dist-electron"), r = n.join(process.env.APP_ROOT, "dist");
process.env.VITE_PUBLIC = t ? n.join(process.env.APP_ROOT, "public") : r;
let o;
const w = e.requestSingleInstanceLock();
w || (e.quit(), process.exit(0));
e.on("second-instance", () => {
  o && (o.isMinimized() && o.restore(), o.focus());
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
  o = new c({
    icon: n.join(process.env.VITE_PUBLIC, "electron-vite.svg"),
    webPreferences: {
      // Prefer a CommonJS preload when available (preload.cjs) for maximum compatibility.
      preload: m.existsSync(n.join(s, "preload.cjs")) ? n.join(s, "preload.cjs") : n.join(s, "preload.mjs"),
      sandbox: !1
    }
  }), o.webContents.on("did-finish-load", () => {
    o?.webContents.send("main-process-message", (/* @__PURE__ */ new Date()).toLocaleString());
  }), t ? o.loadURL(t) : o.loadFile(n.join(r, "index.html"));
}
e.on("window-all-closed", () => {
  process.platform !== "darwin" && (e.quit(), o = null);
});
e.on("activate", () => {
  c.getAllWindows().length === 0 && d();
});
e.whenReady().then(d);
export {
  u as MAIN_DIST,
  r as RENDERER_DIST,
  t as VITE_DEV_SERVER_URL
};
