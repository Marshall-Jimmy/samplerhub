import { app, BrowserWindow, dialog, nativeImage } from 'electron'
import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import log from 'electron-log'
import { registerIpcHandlers } from './services/ipcHandlers'
import { startWatchingAllFolders, stopAllWatchers } from './services/fileWatcher'
import { startAutoBackup, stopAutoBackup } from './services/database'
import { update } from './update'

// 配置日志
log.transports.file.maxSize = 10 * 1024 * 1024 // 10MB
log.transports.file.format = '[{y}-{m}-{d} {h}:{i}:{s}] [{level}] {text}'
const __dirname = path.dirname(fileURLToPath(import.meta.url))

process.env.APP_ROOT = path.join(__dirname, '..')

export const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL']
export const MAIN_DIST = path.join(process.env.APP_ROOT, 'dist-electron')
export const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist')

process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL ? path.join(process.env.APP_ROOT, 'public') : RENDERER_DIST

let win: BrowserWindow | null
let splash: BrowserWindow | null

function createSplash() {
  splash = new BrowserWindow({
    width: 480,
    height: 320,
    transparent: true,
    frame: false,
    resizable: false,
    center: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    show: false,
  })

  // 读取应用图标为 data URL，嵌入 splash HTML
  let iconDataUrl = ''
  const iconCandidates: string[] = []
  if (app.isPackaged) {
    iconCandidates.push(path.join(__dirname, '..', 'dist', 'appIcon_256.png'))
    iconCandidates.push(path.join(__dirname, '..', 'dist', 'appIcon.png'))
    iconCandidates.push(path.join(process.resourcesPath, 'icon.png'))
  } else {
    iconCandidates.push(path.join(__dirname, '..', 'public', 'appIcon_256.png'))
    iconCandidates.push(path.join(__dirname, '..', 'build', 'icon_256.png'))
    iconCandidates.push(path.join(__dirname, '..', 'public', 'appIcon.png'))
  }
  for (const iconPath of iconCandidates) {
    try {
      if (fs.existsSync(iconPath)) {
        const buf = fs.readFileSync(iconPath)
        iconDataUrl = `data:image/png;base64,${buf.toString('base64')}`
        break
      }
    } catch {
      // skip
    }
  }

  splash.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(`
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
          width: 480px;
          height: 320px;
          background: #0f0f14;
          border-radius: 16px;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
          color: #e5e5e5;
          overflow: hidden;
          border: 1px solid rgba(255,255,255,0.06);
        }
        .app-icon {
          width: 80px;
          height: 80px;
          border-radius: 18px;
          margin-bottom: 12px;
          object-fit: contain;
        }
        .subtitle {
          font-size: 13px;
          color: #71717a;
          margin-bottom: 32px;
        }
        .progress-container {
          width: 240px;
          height: 4px;
          background: rgba(255,255,255,0.06);
          border-radius: 2px;
          overflow: hidden;
          margin-bottom: 16px;
        }
        .progress-bar {
          height: 100%;
          width: 0%;
          background: linear-gradient(90deg, #6366f1, #22d3ee);
          border-radius: 2px;
          transition: width 0.3s ease;
        }
        .status {
          font-size: 12px;
          color: #52525b;
        }
      </style>
    </head>
    <body>
      ${iconDataUrl ? `<img class="app-icon" src="${iconDataUrl}" alt="SamplerHub" />` : '<div class="app-icon" style="background:linear-gradient(135deg,#6366f1,#22d3ee);border-radius:18px;"></div>'}
      <div class="subtitle">Jima's Sample Manager</div>
      <div class="progress-container">
        <div class="progress-bar" id="bar"></div>
      </div>
      <div class="status" id="status">Initializing...</div>
      <script>
        const bar = document.getElementById('bar');
        const status = document.getElementById('status');
        window.electronAPI = { on: () => {} };

        // Simulate progress stages
        const stages = [
          { pct: 15, text: 'Loading database...' },
          { pct: 35, text: 'Scanning libraries...' },
          { pct: 55, text: 'Loading samples...' },
          { pct: 75, text: 'Preparing interface...' },
          { pct: 90, text: 'Almost ready...' },
        ];

        let currentStage = 0;
        function nextStage() {
          if (currentStage < stages.length) {
            bar.style.width = stages[currentStage].pct + '%';
            status.textContent = stages[currentStage].text;
            currentStage++;
            setTimeout(nextStage, 400 + Math.random() * 300);
          }
        }
        nextStage();
      </script>
    </body>
    </html>
  `)}`)

  splash.once('ready-to-show', () => {
    splash?.show()
  })
}

function createWindow() {
  // 图标加载：尝试多个路径，优先使用小尺寸图标（256x256）
  let windowIcon: Electron.NativeImage
  try {
    const candidates: string[] = []
    if (app.isPackaged) {
      // 打包后：优先用 dist 中的小尺寸图标
      candidates.push(path.join(__dirname, '..', 'dist', 'appIcon_256.png'))
      candidates.push(path.join(__dirname, '..', 'dist', 'appIcon.png'))
      candidates.push(path.join(process.resourcesPath, 'icon.png'))
    } else {
      // 开发时
      candidates.push(path.join(__dirname, '..', 'public', 'appIcon_256.png'))
      candidates.push(path.join(__dirname, '..', 'build', 'icon_256.png'))
      candidates.push(path.join(__dirname, '..', 'public', 'appIcon.png'))
    }

    let loadedPath = ''
    for (const iconPath of candidates) {
      if (fs.existsSync(iconPath)) {
        const stats = fs.statSync(iconPath)
        if (stats.size > 1000) {
          windowIcon = nativeImage.createFromPath(iconPath)
          if (!windowIcon.isEmpty()) {
            loadedPath = iconPath
            break
          }
        }
      }
    }

    if (!loadedPath) {
      console.error('[Icon] No valid icon found. Tried:', candidates)
      windowIcon = nativeImage.createEmpty()
    } else {
      console.log('[Icon] Loaded from:', loadedPath, 'size:', windowIcon.getSize())
    }
  } catch (e) {
    console.error('[Icon] Failed to load app icon:', e)
    windowIcon = nativeImage.createEmpty()
  }

  win = new BrowserWindow({
    width: 1400,
    height: 900,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#0f0f14',
    icon: windowIcon,
    title: "Jima's SamplerHub",
    webPreferences: {
      preload: path.join(__dirname, 'index.mjs'),
    },
  })

  win.webContents.on('did-finish-load', () => {
    win?.webContents.send('main-process-message', (new Date).toLocaleString())

    // 初始化自动更新
    if (app.isPackaged) {
      update(win!)
    }

    // 主窗口加载完成，关闭 splash 显示主窗口
    if (splash && !splash.isDestroyed()) {
      splash.webContents.executeJavaScript(`
        document.getElementById('bar').style.width = '100%';
        document.getElementById('status').textContent = 'Ready!';
      `).then(() => {
        setTimeout(() => {
          splash?.close()
          splash = null
          win?.show()
        }, 300)
      })
    } else {
      win?.show()
    }
  })

  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL)
  } else {
    win.loadFile(path.join(RENDERER_DIST, 'index.html'))
  }
}

app.on('window-all-closed', () => {
  stopAllWatchers()
  stopAutoBackup()
  if (process.platform !== 'darwin') {
    app.quit()
    win = null
  }
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})

app.whenReady().then(() => {
  const startTime = Date.now()
  try {
    createSplash()
    createWindow()
    // 延迟初始化数据库和文件监控，不阻塞窗口创建
    setImmediate(() => {
      const initStart = Date.now()
      registerIpcHandlers()
      startWatchingAllFolders()
      startAutoBackup()
      log.info(`[Perf] DB + Watcher + Backup init: ${Date.now() - initStart}ms`)
      log.info(`[Perf] App ready to show: ${Date.now() - startTime}ms`)
    })
  } catch (err) {
    log.error('Failed to initialize app:', err)
    dialog.showErrorBox('Startup Error', (err as Error).message)
    app.quit()
  }
})

process.on('uncaughtException', (err) => {
  log.error('Uncaught Exception:', err)
  try {
    dialog.showErrorBox('Uncaught Exception', err.message)
  } catch {
    // dialog may not be available
  }
})

process.on('unhandledRejection', (reason) => {
  log.error('Unhandled Rejection:', reason)
})
