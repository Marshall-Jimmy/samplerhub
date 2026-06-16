import { ipcMain } from 'electron';
import {
  analysisQueueManager,
  ANALYSIS_PRESETS,
  estimateAnalysisTime,
  type AnalysisConfig,
} from './analysisQueue';

/**
 * 注册所有分析相关的 IPC handler
 * 提供分析会话的创建、控制、进度查询等功能
 */
export function registerAnalysisIpcHandlers(): void {

  // ── 1. 创建分析会话 ──────────────────────────────────────────────
  ipcMain.handle('analysis:createSession', async (_event, data: {
    name: string;
    sampleIds: number[];
    config: AnalysisConfig;
  }) => {
    try {
      const { sessionId, estimatedTimeMs } = await analysisQueueManager.createSession(
        data.name,
        data.sampleIds,
        data.config,
      );
      return {
        success: true,
        data: { sessionId, estimatedTimeMs },
      };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  });

  // ── 2. 开始分析 ──────────────────────────────────────────────────
  ipcMain.handle('analysis:startSession', async (_event, data: { sessionId: number }) => {
    try {
      await analysisQueueManager.startSession(data.sessionId);
      return { success: true };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  });

  // ── 3. 暂停分析 ──────────────────────────────────────────────────
  ipcMain.handle('analysis:pauseSession', async (_event, data: { sessionId: number }) => {
    try {
      await analysisQueueManager.pauseSession(data.sessionId);
      return { success: true };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  });

  // ── 4. 恢复分析（断点续传） ──────────────────────────────────────
  ipcMain.handle('analysis:resumeSession', async (_event, data: { sessionId: number }) => {
    try {
      await analysisQueueManager.resumeSession(data.sessionId);
      return { success: true };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  });

  // ── 5. 取消分析 ──────────────────────────────────────────────────
  ipcMain.handle('analysis:cancelSession', async (_event, data: { sessionId: number }) => {
    try {
      await analysisQueueManager.cancelSession(data.sessionId);
      return { success: true };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  });

  // ── 6. 获取当前进度 ──────────────────────────────────────────────
  ipcMain.handle('analysis:getProgress', async (_event, data: { sessionId: number }) => {
    try {
      const progress = await analysisQueueManager.getProgress(data.sessionId);
      return {
        success: true,
        data: progress,
      };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  });

  // ── 7. 获取未完成的会话（启动时检查） ────────────────────────────
  ipcMain.handle('analysis:getIncompleteSessions', async () => {
    try {
      const sessions = await analysisQueueManager.getIncompleteSessions();
      return {
        success: true,
        data: sessions,
      };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  });

  // ── 8. 获取所有会话列表 ──────────────────────────────────────────
  ipcMain.handle('analysis:getSessions', async () => {
    try {
      const sessions = await analysisQueueManager.getSessions();
      return {
        success: true,
        data: sessions,
      };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  });

  // ── 9. 获取分析方案预设 ──────────────────────────────────────────
  ipcMain.handle('analysis:getPresets', async () => {
    try {
      return {
        success: true,
        data: ANALYSIS_PRESETS,
      };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  });

  // ── 10. 预估分析时间 ─────────────────────────────────────────────
  ipcMain.handle('analysis:estimateTime', async (_event, data: {
    fileCount: number;
    config: AnalysisConfig;
  }) => {
    try {
      const estimatedTimeMs = estimateAnalysisTime(data.fileCount, data.config);
      // 格式化预估时间为可读字符串
      const seconds = Math.ceil(estimatedTimeMs / 1000);
      const minutes = Math.floor(seconds / 60);
      const remainingSeconds = seconds % 60;
      const formattedTime = minutes > 0
        ? `${minutes} 分 ${remainingSeconds} 秒`
        : `${remainingSeconds} 秒`;

      return {
        success: true,
        data: { estimatedTimeMs, formattedTime },
      };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  });
}
