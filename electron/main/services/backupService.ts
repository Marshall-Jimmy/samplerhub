import { app } from 'electron'
import path from 'node:path'
import fs from 'node:fs'
import {
  assertValidDatabaseFile,
  backupDatabaseTo,
  getDbPath,
  resetDatabaseConnection,
} from './database'
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
export async function createBackup(): Promise<{ success: boolean; path?: string; error?: string; size?: number }> {
  try {
    const backupDir = getBackupDir()
    const timestamp = formatTimestamp(new Date())
    const backupPath = path.join(backupDir, `database_${timestamp}.db`)

    // 使用 SQLite backup API（安全在线备份）
    await backupDatabaseTo(backupPath)

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
export async function restoreBackup(backupFileName: string): Promise<{
  success: boolean;
  error?: string;
  requiresRestart?: boolean;
}> {
  let connectionClosed = false
  let safetyBackupPath = ''
  let restoreTempPath = ''

  try {
    const backupDir = getBackupDir()
    if (
      typeof backupFileName !== 'string' ||
      path.basename(backupFileName) !== backupFileName ||
      !/^database_.+\.db$/u.test(backupFileName)
    ) {
      return { success: false, error: 'Invalid backup file name' }
    }

    const backupPath = path.resolve(backupDir, backupFileName)

    if (!fs.existsSync(backupPath)) {
      return { success: false, error: `Backup file not found: ${backupFileName}` }
    }

    const realBackupDir = fs.realpathSync(backupDir)
    const realBackupPath = fs.realpathSync(backupPath)
    const relativeBackupPath = path.relative(realBackupDir, realBackupPath)
    if (relativeBackupPath.startsWith('..') || path.isAbsolute(relativeBackupPath)) {
      return { success: false, error: 'Backup file resolves outside the backup directory' }
    }
    if (!fs.statSync(realBackupPath).isFile()) {
      return { success: false, error: 'Backup path is not a regular file' }
    }

    // 在关闭当前连接前完整校验候选文件，校验失败时应用仍可继续运行。
    assertValidDatabaseFile(realBackupPath)

    // 先创建当前数据库的备份（安全措施）
    const dbPath = getDbPath()
    safetyBackupPath = path.join(backupDir, `pre_restore_${formatTimestamp(new Date())}.db`)
    if (fs.existsSync(dbPath)) {
      await backupDatabaseTo(safetyBackupPath)
    }

    // 先复制到同目录临时文件并再次校验，避免源文件在校验后被替换。
    restoreTempPath = `${dbPath}.restore-${process.pid}-${Date.now()}.tmp`
    fs.copyFileSync(realBackupPath, restoreTempPath)
    assertValidDatabaseFile(restoreTempPath)

    // 关闭当前数据库连接
    resetDatabaseConnection('Database backup restored')
    connectionClosed = true

    // 用已校验的临时文件替换当前数据库；旧 WAL/SHM 绝不能与恢复文件混用。
    removeIfExists(`${dbPath}-wal`)
    removeIfExists(`${dbPath}-shm`)
    fs.copyFileSync(restoreTempPath, dbPath)
    removeIfExists(restoreTempPath)

    log.info(`[Backup] Restored from: ${backupFileName}`)
    return { success: true, requiresRestart: true }
  } catch (err) {
    const errorMsg = (err as Error).message
    log.error('[Backup] Failed to restore backup:', errorMsg)

    // 一旦旧连接已关闭，当前进程不能安全热重绑。尽力恢复安全备份，
    // 然后明确要求重启；恢复失败也不能伪装成可继续运行。
    if (connectionClosed && safetyBackupPath && fs.existsSync(safetyBackupPath)) {
      try {
        const dbPath = getDbPath()
        removeIfExists(`${dbPath}-wal`)
        removeIfExists(`${dbPath}-shm`)
        fs.copyFileSync(safetyBackupPath, dbPath)
      } catch (rollbackError) {
        log.error('[Backup] Failed to roll back restore:', rollbackError)
      }
    }
    return { success: false, error: errorMsg, requiresRestart: connectionClosed }
  } finally {
    if (restoreTempPath) {
      try {
        removeIfExists(restoreTempPath)
      } catch (cleanupError) {
        log.warn('[Backup] Failed to remove restore temp file:', cleanupError)
      }
    }
  }
}

function removeIfExists(filePath: string): void {
  try {
    fs.unlinkSync(filePath)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
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
