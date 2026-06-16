import { app, BrowserWindow, dialog, nativeImage, Tray, Menu, ipcMain, protocol, net } from 'electron'

// 必须在 app ready 之前注册自定义协议，否则渲染进程无法识别
protocol.registerSchemesAsPrivileged([
  { scheme: 'local-audio', privileges: { secure: true, standard: true, supportFetchAPI: true } },
  { scheme: 'online-preview', privileges: { secure: true, standard: true, supportFetchAPI: true, corsEnabled: true } },
])
import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import log from 'electron-log'

// 启动错误捕获（延迟初始化路径，避免 app ready 前调用 getPath）
let startupLogPath: string | null = null
function getStartupLogPath(): string {
  if (!startupLogPath) {
    startupLogPath = path.join(app.getPath('userData'), 'startup-error.log')
  }
  return startupLogPath
}
process.on('uncaughtException', (err) => {
  try {
    fs.appendFileSync(getStartupLogPath(), `[${new Date().toISOString()}] UNCAUGHT: ${err.message}\n${err.stack}\n\n`)
  } catch {}
})
process.on('unhandledRejection', (reason) => {
  try {
    fs.appendFileSync(getStartupLogPath(), `[${new Date().toISOString()}] UNHANDLED: ${reason}\n\n`)
  } catch {}
})

// Polyfill __dirname 和 __filename 用于 ESM 环境
// 某些第三方库（如 essentia.js WASM）在 ESM 中引用了这些 CJS 全局变量
import { pathToFileURL } from 'node:url'
const _filename = fileURLToPath(import.meta.url)
const _dirname = path.dirname(_filename)
if (typeof globalThis.__filename === 'undefined') (globalThis as any).__filename = _filename
if (typeof globalThis.__dirname === 'undefined') (globalThis as any).__dirname = _dirname
import { registerIpcHandlers, registerWindowHandlers, setToolWindowsMap, setWindowCreators } from './services/ipcHandlers'
import { startWatchingAllFolders, stopAllWatchers } from './services/fileWatcher'
import { startAutoBackup, stopAutoBackup, getSqlite } from './services/database'
import { seedUcsTaxonomy } from './services/ucsTaxonomy'
import { initAutoUpdater, stopAutoUpdater } from './services/updater'
import { perfMonitor } from './services/performanceMonitor'
import { initSentry } from './services/sentry'
import { initEssentia, shutdownEssentia } from './services/audioAnalyzer'
import { runPythonSetup } from './services/pythonSetup'

// 配置日志
log.transports.file.maxSize = 10 * 1024 * 1024 // 10MB
log.transports.file.format = '[{y}-{m}-{d} {h}:{i}:{s}] [{level}] {text}'
const __dirname = path.dirname(fileURLToPath(import.meta.url))

process.env.APP_ROOT = path.join(__dirname, '..')

export const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL']
export const MAIN_DIST = path.join(process.env.APP_ROOT, 'dist-electron')
export const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist')

process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL ? path.join(process.env.APP_ROOT, 'public') : RENDERER_DIST

var win: BrowserWindow | null
var splash: BrowserWindow | null
var tray: Tray | null = null
var isQuitting = false
const windows: BrowserWindow[] = []

// 工具窗口管理
const toolWindows = new Map<string, BrowserWindow>()

function createToolWindow(type: 'pad' | 'sequencer') {
  const windowIcon = loadWindowIcon()
  const title = type === 'pad' ? "Drum Pad - SamplerHub" : "Step Sequencer - SamplerHub"
  const width = type === 'pad' ? 720 : 900
  const height = type === 'pad' ? 580 : 700

  const toolWin = new BrowserWindow({
    width,
    height,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#0f0f14',
    icon: windowIcon,
    title,
    webPreferences: {
      preload: path.join(__dirname, 'index.mjs'),
    },
  })

  const url = VITE_DEV_SERVER_URL
    ? `${VITE_DEV_SERVER_URL}?tool=${type}`
    : `file://${path.join(RENDERER_DIST, 'index.html')}?tool=${type}`

  toolWin.loadURL(url)

  toolWin.once('ready-to-show', () => {
    toolWin.show()
    toolWin.focus()
  })

  toolWin.on('closed', () => {
    toolWindows.delete(type)
  })

  toolWindows.set(type, toolWin)
  return toolWin
}

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

function loadWindowIcon(): Electron.NativeImage {
  let windowIcon: Electron.NativeImage = nativeImage.createEmpty()
  try {
    const candidates: string[] = []
    if (app.isPackaged) {
      candidates.push(path.join(__dirname, '..', 'dist', 'appIcon_256.png'))
      candidates.push(path.join(__dirname, '..', 'dist', 'appIcon.png'))
      candidates.push(path.join(process.resourcesPath, 'icon.png'))
    } else {
      candidates.push(path.join(__dirname, '..', 'public', 'appIcon_256.png'))
      candidates.push(path.join(__dirname, '..', 'build', 'icon_256.png'))
      candidates.push(path.join(__dirname, '..', 'public', 'appIcon.png'))
    }

    let loadedPath = ''
    for (const iconPath of candidates) {
      if (fs.existsSync(iconPath)) {
        const stats = fs.statSync(iconPath)
        if (stats.size > 1000) {
          const icon = nativeImage.createFromPath(iconPath)
          if (!icon.isEmpty()) {
            windowIcon = icon
            loadedPath = iconPath
            break
          }
        }
      }
    }

    if (!loadedPath) {
      console.error('[Icon] No valid icon found. Tried:', candidates)
    } else {
      console.log('[Icon] Loaded from:', loadedPath, 'size:', windowIcon.getSize())
    }
  } catch (e) {
    console.error('[Icon] Failed to load app icon:', e)
  }
  return windowIcon
}

function createWindow() {
  const windowIcon = loadWindowIcon()

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

  // 禁用默认的文件拖放行为（防止拖文件时导航到文件路径）
  win.webContents.on('will-navigate', (e, url) => {
    if (url.startsWith('file://')) {
      e.preventDefault()
    }
  })

  win.webContents.on('did-finish-load', () => {
    win?.webContents.send('main-process-message', (new Date).toLocaleString())

    // 记录页面加载时间
    perfMonitor.recordMetric('pageLoad', Date.now() - perfMonitor.getStartupTime())

    // 初始化自动更新
    if (app.isPackaged) {
      initAutoUpdater(win!).catch(err => {
        log.error('[Updater] Init failed:', err)
      })
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

  // 关闭按钮：发送事件到渲染进程，由前端弹窗处理
  win.on('close', (e) => {
    if (!isQuitting) {
      e.preventDefault()
      if (win && !win.isDestroyed()) {
        win.webContents.send('window:close-requested')
      }
    }
  })
}

export function createNewWindow() {
  const windowIcon = loadWindowIcon()
  const newWin = new BrowserWindow({
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

  if (process.env.VITE_DEV_SERVER_URL) {
    newWin.loadURL(process.env.VITE_DEV_SERVER_URL)
  } else {
    newWin.loadFile(path.join(__dirname, '../dist/index.html'))
  }

  newWin.once('ready-to-show', () => newWin.show())
  windows.push(newWin)

  newWin.on('closed', () => {
    const idx = windows.indexOf(newWin)
    if (idx > -1) windows.splice(idx, 1)
  })

  return newWin
}

function createTray() {
  // 加载托盘图标
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

  let trayIcon = nativeImage.createEmpty()
  for (const iconPath of iconCandidates) {
    try {
      if (fs.existsSync(iconPath)) {
        const img = nativeImage.createFromPath(iconPath)
        if (!img.isEmpty()) {
          // Windows 托盘图标建议 16x16
          trayIcon = img.resize({ width: 16, height: 16 })
          break
        }
      }
    } catch {
      // skip
    }
  }

  if (trayIcon.isEmpty()) {
    log.warn('[Tray] No valid icon found, using empty icon')
  }

  tray = new Tray(trayIcon)
  tray.setToolTip("Jima's SamplerHub")

  // 右键菜单
  const contextMenu = Menu.buildFromTemplate([
    {
      label: '显示主窗口',
      click: () => {
        if (win) {
          win.show()
          win.focus()
        }
      },
    },
    {
      label: '新建窗口',
      click: () => {
        createNewWindow()
      },
    },
    {
      label: '播放/暂停',
      click: () => {
        if (win && !win.isDestroyed()) {
          win.webContents.send('tray:toggle-play')
        }
      },
    },
    { type: 'separator' },
    {
      label: '退出',
      click: () => {
        isQuitting = true
        stopAllWatchers()
        stopAutoBackup()
        stopAutoUpdater()
        app.quit()
      },
    },
  ])

  tray.setContextMenu(contextMenu)

  // 点击托盘图标恢复主窗口
  tray.on('click', () => {
    if (win) {
      win.show()
      win.focus()
    }
  })
}

app.on('window-all-closed', () => {
  // 不退出应用，保持托盘运行
  // macOS 上默认行为是保持应用活跃
})

// 退出时完整清理资源（无论通过何种方式退出）
app.on('will-quit', () => {
  try { stopAllWatchers() } catch {}
  try { stopAutoBackup() } catch {}
  try { stopAutoUpdater() } catch {}
  try { shutdownEssentia() } catch {}
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})

app.whenReady().then(async () => {
  const startTime = Date.now()
  try {
    // 注册自定义协议处理本地音频文件（避免 file:// URL 中 # 等特殊字符的问题）
    protocol.handle('local-audio', (request) => {
      // 从 URL 中提取文件路径（不能用 new URL() 因为 # 会被截断）
      // local-audio:///<absolute-path>
      const rawUrl = request.url
      // 去掉协议前缀，得到路径部分
      const pathPart = rawUrl.slice('local-audio:///'.length)
      const filePath = decodeURIComponent(pathPart)
      return net.fetch(`file:///${filePath.replace(/\\/g, '/')}`)
    })

    // 注册 online-preview 协议（代理在线采样预览音频，绕过 CORS）
    // 必须在 createWindow 之前同步注册，否则渲染进程可能无法识别该协议
    const { registerOnlinePreviewProtocol } = await import('./services/onlineSampleApi')
    registerOnlinePreviewProtocol()

    createSplash()
    createWindow()
    createTray()
    // 注册窗口控制 IPC（包括工具窗口创建）
    setToolWindowsMap(toolWindows)
    setWindowCreators(
      () => createToolWindow('pad'),
      () => createToolWindow('sequencer')
    )
    if (win) {
      registerWindowHandlers(win)
    }

    // 延迟初始化数据库和文件监控，不阻塞窗口创建
    setImmediate(async () => {
      const initStart = Date.now()
      await registerIpcHandlers()
      // 初始化 UCS 分类数据（在数据库初始化完成后）
      try {
        seedUcsTaxonomy(getSqlite())
      } catch (err) {
        console.error('[UCS] Seed failed:', err)
      }
      // 注册窗口控制 IPC（最小化到托盘 / 强制退出）
      ipcMain.on('window:minimize-to-tray', () => {
        if (win && !win.isDestroyed()) {
          win.hide()
        }
      })
      ipcMain.on('window:force-quit', () => {
        isQuitting = true
        app.quit()
      })
      perfMonitor.recordMetric('databaseInit', Date.now() - initStart)
      startAutoBackup()

      // 延迟 2 秒再启动文件监控，让窗口先完成加载、UI 先响应
      setTimeout(() => {
        startWatchingAllFolders().catch(err => {
          console.warn('[Watcher] Failed to start file watchers:', err)
        })
      }, 2000)

      // 异步初始化 essentia.js WASM（不阻塞其他初始化）
      initEssentia().catch(err => {
        log.warn('[AudioAnalyzer] essentia.js init failed, audio analysis will be unavailable:', err)
      })

      // 延迟 5 秒再启动 Python 相关后台任务，避免与 UI 初始化抢资源
      setTimeout(() => {
        // 异步检测 Python 环境并安装依赖（不阻塞）
        import('./services/pythonSetup').then(({ runPythonSetup }) => {
          runPythonSetup((msg) => {
            log.info(`[PythonSetup] ${msg}`)
          }).then(result => {
            if (result.success) {
              log.info('[PythonSetup] Python environment ready')
            } else {
              log.warn('[PythonSetup] Python setup failed:', result.error)
            }

            // Python 环境准备好后，启动 sidecar
            import('./services/analyzerSidecar').then(({ analyzerSidecar }) => {
              analyzerSidecar.start().then(ok => {
                if (ok) {
                  log.info('[Sidecar] Analyzer sidecar started successfully')
                } else {
                  log.warn('[Sidecar] Analyzer sidecar not available, semantic search will be disabled')
                }
              }).catch(err => {
                log.warn('[Sidecar] Failed to start analyzer sidecar:', err)
              })
            })
          })
        })
      }, 5000)

      perfMonitor.recordMetric('dbWatcherBackupInit', Date.now() - initStart)
      perfMonitor.recordMetric('appStartup', Date.now() - startTime)
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
  // 避免应用处于不可预测状态，延迟退出
  setTimeout(() => { app.quit() }, 1000)
})

process.on('unhandledRejection', (reason) => {
  log.error('Unhandled Rejection:', reason)
})
