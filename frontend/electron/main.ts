import { app } from 'electron'
// Disable hardware acceleration and force software rendering fallbacks for Electron
// Call these before any other Electron imports to avoid early GPU initialization.
app.disableHardwareAcceleration();
app.commandLine.appendSwitch('disable-gpu');
// Allow Electron to fall back to the software rasterizer when GPU
// virtualization is unavailable. Disabling the software rasterizer
// can make Electron fail to create any rendering context.
app.commandLine.appendSwitch('enable-software-rasterizer');
// Also disable GPU compositing to reduce reliance on hardware GPU.
app.commandLine.appendSwitch('disable-gpu-compositing');
// Additional switches to reduce Chromium's GPU usage and noisy GPU logs
app.commandLine.appendSwitch('disable-gpu-sandbox');
app.commandLine.appendSwitch('disable-d3d11');
app.commandLine.appendSwitch('disable-dx12');
app.commandLine.appendSwitch('disable-accelerated-2d-canvas');
app.commandLine.appendSwitch('disable-direct-composition');
app.commandLine.appendSwitch('disable-gpu-memory-buffer-video-frames');
import { BrowserWindow } from 'electron'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import fs from 'node:fs'
import os from 'node:os'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// The built directory structure
//
// ├─┬─┬ dist
// │ │ └── index.html
// │ │
// │ ├─┬ dist-electron
// │ │ ├── main.js
// │ │ └── preload.mjs
// │
process.env.APP_ROOT = path.join(__dirname, '..')

// Use a safe temp user-data directory to avoid permission errors
// when Chromium attempts to create disk cache in restricted folders.
try {
  const tmpUserData = path.join(os.tmpdir(), 'khushi-erps-electron')
  app.setPath('userData', tmpUserData)
} catch (err) {
  // ignore if setPath fails; at worst Chromium will use default locations
}

// 🚧 Use ['ENV_NAME'] avoid vite:define plugin - Vite@2.x
export const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL']
export const MAIN_DIST = path.join(process.env.APP_ROOT, 'dist-electron')
// Renderer distribution directory inside packaged app
// Renderer distribution directory inside packaged app: use `dist` at app root
export const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist')

process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL ? path.join(process.env.APP_ROOT, 'public') : RENDERER_DIST

let win: BrowserWindow | null

// Prevent multiple Electron instances in development
const gotTheLock = app.requestSingleInstanceLock()
if (!gotTheLock) {
  app.quit()
  process.exit(0)
}

app.on('second-instance', () => {
  // Focus the existing window if a second instance is launched
  if (win) {
    if (win.isMinimized()) win.restore()
    win.focus()
  }
})

// Ensure clean exit on parent process termination / signals
const cleanupAndExit = () => {
  try { app.quit() } catch (e) { /* ignore */ }
  try { process.exit(0) } catch (e) { /* ignore */ }
}
process.on('SIGINT', cleanupAndExit)
process.on('SIGTERM', cleanupAndExit)
process.on('exit', cleanupAndExit)

function createWindow() {
  win = new BrowserWindow({
    icon: path.join(process.env.VITE_PUBLIC, 'electron-vite.svg'),
    webPreferences: {
      // Prefer a CommonJS preload when available (preload.cjs) for maximum compatibility.
      preload: fs.existsSync(path.join(__dirname, 'preload.cjs'))
        ? path.join(__dirname, 'preload.cjs')
        : path.join(__dirname, 'preload.mjs'),
      sandbox: false,
    },
  })

  // Test active push message to Renderer-process.
  win.webContents.on('did-finish-load', () => {
    win?.webContents.send('main-process-message', (new Date).toLocaleString())
  })

  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL)
  } else {
    // In production: load from `dist` inside the app resources (no extra "frontend" folder)
    // When packaged, electron-builder extracts files to: <app>/resources/app/
    const indexPath = path.join(RENDERER_DIST, 'index.html')

    console.log('Loading production HTML from:', indexPath)
    console.log('File exists:', fs.existsSync(indexPath))

    win.loadFile(indexPath)
  }
}

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
    win = null
  }
})

app.on('activate', () => {
  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})

app.whenReady().then(createWindow)
