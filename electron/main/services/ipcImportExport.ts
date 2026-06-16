import { ipcMain, dialog, BrowserWindow, shell, nativeImage } from 'electron';
import { IPC_CHANNELS } from '../../../shared/types/ipc.types';
import type { IpcContext } from './ipcTypes';
import { samples } from '../../../drizzle/schema';
import { inArray } from 'drizzle-orm';
import fs from 'node:fs';
import path from 'node:path';
import { createZipBuffer } from './ipcUtils';
import { generateRenameSuggestions } from './smartRenamer';
import { searchLotsofsounds, searchFreesound, searchSnddev, searchPixabay, getSnddevCategories, downloadOnlineSample, cachePreviewAudio } from './onlineSampleApi';
import { validateArray, validateString, validatePositiveInt, validatePath } from './ipcValidation';
import { scanFolder as doScan } from './fileScanner';
import { generateBatchRename } from './namingEngine';
import { exportToEngine, generateGodotRegistry } from './engineExporter';
import type { ExportEngine } from './engineExporter';
import { runQACheck, getQASummary, QA_RULES } from './deliveryChecker';

export function registerImportExportHandlers(ctx: IpcContext): void {
  const { db, sqlite } = ctx;

  // 导出 JSON
  ipcMain.handle(IPC_CHANNELS.EXPORT_SAMPLES_JSON, async (_event, data: { ids?: number[] }) => {
    try {
      const query = data.ids && data.ids.length > 0
        ? db.select().from(samples).where(inArray(samples.id, data.ids))
        : db.select().from(samples);
      const result = await query;
      const exportData = result.map((s: typeof result[0]) => ({
        fileName: s.fileName,
        filePath: s.filePath,
        fileSize: s.fileSize,
        duration: s.duration,
        bpm: s.bpm,
        key: s.key,
        sampleRate: s.sampleRate,
        bitRate: s.bitRate,
        channels: s.channels,
        categoryId: s.categoryId,
        isFavorite: s.isFavorite,
      }));
      return { success: true, data: exportData };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  });

  // 导出 CSV
  ipcMain.handle(IPC_CHANNELS.EXPORT_SAMPLES_CSV, async (_event, data: { ids?: number[] }) => {
    try {
      const query = data.ids && data.ids.length > 0
        ? db.select().from(samples).where(inArray(samples.id, data.ids))
        : db.select().from(samples);
      const result = await query;
      const headers = ['文件名', '路径', '大小', '时长', 'BPM', 'Key', '采样率', '比特率', '声道', '分类ID', '收藏'];
      const rows = result.map((s: typeof result[0]) => [
        s.fileName, s.filePath, s.fileSize, s.duration,
        s.bpm ?? '', s.key ?? '', s.sampleRate, s.bitRate,
        s.channels, s.categoryId ?? '', s.isFavorite ? '是' : '否'
      ]);
      const csv = [headers.join(','), ...rows.map((r: (string | number | null | boolean)[]) => r.map((v: string | number | null | boolean) => `"${String(v).replace(/"/g, '""')}"`).join(','))].join('\n');
      return { success: true, data: csv };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  });

  // DAW 拖拽：渲染进程 dragstart 时异步通知，主进程启动原生文件拖拽
  // 支持单文件和多文件拖拽
  // 注意：startDrag 必须包含 icon 属性，否则某些 DAW（如 Studio One）会拒绝接受拖放
  ipcMain.on('drag:start', (event, data: { filePath: string; name: string; filePaths?: string[] }) => {
    // 创建一个 16x16 的半透明紫色图标作为拖拽图标
    const dragIcon = nativeImage.createEmpty();
    try {
      const iconSize = 16;
      const canvas = `data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAABGdBTUEAALGPC/xhBQAAAAlwSFlzAAAOwQAADsEBuJFr7QAAABl0RVh0U29mdHdhcmUAcGFpbnQubmV0IDQuMC41ZYBSAAAAH0lEQVQ4T2NgGAWjYBSMglEwCkbBSAcCBgYGFB4DgwgDIwIAAA5wmB3rmXRkAAAAASUVORK5CYII=`;
      const parsed = nativeImage.createFromDataURL(canvas);
      if (!parsed.isEmpty()) {
        dragIcon.addRepresentation({ image: parsed.toPNG() } as any);
      }
    } catch { /* ignore */ }

    // 多文件模式
    if (data.filePaths && data.filePaths.length > 0) {
      const validPaths = data.filePaths.filter(p => p && fs.existsSync(p));
      if (validPaths.length === 0) return;

      setImmediate(() => {
        try {
          (event.sender as any).startDrag({
            file: validPaths.length === 1 ? validPaths[0] : validPaths,
            icon: dragIcon,
          });
        } catch (err) {
          console.error('startDrag (multi) failed:', err);
        }
      });
      return;
    }

    // 单文件模式
    const filePath = data.filePath;
    if (!filePath || !fs.existsSync(filePath)) {
      return;
    }

    setImmediate(() => {
      try {
        event.sender.startDrag({
          file: filePath,
          icon: dragIcon,
        });
      } catch (err) {
        console.error('startDrag failed:', err);
      }
    });
  });

  // 在文件管理器中显示文件
  ipcMain.on('show-item-in-folder', (_event, data: { filePath: string }) => {
    if (data.filePath && fs.existsSync(data.filePath)) {
      shell.showItemInFolder(data.filePath);
    }
  });

  // ===== 智能重命名 =====
  ipcMain.handle(IPC_CHANNELS.GET_RENAME_SUGGESTIONS, async (_event, data: { sampleIds: number[] }) => {
    try {
      const placeholders = data.sampleIds.map(() => '?').join(',');
      const rows = sqlite.prepare(`
        SELECT s.id, s.file_name, s.file_path, s.bpm, s.key, c.name as category,
               GROUP_CONCAT(t.name) as tags
        FROM samples s
        LEFT JOIN categories c ON s.category_id = c.id
        LEFT JOIN sample_tags st ON s.id = st.sample_id
        LEFT JOIN tags t ON st.tag_id = t.id
        WHERE s.id IN (${placeholders})
        GROUP BY s.id
      `).all(...data.sampleIds);

      const suggestions = generateRenameSuggestions(rows.map((r: any) => ({
        fileName: r.file_name,
        category: r.category,
        bpm: r.bpm,
        key: r.key,
        tags: r.tags ? r.tags.split(',') : [],
      })));

      return { success: true, data: suggestions };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  });

  ipcMain.handle(IPC_CHANNELS.APPLY_RENAME, async (_event, data: { sampleId: number; newName: string }) => {
    try {
      const sampleId = validatePositiveInt(data?.sampleId, 'sampleId');
      const newName = validateString(data?.newName, 'newName');
      // Prevent path traversal in new filename
      if (newName.includes('/') || newName.includes('\\') || newName.includes('\0')) {
        return { success: false, error: 'Invalid filename: must not contain path separators' };
      }
      const row = sqlite.prepare('SELECT file_path, file_name FROM samples WHERE id = ?').get(sampleId) as { file_path: string; file_name: string } | undefined;
      if (!row) return { success: false, error: 'Sample not found' };

      const dir = path.dirname(row.file_path);
      const newPath = path.join(dir, newName);

      // 检查目标文件是否已存在
      if (fs.existsSync(newPath) && newPath !== row.file_path) {
        return { success: false, error: 'File already exists' };
      }

      // 重命名文件
      fs.renameSync(row.file_path, newPath);

      // 更新数据库
      sqlite.prepare('UPDATE samples SET file_path = ?, file_name = ? WHERE id = ?').run(newPath, newName, sampleId);

      return { success: true, data: { newPath } };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  });

  // ===== 采样分享 - 打包采样+元数据导出 =====
  ipcMain.handle(IPC_CHANNELS.EXPORT_SAMPLES_PACKAGE, async (_event, data: { sampleIds: number[] }) => {
    try {
      const sampleIds = validateArray<number>(data?.sampleIds, 'sampleIds', (item) => validatePositiveInt(item));
      if (sampleIds.length === 0) {
        return { success: false, error: 'No samples selected' };
      }

      // 查询采样数据
      const placeholders = sampleIds.map(() => '?').join(',');
      const rows = sqlite.prepare(`
        SELECT s.*, c.name as category_name,
               GROUP_CONCAT(t.name) as tag_names
        FROM samples s
        LEFT JOIN categories c ON s.category_id = c.id
        LEFT JOIN sample_tags st ON s.id = st.sample_id
        LEFT JOIN tags t ON st.tag_id = t.id
        WHERE s.id IN (${placeholders})
        GROUP BY s.id
      `).all(...sampleIds) as any[];

      if (rows.length === 0) {
        return { success: false, error: 'No samples found' };
      }

      // 选择保存路径
      const saveResult = await dialog.showSaveDialog(BrowserWindow.getFocusedWindow()!, {
        title: '导出采样包',
        defaultPath: `samplerhub-export-${Date.now()}.zip`,
        filters: [{ name: 'ZIP 压缩包', extensions: ['zip'] }],
      });

      if (!saveResult.filePath) {
        return { success: true, data: null };
      }

      // 构建元数据 JSON
      const metadata = rows.map(r => ({
        fileName: r.file_name,
        category: r.category_name,
        bpm: r.bpm,
        key: r.key,
        duration: r.duration,
        sampleRate: r.sample_rate,
        bitRate: r.bit_rate,
        tags: r.tag_names ? r.tag_names.split(',') : [],
        isFavorite: !!r.is_favorite,
      }));

      // 创建简易 ZIP 文件（使用 Store 方式，不压缩音频文件本身）
      // ZIP 格式：Local File Header + File Data + Central Directory + End of Central Directory
      const entries: { name: string; data: Buffer; compressed: boolean }[] = [];

      // 添加元数据文件
      entries.push({
        name: 'metadata.json',
        data: Buffer.from(JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), samples: metadata }, null, 2)),
        compressed: true,
      });

      // 添加音频文件
      for (const row of rows) {
        if (fs.existsSync(row.file_path)) {
          const fileData = fs.readFileSync(row.file_path);
          entries.push({
            name: `audio/${row.file_name}`,
            data: fileData,
            compressed: false, // 音频文件本身已压缩，不再重复压缩
          });
        }
      }

      // 写入 ZIP 文件
      const zipBuffer = createZipBuffer(entries);
      fs.writeFileSync(saveResult.filePath, zipBuffer);

      return { success: true, data: { path: saveResult.filePath, count: rows.length } };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  });

  // ===== 在线采样搜索 =====
  ipcMain.handle(IPC_CHANNELS.ONLINE_SEARCH, async (_event, data: {
    source: 'lotsofsounds' | 'freesound' | 'snddev' | 'pixabay';
    query: string;
    page?: number;
    pageSize?: number;
    filter?: string;
    sort?: string;
    freesoundApiKey?: string;
    pixabayApiKey?: string;
  }) => {
    try {
      let result;
      switch (data.source) {
        case 'freesound':
          if (!data.freesoundApiKey) {
            return { success: false, error: 'Freesound API Key 未配置，请在设置中填写' };
          }
          result = await searchFreesound(data.freesoundApiKey, data.query, {
            filter: data.filter,
            sort: data.sort,
            page: data.page,
            pageSize: data.pageSize,
          });
          break;
        case 'pixabay':
          if (!data.pixabayApiKey) {
            return { success: false, error: 'Pixabay API Key 未配置，请在设置中填写' };
          }
          result = await searchPixabay(data.pixabayApiKey, data.query, {
            page: data.page,
            perPage: data.pageSize,
          });
          break;
        case 'snddev':
          result = await searchSnddev(data.filter);
          break;
        case 'lotsofsounds':
        default:
          result = await searchLotsofsounds(data.query, data.page);
          break;
      }
      return { success: true, data: result };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  });

  // ===== 在线采样下载 =====
  ipcMain.handle(IPC_CHANNELS.ONLINE_DOWNLOAD, async (_event, data: {
    url: string;
    fileName: string;
    headers?: Record<string, string>;
    saveDir?: string;
  }) => {
    try {
      // 选择保存目录：优先使用用户指定的，否则用第一个监视文件夹
      let saveDir = data.saveDir || '';
      if (!saveDir) {
        const folders = sqlite.prepare('SELECT path FROM watched_folders LIMIT 1').all() as { path: string }[];
        saveDir = folders.length > 0 ? folders[0].path : '';
      }

      if (!saveDir) {
        return { success: false, error: '没有可用的保存目录，请先添加文件夹或配置下载路径' };
      }

      // 确保目录存在
      if (!fs.existsSync(saveDir)) {
        fs.mkdirSync(saveDir, { recursive: true });
      }

      const targetPath = path.join(saveDir, data.fileName);

      // 检查文件是否已存在
      if (fs.existsSync(targetPath)) {
        return { success: false, error: '文件已存在' };
      }

      await downloadOnlineSample(data.url, targetPath, data.headers);

      // 触发重新扫描该文件夹
      try {
        await doScan(saveDir);
      } catch (err) {
        console.error('[Download] Rescan failed:', err);
      }

      return { success: true, data: { path: targetPath, saveDir } };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  });

  // ===== 获取 SND.dev 分类 =====
  ipcMain.handle(IPC_CHANNELS.ONLINE_GET_SNDDEV_CATEGORIES, async () => {
    return { success: true, data: getSnddevCategories() };
  });

  // ===== 选择在线采样下载文件夹 =====
  ipcMain.handle(IPC_CHANNELS.SELECT_ONLINE_DOWNLOAD_FOLDER, async () => {
    const result = await dialog.showOpenDialog({
      title: '选择在线采样下载目录',
      properties: ['openDirectory', 'createDirectory'],
      buttonLabel: '选择此文件夹',
    });
    if (result.canceled || result.filePaths.length === 0) {
      return { success: false, error: '用户取消' };
    }
    return { success: true, data: { folder: result.filePaths[0] } };
  });

  // ===== 在线采样预览缓存 =====
  // 将远程音频下载到主进程缓存，返回 online-preview:// URL 供渲染进程播放
  ipcMain.handle(IPC_CHANNELS.ONLINE_CACHE_PREVIEW, async (_event, data: { url: string }) => {
    try {
      const previewUrl = await cachePreviewAudio(data.url);
      return { success: true, data: { previewUrl } };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  });

  // 导出音序器 MIDI
  ipcMain.handle(IPC_CHANNELS.EXPORT_SEQUENCER_MIDI, async (_event, data: {
    tracks: Array<{
      id: string;
      name: string;
      type?: string;
      stepCount?: number;
      steps: boolean[];
      velocity: number;
    }>;
    bpm: number;
    timeSignature?: string;
  }) => {
    try {
      const { dialog } = await import('electron');
      const result = await dialog.showSaveDialog({
        title: 'Export MIDI',
        defaultPath: 'pattern.mid',
        filters: [{ name: 'MIDI Files', extensions: ['mid'] }],
      });
      if (result.canceled || !result.filePath) {
        return { success: false, error: 'Canceled' };
      }

      const { Midi } = await import('@tonejs/midi');
      const midi = new Midi();
      midi.header.setTempo(data.bpm);

      // 设置拍号
      const timeSignature = data.timeSignature || '4/4';
      const [numerator, denominator] = timeSignature.split('/').map(Number);
      midi.header.timeSignatures = [{ ticks: 0, timeSignature: [numerator, denominator] }];

      // 鼓组名称到 MIDI 键名的映射 (GM 鼓组标准)
      const DRUM_NAME_TO_MIDI: Record<string, number> = {
        'kick': 36, 'bd': 36, 'bass drum': 36, 'bassdrum': 36,
        'snare': 38, 'sd': 38, 'sn': 38,
        'hihat': 42, 'hat': 42, 'hh': 42, 'closed hat': 42, 'open hat': 46,
        'closed hihat': 42, 'open hihat': 46, 'pedal hihat': 44,
        'clap': 39, 'cp': 39,
        'tom': 47, 'low tom': 45, 'mid tom': 47, 'high tom': 50,
        'floor tom': 43, 'rack tom': 47,
        'crash': 49, 'crash cymbal': 49, 'cymbal': 49, 'ride': 51,
        'rim': 37, 'sidestick': 37, 'rimshot': 37,
        'cowbell': 56, 'cb': 56,
        'tambourine': 54, 'tamb': 54,
        'shaker': 82, 'shake': 82,
        'conga': 63, 'congas': 63, 'bongo': 60, 'bongos': 60,
        'timbale': 65, 'timbales': 65,
        'agogo': 67, 'agogos': 67,
        'whistle': 71, 'whistles': 71,
        'guiro': 73, 'guiros': 73,
        'claves': 75, 'clave': 75,
        'woodblock': 76, 'woodblocks': 76,
        'cuica': 78, 'cuicas': 78,
        'triangle': 81, 'triangles': 81,
        'vibraslap': 58,
        'maracas': 70, 'maraca': 70,
        'surdo': 87, 'surdos': 87,
        'cajon': 86, 'cajons': 86,
        'handclap': 39, 'hand clap': 39,
        'snap': 39, 'finger snap': 39,
        'stomp': 36, 'stomp kick': 36,
        'perc': 82, 'percussion': 82,
      };

      function getMidiNoteForTrack(trackName: string): number {
        const normalized = trackName.toLowerCase().trim();
        if (DRUM_NAME_TO_MIDI[normalized] !== undefined) {
          return DRUM_NAME_TO_MIDI[normalized];
        }
        for (const [key, midi] of Object.entries(DRUM_NAME_TO_MIDI)) {
          if (normalized.includes(key)) {
            return midi;
          }
        }
        return 48;
      }

      // 计算 step 时长：基于 16 分音符
      const stepDuration = 60 / data.bpm / 4; // 16th note duration in seconds

      data.tracks.forEach((track) => {
        // 跳过 loop 轨道（loop 是音频片段，不是 MIDI 音符）
        if (track.type === 'loop') return;

        const midiTrack = midi.addTrack();
        midiTrack.name = track.name;
        const midiNote = getMidiNoteForTrack(track.name);

        // 根据轨道的 stepCount 计算实际的 step 时长
        const trackStepCount = track.stepCount || 16;
        const trackStepDuration = stepDuration * (16 / trackStepCount);

        track.steps.forEach((active, stepIndex) => {
          if (active) {
            const time = stepIndex * trackStepDuration;
            midiTrack.addNote({
              midi: midiNote,
              time: time,
              duration: trackStepDuration * 0.9,
              velocity: track.velocity,
            });
          }
        });
      });

      const fs = await import('fs/promises');
      await fs.writeFile(result.filePath, Buffer.from(midi.toArray()));
      return { success: true, data: result.filePath };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  });

  // ===== 批量重命名（基于 UCS 分类） =====
  ipcMain.handle(IPC_CHANNELS.GENERATE_BATCH_RENAME, async (_event, data: { sampleIds: number[]; template?: string }) => {
    try {
      const sampleIds = validateArray<number>(data?.sampleIds, 'sampleIds', (item) => validatePositiveInt(item));
      if (sampleIds.length === 0) {
        return { success: false, error: 'No samples selected' };
      }
      const results = await generateBatchRename(sqlite, sampleIds, data.template);
      return { success: true, data: results };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  });

  // ===== 引擎导出 =====
  ipcMain.handle(IPC_CHANNELS.EXPORT_TO_ENGINE, async (_event, data: { engine: ExportEngine; sampleIds: number[] }) => {
    try {
      const engine = data?.engine as ExportEngine;
      if (!engine || !['unity', 'unreal', 'godot'].includes(engine)) {
        return { success: false, error: 'Invalid engine type. Must be one of: unity, unreal, godot' };
      }
      const sampleIds = validateArray(data?.sampleIds, 'sampleIds', validatePositiveInt);
      if (sampleIds.length === 0) {
        return { success: false, error: 'No samples selected' };
      }

      // 弹出文件夹选择对话框
      const dialogResult = await dialog.showOpenDialog(BrowserWindow.getFocusedWindow()!, {
        title: `选择 ${engine.toUpperCase()} 项目根目录`,
        properties: ['openDirectory', 'createDirectory'],
        buttonLabel: '导出到此目录',
      });

      if (dialogResult.canceled || dialogResult.filePaths.length === 0) {
        return { success: true, data: null };
      }

      const outputDir = dialogResult.filePaths[0];
      const result = await exportToEngine(sqlite, outputDir, engine, sampleIds);
      return { success: true, data: result };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  });

  // ===== 交付质检 =====
  ipcMain.handle(IPC_CHANNELS.RUN_DELIVERY_QA, async (_event, data: { sampleIds?: number[] }) => {
    try {
      const sampleIds: number[] = data?.sampleIds ?? [];

      // If no specific IDs provided, run on all samples
      const ids = sampleIds.length > 0
        ? sampleIds
        : (ctx.sqlite.prepare('SELECT id FROM samples').all() as { id: number }[]).map(r => r.id);

      const issues = runQACheck(ctx.sqlite, ids);
      const summary = getQASummary(issues);

      return { success: true, data: { issues, summary } };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  });

  ipcMain.handle(IPC_CHANNELS.GET_QA_RULES, async () => {
    try {
      return { success: true, data: QA_RULES };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  });
}
