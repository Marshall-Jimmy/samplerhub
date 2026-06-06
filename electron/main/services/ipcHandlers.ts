import { ipcMain, dialog, BrowserWindow, nativeImage, shell } from 'electron';
import { IPC_CHANNELS } from '../../../shared/types/ipc.types';
import { getDatabase, initDatabase, getSqlite } from './database';
import { samples, categories, tags, watchedFolders, classificationRules, sampleTags, recentSamples, playlists, playlistItems } from '../../../drizzle/schema';
import { eq, and, sql, count, desc, asc, like, gte, lte, inArray } from 'drizzle-orm';
import { parseMidiFile, isMidiFile } from './midiParser';
import type { SearchFilters } from '../../../shared/types/sample.types';
import { scanFolder, abortScan } from './fileScanner';
import { startWatching, stopWatching, startWatchingAllFolders } from './fileWatcher';
import { classifyAllSamples, classifySampleById } from './classifier';
import { extractBPMAndKey } from './bpmKeyParser';
import { decodeWaveform, readWaveformFile, readPeakEnvelopeFile, detectSilence, writeWaveformFile } from './waveformGenerator';
import { generateRenameSuggestions } from './smartRenamer';
import { searchLotsofsounds, searchFreesound, searchSnddev, searchPixabay, getSnddevCategories, downloadOnlineSample } from './onlineSampleApi';
import path from 'node:path';
import fs from 'node:fs';
import zlib from 'node:zlib';

export function registerIpcHandlers(): void {
  initDatabase();

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
  };

  // 获取采样列表
  ipcMain.handle(IPC_CHANNELS.GET_SAMPLES, async () => {
    try {
      const result = await db.select(sampleListFields).from(samples);
      return { success: true, data: result };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  });

  // 分页获取采样列表
  ipcMain.handle(IPC_CHANNELS.GET_SAMPLES_PAGINATED, async (_event, data: { offset?: number; limit?: number }) => {
    try {
      const offset = data?.offset || 0;
      const limit = data?.limit || 200;

      const result = await db.select(sampleListFields).from(samples)
        .orderBy(desc(samples.playCount), samples.fileName)
        .limit(limit)
        .offset(offset);

      const [{ total }] = await db.select({ total: count() }).from(samples);

      return { success: true, data: { items: result, total, offset, limit } };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  });

  // 搜索采样（FTS5 获取 ID + Drizzle ORM 查询，保证 camelCase 字段）
  ipcMain.handle(IPC_CHANNELS.SEARCH_SAMPLES, async (_event, filters: SearchFilters) => {
    try {
      const conditions = [];

      // FTS5 全文搜索：先用原生 SQL 获取匹配的 ID 列表
      if (filters.query) {
        const terms = filters.query.trim().split(/\s+/).filter(Boolean);
        const ftsQuery = terms.map(t => `"${t}" *`).join(' AND ');
        const ftsRows = sqlite.prepare(
          `SELECT rowid as id FROM samples_fts WHERE samples_fts MATCH ?`
        ).all(ftsQuery) as { id: number }[];
        const matchedIds = ftsRows.map(r => r.id);
        if (matchedIds.length === 0) {
          return { success: true, data: { items: [], total: 0, page: 1, pageSize: 0 } };
        }
        conditions.push(inArray(samples.id, matchedIds));
      }

      // 文件类型筛选（audio / midi）
      if (filters.fileType) {
        conditions.push(eq(samples.fileType, filters.fileType));
      }

      // 分类筛选
      if (filters.categoryId) {
        conditions.push(eq(samples.categoryId, filters.categoryId));
      }

      // 时长范围
      if (filters.durationMin !== undefined) {
        conditions.push(gte(samples.duration, filters.durationMin));
      }
      if (filters.durationMax !== undefined) {
        conditions.push(lte(samples.duration, filters.durationMax));
      }

      // 采样率
      if (filters.sampleRate) {
        conditions.push(eq(samples.sampleRate, filters.sampleRate));
      }

      // 声道数
      if (filters.channels) {
        conditions.push(eq(samples.channels, filters.channels));
      }

      // BPM 范围
      if (filters.bpmMin !== undefined) {
        conditions.push(gte(samples.bpm, filters.bpmMin));
      }
      if (filters.bpmMax !== undefined) {
        conditions.push(lte(samples.bpm, filters.bpmMax));
      }

      // 调性
      if (filters.key) {
        conditions.push(like(samples.key, `${filters.key}%`));
      }

      // 收藏
      if (filters.isFavorite !== undefined) {
        conditions.push(eq(samples.isFavorite, filters.isFavorite));
      }

      // 文件夹路径筛选（统一分隔符以兼容 Windows 反斜杠）
      if (filters.folderPath) {
        const normalizedPath = filters.folderPath.replace(/\\/g, '/');
        // 使用原生 SQL 确保 REPLACE 和 LIKE 正确工作
        const folderRows = sqlite.prepare(
          `SELECT id FROM samples WHERE REPLACE(file_path, '\\', '/') LIKE ?`
        ).all(`${normalizedPath}/%`) as { id: number }[];
        if (folderRows.length === 0) {
          return { success: true, data: { items: [], total: 0, page: 1, pageSize: 0 } };
        }
        conditions.push(inArray(samples.id, folderRows.map(r => r.id)));
      }

      // 标签筛选
      if (filters.tagIds && filters.tagIds.length > 0) {
        const tagRows = sqlite.prepare(
          `SELECT DISTINCT sample_id FROM sample_tags WHERE tag_id IN (${filters.tagIds.map(() => '?').join(',')})`
        ).all(...filters.tagIds) as { sample_id: number }[];
        const sampleIds = tagRows.map(r => r.sample_id);
        if (sampleIds.length === 0) {
          return { success: true, data: { items: [], total: 0, page: 1, pageSize: 0 } };
        }
        conditions.push(inArray(samples.id, sampleIds));
      }

      const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

      // 查总数
      const [{ total }] = await db.select({ total: count() }).from(samples).where(whereClause);

      // 排序
      const sortableFields: Record<string, any> = {
        fileName: samples.fileName,
        duration: samples.duration,
        bpm: samples.bpm,
        key: samples.key,
        sampleRate: samples.sampleRate,
        fileSize: samples.fileSize,
        playCount: samples.playCount,
        isFavorite: samples.isFavorite,
        createdAt: samples.createdAt,
      };
      const sortKey = filters.sortField || 'playCount';
      const sortDir = filters.sortDirection || 'desc';
      const sortCol = sortableFields[sortKey] ?? samples.playCount;
      const orderByClause = sortDir === 'asc'
        ? [asc(sortCol), samples.fileName]
        : [desc(sortCol), samples.fileName];

      // 分页
      const offset = filters.offset ?? 0;
      const limit = filters.limit ?? 200;

      // 查数据
      const result = await db.select(sampleListFields).from(samples).where(whereClause)
        .orderBy(...orderByClause)
        .limit(limit)
        .offset(offset);

      return { success: true, data: { items: result, total, page: Math.floor(offset / limit) + 1, pageSize: limit } };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  });

  // 获取分类
  ipcMain.handle(IPC_CHANNELS.GET_CATEGORIES, async () => {
    try {
      const result = await db.select().from(categories);
      return { success: true, data: result };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  });

  // 添加监控文件夹
  ipcMain.handle(IPC_CHANNELS.ADD_WATCHED_FOLDER, async (_event, data: { path: string }) => {
    try {
      await db.insert(watchedFolders).values({ path: data.path }).onConflictDoNothing();
      startWatching(data.path);
      return { success: true };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  });

  // 获取监控文件夹
  ipcMain.handle(IPC_CHANNELS.GET_WATCHED_FOLDERS, async () => {
    try {
      const result = await db.select().from(watchedFolders);
      return { success: true, data: result };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  });

  // 移除监控文件夹
  ipcMain.handle(IPC_CHANNELS.REMOVE_WATCHED_FOLDER, async (_event, data: { path: string }) => {
    try {
      stopWatching(data.path);
      await db.delete(watchedFolders).where(eq(watchedFolders.path, data.path));
      return { success: true };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  });

  // 获取文件夹树结构（按采样所在目录构建）
  ipcMain.handle(IPC_CHANNELS.GET_FOLDER_TREE, async () => {
    try {
      const rows = sqlite.prepare(
        `SELECT file_path FROM samples ORDER BY file_path`
      ).all() as { file_path: string }[];

      // 构建文件夹树
      const root: Record<string, any> = {};
      const sep = '/';

      for (const row of rows) {
        const normalized = row.file_path.replace(/\\/g, '/');
        const parts = normalized.split(sep);
        // 文件名是最后一个部分，文件夹是前面的部分
        for (let i = 1; i < parts.length; i++) {
          const folderPath = parts.slice(0, i).join(sep);
          if (!root[folderPath]) {
            root[folderPath] = { path: folderPath, name: parts[i - 1], sampleCount: 0, children: [] };
          }
        }
      }

      // 计算每个文件夹的采样数
      for (const row of rows) {
        const normalized = row.file_path.replace(/\\/g, '/');
        const parts = normalized.split(sep);
        for (let i = 1; i < parts.length; i++) {
          const folderPath = parts.slice(0, i).join(sep);
          if (root[folderPath]) {
            root[folderPath].sampleCount++;
          }
        }
      }

      // 构建树形结构：找到顶层节点，递归挂载子节点
      const allPaths = Object.keys(root).sort();
      const buildTree = (parentPath: string): any[] => {
        const children: any[] = [];
        for (const p of allPaths) {
          // p 是 parentPath 的直接子文件夹
          if (p.startsWith(parentPath + sep)) {
            const remaining = p.slice(parentPath.length + sep.length);
            if (!remaining.includes(sep)) {
              const node = { ...root[p], children: buildTree(p) };
              children.push(node);
            }
          }
        }
        return children;
      };

      // 找到顶层文件夹（监控的根目录）
      const watchedResult = await db.select().from(watchedFolders);
      const watchedPaths = watchedResult.map(w => w.path.replace(/\\/g, '/'));

      const tree: any[] = [];
      if (watchedPaths.length > 0) {
        for (const wp of watchedPaths) {
          if (root[wp]) {
            tree.push({ ...root[wp], children: buildTree(wp) });
          } else {
            // 监控目录本身可能没有采样，但子目录有
            const children = buildTree(wp);
            if (children.length > 0) {
              tree.push({ path: wp, name: wp.split(sep).pop() || wp, sampleCount: 0, children });
            }
          }
        }
      } else {
        // 没有监控目录，找所有顶级目录
        const topPaths = allPaths.filter(p => !allPaths.some(other => other !== p && p.startsWith(other + sep)));
        for (const tp of topPaths) {
          tree.push({ ...root[tp], children: buildTree(tp) });
        }
      }

      return { success: true, data: tree };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  });

  // 获取标签
  ipcMain.handle(IPC_CHANNELS.GET_TAGS, async () => {
    try {
      const result = await db.select().from(tags);
      return { success: true, data: result };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  });

  // 创建标签
  ipcMain.handle(IPC_CHANNELS.CREATE_TAG, async (_event, data: { name: string; color?: string }) => {
    try {
      await db.insert(tags).values({ name: data.name, color: data.color || '#1890ff' });
      const result = await db.select().from(tags).where(eq(tags.name, data.name));
      return { success: true, data: result[0] };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  });

  // 删除标签
  ipcMain.handle(IPC_CHANNELS.DELETE_TAG, async (_event, data: { tagId: number }) => {
    try {
      await db.delete(sampleTags).where(eq(sampleTags.tagId, data.tagId));
      await db.delete(tags).where(eq(tags.id, data.tagId));
      return { success: true };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  });

  // 给采样添加标签
  ipcMain.handle('tags:addToSample', async (_event, data: { sampleId: number; tagId: number }) => {
    try {
      await db.insert(sampleTags).values({ sampleId: data.sampleId, tagId: data.tagId }).onConflictDoNothing();
      return { success: true };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  });

  // 从采样移除标签
  ipcMain.handle('tags:removeFromSample', async (_event, data: { sampleId: number; tagId: number }) => {
    try {
      await db.delete(sampleTags).where(and(eq(sampleTags.sampleId, data.sampleId), eq(sampleTags.tagId, data.tagId)));
      return { success: true };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  });

  // 切换收藏
  ipcMain.handle(IPC_CHANNELS.TOGGLE_FAVORITE, async (_event, data: { sampleId: number }) => {
    try {
      const sample = await db.select().from(samples).where(eq(samples.id, data.sampleId)).get();
      if (!sample) {
        return { success: false, error: 'Sample not found' };
      }

      const newFavorite = !sample.isFavorite;
      await db.update(samples).set({ isFavorite: newFavorite }).where(eq(samples.id, data.sampleId));

      return { success: true, data: newFavorite };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  });

  // 获取收藏
  ipcMain.handle(IPC_CHANNELS.GET_FAVORITES, async () => {
    try {
      const result = await db.select(sampleListFields).from(samples).where(eq(samples.isFavorite, true));
      return { success: true, data: result };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  });

  // 添加最近使用
  ipcMain.handle(IPC_CHANNELS.ADD_RECENT, async (_event, data: { sampleId: number }) => {
    try {
      await db.insert(recentSamples).values({ sampleId: data.sampleId });

      // 更新播放计数和最后播放时间
      await db.update(samples)
        .set({
          playCount: sql`${samples.playCount} + 1`,
          lastPlayedAt: new Date(),
        })
        .where(eq(samples.id, data.sampleId));

      // 清理旧记录，只保留最近 50 条
      sqlite.prepare(`
        DELETE FROM recent_samples WHERE id NOT IN (
          SELECT id FROM recent_samples ORDER BY played_at DESC LIMIT 50
        )
      `).run();

      return { success: true };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  });

  // 获取最近使用（用 Drizzle ORM 保证 camelCase）
  ipcMain.handle(IPC_CHANNELS.GET_RECENT, async (_event, data?: { limit?: number }) => {
    try {
      const limit = data?.limit || 50;
      // 先获取最近使用的 sample_id 列表（按时间排序）
      const recentRows = sqlite.prepare(
        `SELECT sample_id FROM recent_samples ORDER BY played_at DESC LIMIT ?`
      ).all(limit) as { sample_id: number }[];

      if (recentRows.length === 0) {
        return { success: true, data: [] };
      }

      const sampleIds = recentRows.map(r => r.sample_id);
      // 用 Drizzle 查询保证 camelCase 字段，排除 waveformData
      const result = await db.select(sampleListFields).from(samples).where(inArray(samples.id, sampleIds));
      // 按 recentRows 的顺序排列
      const orderMap = new Map(sampleIds.map((id, idx) => [id, idx]));
      result.sort((a, b) => (orderMap.get(a.id) ?? 999) - (orderMap.get(b.id) ?? 999));

      return { success: true, data: result };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  });

  // 扫描进度事件
  ipcMain.on(IPC_CHANNELS.SCAN_PROGRESS, (_event, progress) => {
    const windows = BrowserWindow.getAllWindows();
    windows.forEach((win: Electron.BrowserWindow) => {
      win.webContents.send(IPC_CHANNELS.SCAN_PROGRESS, progress);
    });
  });

  // 扫描指定文件夹
  ipcMain.handle(IPC_CHANNELS.SCAN_FOLDER, async (_event, data: { folderPath: string }) => {
    try {
      const win = BrowserWindow.getFocusedWindow();
      const result = await scanFolder(data.folderPath, (progress) => {
        win?.webContents.send(IPC_CHANNELS.SCAN_PROGRESS, {
          ...progress,
          folderPath: data.folderPath,
        });
      });
      return { success: true, data: result };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  });

  // 开始扫描（打开文件夹对话框）
  ipcMain.handle(IPC_CHANNELS.START_SCAN, async () => {
    try {
      const win = BrowserWindow.getFocusedWindow();
      const result = await dialog.showOpenDialog(win!, {
        properties: ['openDirectory', 'multiSelections'],
        title: '选择采样文件夹（可多选）',
      });
      if (result.canceled || result.filePaths.length === 0) {
        return { success: true, data: null };
      }

      let totalAdded = 0, totalUpdated = 0, totalDeleted = 0;
      for (const folderPath of result.filePaths) {
        await db.insert(watchedFolders).values({ path: folderPath }).onConflictDoNothing();
        const scanResult = await scanFolder(folderPath, (progress) => {
          win?.webContents.send(IPC_CHANNELS.SCAN_PROGRESS, {
            ...progress,
            folderPath,
          });
        });
        totalAdded += scanResult.added;
        totalUpdated += scanResult.updated;
        totalDeleted += scanResult.deleted;
      }
      return { success: true, data: { folderPath: result.filePaths.join('; '), added: totalAdded, updated: totalUpdated, deleted: totalDeleted } };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  });

  // 取消扫描
  ipcMain.handle(IPC_CHANNELS.STOP_SCAN, async () => {
    abortScan();
    return { success: true };
  });

  // 打开文件夹对话框
  ipcMain.handle(IPC_CHANNELS.DIALOG_OPEN_FOLDER, async () => {
    try {
      const win = BrowserWindow.getFocusedWindow();
      const result = await dialog.showOpenDialog(win!, {
        properties: ['openDirectory'],
        title: '选择采样文件夹',
      });
      if (result.canceled) return { success: true, data: null };
      return { success: true, data: result.filePaths[0] };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  });

  // 多文件夹选择对话框
  ipcMain.handle(IPC_CHANNELS.DIALOG_OPEN_FOLDERS, async () => {
    try {
      const win = BrowserWindow.getFocusedWindow();
      const result = await dialog.showOpenDialog(win!, {
        properties: ['openDirectory', 'multiSelections'],
        title: '选择采样文件夹（可多选）',
      });
      if (result.canceled) return { success: true, data: null };
      return { success: true, data: result.filePaths };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  });

  // 分类单个采样
  ipcMain.handle(IPC_CHANNELS.CLASSIFY_SAMPLE, async (_event, data: { sampleId: number }) => {
    try {
      const categoryId = await classifySampleById(data.sampleId);
      return { success: true, data: categoryId };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  });

  // 分类所有采样
  ipcMain.handle(IPC_CHANNELS.CLASSIFY_ALL, async () => {
    try {
      const classifiedCount = await classifyAllSamples();
      return { success: true, data: classifiedCount };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  });

  // 获取分类规则
  ipcMain.handle(IPC_CHANNELS.GET_CLASSIFICATION_RULES, async () => {
    try {
      const result = await db.select().from(classificationRules);
      return { success: true, data: result };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  });

  // 获取规则列表
  ipcMain.handle(IPC_CHANNELS.GET_RULES, async () => {
    try {
      const result = await db.select().from(classificationRules).orderBy(desc(classificationRules.priority));
      return { success: true, data: result };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  });

  // 创建规则
  ipcMain.handle(IPC_CHANNELS.CREATE_RULE, async (_event, data: { name: string; pattern: string; ruleType: string; targetCategoryId: number; priority?: number }) => {
    try {
      const result = await db.insert(classificationRules).values({
        name: data.name,
        pattern: data.pattern,
        ruleType: data.ruleType as 'regex' | 'keyword' | 'folder',
        targetCategoryId: data.targetCategoryId,
        priority: data.priority ?? 100,
        isActive: true,
      }).returning();
      return { success: true, data: result[0] };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  });

  // 更新规则
  ipcMain.handle(IPC_CHANNELS.UPDATE_RULE, async (_event, data: { id: number; name?: string; pattern?: string; ruleType?: string; targetCategoryId?: number; priority?: number; isActive?: boolean }) => {
    try {
      const updates: Record<string, any> = {};
      if (data.name !== undefined) updates.name = data.name;
      if (data.pattern !== undefined) updates.pattern = data.pattern;
      if (data.ruleType !== undefined) updates.ruleType = data.ruleType;
      if (data.targetCategoryId !== undefined) updates.targetCategoryId = data.targetCategoryId;
      if (data.priority !== undefined) updates.priority = data.priority;
      if (data.isActive !== undefined) updates.isActive = data.isActive;
      await db.update(classificationRules).set(updates).where(eq(classificationRules.id, data.id));
      return { success: true };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  });

  // 删除规则
  ipcMain.handle(IPC_CHANNELS.DELETE_RULE, async (_event, data: { id: number }) => {
    try {
      await db.delete(classificationRules).where(eq(classificationRules.id, data.id));
      return { success: true };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  });

  // 智能推荐：基于 BPM/Key/分类 匹配相似采样
  ipcMain.handle(IPC_CHANNELS.GET_SIMILAR_SAMPLES, async (_event, data: { sampleId: number; limit?: number }) => {
    try {
      const sample = await db.select().from(samples).where(eq(samples.id, data.sampleId)).get();
      if (!sample) return { success: true, data: [] };

      const limit = data.limit ?? 10;
      const conditions = [];

      // 同分类
      if (sample.categoryId) {
        conditions.push(eq(samples.categoryId, sample.categoryId));
      }

      // BPM 范围 ±5
      if (sample.bpm) {
        conditions.push(
          and(
            gte(samples.bpm, sample.bpm - 5),
            lte(samples.bpm, sample.bpm + 5)
          )!
        );
      }

      // Key 匹配
      if (sample.key) {
        conditions.push(eq(samples.key, sample.key));
      }

      // 构建查询：优先匹配分类+BPM+Key，然后放宽条件
      let result: any[] = [];

      // 严格匹配：同分类 + BPM相近 + 同Key
      if (sample.categoryId && sample.bpm && sample.key) {
        result = await db.select().from(samples)
          .where(and(
            eq(samples.categoryId, sample.categoryId),
            gte(samples.bpm, sample.bpm - 5),
            lte(samples.bpm, sample.bpm + 5),
            eq(samples.key, sample.key),
            sql`${samples.id} != ${data.sampleId}`
          ))
          .limit(limit)
          .execute();
      }

      // 放宽：同分类 + BPM相近
      if (result.length < limit && sample.categoryId && sample.bpm) {
        const more = await db.select().from(samples)
          .where(and(
            eq(samples.categoryId, sample.categoryId),
            gte(samples.bpm, sample.bpm - 5),
            lte(samples.bpm, sample.bpm + 5),
            sql`${samples.id} != ${data.sampleId}`,
            sql`${samples.id} NOT IN (${result.length > 0 ? result.map(r => r.id).join(',') : '0'})`
          ))
          .limit(limit - result.length)
          .execute();
        result = [...result, ...more];
      }

      // 再放宽：同分类
      if (result.length < limit && sample.categoryId) {
        const existingIds = result.length > 0 ? result.map(r => r.id).join(',') : '0';
        const more = await db.select().from(samples)
          .where(and(
            eq(samples.categoryId, sample.categoryId),
            sql`${samples.id} != ${data.sampleId}`,
            sql`${samples.id} NOT IN (${existingIds})`
          ))
          .limit(limit - result.length)
          .execute();
        result = [...result, ...more];
      }

      return { success: true, data: result };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  });

  // 重复检测：基于 fileHash 查找重复文件
  ipcMain.handle(IPC_CHANNELS.GET_DUPLICATES, async () => {
    try {
      const result = await db.select({
        hash: samples.fileHash,
        count: sql<number>`count(*)`.as('count'),
        ids: sql<string>`group_concat(${samples.id})`.as('ids'),
        names: sql<string>`group_concat(${samples.fileName})`.as('names'),
      })
        .from(samples)
        .where(sql`${samples.fileHash} != ''`)
        .groupBy(samples.fileHash)
        .having(sql`count(*) > 1`);
      return { success: true, data: result };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  });

  // 清理损坏文件记录
  ipcMain.handle(IPC_CHANNELS.CLEAN_CORRUPTED, async () => {
    try {
      const result = await db.delete(samples).where(eq(samples.isCorrupted, true));
      return { success: true, data: result.changes };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  });

  // 批量删除采样记录
  ipcMain.handle(IPC_CHANNELS.DELETE_SAMPLES, async (_event, data: { ids: number[] }) => {
    try {
      await db.delete(samples).where(inArray(samples.id, data.ids));
      return { success: true };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  });

  // 批量更新分类
  ipcMain.handle(IPC_CHANNELS.UPDATE_SAMPLES_CATEGORY, async (_event, data: { ids: number[]; categoryId: number }) => {
    try {
      await db.update(samples).set({ categoryId: data.categoryId }).where(inArray(samples.id, data.ids));
      return { success: true };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  });

  // 批量添加标签
  ipcMain.handle(IPC_CHANNELS.BATCH_ADD_TAG, async (_event, data: { sampleIds: number[]; tagId: number }) => {
    try {
      const values = data.sampleIds.map(sampleId => ({
        sampleId,
        tagId: data.tagId,
      }));
      // 忽略已存在的关联
      for (const v of values) {
        const existing = await db.select().from(sampleTags)
          .where(and(eq(sampleTags.sampleId, v.sampleId), eq(sampleTags.tagId, v.tagId)));
        if (existing.length === 0) {
          await db.insert(sampleTags).values(v);
        }
      }
      return { success: true };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  });

  // 导出选区（使用 ffmpeg 裁剪）
  ipcMain.handle(IPC_CHANNELS.EXPORT_SELECTION, async (_event, data: { filePath: string; startTime: number; endTime: number }) => {
    try {
      const { filePath, startTime, endTime } = data;
      const path = await import('path');
      const fs = await import('fs');
      const { execFile } = await import('child_process');
      const { promisify } = await import('util');
      const execFileAsync = promisify(execFile);

      const ext = path.extname(filePath);
      const baseName = path.basename(filePath, ext);
      const dir = path.dirname(filePath);
      const outputPath = path.join(dir, `${baseName}_clip_${startTime.toFixed(1)}s-${endTime.toFixed(1)}s${ext}`);

      // 尝试使用 ffmpeg
      const ffmpegPath = 'ffmpeg'; // 假设在 PATH 中
      const duration = endTime - startTime;
      try {
        await execFileAsync(ffmpegPath, [
          '-i', filePath,
          '-ss', String(startTime),
          '-t', String(duration),
          '-y',
          '-c', 'copy',
          outputPath,
        ], { timeout: 30000 });
        return { success: true, data: outputPath };
      } catch {
        // ffmpeg 不可用，使用简单复制方式
        fs.copyFileSync(filePath, outputPath);
        return { success: true, data: outputPath };
      }
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  });

  // 导出 JSON
  ipcMain.handle(IPC_CHANNELS.EXPORT_SAMPLES_JSON, async (_event, data: { ids?: number[] }) => {
    try {
      const query = data.ids && data.ids.length > 0
        ? db.select().from(samples).where(inArray(samples.id, data.ids))
        : db.select().from(samples);
      const result = await query;
      const exportData = result.map(s => ({
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
      const rows = result.map(s => [
        s.fileName, s.filePath, s.fileSize, s.duration,
        s.bpm ?? '', s.key ?? '', s.sampleRate, s.bitRate,
        s.channels, s.categoryId ?? '', s.isFavorite ? '是' : '否'
      ]);
      const csv = [headers.join(','), ...rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))].join('\n');
      return { success: true, data: csv };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  });

  // DAW 拖拽：渲染进程 dragstart 时异步通知，主进程启动原生文件拖拽
  // 支持单文件和多文件拖拽
  ipcMain.on('drag:start', (event, data: { filePath: string; name: string; filePaths?: string[] }) => {
    // 多文件模式
    if (data.filePaths && data.filePaths.length > 0) {
      const validPaths = data.filePaths.filter(p => p && fs.existsSync(p));
      if (validPaths.length === 0) return;

      const iconPath = path.join(process.env.VITE_PUBLIC || '', 'appIcon.jpg');
      const icon = fs.existsSync(iconPath) ? nativeImage.createFromPath(iconPath) : nativeImage.createEmpty();

      setImmediate(() => {
        try {
          // Electron startDrag 的 file 参数支持 string | string[]
          (event.sender as any).startDrag({
            file: validPaths.length === 1 ? validPaths[0] : validPaths,
            icon,
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

    const iconPath = path.join(process.env.VITE_PUBLIC || '', 'appIcon.jpg');
    const icon = fs.existsSync(iconPath) ? nativeImage.createFromPath(iconPath) : nativeImage.createEmpty();

    // 延迟到下一个事件循环调用 startDrag，避免 IPC 处理期间阻塞
    setImmediate(() => {
      try {
        event.sender.startDrag({
          file: filePath,
          icon,
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

  // 获取波形数据：优先从数据库读取，回退到实时生成
  ipcMain.handle(IPC_CHANNELS.GET_WAVEFORM, async (_event, data: { filePath: string }) => {
    try {
      const filePath = data.filePath;
      if (!filePath) {
        return { success: false, error: 'No file path' };
      }

      // 1. 优先从独立波形文件读取
      const sampleRow = sqlite.prepare('SELECT id FROM samples WHERE file_path = ?').get(filePath) as { id: number } | undefined;
      if (sampleRow) {
        const fileWaveform = readWaveformFile(sampleRow.id);
        if (fileWaveform) {
          return { success: true, data: fileWaveform };
        }
      }

      // 2. 回退：从数据库 BLOB 读取（兼容旧数据）
      const result = await db.select({ waveformData: samples.waveformData })
        .from(samples)
        .where(eq(samples.filePath, filePath))
        .limit(1);

      if (result.length > 0 && result[0].waveformData) {
        const waveform = decodeWaveform(result[0].waveformData as Buffer);
        return { success: true, data: waveform };
      }

      // 3. 数据库无波形数据，实时生成
      if (!fs.existsSync(filePath)) {
        return { success: false, error: 'File not found' };
      }

      const fileBuffer = fs.readFileSync(filePath);

      if (filePath.toLowerCase().endsWith('.wav')) {
        const waveform = extractWavWaveform(fileBuffer);
        if (waveform) {
          return { success: true, data: waveform };
        }
      }

      const waveform = generatePseudoWaveform(filePath);
      return { success: true, data: waveform };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  });

  // 保存波形数据到 .wf 文件（用于伪随机波形升级为真实波形）
  ipcMain.handle(IPC_CHANNELS.SAVE_WAVEFORM, async (_event, data: { sampleId: number; waveform: number[] }) => {
    try {
      const { sampleId, waveform } = data;
      if (!sampleId || !waveform || waveform.length === 0) {
        return { success: false, error: 'Invalid parameters' };
      }
      writeWaveformFile(sampleId, waveform);
      return { success: true };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  });

  // 获取峰值包络数据（高精度 min/max，支持缩放）
  ipcMain.handle('audio:getPeakEnvelope', async (_event, data: { filePath: string }) => {
    try {
      const { filePath } = data;
      if (!filePath) return { success: false, error: 'No file path' };

      const sampleRow = sqlite.prepare('SELECT id FROM samples WHERE file_path = ?').get(filePath) as { id: number } | undefined;
      if (sampleRow) {
        const peaks = readPeakEnvelopeFile(sampleRow.id);
        if (peaks && peaks.length > 0) {
          return { success: true, data: peaks };
        }
      }
      return { success: false, error: 'No peak envelope data' };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  });

  // 获取音频文件 Buffer（供渲染进程 Web Audio API 解码获取真实波形）
  ipcMain.handle('audio:getBuffer', async (_event, data: { filePath: string }) => {
    try {
      const filePath = data.filePath;
      if (!filePath || !fs.existsSync(filePath)) {
        return { success: false, error: 'File not found' };
      }
      const fileBuffer = fs.readFileSync(filePath);
      // 转为 base64 传输
      const base64 = fileBuffer.toString('base64');
      return { success: true, data: base64 };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  });

  // 批量从文件名补充 BPM/Key（对已有采样中缺少 BPM/Key 的进行补充）
  ipcMain.handle('samples:enrichBpmKey', async () => {
    try {
      // 查找缺少 BPM 和 Key 的采样
      const missing = await db.select({
        id: samples.id,
        fileName: samples.fileName,
      }).from(samples);

      let enriched = 0;
      for (const sample of missing) {
        const parsed = extractBPMAndKey(sample.fileName);
        if (parsed.bpm !== null || parsed.key !== null) {
          const updates: Record<string, any> = {};
          if (parsed.bpm !== null) updates.bpm = parsed.bpm;
          if (parsed.key !== null) updates.key = parsed.key;

          // 只更新当前为空的字段
          await db.update(samples)
            .set(updates)
            .where(eq(samples.id, sample.id));
          enriched++;
        }
      }

      return { success: true, data: { enriched } };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  });

  // ========== 播放列表 ==========

  // 获取所有播放列表
  ipcMain.handle(IPC_CHANNELS.GET_PLAYLISTS, async () => {
    try {
      const result = await db.select({
        id: playlists.id,
        name: playlists.name,
        description: playlists.description,
        coverColor: playlists.coverColor,
        createdAt: playlists.createdAt,
        updatedAt: playlists.updatedAt,
        itemCount: sql<number>`(SELECT COUNT(*) FROM playlist_items WHERE playlist_id = ${playlists.id})`,
      }).from(playlists).orderBy(desc(playlists.updatedAt));
      return { success: true, data: result };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  });

  // 创建播放列表
  ipcMain.handle(IPC_CHANNELS.CREATE_PLAYLIST, async (_event, data: { name: string; description?: string; coverColor?: string }) => {
    try {
      const result = await db.insert(playlists).values({
        name: data.name,
        description: data.description || null,
        coverColor: data.coverColor || '#6366F1',
      }).returning();
      return { success: true, data: result[0] };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  });

  // 更新播放列表
  ipcMain.handle(IPC_CHANNELS.UPDATE_PLAYLIST, async (_event, data: { id: number; name?: string; description?: string; coverColor?: string }) => {
    try {
      const updates: Record<string, any> = { updatedAt: new Date() };
      if (data.name !== undefined) updates.name = data.name;
      if (data.description !== undefined) updates.description = data.description;
      if (data.coverColor !== undefined) updates.coverColor = data.coverColor;
      await db.update(playlists).set(updates).where(eq(playlists.id, data.id));
      return { success: true, data: null };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  });

  // 删除播放列表
  ipcMain.handle(IPC_CHANNELS.DELETE_PLAYLIST, async (_event, data: { id: number }) => {
    try {
      await db.delete(playlists).where(eq(playlists.id, data.id));
      return { success: true, data: null };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  });

  // 获取播放列表内的采样
  ipcMain.handle(IPC_CHANNELS.GET_PLAYLIST_ITEMS, async (_event, data: { playlistId: number }) => {
    try {
      const result = await db.select({
        id: playlistItems.id,
        playlistId: playlistItems.playlistId,
        sampleId: playlistItems.sampleId,
        sortOrder: playlistItems.sortOrder,
        addedAt: playlistItems.addedAt,
        sampleId2: samples.id,
        filePath: samples.filePath,
        fileName: samples.fileName,
        fileSize: samples.fileSize,
        duration: samples.duration,
        sampleRate: samples.sampleRate,
        bitRate: samples.bitRate,
        channels: samples.channels,
        bpm: samples.bpm,
        key: samples.key,
        categoryId: samples.categoryId,
        isFavorite: samples.isFavorite,
        playCount: samples.playCount,
      }).from(playlistItems)
        .innerJoin(samples, eq(playlistItems.sampleId, samples.id))
        .where(eq(playlistItems.playlistId, data.playlistId))
        .orderBy(playlistItems.sortOrder);

      const items = result.map(r => ({
        id: r.id,
        playlistId: r.playlistId,
        sampleId: r.sampleId,
        sortOrder: r.sortOrder,
        addedAt: r.addedAt,
        sample: {
          id: r.sampleId2,
          filePath: r.filePath,
          fileName: r.fileName,
          fileSize: r.fileSize,
          duration: r.duration,
          sampleRate: r.sampleRate,
          bitRate: r.bitRate,
          channels: r.channels,
          bpm: r.bpm,
          key: r.key,
          categoryId: r.categoryId,
          isFavorite: r.isFavorite,
          playCount: r.playCount,
        },
      }));

      return { success: true, data: items };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  });

  // 添加采样到播放列表
  ipcMain.handle(IPC_CHANNELS.ADD_TO_PLAYLIST, async (_event, data: { playlistId: number; sampleIds: number[] }) => {
    try {
      // 获取当前最大 sortOrder
      const maxOrder = await db.select({ maxOrder: sql<number>`COALESCE(MAX(${playlistItems.sortOrder}), -1)` })
        .from(playlistItems)
        .where(eq(playlistItems.playlistId, data.playlistId));
      let sortOrder = (maxOrder[0]?.maxOrder ?? -1) + 1;

      // 批量插入（忽略已存在的）
      for (const sampleId of data.sampleIds) {
        try {
          await db.insert(playlistItems).values({
            playlistId: data.playlistId,
            sampleId,
            sortOrder: sortOrder++,
          });
        } catch {
          // UNIQUE 约束冲突，忽略
        }
      }

      // 更新播放列表的 updatedAt
      await db.update(playlists).set({ updatedAt: new Date() }).where(eq(playlists.id, data.playlistId));

      return { success: true, data: null };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  });

  // 从播放列表移除采样
  ipcMain.handle(IPC_CHANNELS.REMOVE_FROM_PLAYLIST, async (_event, data: { playlistId: number; sampleId: number }) => {
    try {
      await db.delete(playlistItems)
        .where(and(eq(playlistItems.playlistId, data.playlistId), eq(playlistItems.sampleId, data.sampleId)));
      await db.update(playlists).set({ updatedAt: new Date() }).where(eq(playlists.id, data.playlistId));
      return { success: true, data: null };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  });

  // 重排播放列表
  ipcMain.handle(IPC_CHANNELS.REORDER_PLAYLIST, async (_event, data: { playlistId: number; sampleIds: number[] }) => {
    try {
      for (let i = 0; i < data.sampleIds.length; i++) {
        await db.update(playlistItems)
          .set({ sortOrder: i })
          .where(and(eq(playlistItems.playlistId, data.playlistId), eq(playlistItems.sampleId, data.sampleIds[i])));
      }
      await db.update(playlists).set({ updatedAt: new Date() }).where(eq(playlists.id, data.playlistId));
      return { success: true, data: null };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  });

  // 导出播放列表为 M3U
  ipcMain.handle(IPC_CHANNELS.EXPORT_PLAYLIST, async (_event, data: { playlistId: number; format: 'm3u' | 'm3u8' }) => {
    try {
      const playlist = await db.select().from(playlists).where(eq(playlists.id, data.playlistId));
      if (!playlist.length) return { success: false, error: 'Playlist not found' };

      const items = await db.select({ filePath: samples.filePath })
        .from(playlistItems)
        .innerJoin(samples, eq(playlistItems.sampleId, samples.id))
        .where(eq(playlistItems.playlistId, data.playlistId))
        .orderBy(playlistItems.sortOrder);

      const ext = data.format === 'm3u8' ? '.m3u8' : '.m3u';
      const header = data.format === 'm3u8' ? '#EXTM3U\n' : '#EXTM3U\n';
      let content = header + `#PLAYLIST:${playlist[0].name}\n`;
      for (const item of items) {
        content += `${item.filePath}\n`;
      }

      const saveResult = await dialog.showSaveDialog(BrowserWindow.getFocusedWindow()!, {
        title: '导出播放列表',
        defaultPath: `${playlist[0].name}${ext}`,
        filters: [{ name: 'M3U 播放列表', extensions: ['m3u', 'm3u8'] }],
      });

      if (saveResult.filePath) {
        fs.writeFileSync(saveResult.filePath, content, 'utf-8');
        return { success: true, data: saveResult.filePath };
      }
      return { success: true, data: null };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  });

  // ===== 智能文件夹 =====
  ipcMain.handle(IPC_CHANNELS.GET_SMART_FOLDERS, async () => {
    try {
      const rows = sqlite.prepare('SELECT * FROM smart_folders ORDER BY sort_order, id').all();
      return { success: true, data: rows };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  });

  ipcMain.handle(IPC_CHANNELS.CREATE_SMART_FOLDER, async (_event, data: { name: string; query: string; filters: string; icon?: string; color?: string }) => {
    try {
      const maxOrder = sqlite.prepare('SELECT COALESCE(MAX(sort_order), 0) + 1 as next FROM smart_folders').get() as { next: number };
      const stmt = sqlite.prepare('INSERT INTO smart_folders (name, query, filters, icon, color, sort_order) VALUES (?, ?, ?, ?, ?, ?)');
      const result = stmt.run(data.name, data.query || '', data.filters || '{}', data.icon || 'folder', data.color || '', maxOrder.next);
      return { success: true, data: { id: result.lastInsertRowid } };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  });

  ipcMain.handle(IPC_CHANNELS.UPDATE_SMART_FOLDER, async (_event, data: { id: number; name?: string; query?: string; filters?: string; icon?: string; color?: string }) => {
    try {
      const sets: string[] = [];
      const values: any[] = [];
      if (data.name !== undefined) { sets.push('name = ?'); values.push(data.name); }
      if (data.query !== undefined) { sets.push('query = ?'); values.push(data.query); }
      if (data.filters !== undefined) { sets.push('filters = ?'); values.push(data.filters); }
      if (data.icon !== undefined) { sets.push('icon = ?'); values.push(data.icon); }
      if (data.color !== undefined) { sets.push('color = ?'); values.push(data.color); }
      sets.push('updated_at = unixepoch()');
      values.push(data.id);
      sqlite.prepare(`UPDATE smart_folders SET ${sets.join(', ')} WHERE id = ?`).run(...values);
      return { success: true };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  });

  ipcMain.handle(IPC_CHANNELS.DELETE_SMART_FOLDER, async (_event, data: { id: number }) => {
    try {
      sqlite.prepare('DELETE FROM smart_folders WHERE id = ?').run(data.id);
      return { success: true };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  });

  ipcMain.handle(IPC_CHANNELS.QUERY_SMART_FOLDER, async (_event, data: { id: number; page?: number; pageSize?: number }) => {
    try {
      const folder = sqlite.prepare('SELECT * FROM smart_folders WHERE id = ?').get(data.id) as any;
      if (!folder) return { success: false, error: 'Smart folder not found' };

      const filters = JSON.parse(folder.filters || '{}');
      const page = data.page || 1;
      const pageSize = data.pageSize || 100;
      const offset = (page - 1) * pageSize;

      // 构建查询条件
      const conditions: string[] = [];
      const params: any[] = [];

      if (folder.query) {
        conditions.push('s.id IN (SELECT rowid FROM samples_fts WHERE samples_fts MATCH ?)');
        params.push(folder.query);
      }
      if (filters.categoryId) {
        conditions.push('s.category_id = ?');
        params.push(filters.categoryId);
      }
      if (filters.bpmMin) {
        conditions.push('s.bpm >= ?');
        params.push(filters.bpmMin);
      }
      if (filters.bpmMax) {
        conditions.push('s.bpm <= ?');
        params.push(filters.bpmMax);
      }
      if (filters.key) {
        conditions.push('s.key = ?');
        params.push(filters.key);
      }
      if (filters.isFavorite) {
        conditions.push('s.is_favorite = 1');
      }
      if (filters.tagIds && filters.tagIds.length > 0) {
        conditions.push(`s.id IN (SELECT sample_id FROM sample_tags WHERE tag_id IN (${filters.tagIds.map(() => '?').join(',')}))`);
        params.push(...filters.tagIds);
      }

      const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
      const countRow = sqlite.prepare(`SELECT COUNT(*) as total FROM samples s ${where}`).get(...params) as { total: number };
      const rows = sqlite.prepare(
        `SELECT s.*, c.name as category_name FROM samples s LEFT JOIN categories c ON s.category_id = c.id ${where} ORDER BY s.file_name LIMIT ? OFFSET ?`
      ).all(...params, pageSize, offset);

      return { success: true, data: { samples: rows, total: countRow.total, page, pageSize } };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  });

  // ===== 使用统计 =====
  ipcMain.handle(IPC_CHANNELS.RECORD_PLAY, async (_event, data: { sampleId: number }) => {
    try {
      const now = Math.floor(Date.now() / 1000);
      sqlite.prepare(`
        INSERT INTO usage_stats (sample_id, play_count, last_played_at, first_played_at)
        VALUES (?, 1, ?, ?)
        ON CONFLICT(sample_id) DO UPDATE SET
          play_count = play_count + 1,
          last_played_at = ?
      `).run(data.sampleId, now, now, now);
      return { success: true };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  });

  ipcMain.handle(IPC_CHANNELS.GET_USAGE_STATS, async () => {
    try {
      const totalPlays = sqlite.prepare('SELECT SUM(play_count) as total FROM usage_stats').get() as { total: number | null };
      const uniqueSamples = sqlite.prepare('SELECT COUNT(*) as count FROM usage_stats WHERE play_count > 0').get() as { count: number };
      const avgPlays = sqlite.prepare('SELECT AVG(play_count) as avg FROM usage_stats WHERE play_count > 0').get() as { avg: number | null };
      const neverPlayed = sqlite.prepare('SELECT COUNT(*) as count FROM samples WHERE id NOT IN (SELECT sample_id FROM usage_stats)').get() as { count: number };
      return {
        success: true,
        data: {
          totalPlays: totalPlays.total || 0,
          uniqueSamples: uniqueSamples.count,
          avgPlays: Math.round((avgPlays.avg || 0) * 10) / 10,
          neverPlayed: neverPlayed.count,
        },
      };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  });

  ipcMain.handle(IPC_CHANNELS.GET_MOST_PLAYED, async (_event, data: { limit?: number }) => {
    try {
      const limit = data.limit || 20;
      const rows = sqlite.prepare(`
        SELECT s.*, u.play_count, u.last_played_at, c.name as category_name
        FROM usage_stats u
        JOIN samples s ON u.sample_id = s.id
        LEFT JOIN categories c ON s.category_id = c.id
        ORDER BY u.play_count DESC
        LIMIT ?
      `).all(limit);
      return { success: true, data: rows };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  });

  ipcMain.handle(IPC_CHANNELS.GET_LEAST_PLAYED, async (_event, data: { limit?: number }) => {
    try {
      const limit = data.limit || 20;
      const rows = sqlite.prepare(`
        SELECT s.*, COALESCE(u.play_count, 0) as play_count, u.last_played_at, c.name as category_name
        FROM samples s
        LEFT JOIN usage_stats u ON u.sample_id = s.id
        LEFT JOIN categories c ON s.category_id = c.id
        ORDER BY COALESCE(u.play_count, 0) ASC, s.file_name ASC
        LIMIT ?
      `).all(limit);
      return { success: true, data: rows };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  });

  // ===== 空白检测 =====
  ipcMain.handle(IPC_CHANNELS.DETECT_SILENCE, async (_event, data: { filePath: string; threshold?: number }) => {
    try {
      const result = detectSilence(data.filePath, data.threshold);
      if (!result) return { success: false, error: 'Cannot detect silence for this format' };
      return { success: true, data: result };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  });

  // ── MIDI 解析 ──────────────────────────────────
  // 解析 MIDI 文件元数据
  ipcMain.handle(IPC_CHANNELS.PARSE_MIDI, async (_event, data: { filePath: string }) => {
    try {
      if (!isMidiFile(data.filePath)) {
        return { success: false, error: 'Not a MIDI file' };
      }
      const metadata = await parseMidiFile(data.filePath);
      return { success: true, data: metadata };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  });

  // 获取 MIDI 文件预览数据（音符列表，用于钢琴卷帘渲染）
  ipcMain.handle(IPC_CHANNELS.GET_MIDI_PREVIEW, async (_event, data: { filePath: string }) => {
    try {
      if (!isMidiFile(data.filePath)) {
        return { success: false, error: 'Not a MIDI file' };
      }
      const { Midi } = await import('@tonejs/midi');
      const buffer = await import('fs/promises').then(fs => fs.readFile(data.filePath));
      const midi = new Midi(buffer);

      const tracks = midi.tracks.map(track => ({
        name: track.name || `Track ${(track as any).channel + 1}`,
        channel: (track as any).channel,
        notes: track.notes.map(note => ({
          midi: note.midi,
          time: note.time,
          duration: note.duration,
          velocity: note.velocity,
          name: note.name,
        })),
        instrument: track.instrument?.name || null,
      }));

      return {
        success: true,
        data: {
          duration: midi.duration,
          tracks,
          header: {
            tempos: midi.header.tempos.map((t: any) => ({ bpm: t.bpm, time: t.time ?? t.ticks })),
            timeSignatures: midi.header.timeSignatures.map((ts: any) => ({
              timeSignature: ts.timeSignature,
              time: ts.time ?? ts.ticks,
            })),
            keySignatures: midi.header.keySignatures.map((ks: any) => ({
              key: ks.key,
              scale: ks.scale,
              time: ks.time ?? ks.ticks,
            })),
          },
        },
      };
    } catch (error) {
      return { success: false, error: (error as Error).message };
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
      const row = sqlite.prepare('SELECT file_path, file_name FROM samples WHERE id = ?').get(data.sampleId) as { file_path: string; file_name: string } | undefined;
      if (!row) return { success: false, error: 'Sample not found' };

      const dir = path.dirname(row.file_path);
      const newPath = path.join(dir, data.newName);

      // 检查目标文件是否已存在
      if (fs.existsSync(newPath) && newPath !== row.file_path) {
        return { success: false, error: 'File already exists' };
      }

      // 重命名文件
      fs.renameSync(row.file_path, newPath);

      // 更新数据库
      sqlite.prepare('UPDATE samples SET file_path = ?, file_name = ? WHERE id = ?').run(newPath, data.newName, data.sampleId);

      return { success: true, data: { newPath } };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  });

  // ===== 采样分享 - 打包采样+元数据导出 =====
  ipcMain.handle(IPC_CHANNELS.EXPORT_SAMPLES_PACKAGE, async (_event, data: { sampleIds: number[] }) => {
    try {
      if (!data.sampleIds || data.sampleIds.length === 0) {
        return { success: false, error: 'No samples selected' };
      }

      // 查询采样数据
      const placeholders = data.sampleIds.map(() => '?').join(',');
      const rows = sqlite.prepare(`
        SELECT s.*, c.name as category_name,
               GROUP_CONCAT(t.name) as tag_names
        FROM samples s
        LEFT JOIN categories c ON s.category_id = c.id
        LEFT JOIN sample_tags st ON s.id = st.sample_id
        LEFT JOIN tags t ON st.tag_id = t.id
        WHERE s.id IN (${placeholders})
        GROUP BY s.id
      `).all(...data.sampleIds) as any[];

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
  }) => {
    try {
      // 选择保存目录（使用第一个监视文件夹）
      const folders = sqlite.prepare('SELECT path FROM watched_folders LIMIT 1').all() as { path: string }[];
      const saveDir = folders.length > 0 ? folders[0].path : '';

      if (!saveDir) {
        return { success: false, error: '没有可用的监视文件夹，请先添加文件夹' };
      }

      const targetPath = path.join(saveDir, data.fileName);

      // 检查文件是否已存在
      if (fs.existsSync(targetPath)) {
        return { success: false, error: '文件已存在' };
      }

      await downloadOnlineSample(data.url, targetPath, data.headers);

      // 触发重新扫描该文件夹
      const { scanFolder: doScan } = await import('./fileScanner');
      try {
        await doScan(saveDir);
      } catch (err) {
        console.error('[Download] Rescan failed:', err);
      }

      return { success: true, data: { path: targetPath } };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  });

  // ===== 获取 SND.dev 分类 =====
  ipcMain.handle(IPC_CHANNELS.ONLINE_GET_SNDDEV_CATEGORIES, async () => {
    return { success: true, data: getSnddevCategories() };
  });
}
/**
 * 创建简易 ZIP 文件缓冲区
 * 支持 Store（不压缩）和 Deflate 压缩
 */
function createZipBuffer(entries: { name: string; data: Buffer; compressed: boolean }[]): Buffer {
  const localHeaders: Buffer[] = [];
  const centralHeaders: Buffer[] = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBytes = Buffer.from(entry.name, 'utf8');
    let fileData = entry.data;
    let compressionMethod = 0; // Store
    let compressedSize = fileData.length;
    const crc = crc32(fileData);

    if (entry.compressed) {
      const deflated = zlib.deflateRawSync(fileData);
      if (deflated.length < fileData.length) {
        fileData = deflated;
        compressionMethod = 8; // Deflate
        compressedSize = fileData.length;
      }
    }

    // Local File Header (30 + name length + data)
    const localHeader = Buffer.alloc(30 + nameBytes.length);
    localHeader.writeUInt32LE(0x04034b50, 0);   // Signature
    localHeader.writeUInt16LE(20, 4);             // Version needed
    localHeader.writeUInt16LE(0, 6);              // Flags
    localHeader.writeUInt16LE(compressionMethod, 8); // Compression
    localHeader.writeUInt16LE(0, 10);             // Mod time
    localHeader.writeUInt16LE(0, 12);             // Mod date
    localHeader.writeUInt32LE(crc, 14);           // CRC-32
    localHeader.writeUInt32LE(compressedSize, 18); // Compressed size
    localHeader.writeUInt32LE(entry.data.length, 22); // Uncompressed size
    localHeader.writeUInt16LE(nameBytes.length, 26); // Name length
    localHeader.writeUInt16LE(0, 28);             // Extra length
    nameBytes.copy(localHeader, 30);

    localHeaders.push(localHeader);
    localHeaders.push(fileData);

    // Central Directory Header
    const centralHeader = Buffer.alloc(46 + nameBytes.length);
    centralHeader.writeUInt32LE(0x02014b50, 0);  // Signature
    centralHeader.writeUInt16LE(20, 4);            // Version made by
    centralHeader.writeUInt16LE(20, 6);            // Version needed
    centralHeader.writeUInt16LE(0, 8);             // Flags
    centralHeader.writeUInt16LE(compressionMethod, 10);
    centralHeader.writeUInt16LE(0, 12);            // Mod time
    centralHeader.writeUInt16LE(0, 14);            // Mod date
    centralHeader.writeUInt32LE(crc, 16);
    centralHeader.writeUInt32LE(compressedSize, 20);
    centralHeader.writeUInt32LE(entry.data.length, 24);
    centralHeader.writeUInt16LE(nameBytes.length, 28);
    centralHeader.writeUInt16LE(0, 30);            // Extra length
    centralHeader.writeUInt16LE(0, 32);            // Comment length
    centralHeader.writeUInt16LE(0, 34);            // Disk number
    centralHeader.writeUInt16LE(0, 36);            // Internal attrs
    centralHeader.writeUInt32LE(0, 38);            // External attrs
    centralHeader.writeUInt32LE(offset, 42);       // Local header offset
    nameBytes.copy(centralHeader, 46);

    centralHeaders.push(centralHeader);
    offset += localHeader.length + fileData.length;
  }

  const centralDirOffset = offset;
  let centralDirSize = 0;
  for (const ch of centralHeaders) centralDirSize += ch.length;

  // End of Central Directory
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);   // Signature
  eocd.writeUInt16LE(0, 4);             // Disk number
  eocd.writeUInt16LE(0, 6);             // Central dir disk
  eocd.writeUInt16LE(entries.length, 8); // Entries on disk
  eocd.writeUInt16LE(entries.length, 10); // Total entries
  eocd.writeUInt32LE(centralDirSize, 12); // Central dir size
  eocd.writeUInt32LE(centralDirOffset, 16); // Central dir offset
  eocd.writeUInt16LE(0, 20);            // Comment length

  return Buffer.concat([...localHeaders, ...centralHeaders, eocd]);
}

/** CRC-32 计算 */
function crc32(data: Buffer): number {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < data.length; i++) {
    crc ^= data[i];
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xEDB88320 : 0);
    }
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function extractWavWaveform(buffer: Buffer): number[] | null {
  const SAMPLES = 200;

  try {
    const riff = buffer.toString('ascii', 0, 4);
    if (riff !== 'RIFF') return null;

    // 找到 data chunk
    let offset = 12;
    while (offset < buffer.length - 8) {
      const chunkId = buffer.toString('ascii', offset, offset + 4);
      const chunkSize = buffer.readUInt32LE(offset + 4);
      if (chunkId === 'data') {
        const dataStart = offset + 8;
        const pcmData = buffer.subarray(dataStart, Math.min(dataStart + chunkSize, buffer.length));

        // 16-bit PCM
        const sampleCount = Math.floor(pcmData.length / 2);
        const blockSize = Math.floor(sampleCount / SAMPLES);
        if (blockSize === 0) return null;

        const waveform: number[] = [];
        for (let i = 0; i < SAMPLES; i++) {
          let sum = 0;
          const start = i * blockSize * 2;
          for (let j = 0; j < blockSize && (start + j * 2 + 1) < pcmData.length; j++) {
            const sample = pcmData.readInt16LE(start + j * 2);
            sum += Math.abs(sample);
          }
          waveform.push(sum / blockSize / 32768);
        }

        // 归一化
        const max = Math.max(...waveform);
        if (max > 0) {
          for (let i = 0; i < waveform.length; i++) {
            waveform[i] = waveform[i] / max;
          }
        }

        return waveform;
      }
      offset += 8 + chunkSize;
    }
  } catch {
    // 解析失败
  }

  return null;
}

// 伪随机波形（非 WAV 文件回退）
function generatePseudoWaveform(filePath: string): number[] {
  const SAMPLES = 200;
  const seed = filePath.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
  const waveform: number[] = [];
  for (let i = 0; i < SAMPLES; i++) {
    const x = Math.sin(seed * 9301 + i * 49297 + 233280) * 49297;
    const v = x - Math.floor(x);
    waveform.push(v * 0.6 + 0.2);
  }
  return waveform;
}
