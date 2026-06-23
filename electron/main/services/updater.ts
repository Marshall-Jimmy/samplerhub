import { app, ipcMain } from 'electron'
import type {
  ProgressInfo,
  UpdateDownloadedEvent,
  UpdateInfo,
} from 'electron-updater'
import log from 'electron-log'

var cancellationToken: any = null
var isDownloading = false
var checkTimer: ReturnType<typeof setInterval> | null = null

/** 初始化自动更新服务 */
export async function initAutoUpdater(win: Electron.BrowserWindow): Promise<void> {
  // 仅在打包环境中启用
  if (!app.isPackaged) {
    log.info('[Updater] Auto-update disabled in development mode')
    return
  }

  // 动态导入 electron-updater（避免 ESM 兼容性问题）
  const { autoUpdater, CancellationToken } = await import('electron-updater')
  cancellationToken = new CancellationToken()

  // 配置 autoUpdater
  autoUpdater.autoDownload = false
  autoUpdater.disableWebInstaller = false
  autoUpdater.allowDowngrade = false
  autoUpdater.autoInstallOnAppQuit = true

  // 事件监听
  autoUpdater.on('checking-for-update', () => {
    log.info('[Updater] Checking for updates...')
  })

  autoUpdater.on('update-available', (info: UpdateInfo) => {
    log.info(`[Updater] Update available: v${info.version}`)
    win.webContents.send('update-can-available', {
      update: true,
      version: app.getVersion(),
      newVersion: info?.version,
    })
  })

  autoUpdater.on('update-not-available', (info: UpdateInfo) => {
    log.info('[Updater] No update available')
    win.webContents.send('update-can-available', {
      update: false,
      version: app.getVersion(),
      newVersion: info?.version,
    })
  })

  autoUpdater.on('download-progress', (info: ProgressInfo) => {
    win.webContents.send('download-progress', info)
  })

  autoUpdater.on('update-downloaded', (info: UpdateDownloadedEvent) => {
    log.info('[Updater] Update downloaded, ready to install')
    win.webContents.send('update-downloaded')
  })

  autoUpdater.on('error', (err: Error) => {
    log.error('[Updater] Error:', err.message)
    win.webContents.send('update-error', { message: err.message, error: err })
  })

  // 注册 IPC 处理程序
  registerUpdaterIpcHandlers(win, autoUpdater)

  // 首次启动延迟 30 秒后检查更新（避免影响启动性能）
  setTimeout(() => {
    checkForUpdates(autoUpdater).catch(err => {
      log.warn('[Updater] Initial check failed:', err)
    })
  }, 30 * 1000)

  // 每小时检查一次更新
  checkTimer = setInterval(() => {
    checkForUpdates(autoUpdater).catch(err => {
      log.warn('[Updater] Scheduled check failed:', err)
    })
  }, 60 * 60 * 1000)
}

/** 停止自动更新定时器 */
export function stopAutoUpdater(): void {
  if (checkTimer) {
    clearInterval(checkTimer)
    checkTimer = null
  }
}

/** 检查更新 */
async function checkForUpdates(autoUpdater: any): Promise<void> {
  try {
    await autoUpdater.checkForUpdates()
  } catch (err) {
    log.error('[Updater] Check failed:', err)
  }
}

/** 注册更新相关的 IPC 处理程序 */
function registerUpdaterIpcHandlers(win: Electron.BrowserWindow, autoUpdater: any): void {
  // 手动检查更新
  ipcMain.handle('check-update', async () => {
    if (!app.isPackaged) {
      const error = new Error('The update feature is only available after the package.')
      return { message: error.message, error }
    }

    try {
      return await autoUpdater.checkForUpdates()
    } catch (error) {
      const resolvedError = error instanceof Error ? error : new Error('Network error')
      return { message: resolvedError.message, error: resolvedError }
    }
  })

  // 开始下载
  ipcMain.handle('start-download', (event: Electron.IpcMainInvokeEvent) => {
    if (isDownloading) return

    isDownloading = true
    startDownload(
      autoUpdater,
      (error, progressInfo) => {
        if (error) {
          isDownloading = false
          event.sender.send('update-error', { message: error.message, error })
        } else {
          event.sender.send('download-progress', progressInfo)
        }
      },
      () => {
        isDownloading = false
        event.sender.send('update-downloaded')
      }
    )
  })

  // 取消下载
  ipcMain.handle('cancel-download', () => {
    if (cancellationToken) {
      cancellationToken.cancel()
    }
  })

  // 立即安装并重启
  ipcMain.handle('quit-and-install', () => {
    autoUpdater.quitAndInstall(false, true)
  })
}

/** 开始下载更新 */
function startDownload(
  autoUpdater: any,
  callback: (error: Error | null, info: ProgressInfo | null) => void,
  complete: (event: UpdateDownloadedEvent) => void,
): void {
  const onDownloadProgress = (info: ProgressInfo) => callback(null, info)
  const onError = (error: Error) => {
    cleanup()
    callback(error, null)
  }
  const onDownloaded = (event: UpdateDownloadedEvent) => {
    cleanup()
    complete(event)
  }

  const cleanup = () => {
    autoUpdater.off('download-progress', onDownloadProgress)
    autoUpdater.off('error', onError)
    autoUpdater.off('update-downloaded', onDownloaded)
  }

  autoUpdater.on('download-progress', onDownloadProgress)
  autoUpdater.on('error', onError)
  autoUpdater.once('update-downloaded', onDownloaded)
  autoUpdater.downloadUpdate(cancellationToken)
}
