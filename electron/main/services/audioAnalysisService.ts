/**
 * 音频分析服务 —— 管理独立 worker 线程，避免阻塞 Electron 主进程
 *
 * 使用方式：
 *   import { analyzeFileBatch } from './audioAnalysisService';
 *   // 每个文件 200-800ms CPU 工作全部在 worker 线程完成
 *   // 主线程只处理异步消息回调 (<1ms)
 */

import { Worker } from 'worker_threads';
import { app } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export interface AnalysisResult {
  isCorrupted: boolean;
  duration: number;
  sampleRate: number;
  bpm: number | null;
  key: string | null;
  waveform: number[] | null;
  peaks: Array<{ min: number; max: number }> | null;
  tags: string[];
  featureVector: number[] | null;
  category: number | null;
  secondaryCategories: number[];
}

export interface FileToAnalyze {
  path: string;
  name: string;
  size: number;
}

export interface BatchAnalysisResult {
  file: FileToAnalyze;
  analysis?: AnalysisResult;
  error?: string;
}

let worker: Worker | null = null;
let isShuttingDown = false;
let pendingTasks: Array<{
  files: FileToAnalyze[];
  onProgress: (current: number, total: number, currentFile: string) => void;
  onResult: (file: FileToAnalyze, analysis: AnalysisResult) => void;
  onDone: (processed: number) => void;
}> = [];

function ensureWorker(): Worker {
  if (worker && !isShuttingDown) return worker;

  // 从编译后的路径加载 worker
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);

  // 先尝试加载编译后的 JS 文件（Electron 打包场景）
  const compiledPath = path.join(__dirname, 'audioAnalysisWorker.js');
  // 再尝试 TS 源文件（开发场景，由 Vite/Electron 处理）
  const sourcePath = path.join(__dirname, 'audioAnalysisWorker.ts');

  let workerPath = compiledPath;
  try {
    const fs = require('node:fs');
    if (!fs.existsSync(compiledPath) && fs.existsSync(sourcePath)) {
      workerPath = sourcePath;
    }
  } catch { /* ignore */ }

  worker = new Worker(workerPath, {
    resourceLimits: {
      maxOldGenerationSizeMb: 256,  // 限制 worker 内存上限
    },
  });

  worker.on('message', (msg) => {
    // --- 标准分析任务 ---
    if (msg?.type === 'progress') {
      pendingTasks[0]?.onProgress(msg.current, msg.total, msg.currentFile);
    } else if (msg?.type === 'result') {
      pendingTasks[0]?.onResult(msg.file, msg.analysis);
    } else if (msg?.type === 'done') {
      const task = pendingTasks.shift();
      task?.onDone(msg.processed);
    }
    // --- Essentia 分析任务 ---
    else if (msg?.type === 'essentia-result') {
      essentiaTasks[0]?.onResult(msg.file, msg.analysis);
    } else if (msg?.type === 'essentia-done') {
      const task = essentiaTasks.shift();
      task?.onDone(msg.processed);
    }
    // --- 错误处理（两类任务共享）---
    else if (msg?.type === 'error') {
      console.warn(`[AudioAnalysis] File failed: ${msg.file?.name} - ${msg.message}`);
    }
  });

  worker.on('error', (err) => {
    console.error('[AudioAnalysis] Worker error:', err.message);
  });

  worker.on('exit', (code) => {
    console.log(`[AudioAnalysis] Worker exited with code ${code}`);
    worker = null;
  });

  return worker;
}

/**
 * 批量分析文件（异步，不阻塞主线程）
 *
 * @param files 要分析的文件列表
 * @param callbacks 回调：进度/单个结果/全部完成
 */
export function analyzeFileBatch(
  files: FileToAnalyze[],
  callbacks: {
    onProgress?: (current: number, total: number, currentFile: string) => void;
    onResult?: (file: FileToAnalyze, analysis: AnalysisResult) => void;
    onDone?: (processed: number) => void;
  },
): void {
  if (files.length === 0) {
    callbacks.onDone?.(0);
    return;
  }

  const task = {
    files,
    onProgress: callbacks.onProgress ?? (() => {}),
    onResult: callbacks.onResult ?? (() => {}),
    onDone: callbacks.onDone ?? (() => {}),
  };

  const wasEmpty = pendingTasks.length === 0;
  pendingTasks.push(task);

  if (wasEmpty) {
    try {
      const w = ensureWorker();
      w.postMessage({ type: 'analyze', files });
    } catch (err) {
      console.error('[AudioAnalysis] Failed to start worker:', err);
      // Worker 失败兜底：直接完成，避免卡住 UI
      callbacks.onDone?.(0);
      pendingTasks = [];
    }
  }
}

/**
 * 停止所有分析任务并清理 worker
 */
export function stopAllAnalysis(): void {
  isShuttingDown = true;
  if (worker) {
    try { worker.postMessage({ type: 'stop' }); } catch {}
    // 强制终止（给 2 秒优雅关闭时间）
    setTimeout(() => {
      if (worker) {
        try { worker.terminate(); } catch {}
        worker = null;
      }
      isShuttingDown = false;
      pendingTasks = [];
      essentiaTasks = [];
    }, 2000);
  }
}

/**
 * 是否有分析任务正在进行
 */
export function isAnalysisInProgress(): boolean {
  return pendingTasks.length > 0;
}

// ============ Essentia 分析 (BPM / Key) ============

/**
 * Essentia 分析结果
 */
export interface EssentiaAnalysisResult {
  bpm: number | null;
  key: string | null;
  pitch: number | null;
}

let essentiaTasks: Array<{
  files: Array<{ path: string; name: string; size: number }>;
  onProgress: (current: number, total: number, currentFile: string) => void;
  onResult: (file: { path: string; name: string; size: number }, analysis: EssentiaAnalysisResult) => void;
  onDone: (processed: number) => void;
}> = [];

/**
 * 使用 Essentia WASM 分析音频（BPM/Key）
 * 完全在 worker 线程执行，不阻塞 Electron 主进程
 *
 * @param files 要分析的文件列表
 * @param callbacks 进度、结果、完成回调
 */
export function analyzeEssentiaBatch(
  files: Array<{ path: string; name: string; size: number }>,
  callbacks: {
    onProgress?: (current: number, total: number, currentFile: string) => void;
    onResult?: (file: { path: string; name: string; size: number }, analysis: EssentiaAnalysisResult) => void;
    onDone?: (processed: number) => void;
  },
): void {
  if (files.length === 0) {
    callbacks.onDone?.(0);
    return;
  }

  const task = {
    files,
    onProgress: callbacks.onProgress ?? (() => {}),
    onResult: callbacks.onResult ?? (() => {}),
    onDone: callbacks.onDone ?? (() => {}),
  };

  const wasEmpty = essentiaTasks.length === 0;
  essentiaTasks.push(task);

  if (wasEmpty) {
    try {
      const w = ensureWorker();
      w.postMessage({ type: 'analyze-essentia', files });
    } catch (err) {
      console.error('[AudioAnalysis] Essentia worker failed:', err);
      callbacks.onDone?.(0);
      essentiaTasks = [];
    }
  }
}


