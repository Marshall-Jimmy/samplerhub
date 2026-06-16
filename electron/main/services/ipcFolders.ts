import { ipcMain, dialog, BrowserWindow } from 'electron';
import { IPC_CHANNELS } from '../../../shared/types/ipc.types';
import type { IpcContext } from './ipcTypes';
import { watchedFolders, samples } from '../../../drizzle/schema';
import { eq, sql, desc } from 'drizzle-orm';
import { scanFolder, abortScan } from './fileScanner';
import { startWatching, stopWatching } from './fileWatcher';
import { classifyAllSamples, classifySampleById } from './classifier';
import { detectSilence } from './waveformGenerator';
import { validatePath, validatePositiveInt } from './ipcValidation';

export function registerFoldersHandlers(ctx: IpcContext): void {
  const { db, sqlite } = ctx;

  // 添加监控文件夹
  ipcMain.handle(IPC_CHANNELS.ADD_WATCHED_FOLDER, async (_event, data: { path: string }) => {
    try {
      const folderPath = validatePath(data?.path, 'folder path');
      await db.insert(watchedFolders).values({ path: folderPath }).onConflictDoNothing();
      startWatching(folderPath);
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
      const folderPath = validatePath(data?.path, 'folder path');
      stopWatching(folderPath);
      await db.delete(watchedFolders).where(eq(watchedFolders.path, folderPath));
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
      const watchedPaths = watchedResult.map((w: { path: string }) => w.path.replace(/\\/g, '/'));

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
      const folderPath = validatePath(data?.folderPath, 'folder path');
      const result = await scanFolder(folderPath, (progress) => {
        const windows = BrowserWindow.getAllWindows();
        windows.forEach((w: Electron.BrowserWindow) => {
          if (!w.isDestroyed()) {
            w.webContents.send(IPC_CHANNELS.SCAN_PROGRESS, {
              ...progress,
              folderPath: folderPath,
            });
          }
        });
      });
      return { success: true, data: result };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  });

  // 开始扫描（打开文件夹对话框）
  ipcMain.handle(IPC_CHANNELS.START_SCAN, async (_event, data?: { folderPath?: string | null }) => {
    try {
      // 如果传入了 folderPath，直接使用；否则打开对话框
      let filePaths: string[];
      if (data?.folderPath) {
        filePaths = [data.folderPath];
      } else {
        const win = BrowserWindow.getFocusedWindow();
        const result = await dialog.showOpenDialog(win!, {
          properties: ['openDirectory', 'multiSelections'],
          title: '选择采样文件夹（可多选）',
        });
        if (result.canceled || result.filePaths.length === 0) {
          return { success: true, data: null };
        }
        filePaths = result.filePaths;
      }

      let totalAdded = 0, totalUpdated = 0, totalDeleted = 0;
      for (const folderPath of filePaths) {
        await db.insert(watchedFolders).values({ path: folderPath }).onConflictDoNothing();
        const scanResult = await scanFolder(folderPath, (progress) => {
          const windows = BrowserWindow.getAllWindows();
          windows.forEach((w: Electron.BrowserWindow) => {
            if (!w.isDestroyed()) {
              w.webContents.send(IPC_CHANNELS.SCAN_PROGRESS, {
                ...progress,
                folderPath,
              });
            }
          });
        });
        totalAdded += scanResult.added;
        totalUpdated += scanResult.updated;
        totalDeleted += scanResult.deleted;
      }
      return { success: true, data: { folderPath: filePaths.join('; '), added: totalAdded, updated: totalUpdated, deleted: totalDeleted } };
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
}
