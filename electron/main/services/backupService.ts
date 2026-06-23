import { app } from 'electron'
import path from 'node:path'
import fs from 'node:fs'
import { getDatabase, getSqlite, getDbPath, resetDatabaseConnection } from './database'
import log from 'electron-log'

const BACKUP_DIR_NAME = 'backups'
const MAX_BACKUPS = 5
const BACKUP_INTERVAL_MS = 24 * 60 * 60 * 1000 // 24 hours

/** 获取备份目录路径 */
function getBackupDir(): string {
  const backupDir = path.join(app.getPath('userData'), BACKUP_DIR_NAME)
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true })
  }
  return backupDir
}

/** 格式化时间戳 */
function formatTimestamp(date: Date): string {
  return date.toISOString().replace(/[:.]/g, '-')
}

/** 创建数据库备份 */
export function createBackup(): { success: boolean; path?: string; error?: string; size?: number } {
  try {
    const backupDir = getBackupDir()
    const timestamp = formatTimestamp(new Date())
    const backupPath = path.join(backupDir, `database_${timestamp}.db`)

    // 使用 SQLite backup API（安全在线备份）
    const sqlite = getSqlite()
    sqlite.backup(backupPath)

    const stats = fs.statSync(backupPath)

    // 清理旧备份，保留最近 MAX_BACKUPS 个
    cleanupOldBackups()

    log.info(`[Backup] Created backup: ${backupPath} (${(stats.size / 1024).toFixed(1)} KB)`)
    return { success: true, path: backupPath, size: stats.size }
  } catch (err) {
    const errorMsg = (err as Error).message
    log.error('[Backup] Failed to create backup:', errorMsg)
    return { success: false, error: errorMsg }
  }
}

/** 从备份恢复数据库 */
export function restoreBackup(backupFileName: string): { success: boolean; error?: string } {
  try {
    const backupDir = getBackupDir()
    const backupPath = path.join(backupDir, backupFileName)

    if (!fs.existsSync(backupPath)) {
      return { success: false, error: `Backup file not found: ${backupFileName}` }
    }

    // 先创建当前数据库的备份（安全措施）
    const dbPath = getDbPath()
    const safetyBackupPath = path.join(backupDir, `pre_restore_${formatTimestamp(new Date())}.db`)
    if (fs.existsSync(dbPath)) {
      fs.copyFileSync(dbPath, safetyBackupPath)
    }

    // 关闭当前数据库连接
    resetDatabaseConnection()

    // 用备份文件替换当前数据库
    fs.copyFileSync(backupPath, dbPath)

    // 重新初始化数据库连接
    getDatabase()

    log.info(`[Backup] Restored from: ${backupFileName}`)
    return { success: true }
  } catch (err) {
    const errorMsg = (err as Error).message
    log.error('[Backup] Failed to restore backup:', errorMsg)
    return { success: false, error: errorMsg }
  }
}

/** 列出所有备份 */
export function listBackups(): Array<{ name: string; size: number; createdAt: string }> {
  try {
    const backupDir = getBackupDir()
    const files = fs.readdirSync(backupDir)
      .filter(f => f.startsWith('database_') && f.endsWith('.db'))
      .sort()
      .reverse() // 最新的在前

    return files.map(name => {
      const filePath = path.join(backupDir, name)
      const stats = fs.statSync(filePath)
      // 从文件名中提取时间戳: database_2026-06-06T12-00-00-000Z.db
      const timeMatch = name.match(/database_(.+)\.db$/)
      const createdAt = timeMatch ? timeMatch[1].replace(/-/g, (m, offset) => {
        // 还原 ISO 时间戳格式
        if (offset === 4 || offset === 7) return '-'
        if (offset === 10) return 'T'
        if (offset === 13 || offset === 16) return ':'
        return m
      }) : stats.birthtime.toISOString()

      return {
        name,
        size: stats.size,
        createdAt,
      }
    })
  } catch (err) {
    log.error('[Backup] Failed to list backups:', err)
    return []
  }
}

/** 清理旧备份，保留最近 MAX_BACKUPS 个 */
function cleanupOldBackups(): void {
  try {
    const backupDir = getBackupDir()
    const backups = fs.readdirSync(backupDir)
      .filter(f => f.startsWith('database_') && f.endsWith('.db'))
      .sort()
      .reverse()

    for (let i = MAX_BACKUPS; i < backups.length; i++) {
      const filePath = path.join(backupDir, backups[i])
      fs.unlinkSync(filePath)
      log.info(`[Backup] Removed old backup: ${backups[i]}`)
    }
  } catch (err) {
    log.error('[Backup] Failed to cleanup old backups:', err)
  }
}

/** 检查是否需要自动备份（距离上次备份超过24小时） */
export function shouldAutoBackup(): boolean {
  try {
    const backupDir = getBackupDir()
    const backups = fs.readdirSync(backupDir)
      .filter(f => f.startsWith('database_') && f.endsWith('.db'))
      .sort()
      .reverse()

    if (backups.length === 0) return true

    const latestBackupPath = path.join(backupDir, backups[0])
    const stats = fs.statSync(latestBackupPath)
    const elapsed = Date.now() - stats.mtimeMs

    return elapsed > BACKUP_INTERVAL_MS
  } catch {
    return true
  }
}
