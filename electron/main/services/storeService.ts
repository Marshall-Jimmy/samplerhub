/**
 * storeService — 主进程 JSON 文件持久化存储
 *
 * 替代渲染进程的 localStorage（在 Electron app:// 协议下被安全策略禁用）。
 * 通过 IPC 为 zustand persist 提供同步读写能力。
 */

import { ipcMain, app } from 'electron'
import fs from 'node:fs'
import path from 'node:path'

const STORE_DIR = path.join(app.getPath('userData'), 'store')

function getFilePath(key: string): string {
  const safeKey = key.replace(/[^a-zA-Z0-9_-]/g, '_')
  return path.join(STORE_DIR, `${safeKey}.json`)
}

function ensureDir(): void {
  if (!fs.existsSync(STORE_DIR)) {
    fs.mkdirSync(STORE_DIR, { recursive: true })
  }
}

export function initStoreService(): void {
  ensureDir()

  ipcMain.on('store:get', (event, key: string) => {
    try {
      const filePath = getFilePath(key)
      if (!fs.existsSync(filePath)) {
        event.returnValue = null
        return
      }
      const content = fs.readFileSync(filePath, 'utf-8')
      event.returnValue = content
    } catch (err) {
      console.error('[storeService] get failed:', key, err)
      event.returnValue = null
    }
  })

  ipcMain.on('store:set', (event, key: string, value: string) => {
    try {
      ensureDir()
      const filePath = getFilePath(key)
      fs.writeFileSync(filePath, value, 'utf-8')
      event.returnValue = true
    } catch (err) {
      console.error('[storeService] set failed:', key, err)
      event.returnValue = false
    }
  })

  ipcMain.on('store:remove', (event, key: string) => {
    try {
      const filePath = getFilePath(key)
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath)
      }
      event.returnValue = true
    } catch (err) {
      console.error('[storeService] remove failed:', key, err)
      event.returnValue = false
    }
  })
}
