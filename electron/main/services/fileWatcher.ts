import chokidar from 'chokidar';
import { extname } from 'path';
import { BrowserWindow } from 'electron';
import { AUDIO_EXTENSIONS, MIDI_EXTENSIONS, ALL_SUPPORTED_EXTENSIONS } from '../../../shared/constants/audioFormats';
import { IPC_CHANNELS } from '../../../shared/types/ipc.types';
import { getDatabase } from './database';
import { samples, watchedFolders } from '../../../drizzle/schema';
import { eq } from 'drizzle-orm';
import { computeFileHash, enqueueMetadataJob } from './fileScanner';
import type { FileInfo } from './fileScanner';
import { stat } from 'fs/promises';

// 防抖延迟（毫秒）
const DEBOUNCE_DELAY = 2000;

// 防抖队列：批量文件变更时合并处理，避免逐个触发 DB 写入
const pendingAdds = new Set<string>();
const pendingChanges = new Set<string>();
const pendingRemoves = new Set<string>();
var debounceTimer: ReturnType<typeof setTimeout> | null = null;

// 文件监控器映射
const watchers = new Map<string, any>();

function flushPendingFiles(): void {
  const adds = [...pendingAdds];
  const changes = [...pendingChanges];
  const removes = [...pendingRemoves];
  pendingAdds.clear();
  pendingChanges.clear();
  pendingRemoves.clear();
  debounceTimer = null;

  // 串行处理，避免并发 DB 写入冲突
  (async () => {
    for (const filePath of removes) {
      try { await handleFileRemove(filePath); } catch {}
    }
    for (const filePath of adds) {
      try { await handleFileAdd(filePath); } catch {}
    }
    for (const filePath of changes) {
      try { await handleFileChange(filePath); } catch {}
    }
  })();
}

function scheduleDebounced(): void {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(flushPendingFiles, DEBOUNCE_DELAY);
}

export async function handleFileAdd(filePath: string): Promise<void> {
  const ext = extname(filePath).toLowerCase();
  if (!ALL_SUPPORTED_EXTENSIONS.has(ext)) return;

  const db = getDatabase();

  // 检查是否已存在
  const existing = await db.select({ id: samples.id }).from(samples).where(eq(samples.filePath, filePath)).get();
  if (existing) return;

  try {
    const stats = await stat(filePath);
    const hash = computeFileHash(filePath, stats.size, stats.mtimeMs);
    const fileName = filePath.split(/[\\/]/).pop() || '';

    await db.insert(samples).values({
      filePath,
      fileName,
      fileSize: stats.size,
      fileHash: hash,
      fileType: 'audio',
      createdAt: new Date(),
      modifiedAt: stats.mtime,
      duration: 0,
      sampleRate: 0,
      bitRate: 0,
      channels: 0,
    });

    // 元数据/波形/分类交给后台 Job Queue 处理（与全量扫描行为一致）
    const fileInfo: FileInfo = {
      path: filePath,
      name: fileName,
      size: stats.size,
      modifiedAt: stats.mtime,
      hash,
    };
    enqueueMetadataJob([fileInfo]);

    // 通知渲染进程
    notifyLibraryChanged('add', filePath);
  } catch (error) {
    console.warn(`Failed to process new file: ${filePath}`, error);
  }
}

async function handleFileRemove(filePath: string): Promise<void> {
  const db = getDatabase();
  try {
    await db.delete(samples).where(eq(samples.filePath, filePath));
    notifyLibraryChanged('remove', filePath);
  } catch (error) {
    console.warn(`Failed to remove file from DB: ${filePath}`, error);
  }
}

async function handleFileChange(filePath: string): Promise<void> {
  const ext = extname(filePath).toLowerCase();
  if (!ALL_SUPPORTED_EXTENSIONS.has(ext)) return;

  const db = getDatabase();
  try {
    const stats = await stat(filePath);
    const hash = computeFileHash(filePath, stats.size, stats.mtimeMs);
    const fileName = filePath.split(/[\\/]/).pop() || '';

    await db.update(samples)
      .set({ fileSize: stats.size, fileHash: hash, modifiedAt: stats.mtime })
      .where(eq(samples.filePath, filePath));

    // 元数据/波形/分类交给后台 Job Queue 重新分析（与全量扫描行为一致）
    const fileInfo: FileInfo = {
      path: filePath,
      name: fileName,
      size: stats.size,
      modifiedAt: stats.mtime,
      hash,
    };
    enqueueMetadataJob([fileInfo]);

    notifyLibraryChanged('update', filePath);
  } catch (error) {
    console.warn(`Failed to process changed file: ${filePath}`, error);
  }
}

function notifyLibraryChanged(action: string, filePath: string): void {
  const windows = BrowserWindow.getAllWindows();
  windows.forEach(win => {
    win.webContents.send(IPC_CHANNELS.LIBRARY_CHANGED, { action, filePath });
  });
}

export function startWatching(folderPath: string): void {
  if (watchers.has(folderPath)) return;

  const watcher = chokidar.watch(folderPath, {
    ignored: /(^|[\/\\])\../, // ignore dotfiles
    persistent: true,
    ignoreInitial: true, // don't trigger events for existing files
    awaitWriteFinish: {
      stabilityThreshold: 2000,
      pollInterval: 500,
    },
  });

  watcher.on('add', (filePath) => {
    pendingAdds.add(filePath);
    // 如果同时在 change 队列中，移除（add 优先）
    pendingChanges.delete(filePath);
    scheduleDebounced();
  });
  watcher.on('change', (filePath) => {
    if (!pendingAdds.has(filePath)) {
      pendingChanges.add(filePath);
    }
    scheduleDebounced();
  });
  watcher.on('unlink', (filePath) => {
    pendingRemoves.add(filePath);
    pendingAdds.delete(filePath);
    pendingChanges.delete(filePath);
    scheduleDebounced();
  });

  watchers.set(folderPath, watcher);
  console.log(`Started watching: ${folderPath}`);
}

export function stopWatching(folderPath: string): void {
  const watcher = watchers.get(folderPath);
  if (watcher) {
    watcher.close();
    watchers.delete(folderPath);
    console.log(`Stopped watching: ${folderPath}`);
  }
}

export async function startWatchingAllFolders(): Promise<void> {
  const db = getDatabase();
  const folders = await db.select().from(watchedFolders).where(eq(watchedFolders.isActive, true));

  for (const folder of folders) {
    startWatching(folder.path);
  }
}

export function stopAllWatchers(): void {
  for (const [path, watcher] of watchers) {
    watcher.close();
    console.log(`Stopped watching: ${path}`);
  }
  watchers.clear();
}
