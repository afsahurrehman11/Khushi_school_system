import { app as e, BrowserWindow as r } from "electron";
import { fileURLToPath as p } from "node:url";
import n from "node:path";
import a from "node:fs";
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
const t = process.env.VITE_DEV_SERVER_URL, b = n.join(process.env.APP_ROOT, "dist-electron"), m = n.join(process.env.APP_ROOT, "frontend", "dist");
process.env.VITE_PUBLIC = t ? n.join(process.env.APP_ROOT, "public") : m;
let o;
const f = e.requestSingleInstanceLock();
f || (e.quit(), process.exit(0));
e.on("second-instance", () => {
  o && (o.isMinimized() && o.restore(), o.focus());
});
const c = () => {
  try {
    e.quit();
  } catch {
  }
  try {
    process.exit(0);
  } catch {
  }
};
process.on("SIGINT", c);
process.on("SIGTERM", c);
process.on("exit", c);
function d() {
  if (o = new r({
    icon: n.join(process.env.VITE_PUBLIC, "electron-vite.svg"),
    webPreferences: {
      // Prefer a CommonJS preload when available (preload.cjs) for maximum compatibility.
      preload: a.existsSync(n.join(s, "preload.cjs")) ? n.join(s, "preload.cjs") : n.join(s, "preload.mjs"),
      sandbox: !1
    }
  }), o.webContents.on("did-finish-load", () => {
    o?.webContents.send("main-process-message", (/* @__PURE__ */ new Date()).toLocaleString());
  }), t)
    o.loadURL(t);
  else {
    const i = n.join(s, "..", "frontend", "dist", "index.html");
    console.log("Loading production HTML from:", i), console.log("File exists:", a.existsSync(i)), o.loadFile(i);
  }
}
e.on("window-all-closed", () => {
  process.platform !== "darwin" && (e.quit(), o = null);
});
e.on("activate", () => {
  r.getAllWindows().length === 0 && d();
});
e.whenReady().then(d);
export {
  b as MAIN_DIST,
  m as RENDERER_DIST,
  t as VITE_DEV_SERVER_URL
};
