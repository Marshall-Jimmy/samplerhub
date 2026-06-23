import { readdir, stat } from 'fs/promises';
import type { Dirent } from 'fs';
import { join, extname } from 'path';
import { createHash } from 'crypto';
import { AUDIO_EXTENSIONS, MIDI_EXTENSIONS, ALL_SUPPORTED_EXTENSIONS } from '../../../shared/constants/audioFormats';
import { getDatabase, getSqlite, rebuildFtsIndex } from './database';
import { parseAudioFile } from './audioParser';
import { parseMidiFile, isMidiFile } from './midiParser';
import { classifySample } from './classifier';
import { extractBPMAndKey } from './bpmKeyParser';
import { generateWaveform, writeWaveformFile, writePeakEnvelopeFile } from './waveformGenerator';
import { extractAudioFeatures, inferTagsFromFeatures, hasFfmpeg } from './audioFeatureExtractor';
import { samples, watchedFolders, classificationRules } from '../../../drizzle/schema';
import { eq, inArray } from 'drizzle-orm';
import type { ScanProgress } from '../../../shared/types/sample.types';
import { analyzeAudioFile, initEssentia } from './audioAnalyzer';
import { getFileIOService } from './fileIOService';
import { perfMonitor } from './performanceMonitor';
import { BrowserWindow } from 'electron';

export interface FileInfo {
  path: string;
  name: string;
  size: number;
  modifiedAt: Date;
  hash: string;
}

// ============ 后台元数据/波形/分类处理队列 ============

// 后台队列状态
let metadataJobRunning = false;
let metadataJobQueue: FileInfo[] = [];
let metadataJobAbortController: AbortController | null = null;
let metadataJobProgress = { current: 0, total: 0, currentFile: '' };

/**
 * 获取后台元数据处理进度（供 UI 查询）
 */
export function getMetadataJobProgress(): { running: boolean; current: number; total: number; currentFile: string } {
  return { running: metadataJobRunning, ...metadataJobProgress };
}

/**
 * 取消后台元数据处理
 */
export function abortMetadataJob(): void {
  metadataJobAbortController?.abort();
}

/**
 * 将文件列表加入后台元数据处理队列
 * 如果当前没有任务在运行，自动启动
 */
export function enqueueMetadataJob(files: FileInfo[], signal?: AbortSignal): void {
  metadataJobQueue.push(...files);
  if (!metadataJobRunning) {
    processMetadataQueue(signal);
  }
}

/**
 * 后台处理元数据队列：解析元数据、生成波形、提取特征、自动分类
 * 与扫描流程解耦，用户感知"导入完成"时文件已入库，分析在后台进行
 */
async function processMetadataQueue(parentSignal?: AbortSignal): Promise<void> {
  if (metadataJobQueue.length === 0) return;

  metadataJobRunning = true;
  metadataJobAbortController = new AbortController();
  const signal = metadataJobAbortController.signal;

  // 合并 parent signal
  if (parentSignal?.aborted) {
    metadataJobRunning = false;
    return;
  }
  const onParentAbort = () => metadataJobAbortController?.abort();
  parentSignal?.addEventListener('abort', onParentAbort);

  try {
    while (metadataJobQueue.length > 0 && !signal.aborted) {
      // 取出一批（最多 100 个）
      const batch = metadataJobQueue.splice(0, 100);
      metadataJobProgress.total += batch.length;

      await processMetadataBatch(batch, signal);
    }

    // 所有任务完成后重建 FTS 索引
    if (!signal.aborted) {
      rebuildFtsIndex();
    }
  } catch (err) {
    console.error('[MetadataJob] 队列处理错误:', err);
  } finally {
    parentSignal?.removeEventListener('abort', onParentAbort);
    metadataJobRunning = false;
    metadataJobAbortController = null;
    metadataJobProgress = { current: 0, total: 0, currentFile: '' };

    // 通知渲染进程后台任务完成
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) {
        win.webContents.send('metadata-job:complete', {});
      }
    }

    // 后台生成文本 Embedding（方案 B：语义搜索）
    // 异步执行，不阻塞当前流程
    generateEmbeddingsInBackground().catch(err => {
      console.error('[MetadataJob] Embedding 生成失败:', err);
    });
  }
}

/**
 * 后台生成文本 Embedding（fire-and-forget）
 * 在元数据处理完成后自动触发，为所有缺少 embedding 的采样生成向量
 */
async function generateEmbeddingsInBackground(): Promise<void> {
  try {
    const { getTextEmbeddingSearcher } = await import('./textEmbeddingSearch');
    const searcher = getTextEmbeddingSearcher();

    // 如果模型还没加载，先初始化
    if (!searcher.ready) {
      await searcher.initialize();
    }

    const count = await searcher.generateForAllSamples((current, total) => {
      for (const win of BrowserWindow.getAllWindows()) {
        if (!win.isDestroyed()) {
          win.webContents.send('metadata-job:progress', {
            current,
            total,
            currentFile: '',
            phase: 'embedding',
          });
        }
      }
    });

    if (count > 0) {
      console.log(`[TextEmbedding] 为 ${count} 个采样生成了 embedding`);
    }
  } catch (err) {
    // embedding 生成失败不影响主流程
    console.warn('[TextEmbedding] 后台生成跳过:', err);
  }
}

/**
 * 处理一批文件的元数据（并发 8）
 */
async function processMetadataBatch(files: FileInfo[], signal: AbortSignal): Promise<void> {
  const db = getDatabase();
  const sqlite = getSqlite();
  const fileIO = getFileIOService();

  // 检测 ffmpeg 可用性
  let ffmpegMissing = false;
  try {
    if (!hasFfmpeg()) ffmpegMissing = true;
  } catch {}

  // 1. 批量预读所有文件到缓存（并发 8）
  const filePaths = files.map(f => f.path);
  await fileIO.preloadFiles(filePaths);

  // 2. 并行解析元数据（传入 Buffer）
  const metadataMap = await parseMetadataParallel(files, 8, signal, (cur, tot, fileName) => {
    metadataJobProgress.current = metadataJobProgress.total - files.length + cur;
    metadataJobProgress.currentFile = fileName;
    // 通知 UI 进度
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) {
        win.webContents.send('metadata-job:progress', {
          current: metadataJobProgress.current,
          total: metadataJobProgress.total,
          currentFile: fileName,
          phase: 'parsing',
          ffmpegMissing,
        });
      }
    }
  });

  // 构建 Map 用于 O(1) 查找
  const fileMap = new Map(files.map(f => [f.path, f]));

  // 逐个处理：更新元数据 + 波形 + 特征 + 分类
  for (const [filePath, metadata] of metadataMap) {
    if (signal.aborted) break;

    const fileInfo = fileMap.get(filePath);
    const fileNameParsed = fileInfo ? extractBPMAndKey(fileInfo.name) : { bpm: null, key: null };

    let finalBpm = metadata.bpm ?? fileNameParsed.bpm;
    let finalKey = metadata.key ?? fileNameParsed.key;

    // 从缓存获取 Buffer（已经预读了）
    const buffer = await fileIO.readFile(filePath);

    // essentia fallback（10秒超时）
    if ((!finalBpm || !finalKey) && !metadata.isMidi) {
      try {
        const analysis = await Promise.race([
          analyzeAudioFile(buffer, metadata.sampleRate || undefined),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('essentia timeout')), 10_000)
          ),
        ]);
        if (!finalBpm && analysis.bpm !== null) finalBpm = analysis.bpm;
        if (!finalKey && analysis.key !== null) finalKey = analysis.key;
      } catch { /* skip */ }
    }

    if (metadata.isMidi) {
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
      const isCorrupted = metadata.duration === 0 && metadata.sampleRate === 0;

      // 波形生成（15秒超时）
      try {
        const result = await Promise.race([
          generateWaveform(buffer),
          new Promise<null>((_, reject) =>
            setTimeout(() => reject(new Error('waveform timeout')), 15_000)
          ),
        ]);
        if (result) {
          const row = sqlite.prepare('SELECT id FROM samples WHERE file_path = ?').get(filePath) as { id: number } | undefined;
          if (row) {
            await writeWaveformFile(row.id, result.waveform);
            if (result.peaks.length > 0) {
              await writePeakEnvelopeFile(row.id, result.peaks);
            }
          }
        }
      } catch { /* skip */ }

      // 频谱特征提取（15秒超时）
      let inferredTags: string | null = null;
      let featureVectorJson: string | null = null;
      try {
        const features = await Promise.race([
          Promise.resolve(extractAudioFeatures(buffer)),
          new Promise<null>((_, reject) =>
            setTimeout(() => reject(new Error('feature extraction timeout')), 15_000)
          ),
        ]);
        if (features) {
          const tags = inferTagsFromFeatures(features);
          if (tags.length > 0) inferredTags = tags.join(',');
          featureVectorJson = JSON.stringify(features.featureVector);
        }
      } catch { /* skip */ }

      await db.update(samples)
        .set({
          duration: metadata.duration,
          sampleRate: metadata.sampleRate,
          bitRate: metadata.bitRate,
          channels: metadata.channels,
          bpm: finalBpm,
          key: finalKey,
          isCorrupted,
          tags: inferredTags,
          featureVector: featureVectorJson,
        })
        .where(eq(samples.filePath, filePath));
    }

    // 通知 UI 单个文件分析完成
    metadataJobProgress.current++;
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) {
        win.webContents.send('metadata-job:progress', {
          current: metadataJobProgress.current,
          total: metadataJobProgress.total,
          currentFile: '',
          phase: 'classifying',
        });
      }
    }
  }

  // 自动分类（支持多标签）
  if (!signal.aborted) {
    const rules = await db.select().from(classificationRules) as import('../../../shared/types/sample.types').ClassificationRule[];
    const BATCH = 500;
    const updateStmt = sqlite.prepare('UPDATE samples SET category_id = ? WHERE file_path = ?');
    const deleteTagsStmt = sqlite.prepare('DELETE FROM sample_categories WHERE sample_id = (SELECT id FROM samples WHERE file_path = ?)');
    const insertTagStmt = sqlite.prepare('INSERT OR IGNORE INTO sample_categories (sample_id, category_id, is_primary) VALUES ((SELECT id FROM samples WHERE file_path = ?), ?, ?)');
    
    let batchCount = 0;
    sqlite.exec('BEGIN TRANSACTION');
    for (const file of files) {
      if (signal.aborted) break;
      const result = classifySample(file.name, file.path, rules);
      
      // 更新主分类
      updateStmt.run(result.primary, file.path);
      
      // 清除旧的多分类标签
      deleteTagsStmt.run(file.path);
      
      // 插入主分类标签
      insertTagStmt.run(file.path, result.primary, 1);
      
      // 插入次分类标签
      for (const catId of result.secondary) {
        insertTagStmt.run(file.path, catId, 0);
      }
      
      batchCount++;
      if (batchCount >= BATCH) {
        sqlite.exec('COMMIT');
        sqlite.exec('BEGIN TRANSACTION');
        batchCount = 0;
      }
    }
    if (batchCount > 0) sqlite.exec('COMMIT');
  }
}

// ============ 扫描器 ============
var scanQueue: Promise<void> = Promise.resolve();

// 当前正在扫描的 AbortController
var currentAbortController: AbortController | null = null;

export function abortScan(): void {
  currentAbortController?.abort();
}

export function computeFileHash(filePath: string, fileSize: number, mtimeMs: number): string {
  const hash = createHash('md5');
  hash.update(`${filePath}:${fileSize}:${mtimeMs}`);
  return hash.digest('hex');
}

/** 并发限制的目录遍历 */
async function traverseDirs(dirs: string[], concurrency: number, fn: (dir: string) => Promise<void>): Promise<void> {
  let index = 0;
  async function runNext(): Promise<void> {
    while (index < dirs.length) {
      const dir = dirs[index++];
      await fn(dir);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, dirs.length) }, () => runNext()));
}

export async function collectAudioFiles(dir: string, signal?: AbortSignal): Promise<FileInfo[]> {
  const files: FileInfo[] = [];

  // 并行遍历子目录（限制并发度为 8）
  async function traverse(currentDir: string): Promise<void> {
    if (signal?.aborted) return;
    let entries;
    try {
      entries = await readdir(currentDir, { withFileTypes: true });
    } catch (err) {
      console.error(`[Scan] Failed to read directory "${currentDir}":`, err);
      throw err;
    }

    // 分离子目录和文件
    const dirs: string[] = [];
    const fileEntries: Dirent[] = [];

    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue;
      const fullPath = join(currentDir, entry.name);
      if (entry.isDirectory()) {
        dirs.push(fullPath);
      } else if (entry.isFile() && ALL_SUPPORTED_EXTENSIONS.has(extname(entry.name).toLowerCase())) {
        fileEntries.push(entry);
      }
    }

    // 并行遍历子目录（限制并发度为 8）
    await traverseDirs(dirs, 8, traverse);
    // 并发 stat（SSD 场景下显著快于串行，限制并发 4 避免过多 I/O 争用）
    const statResults = await Promise.allSettled(
      fileEntries.map(async (entry) => {
        if (signal?.aborted) return null;
        const fullPath = join(currentDir, entry.name);
        const stats = await stat(fullPath);
        return { entry, fullPath, stats };
      })
    );
    for (const result of statResults) {
      if (result.status === 'fulfilled' && result.value) {
        const { entry, fullPath, stats } = result.value;
        const hash = computeFileHash(fullPath, stats.size, stats.mtimeMs);
        files.push({
          path: fullPath,
          name: entry.name,
          size: stats.size,
          modifiedAt: stats.mtime,
          hash,
        });
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
  const fileIO = getFileIOService();
  let completed = 0;

  // 分批处理
  for (let i = 0; i < files.length; i += concurrency) {
    if (signal.aborted) break;
    const batch = files.slice(i, i + concurrency);
    const parsed = await Promise.all(
      batch.map(async (file) => {
        try {
          // 从缓存获取 Buffer（已预读）
          const buffer = await fileIO.readFile(file.path);

          if (isMidiFile(file.path)) {
            const midiMeta = await Promise.race([
              parseMidiFile(buffer),
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
            parseAudioFile(buffer),
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

  // 2. Get existing records — 只查询当前扫描文件夹下的记录，避免全表扫描
  // 使用 B-tree 范围查询（file_path >= folder AND file_path < folderEnd），比 LIKE 更高效且能走索引
  const normalizedFolder = folderPath.replace(/\\/g, '/');
  const folderEnd = normalizedFolder.slice(0, -1) + String.fromCharCode(normalizedFolder.charCodeAt(normalizedFolder.length - 1) + 1);
  const existingRows = sqlite.prepare(
    'SELECT id, file_path, file_hash, modified_at FROM samples WHERE file_path >= ? AND file_path < ?'
  ).all(normalizedFolder, folderEnd) as Array<{ id: number; file_path: string; file_hash: string; modified_at: number | null }>;

  const existingMap = new Map(existingRows.map(s => [
    s.file_path,
    { id: s.id, hash: s.file_hash, modifiedAt: s.modified_at as Date | number | null }
  ]));

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

  // existingRows 已通过范围查询限定为当前文件夹下的记录，直接过滤不在扫描结果中的即可
  const toDelete = existingRows
    .filter(s => !seenPaths.has(s.file_path))
    .map(s => s.id);

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
          'INSERT INTO samples (file_path, file_name, file_size, file_hash, file_type, created_at, modified_at, duration, sample_rate, bit_rate, channels) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
        );
        for (const f of batch) {
          const isMidi = f.name.toLowerCase().endsWith('.mid') || f.name.toLowerCase().endsWith('.midi');
          stmt.run(
            f.path,
            f.name,
            f.size,
            f.hash,
            isMidi ? 'midi' : 'audio',
            f.modifiedAt.getTime(),
            f.modifiedAt.getTime(),
            0,  // duration
            0,  // sample_rate
            0,  // bit_rate
            0   // channels
          );
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

  // 6. 批量删除（先删关联表，再删主表，避免外键约束失败）
  if (toDelete.length > 0 && !signal.aborted) {
    const rawDb = getSqlite();
    rawDb.exec('BEGIN TRANSACTION');
    try {
      const placeholders = toDelete.map(() => '?').join(',');
      rawDb.prepare(`DELETE FROM sample_tags WHERE sample_id IN (${placeholders})`).run(...toDelete);
      rawDb.prepare(`DELETE FROM recent_samples WHERE sample_id IN (${placeholders})`).run(...toDelete);
      rawDb.prepare(`DELETE FROM playlist_items WHERE sample_id IN (${placeholders})`).run(...toDelete);
      rawDb.prepare(`DELETE FROM usage_stats WHERE sample_id IN (${placeholders})`).run(...toDelete);
      rawDb.prepare(`DELETE FROM sample_categories WHERE sample_id IN (${placeholders})`).run(...toDelete);
      rawDb.prepare(`DELETE FROM audio_segments WHERE sample_id IN (${placeholders})`).run(...toDelete);
      rawDb.prepare(`DELETE FROM samples WHERE id IN (${placeholders})`).run(...toDelete);
      rawDb.exec('COMMIT');
      current += toDelete.length;
    } catch (err) {
      rawDb.exec('ROLLBACK');
      console.error('[Scan] Delete transaction failed:', err);
      throw err;
    }
  }

  // 7. Update scan time
  await db.update(watchedFolders)
    .set({ lastScanAt: new Date() })
    .where(eq(watchedFolders.path, folderPath));

  // 8. 将新增文件加入后台元数据处理队列（fire-and-forget）
  // 用户感知"导入完成"= 文件已入库，元数据/波形/BPM/分类在后台异步处理
  if (toAdd.length > 0 && !signal.aborted) {
    enqueueMetadataJob(toAdd, signal);
  }

  // 8b. 对更新的文件也重新执行分类（支持多标签）
  if (toUpdate.length > 0 && !signal.aborted) {
    try {
      const rules = await db.select().from(classificationRules) as import('../../../shared/types/sample.types').ClassificationRule[];
      const BATCH = 500;
      const updateStmt = sqlite.prepare('UPDATE samples SET category_id = ? WHERE file_path = ?');
      const deleteTagsStmt = sqlite.prepare('DELETE FROM sample_categories WHERE sample_id = (SELECT id FROM samples WHERE file_path = ?)');
      const insertTagStmt = sqlite.prepare('INSERT OR IGNORE INTO sample_categories (sample_id, category_id, is_primary) VALUES ((SELECT id FROM samples WHERE file_path = ?), ?, ?)');
      
      let batchCount = 0;
      sqlite.exec('BEGIN TRANSACTION');
      for (const file of toUpdate) {
        if (signal.aborted) break;
        const result = classifySample(file.name, file.path, rules);
        
        updateStmt.run(result.primary, file.path);
        deleteTagsStmt.run(file.path);
        insertTagStmt.run(file.path, result.primary, 1);
        for (const catId of result.secondary) {
          insertTagStmt.run(file.path, catId, 0);
        }
        
        batchCount++;
        if (batchCount >= BATCH) {
          sqlite.exec('COMMIT');
          sqlite.exec('BEGIN TRANSACTION');
          batchCount = 0;
        }
      }
      if (batchCount > 0) sqlite.exec('COMMIT');
    } catch (classifyErr) {
      console.error('[Scan] Re-classify updated files failed:', classifyErr);
    }
  }

  // 删除的文件也需要重建 FTS（如果没有新增文件的话）
  if (toDelete.length > 0 && toAdd.length === 0 && !signal.aborted) {
    rebuildFtsIndex();
  }

  onProgress?.({ current: total, total, currentFile: '', phase: 'complete' });

  // 通知模组系统扫描完成
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send('mod:scan:complete', {
        folderPath,
        added: toAdd.length,
        updated: toUpdate.length,
        deleted: toDelete.length,
      });
    }
  }

  return { added: toAdd.length, updated: toUpdate.length, deleted: toDelete.length };
}

export async function scanFolder(
  folderPath: string,
  onProgress?: (progress: ScanProgress) => void
): Promise<{ added: number; updated: number; deleted: number }> {
  const scanStart = Date.now();
  const currentScan = scanQueue.then(async () => {
    const abortController = new AbortController();
    currentAbortController = abortController;
    try {
      const result = await doScanFolder(folderPath, abortController.signal, onProgress);
      perfMonitor.recordMetric('firstScan', Date.now() - scanStart);
      return result;
    } finally {
      if (currentAbortController === abortController) {
        currentAbortController = null;
      }
    }
  });
  scanQueue = currentScan.then(() => {}).catch(() => {});
  return currentScan;
}
