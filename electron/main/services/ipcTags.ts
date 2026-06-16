import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '../../../shared/types/ipc.types';
import type { IpcContext } from './ipcTypes';
import { tags, samples, sampleTags, recentSamples } from '../../../drizzle/schema';
import { eq, and, sql, desc, inArray } from 'drizzle-orm';
import { validatePositiveInt } from './ipcValidation';

export function registerTagsHandlers(ctx: IpcContext): void {
  const { db, sqlite, sampleListFields } = ctx;

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
      const name = data?.name;
      if (!name || typeof name !== 'string') {
        return { success: false, error: 'tag name is required' };
      }
      await db.insert(tags).values({ name, color: data?.color || '#1890ff' });
      const result = await db.select().from(tags).where(eq(tags.name, name));
      return { success: true, data: result[0] };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  });

  // 删除标签
  ipcMain.handle(IPC_CHANNELS.DELETE_TAG, async (_event, data: { tagId: number }) => {
    try {
      const tagId = validatePositiveInt(data?.tagId, 'tagId');
      await db.delete(sampleTags).where(eq(sampleTags.tagId, tagId));
      await db.delete(tags).where(eq(tags.id, tagId));
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
      const sampleId = validatePositiveInt(data?.sampleId, 'sampleId');
      const sample = await db.select().from(samples).where(eq(samples.id, sampleId)).get();
      if (!sample) {
        return { success: false, error: 'Sample not found' };
      }

      const newFavorite = !sample.isFavorite;
      await db.update(samples).set({ isFavorite: newFavorite }).where(eq(samples.id, sampleId));

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
      result.sort((a: typeof result[0], b: typeof result[0]) => (orderMap.get(a.id) ?? 999) - (orderMap.get(b.id) ?? 999));

      return { success: true, data: result };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  });
}
