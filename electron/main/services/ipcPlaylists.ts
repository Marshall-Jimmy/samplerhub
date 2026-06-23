import { ipcMain, dialog, BrowserWindow } from 'electron';
import { IPC_CHANNELS } from '../../../shared/types/ipc.types';
import type { IpcContext } from './ipcTypes';
import { playlists, playlistItems, samples } from '../../../drizzle/schema';
import { eq, sql, desc, inArray, and } from 'drizzle-orm';
import path from 'node:path';
import fs from 'node:fs';

export function registerPlaylistHandlers(ctx: IpcContext): void {
  const { db, sqlite } = ctx;

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

      const items = result.map((r: typeof result[0]) => ({
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
}
