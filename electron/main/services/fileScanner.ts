import { readdir, stat } from 'fs/promises';
import { join, extname } from 'path';
import { createHash } from 'crypto';
import { AUDIO_EXTENSIONS, MIDI_EXTENSIONS, ALL_SUPPORTED_EXTENSIONS } from '../../../shared/constants/audioFormats';
import { getDatabase, getSqlite, rebuildFtsIndex } from './database';
import { parseAudioFile } from './audioParser';
import { parseMidiFile, isMidiFile } from './midiParser';
import { classifySample } from './classifier';
import { extractBPMAndKey } from './bpmKeyParser';
import { generateWaveform, writeWaveformFile, writePeakEnvelopeFile } from './waveformGenerator';
import { samples, watchedFolders, classificationRules } from '../../../drizzle/schema';
import { eq, inArray } from 'drizzle-orm';
import type { ScanProgress } from '../../../shared/types/sample.types';

interface FileInfo {
  path: string;
  name: string;
  size: number;
  modifiedAt: Date;
  hash: string;
}

// 扫描队列，确保同一时间只有一个 scanFolder 在执行
let scanQueue: Promise<void> = Promise.resolve();

// 当前正在扫描的 AbortController
let currentAbortController: AbortController | null = null;

export function abortScan(): void {
  currentAbortController?.abort();
}

export function computeFileHash(filePath: string, fileSize: number, mtimeMs: number): string {
  const hash = createHash('md5');
  hash.update(`${filePath}:${fileSize}:${mtimeMs}`);
  return hash.digest('hex');
}

export async function collectAudioFiles(dir: string, signal?: AbortSignal): Promise<FileInfo[]> {
  const files: FileInfo[] = [];

  async function traverse(currentDir: string): Promise<void> {
    if (signal?.aborted) return;
    let entries;
    try {
      entries = await readdir(currentDir, { withFileTypes: true });
    } catch (err) {
      console.error(`[Scan] Failed to read directory "${currentDir}":`, err);
      throw err;
    }

    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue;
      const fullPath = join(currentDir, entry.name);

      if (entry.isDirectory()) {
        await traverse(fullPath);
      } else if (entry.isFile() && ALL_SUPPORTED_EXTENSIONS.has(extname(entry.name).toLowerCase())) {
        try {
          const stats = await stat(fullPath);
          const hash = computeFileHash(fullPath, stats.size, stats.mtimeMs);
          files.push({
            path: fullPath,
            name: entry.name,
            size: stats.size,
            modifiedAt: stats.mtime,
            hash,
          });
        } catch {
          // skip inaccessible files
        }
      }
    }
  }

  await traverse(dir);
  return files;
}

// 并行解析元数据（限制并发数）
async function parseMetadataParallel(
  files: FileInfo[],
  concurrency: number,
  signal: AbortSignal,
  onProgress?: (current: number, total: number, fileName: string) => void
): Promise<Map<string, { duration: number; sampleRate: number; bitRate: number; channels: number; bpm: number | null; key: string | null; isMidi?: boolean; midiMeta?: any }>> {
  const results = new Map<string, { duration: number; sampleRate: number; bitRate: number; channels: number; bpm: number | null; key: string | null; isMidi?: boolean; midiMeta?: any }>();
  let completed = 0;

  // 分批处理
  for (let i = 0; i < files.length; i += concurrency) {
    if (signal.aborted) break;
    const batch = files.slice(i, i + concurrency);
    const parsed = await Promise.all(
      batch.map(async (file) => {
        try {
          if (isMidiFile(file.path)) {
            const midiMeta = await Promise.race([
              parseMidiFile(file.path),
              new Promise<never>((_, reject) =>
                setTimeout(() => reject(new Error('Parse timeout')), 15000) // 15秒超时
              )
            ]);
            return {
              path: file.path,
              name: file.name,
              metadata: {
                duration: midiMeta.duration,
                sampleRate: 0,
                bitRate: 0,
                channels: 0,
                bpm: midiMeta.bpm,
                key: midiMeta.key,
              },
              isMidi: true,
              midiMeta,
            };
          }
          const metadata = await Promise.race([
            parseAudioFile(file.path),
            new Promise<never>((_, reject) =>
              setTimeout(() => reject(new Error('Parse timeout')), 15000) // 15秒超时
            )
          ]);
          return { path: file.path, name: file.name, metadata, isMidi: false, midiMeta: null };
        } catch {
          return { path: file.path, name: file.name, metadata: { duration: 0, sampleRate: 0, bitRate: 0, channels: 0, bpm: null, key: null }, isMidi: false, midiMeta: null };
        }
      })
    );

    for (const { path, name, metadata, isMidi, midiMeta } of parsed) {
      if (metadata.duration > 0) {
        results.set(path, { ...metadata, isMidi, midiMeta });
      }
      completed++;
      onProgress?.(completed, files.length, name);
    }
  }

  return results;
}

async function doScanFolder(
  folderPath: string,
  signal: AbortSignal,
  onProgress?: (progress: ScanProgress) => void
): Promise<{ added: number; updated: number; deleted: number }> {
  const db = getDatabase();
  const sqlite = getSqlite();
  sqlite.exec('PRAGMA busy_timeout = 5000'); // 5秒超时，避免永久阻塞

  onProgress?.({ current: 0, total: 0, currentFile: '', phase: 'scanning' });

  // 1. Collect files
  const files = await collectAudioFiles(folderPath, signal);
  if (signal.aborted) {
    onProgress?.({ current: 0, total: 0, currentFile: '', phase: 'complete' });
    return { added: 0, updated: 0, deleted: 0 };
  }

  // 2. Get existing records (包含 modified_at 用于增量跳过)
  const existing = await db.select({
    id: samples.id,
    filePath: samples.filePath,
    fileHash: samples.fileHash,
    modifiedAt: samples.modifiedAt,
  }).from(samples);

  const existingMap = new Map(existing.map(s => [s.filePath, { id: s.id, hash: s.fileHash, modifiedAt: s.modifiedAt }]));

  // 3. Compute diff - 基于 mtime 快速跳过未变更文件
  const toAdd: FileInfo[] = [];
  const toUpdate: FileInfo[] = [];
  const seenPaths = new Set<string>();

  for (const file of files) {
    seenPaths.add(file.path);
    const ex = existingMap.get(file.path);
    if (!ex) {
      toAdd.push(file);
    } else {
      // mtime 未变且大小一致 → 跳过（避免重新计算哈希）
      const existingMtime = ex.modifiedAt instanceof Date ? ex.modifiedAt.getTime() : Number(ex.modifiedAt);
      if (Math.abs(existingMtime - file.modifiedAt.getTime()) < 1000) {
        continue; // mtime 基本一致，跳过
      }
      // mtime 变了才计算哈希确认
      if (ex.hash !== file.hash) {
        toUpdate.push(file);
      }
    }
  }

  const toDelete = existing.filter(s => !seenPaths.has(s.filePath)).map(s => s.id);

  const total = toAdd.length + toUpdate.length + toDelete.length;
  let current = 0;

  // 4. 批量插入新文件（使用事务 + 更大批次提升性能）
  onProgress?.({ current, total, currentFile: '', phase: 'parsing' });

  if (toAdd.length > 0) {
    const BATCH_SIZE = 500;
    for (let i = 0; i < toAdd.length; i += BATCH_SIZE) {
      if (signal.aborted) break;
      const batch = toAdd.slice(i, i + BATCH_SIZE);

      sqlite.exec('BEGIN TRANSACTION');
      try {
        const stmt = sqlite.prepare(
          'INSERT INTO samples (file_path, file_name, file_size, file_hash, created_at, modified_at) VALUES (?, ?, ?, ?, ?, ?)'
        );
        for (const f of batch) {
          stmt.run(f.path, f.name, f.size, f.hash, f.modifiedAt.getTime(), f.modifiedAt.getTime());
        }
        sqlite.exec('COMMIT');
      } catch (err) {
        sqlite.exec('ROLLBACK');
        console.error('[Scan] Insert transaction failed:', err);
        throw err;
      }

      current += batch.length;
      onProgress?.({ current, total, currentFile: batch[batch.length - 1].name, phase: 'parsing' });
    }
  }

  // 5. 批量更新（分批处理，避免单个超大事务）
  if (toUpdate.length > 0) {
    const UPDATE_BATCH_SIZE = 500;
    for (let i = 0; i < toUpdate.length; i += UPDATE_BATCH_SIZE) {
      if (signal.aborted) break;
      const batch = toUpdate.slice(i, i + UPDATE_BATCH_SIZE);

      sqlite.exec('BEGIN TRANSACTION');
      try {
        const stmt = sqlite.prepare(
          'UPDATE samples SET file_size = ?, file_hash = ?, modified_at = ? WHERE file_path = ?'
        );
        for (const file of batch) {
          stmt.run(file.size, file.hash, file.modifiedAt.getTime(), file.path);
        }
        sqlite.exec('COMMIT');
      } catch (err) {
        sqlite.exec('ROLLBACK');
        console.error('[Scan] Update transaction failed:', err);
        throw err;
      }

      current += batch.length;
      // 每100个文件或最后一个批次时发送进度
      if (current % 100 < UPDATE_BATCH_SIZE || i + UPDATE_BATCH_SIZE >= toUpdate.length) {
        onProgress?.({ current, total, currentFile: batch[batch.length - 1].name, phase: 'parsing' });
      }
    }
  }

  // 6. 批量删除
  if (toDelete.length > 0 && !signal.aborted) {
    await db.delete(samples).where(inArray(samples.id, toDelete));
    current += toDelete.length;
  }

  // 7. Update scan time
  await db.update(watchedFolders)
    .set({ lastScanAt: new Date() })
    .where(eq(watchedFolders.path, folderPath));

  // 8. 并行解析元数据（4个并发）
  if (toAdd.length > 0 && !signal.aborted) {
    // 构建 toAdd 的 Map 用于 O(1) 查找（替代 toAdd.find() 的 O(n)）
    const toAddMap = new Map(toAdd.map(f => [f.path, f]));

    const metadataMap = await parseMetadataParallel(toAdd, 4, signal, (cur, tot, fileName) => {
      onProgress?.({ current: cur, total: tot, currentFile: fileName, phase: 'classifying' });
    });

    // 批量更新元数据（文件名解析 BPM/Key 作为 fallback）+ 生成波形
    let metaProgress = 0;
    for (const [filePath, metadata] of metadataMap) {
      if (signal.aborted) break;

      // 使用 Map 查找替代 toAdd.find()（O(1) 替代 O(n)）
      const fileInfo = toAddMap.get(filePath);
      const fileNameParsed = fileInfo ? extractBPMAndKey(fileInfo.name) : { bpm: null, key: null };

      // 元数据标签优先，文件名解析作为 fallback
      const finalBpm = metadata.bpm ?? fileNameParsed.bpm;
      const finalKey = metadata.key ?? fileNameParsed.key;

      if (metadata.isMidi) {
        // MIDI 文件：写入 MIDI 专属字段，跳过波形生成
        const midiMeta = metadata.midiMeta;
        await db.update(samples)
          .set({
            fileType: 'midi',
            duration: metadata.duration,
            sampleRate: 0,
            bitRate: 0,
            channels: 0,
            bpm: finalBpm,
            key: finalKey,
            isCorrupted: metadata.duration === 0,
            midiTrackCount: midiMeta?.trackCount ?? null,
            midiNoteCount: midiMeta?.noteCount ?? null,
            midiInstruments: midiMeta?.instruments?.length ? JSON.stringify(midiMeta.instruments) : null,
            midiTimeSignature: midiMeta?.timeSignature ?? null,
          })
          .where(eq(samples.filePath, filePath));
      } else {
        // 音频文件：原有逻辑
        const isCorrupted = metadata.duration === 0 && metadata.sampleRate === 0;

        // 生成波形数据 + 峰值包络 → 写入独立文件
        const result = generateWaveform(filePath);
        if (result) {
          const row = sqlite.prepare('SELECT id FROM samples WHERE file_path = ?').get(filePath) as { id: number } | undefined;
          if (row) {
            await writeWaveformFile(row.id, result.waveform);
            if (result.peaks.length > 0) {
              await writePeakEnvelopeFile(row.id, result.peaks);
            }
          }
        }

        await db.update(samples)
          .set({
            duration: metadata.duration,
            sampleRate: metadata.sampleRate,
            bitRate: metadata.bitRate,
            channels: metadata.channels,
            bpm: finalBpm,
            key: finalKey,
            isCorrupted,
          })
          .where(eq(samples.filePath, filePath));
      }
    }
  }

  // 9. Auto-classify new files
  if (toAdd.length > 0 && !signal.aborted) {
    const rules = await db.select().from(classificationRules) as import('../../../shared/types/sample.types').ClassificationRule[];

    for (let i = 0; i < toAdd.length; i++) {
      if (signal.aborted) break;
      const file = toAdd[i];
      const categoryId = classifySample(file.name, file.path, rules);
      if (categoryId !== null) {
        await db.update(samples)
          .set({ categoryId })
          .where(eq(samples.filePath, file.path));
      }
      // 每100个文件或最后一个文件时发送分类进度
      if ((i + 1) % 100 === 0 || i === toAdd.length - 1) {
        onProgress?.({ current: i + 1, total: toAdd.length, currentFile: file.name, phase: 'classifying' });
      }
    }
  }

  // 10. 批量重建 FTS 索引（替代逐行触发器，大幅提升批量插入性能）
  if ((toAdd.length > 0 || toUpdate.length > 0 || toDelete.length > 0) && !signal.aborted) {
    rebuildFtsIndex();
  }

  onProgress?.({ current, total, currentFile: '', phase: 'complete' });

  return { added: toAdd.length, updated: toUpdate.length, deleted: toDelete.length };
}

export async function scanFolder(
  folderPath: string,
  onProgress?: (progress: ScanProgress) => void
): Promise<{ added: number; updated: number; deleted: number }> {
  const currentScan = scanQueue.then(async () => {
    const abortController = new AbortController();
    currentAbortController = abortController;
    try {
      return await doScanFolder(folderPath, abortController.signal, onProgress);
    } finally {
      if (currentAbortController === abortController) {
        currentAbortController = null;
      }
    }
  });
  scanQueue = currentScan.then(() => {}).catch(() => {});
  return currentScan;
}
