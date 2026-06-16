import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '../../../shared/types/ipc.types';
import type { IpcContext } from './ipcTypes';
import { classificationRules } from '../../../drizzle/schema';
import { eq, desc } from 'drizzle-orm';

export function registerClassificationHandlers(ctx: IpcContext): void {
  const { db } = ctx;

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
}
