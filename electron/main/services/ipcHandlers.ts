import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '../../../shared/types/ipc.types';
import { getDatabase, getSqlite, initDatabase } from './database';
import { startWatchingAllFolders } from './fileWatcher';
import { samples } from '../../../drizzle/schema';
import { registerAnalysisIpcHandlers } from './ipcAnalysis';
import type { IpcContext } from './ipcTypes';
import { registerSamplesHandlers } from './ipcSamples';
import { registerFoldersHandlers } from './ipcFolders';
import { registerTagsHandlers } from './ipcTags';
import { registerClassificationHandlers } from './ipcClassification';
import { registerPlaylistHandlers } from './ipcPlaylists';
import { registerAudioHandlers } from './ipcAudio';
import { registerImportExportHandlers } from './ipcImportExport';
import { registerBackupConfigHandlers } from './ipcBackupConfig';

export async function registerIpcHandlers(): Promise<void> {
  await initDatabase();

  // 启动文件监控（异步，不阻塞初始化）
  startWatchingAllFolders().catch(err => console.warn('Failed to start file watchers:', err));

  const db = getDatabase();
  const sqlite = getSqlite();

  // 轻量字段列表（排除 waveformData blob，加速大量数据加载）
  const sampleListFields = {
    id: samples.id,
    filePath: samples.filePath,
    fileName: samples.fileName,
    fileSize: samples.fileSize,
    fileHash: samples.fileHash,
    fileType: samples.fileType,
    createdAt: samples.createdAt,
    modifiedAt: samples.modifiedAt,
    duration: samples.duration,
    sampleRate: samples.sampleRate,
    bitRate: samples.bitRate,
    channels: samples.channels,
    bpm: samples.bpm,
    key: samples.key,
    categoryId: samples.categoryId,
    isFavorite: samples.isFavorite,
    isCorrupted: samples.isCorrupted,
    playCount: samples.playCount,
    lastPlayedAt: samples.lastPlayedAt,
    indexedAt: samples.indexedAt,
    midiTrackCount: samples.midiTrackCount,
    midiNoteCount: samples.midiNoteCount,
    midiInstruments: samples.midiInstruments,
    midiTimeSignature: samples.midiTimeSignature,
    tags: samples.tags,
  };

  const ctx: IpcContext = { db, sqlite, sampleListFields };

  // Register all handler modules
  registerSamplesHandlers(ctx);
  registerFoldersHandlers(ctx);
  registerTagsHandlers(ctx);
  registerClassificationHandlers(ctx);
  registerPlaylistHandlers(ctx);
  registerAudioHandlers(ctx);
  registerImportExportHandlers(ctx);
  registerBackupConfigHandlers(ctx);
  registerAnalysisIpcHandlers();
}

// Re-export window handlers for main entry
export { registerWindowHandlers, setToolWindowsMap, setWindowCreators } from './ipcWindow';
