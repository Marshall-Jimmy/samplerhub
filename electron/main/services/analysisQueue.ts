/**
 * 分析队列管理器
 *
 * 管理音频采样的后台分析任务（CLAP embedding、PANNs SED、Essentia 特征提取）。
 * 支持创建分析会话、暂停/恢复/取消、断点续传、进度追踪等功能。
 * processFile 目前是占位实现（模拟耗时），后续对接 Python sidecar 时替换。
 */

import { getDatabase } from './database';
import { samples, analysisSessions, analysisQueue, audioSegments } from '../../../drizzle/schema';
import { eq, and, sql, inArray } from 'drizzle-orm';
import { BrowserWindow } from 'electron';
import { analyzeAudioFile, initEssentia } from './audioAnalyzer';

// ── 分析配置接口 ──────────────────────────────────────────────────────

/** 分析配置：控制启用哪些分析工具及并发数 */
export interface AnalysisConfig {
  enableCLAP: boolean;      // CLAP 语义 embedding
  enablePANNs: boolean;     // PANNs 声音事件检测
  enableEssentia: boolean;   // Essentia 传统特征（BPM/频谱等）
  concurrency: number;       // 并发数 (1-4)
}

// ── 分析方案预设 ──────────────────────────────────────────────────────

/** 预定义的分析方案，用户也可选择自定义 */
export const ANALYSIS_PRESETS: Record<string, { label: string; config: AnalysisConfig; description: string }> = {
  quick: {
    label: 'Quick',
    config: { enableCLAP: true, enablePANNs: false, enableEssentia: false, concurrency: 2 },
    description: '仅 CLAP 语义 embedding，适合快速获得搜索能力',
  },
  balanced: {
    label: 'Balanced',
    config: { enableCLAP: true, enablePANNs: true, enableEssentia: false, concurrency: 2 },
    description: 'CLAP + PANNs，语义搜索 + 声音事件标签',
  },
  thorough: {
    label: 'Thorough',
    config: { enableCLAP: true, enablePANNs: true, enableEssentia: true, concurrency: 1 },
    description: '全部启用，最完整但最慢',
  },
  custom: {
    label: 'Custom',
    config: { enableCLAP: true, enablePANNs: true, enableEssentia: true, concurrency: 2 },
    description: '自定义方案',
  },
};

// ── 时间预估 ──────────────────────────────────────────────────────────

/** 每个工具的单文件平均耗时（毫秒） */
const AVG_TIME_MS = { clap: 800, panns: 1500, essentia: 200 };

/**
 * 根据文件数量和分析配置预估总耗时
 * @param fileCount 文件数量
 * @param config 分析配置
 * @returns 预估耗时（毫秒）
 */
export function estimateAnalysisTime(fileCount: number, config: AnalysisConfig): number {
  let perFile = 0;
  if (config.enableCLAP) perFile += AVG_TIME_MS.clap;
  if (config.enablePANNs) perFile += AVG_TIME_MS.panns;
  if (config.enableEssentia) perFile += AVG_TIME_MS.essentia;
  return Math.ceil(fileCount * perFile / config.concurrency);
}

// ── 分析队列管理器 ────────────────────────────────────────────────────

export class AnalysisQueueManager {
  private currentSessionId: number | null = null;
  private isRunning = false;
  private isPaused = false;
  private startTime: number | null = null;
  private timerInterval: ReturnType<typeof setInterval> | null = null;

  // ── 创建分析会话 ──────────────────────────────────────────────────

  /**
   * 创建一个新的分析会话，并为每个采样生成队列项
   * @param name 会话名称
   * @param sampleIds 待分析的采样 ID 列表
   * @param config 分析配置
   * @returns sessionId 和预估耗时
   */
  async createSession(
    name: string,
    sampleIds: number[],
    config: AnalysisConfig,
  ): Promise<{ sessionId: number; estimatedTimeMs: number }> {
    const db = getDatabase();

    // 1. 计算预估时间
    const estimatedTimeMs = estimateAnalysisTime(sampleIds.length, config);

    // 2. 创建 session 记录
    const [session] = await db.insert(analysisSessions).values({
      name,
      config: JSON.stringify(config),
      totalFiles: sampleIds.length,
      completedFiles: 0,
      failedFiles: 0,
      status: 'pending',
      estimatedTimeMs,
      elapsedTimeMs: 0,
    }).returning();

    const sessionId = session.id;

    // 3. 为每个 sampleId 创建 queue item（taskType 根据配置决定）
    const taskType = this.resolveTaskType(config);
    const queueItems = sampleIds.map((sampleId) => ({
      sessionId,
      sampleId,
      taskType,
      status: 'pending' as const,
    }));

    // 分批插入，避免单次 SQL 过长
    const BATCH_SIZE = 500;
    for (let i = 0; i < queueItems.length; i += BATCH_SIZE) {
      const batch = queueItems.slice(i, i + BATCH_SIZE);
      await db.insert(analysisQueue).values(batch);
    }

    return { sessionId, estimatedTimeMs };
  }

  // ── 开始分析 ──────────────────────────────────────────────────────

  /**
   * 启动分析会话，开始处理队列
   * @param sessionId 会话 ID
   */
  async startSession(sessionId: number): Promise<void> {
    const db = getDatabase();

    // 防止重复启动
    if (this.isRunning) {
      throw new Error('已有分析任务正在运行，请先暂停或取消当前任务');
    }

    // 1. 设置 session 状态为 running
    await db
      .update(analysisSessions)
      .set({
        status: 'running',
        startedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(analysisSessions.id, sessionId));

    this.currentSessionId = sessionId;
    this.isRunning = true;
    this.isPaused = false;
    this.startTime = Date.now();

    // 2. 启动定时器，每秒更新 elapsedTimeMs
    this.timerInterval = setInterval(() => {
      if (this.startTime && this.currentSessionId && !this.isPaused) {
        const elapsed = Date.now() - this.startTime;
        db.update(analysisSessions)
          .set({ elapsedTimeMs: elapsed, updatedAt: new Date() })
          .where(eq(analysisSessions.id, this.currentSessionId))
          .run();
      }
    }, 1000);

    // 3. 开始处理队列（不 await，让它在后台运行）
    this.processQueue().catch((err) => {
      console.error('[AnalysisQueue] processQueue 错误:', err);
    });
  }

  // ── 暂停分析 ──────────────────────────────────────────────────────

  /**
   * 暂停当前分析会话
   * 设置 isPaused = true，当前正在处理的文件完成后停止
   */
  async pauseSession(sessionId?: number): Promise<void> {
    if (!this.isRunning || !this.currentSessionId) {
      return;
    }
    // sessionId 参数保留用于兼容性，实际使用 currentSessionId

    const db = getDatabase();

    // 标记暂停
    this.isPaused = true;

    // 更新 session 状态
    await db
      .update(analysisSessions)
      .set({ status: 'paused', updatedAt: new Date() })
      .where(eq(analysisSessions.id, this.currentSessionId));
  }

  // ── 恢复分析（断点续传） ──────────────────────────────────────────

  /**
   * 恢复已暂停的分析会话
   * 从 status='pending' 的队列项继续处理
   * @param sessionId 会话 ID
   */
  async resumeSession(sessionId: number): Promise<void> {
    const db = getDatabase();

    // 防止重复启动
    if (this.isRunning) {
      throw new Error('已有分析任务正在运行，请先暂停或取消当前任务');
    }

    // 验证会话存在且为 paused 状态
    const [session] = await db
      .select()
      .from(analysisSessions)
      .where(eq(analysisSessions.id, sessionId))
      .limit(1);

    if (!session) {
      throw new Error(`分析会话 ${sessionId} 不存在`);
    }
    if (session.status !== 'paused') {
      throw new Error(`会话状态为 ${session.status}，无法恢复`);
    }

    // 更新 session 状态为 running
    await db
      .update(analysisSessions)
      .set({ status: 'running', updatedAt: new Date() })
      .where(eq(analysisSessions.id, sessionId));

    this.currentSessionId = sessionId;
    this.isRunning = true;
    this.isPaused = false;
    // 累加已用时间：startTime 设为当前时间减去已流逝的时间
    this.startTime = Date.now() - (session.elapsedTimeMs ?? 0);

    // 启动定时器
    this.timerInterval = setInterval(() => {
      if (this.startTime && this.currentSessionId && !this.isPaused) {
        const elapsed = Date.now() - this.startTime;
        db.update(analysisSessions)
          .set({ elapsedTimeMs: elapsed, updatedAt: new Date() })
          .where(eq(analysisSessions.id, this.currentSessionId))
          .run();
      }
    }, 1000);

    // 从 pending 的队列项继续处理
    this.processQueue().catch((err) => {
      console.error('[AnalysisQueue] processQueue 错误:', err);
    });
  }

  // ── 取消分析 ──────────────────────────────────────────────────────

  /**
   * 取消分析会话
   * 设置 session 和所有 pending items 为 cancelled
   * @param sessionId 会话 ID
   */
  async cancelSession(sessionId: number): Promise<void> {
    const db = getDatabase();

    // 如果取消的是当前正在运行的会话，先停止处理
    if (this.currentSessionId === sessionId) {
      this.isRunning = false;
      this.isPaused = false;
      this.stopTimer();
      this.currentSessionId = null;
      this.startTime = null;
    }

    // 将所有 pending 的队列项设为 skipped
    await db
      .update(analysisQueue)
      .set({ status: 'skipped' })
      .where(
        and(
          eq(analysisQueue.sessionId, sessionId),
          eq(analysisQueue.status, 'pending'),
        ),
      );

    // 更新 session 状态为 cancelled
    await db
      .update(analysisSessions)
      .set({
        status: 'cancelled',
        completedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(analysisSessions.id, sessionId));
  }

  // ── 获取当前进度 ──────────────────────────────────────────────────

  /**
   * 获取指定会话的分析进度
   * @param sessionId 会话 ID
   */
  async getProgress(sessionId: number): Promise<{
    status: string;
    totalFiles: number;
    completedFiles: number;
    failedFiles: number;
    estimatedTimeMs: number | null;
    elapsedTimeMs: number;
    currentFile: string | null; // 当前正在处理的文件名
  }> {
    const db = getDatabase();

    // 读取 session 信息
    const [session] = await db
      .select()
      .from(analysisSessions)
      .where(eq(analysisSessions.id, sessionId))
      .limit(1);

    if (!session) {
      throw new Error(`分析会话 ${sessionId} 不存在`);
    }

    // 查找当前正在处理的队列项（获取文件名）
    const [processingItem] = await db
      .select({ fileName: samples.fileName })
      .from(analysisQueue)
      .innerJoin(samples, eq(analysisQueue.sampleId, samples.id))
      .where(
        and(
          eq(analysisQueue.sessionId, sessionId),
          eq(analysisQueue.status, 'processing'),
        ),
      )
      .limit(1);

    return {
      status: session.status,
      totalFiles: session.totalFiles,
      completedFiles: session.completedFiles,
      failedFiles: session.failedFiles,
      estimatedTimeMs: session.estimatedTimeMs,
      elapsedTimeMs: session.elapsedTimeMs,
      currentFile: processingItem?.fileName ?? null,
    };
  }

  // ── 获取未完成的会话（启动时检查） ──────────────────────────────────

  /**
   * 获取所有未完成的会话（running 或 paused 状态）
   * 应用启动时调用，检测是否有中断的分析任务
   */
  async getIncompleteSessions(): Promise<Array<{
    id: number;
    name: string;
    totalFiles: number;
    completedFiles: number;
    failedFiles: number;
    config: string;
    status: string;
    createdAt: Date;
  }>> {
    const db = getDatabase();

    const rows = await db
      .select({
        id: analysisSessions.id,
        name: analysisSessions.name,
        totalFiles: analysisSessions.totalFiles,
        completedFiles: analysisSessions.completedFiles,
        failedFiles: analysisSessions.failedFiles,
        config: analysisSessions.config,
        status: analysisSessions.status,
        createdAt: analysisSessions.createdAt,
      })
      .from(analysisSessions)
      .where(
        inArray(analysisSessions.status, ['running', 'paused']),
      );

    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      totalFiles: row.totalFiles,
      completedFiles: row.completedFiles,
      failedFiles: row.failedFiles,
      config: row.config,
      status: row.status,
      createdAt: row.createdAt,
    }));
  }

  // ── 获取所有会话列表 ──────────────────────────────────────────────

  /**
   * 获取最近的分析会话列表（最多 20 条）
   */
  async getSessions(): Promise<Array<{
    id: number;
    name: string;
    status: string;
    totalFiles: number;
    completedFiles: number;
    failedFiles: number;
    createdAt: Date;
    completedAt: Date | null;
  }>> {
    const db = getDatabase();

    const rows = await db
      .select({
        id: analysisSessions.id,
        name: analysisSessions.name,
        status: analysisSessions.status,
        totalFiles: analysisSessions.totalFiles,
        completedFiles: analysisSessions.completedFiles,
        failedFiles: analysisSessions.failedFiles,
        createdAt: analysisSessions.createdAt,
        completedAt: analysisSessions.completedAt,
      })
      .from(analysisSessions)
      .orderBy(sql`${analysisSessions.createdAt} DESC`)
      .limit(20);

    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      status: row.status,
      totalFiles: row.totalFiles,
      completedFiles: row.completedFiles,
      failedFiles: row.failedFiles,
      createdAt: row.createdAt,
      completedAt: row.completedAt,
    }));
  }

  // ── 内部：处理队列 ────────────────────────────────────────────────

  /**
   * 循环处理 pending 的队列项
   * 根据 concurrency 配置控制并发数
   * 如果 isPaused 或 !isRunning 则退出循环
   */
  private async processQueue(): Promise<void> {
    const db = getDatabase();
    const sessionId = this.currentSessionId;
    if (!sessionId) return;

    // 读取会话配置以获取并发数
    const [session] = await db
      .select()
      .from(analysisSessions)
      .where(eq(analysisSessions.id, sessionId))
      .limit(1);

    if (!session) return;

    const config: AnalysisConfig = JSON.parse(session.config);
    const concurrency = Math.min(Math.max(config.concurrency, 1), 4);

    // 并发处理池
    const running: Promise<void>[] = [];

    while (this.isRunning && !this.isPaused) {
      // 查找下一个 pending 的队列项
      const [nextItem] = await db
        .select()
        .from(analysisQueue)
        .where(
          and(
            eq(analysisQueue.sessionId, sessionId),
            eq(analysisQueue.status, 'pending'),
          ),
        )
        .limit(1);

      // 没有待处理的项，退出循环
      if (!nextItem) break;

      // 控制并发数：如果池已满，等待一个完成
      if (running.length >= concurrency) {
        await Promise.race(running);
        // 移除已完成的 promise
        for (let i = running.length - 1; i >= 0; i--) {
          // 使用 Promise.race 的技巧：给每个 promise 附加一个 settled 标记
          // 这里简单处理：检查队列中是否还有 processing 项
        }
        // 清理已完成的 promise
        const settled = await Promise.allSettled(running);
        running.length = 0;
        for (const result of settled) {
          if (result.status === 'fulfilled') {
            // 已完成
          } else {
            console.error('[AnalysisQueue] 任务执行异常:', result.reason);
          }
        }
      }

      // 启动新任务
      const task = this.processFile(nextItem.id).then(() => {
        // 从 running 数组中移除
        const idx = running.indexOf(task);
        if (idx !== -1) running.splice(idx, 1);
      });
      running.push(task);
    }

    // 等待所有正在处理的任务完成
    await Promise.allSettled(running);

    // 如果不是因为暂停而退出，说明队列处理完毕
    if (!this.isPaused && this.isRunning) {
      await db
        .update(analysisSessions)
        .set({
          status: 'completed',
          completedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(analysisSessions.id, sessionId));

      // 发送最终进度
      this.sendProgress(sessionId);

      // 清理状态
      this.isRunning = false;
      this.stopTimer();
      this.currentSessionId = null;
      this.startTime = null;
    }
  }

  // ── 内部：处理单个文件 ────────────────────────────────────────────

  /**
   * 处理单个文件的分析任务
   * 目前是占位实现，模拟分析耗时，后续对接 Python sidecar 时替换
   * @param queueItemId 队列项 ID
   */
  private async processFile(queueItemId: number): Promise<void> {
    const db = getDatabase();
    const sessionId = this.currentSessionId;
    if (!sessionId) return;

    let queueItem: { id: number; sampleId: number; taskType: string; sessionId: number } | undefined;
    let sample: { id: number; fileName: string; filePath: string; sampleRate: number | null } | undefined;

    try {
      // 1. 读取 queue item 获取 sampleId
      const items = await db
        .select()
        .from(analysisQueue)
        .where(eq(analysisQueue.id, queueItemId))
        .limit(1);

      queueItem = items[0];
      if (!queueItem) return;

      // 2. 读取 sample 获取 filePath
      const sampleRows = await db
        .select({ id: samples.id, fileName: samples.fileName, filePath: samples.filePath, sampleRate: samples.sampleRate })
        .from(samples)
        .where(eq(samples.id, queueItem.sampleId))
        .limit(1);

      sample = sampleRows[0];
      if (!sample) {
        // 采样不存在，标记为 skipped
        await db
          .update(analysisQueue)
          .set({ status: 'skipped', completedAt: new Date() })
          .where(eq(analysisQueue.id, queueItemId));
        return;
      }

      // 3. 标记为 processing
      await db
        .update(analysisQueue)
        .set({ status: 'processing', startedAt: new Date() })
        .where(eq(analysisQueue.id, queueItemId));

      // 4. 根据配置执行分析（目前先模拟耗时）
      const sessionRow = await db
        .select()
        .from(analysisSessions)
        .where(eq(analysisSessions.id, sessionId))
        .limit(1);

      if (!sessionRow) return;

      const config: AnalysisConfig = JSON.parse(sessionRow[0].config);
      const taskStart = Date.now();

      // 对接 Python sidecar 进行 CLAP 分析
      const { analyzerSidecar } = await import('./analyzerSidecar');
      let durationMs = 0;

      if (config.enableCLAP && (queueItem.taskType === 'clap' || queueItem.taskType === 'full')) {
        // 确保 sidecar 已启动
        if (!analyzerSidecar.isReady) {
          await analyzerSidecar.start();
        }

        if (analyzerSidecar.isReady) {
          const result = await analyzerSidecar.analyzeClap(sample.filePath);
          if (result.success && result.embedding_b64) {
            // 将 CLAP embedding 写入 samples 表
            await db
              .update(samples)
              .set({ clapEmbedding: result.embedding_b64 })
              .where(eq(samples.id, sample.id));
          } else {
            console.warn(`[AnalysisQueue] CLAP 分析失败: ${result.error}`);
          }
        } else {
          console.warn('[AnalysisQueue] Sidecar 不可用，跳过 CLAP 分析');
        }
      }

      // PANNs SED 分析
      if (config.enablePANNs && (queueItem.taskType === 'panns' || queueItem.taskType === 'full')) {
        if (!analyzerSidecar.isReady) {
          await analyzerSidecar.start();
        }

        if (analyzerSidecar.isReady && sample) {
          const pannsResult = await analyzerSidecar.analyzePanns(sample.filePath, {
            threshold: 0.3,
            minDuration: 0.25,
            maxSegments: 20,
          });

          if (pannsResult.success && pannsResult.segments && pannsResult.segments.length > 0) {
            // 删除旧的事件段
            await db
              .delete(audioSegments)
              .where(eq(audioSegments.sampleId, sample.id));

            // 插入新的事件段
            const currentSampleId = sample.id;
            const segmentValues = pannsResult.segments.map((seg) => ({
              sampleId: currentSampleId,
              label: seg.label,
              displayLabel: seg.display_label,
              startTime: seg.start_time,
              endTime: seg.end_time,
              peakProb: seg.peak_prob,
              createdAt: new Date(),
            }));

            // 分批插入
            const INSERT_BATCH = 50;
            for (let i = 0; i < segmentValues.length; i += INSERT_BATCH) {
              await db.insert(audioSegments).values(segmentValues.slice(i, i + INSERT_BATCH));
            }
          } else if (!pannsResult.success) {
            console.warn(`[AnalysisQueue] PANNs 分析失败: ${pannsResult.error}`);
          }
        } else {
          console.warn('[AnalysisQueue] Sidecar 不可用，跳过 PANNs 分析');
        }
      }

      // Essentia 分析（BPM/Key 信号分析）
      if (config.enableEssentia && (queueItem.taskType === 'essentia' || queueItem.taskType === 'full')) {
        try {
          await initEssentia();
          const essentiaResult = await analyzeAudioFile(sample.filePath, sample.sampleRate || undefined);
          if (essentiaResult.bpm !== null || essentiaResult.key !== null) {
            await db
              .update(samples)
              .set({
                bpm: essentiaResult.bpm,
                key: essentiaResult.key,
              })
              .where(eq(samples.id, sample.id));
          }
        } catch (err) {
          console.warn(`[AnalysisQueue] Essentia 分析失败: ${(err as Error).message}`);
        }
      }

      durationMs = Date.now() - taskStart;

      // 5. 更新 queue item 状态为 completed
      await db
        .update(analysisQueue)
        .set({
          status: 'completed',
          completedAt: new Date(),
          durationMs,
        })
        .where(eq(analysisQueue.id, queueItemId));

      // 6. 更新 session 进度（completedFiles +1）
      await db
        .update(analysisSessions)
        .set({
          completedFiles: sql`${analysisSessions.completedFiles} + 1`,
          updatedAt: new Date(),
        })
        .where(eq(analysisSessions.id, sessionId));

      // 7. 发送进度事件到渲染进程
      this.sendProgress(sessionId);
    } catch (error) {
      const errorMessage = (error as Error).message ?? String(error);

      console.error(`[AnalysisQueue] 处理文件失败 (queueItemId=${queueItemId}):`, errorMessage);

      // 更新 queue item 状态为 failed
      await db
        .update(analysisQueue)
        .set({
          status: 'failed',
          errorMessage,
          completedAt: new Date(),
        })
        .where(eq(analysisQueue.id, queueItemId));

      // 更新 session 的 failedFiles 计数
      await db
        .update(analysisSessions)
        .set({
          failedFiles: sql`${analysisSessions.failedFiles} + 1`,
          updatedAt: new Date(),
        })
        .where(eq(analysisSessions.id, sessionId));

      // 发送进度事件
      this.sendProgress(sessionId);
    }
  }

  // ── 内部：模拟分析耗时（占位实现） ──────────────────────────────────

  /**
   * 模拟分析耗时
   * TODO: 后续对接 Python sidecar 时删除此方法
   */
  private async simulateAnalysis(config: AnalysisConfig, taskType: string): Promise<void> {
    let delay = 0;
    if (config.enableCLAP && (taskType === 'clap' || taskType === 'full')) {
      delay += AVG_TIME_MS.clap;
    }
    if (config.enablePANNs && (taskType === 'panns' || taskType === 'full')) {
      delay += AVG_TIME_MS.panns;
    }
    if (config.enableEssentia && (taskType === 'essentia' || taskType === 'full')) {
      delay += AVG_TIME_MS.essentia;
    }

    // 缩短模拟时间以方便开发测试（实际耗时乘以 0.1）
    const simulatedDelay = Math.max(Math.floor(delay * 0.1), 50);
    await new Promise((resolve) => setTimeout(resolve, simulatedDelay));
  }

  // ── 内部：根据配置确定任务类型 ──────────────────────────────────────

  /**
   * 根据分析配置确定队列项的任务类型
   * 如果全部启用则为 'full'，否则根据启用的工具决定
   */
  private resolveTaskType(config: AnalysisConfig): 'clap' | 'panns' | 'essentia' | 'full' {
    const enabled = [config.enableCLAP, config.enablePANNs, config.enableEssentia];
    const enabledCount = enabled.filter(Boolean).length;

    // 全部启用或启用两个及以上，使用 full 模式
    if (enabledCount >= 2) return 'full';

    // 只启用一个
    if (config.enableCLAP) return 'clap';
    if (config.enablePANNs) return 'panns';
    if (config.enableEssentia) return 'essentia';

    // 默认 full
    return 'full';
  }

  // ── 内部：停止定时器 ──────────────────────────────────────────────

  /**
   * 停止 elapsedTimeMs 更新定时器
   */
  private stopTimer(): void {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
  }

  // ── 发送进度事件到所有窗口 ──────────────────────────────────────────

  /**
   * 向所有渲染进程窗口发送分析进度事件
   * @param sessionId 会话 ID
   */
  private sendProgress(sessionId: number): void {
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) {
        win.webContents.send('analysis:progress', { sessionId });
      }
    }
  }

  // ── 格式化时间显示 ──────────────────────────────────────────────────

  /**
   * 将毫秒数格式化为可读的时间字符串
   * @param ms 毫秒数
   * @returns 格式化后的时间字符串，如 "1h 23m"、"45s"、"< 1s"
   */
  formatTime(ms: number): string {
    if (ms < 1000) return '< 1s';
    const seconds = Math.floor(ms / 1000);
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    if (minutes < 60) return `${minutes}m ${remainingSeconds}s`;
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    return `${hours}h ${remainingMinutes}m`;
  }
}

// ── 单例导出 ──────────────────────────────────────────────────────────

/** 分析队列管理器单例 */
export const analysisQueueManager = new AnalysisQueueManager();
