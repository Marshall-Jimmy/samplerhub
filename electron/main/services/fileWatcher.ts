import chokidar from 'chokidar';
import { extname } from 'path';
import { BrowserWindow } from 'electron';
import { AUDIO_EXTENSIONS, MIDI_EXTENSIONS, ALL_SUPPORTED_EXTENSIONS } from '../../../shared/constants/audioFormats';
import { IPC_CHANNELS } from '../../../shared/types/ipc.types';
import { getDatabase } from './database';
import { samples, watchedFolders, classificationRules } from '../../../drizzle/schema';
import { eq } from 'drizzle-orm';
import { computeFileHash } from './fileScanner';
import { parseAudioFile } from './audioParser';
import { parseMidiFile, isMidiFile } from './midiParser';
import { classifySample } from './classifier';
import { stat } from 'fs/promises';

const watchers = new Map<string, chokidar.FSWatcher>();

async function handleFileAdd(filePath: string): Promise<void> {
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
    const isMidi = isMidiFile(filePath);

    await db.insert(samples).values({
      filePath,
      fileName,
      fileSize: stats.size,
      fileHash: hash,
      fileType: isMidi ? 'midi' : 'audio',
      createdAt: new Date(),
      modifiedAt: stats.mtime,
      duration: 0,
      sampleRate: 0,
      bitRate: 0,
      channels: 0,
    });

    if (isMidi) {
      // 解析 MIDI 元数据
      const midiMeta = await parseMidiFile(filePath);
      if (midiMeta.duration > 0) {
        await db.update(samples)
          .set({
            duration: midiMeta.duration,
            bpm: midiMeta.bpm,
            key: midiMeta.key,
            isCorrupted: false,
            midiTrackCount: midiMeta.trackCount,
            midiNoteCount: midiMeta.noteCount,
            midiInstruments: midiMeta.instruments.length ? JSON.stringify(midiMeta.instruments) : null,
            midiTimeSignature: midiMeta.timeSignature,
          })
          .where(eq(samples.filePath, filePath));
      }
    } else {
      // 解析音频元数据
      const metadata = await parseAudioFile(filePath);
      if (metadata.duration > 0) {
        await db.update(samples)
          .set({
            duration: metadata.duration,
            sampleRate: metadata.sampleRate,
            bitRate: metadata.bitRate,
            channels: metadata.channels,
            bpm: metadata.bpm,
            key: metadata.key,
          })
          .where(eq(samples.filePath, filePath));
      }
    }

    // 自动分类
    const rules = await db.select().from(classificationRules) as import('../../../shared/types/sample.types').ClassificationRule[];
    const categoryId = classifySample(fileName, filePath, rules);
    if (categoryId !== null) {
      await db.update(samples).set({ categoryId }).where(eq(samples.filePath, filePath));
    }

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

    await db.update(samples)
      .set({ fileSize: stats.size, fileHash: hash, modifiedAt: stats.mtime })
      .where(eq(samples.filePath, filePath));

    if (isMidiFile(filePath)) {
      const midiMeta = await parseMidiFile(filePath);
      if (midiMeta.duration > 0) {
        await db.update(samples)
          .set({
            duration: midiMeta.duration,
            bpm: midiMeta.bpm,
            key: midiMeta.key,
            midiTrackCount: midiMeta.trackCount,
            midiNoteCount: midiMeta.noteCount,
            midiInstruments: midiMeta.instruments.length ? JSON.stringify(midiMeta.instruments) : null,
            midiTimeSignature: midiMeta.timeSignature,
          })
          .where(eq(samples.filePath, filePath));
      }
    } else {
      const metadata = await parseAudioFile(filePath);
      if (metadata.duration > 0) {
        await db.update(samples)
        .set({
          duration: metadata.duration,
          sampleRate: metadata.sampleRate,
          bitRate: metadata.bitRate,
          channels: metadata.channels,
          bpm: metadata.bpm,
          key: metadata.key,
        })
        .where(eq(samples.filePath, filePath));
      }
    }

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

  watcher.on('add', handleFileAdd);
  watcher.on('change', handleFileChange);
  watcher.on('unlink', handleFileRemove);

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
