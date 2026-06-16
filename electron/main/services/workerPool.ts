/**
 * Worker Thread 池 - 将元数据解析和波形生成隔离到独立线程
 * 避免阻塞主进程，提升大规模扫描时的 UI 响应性
 */

import { Worker } from 'node:worker_threads';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import os from 'node:os';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

interface WorkerTask {
  type: 'parseMetadata' | 'generateWaveform';
  payload: any;
  resolve: (value: any) => void;
  reject: (reason: any) => void;
}

interface WorkerWrapper {
  worker: Worker;
  busy: boolean;
  taskQueue: WorkerTask[];
}

const pool: WorkerWrapper[] = [];
var maxWorkers = Math.min(4, Math.max(1, Math.floor(os.cpus().length / 2)));

/** 获取 Worker 脚本路径 */
function getWorkerPath(): string {
  // 开发环境：直接指向源文件
  return path.join(__dirname, 'workerThread.js');
}

/** 初始化 Worker 池 */
export function initWorkerPool(size?: number): void {
  if (size) maxWorkers = size;

  // 清理旧池
  for (const w of pool) {
    w.worker.terminate();
  }
  pool.length = 0;

  for (let i = 0; i < maxWorkers; i++) {
    try {
      const worker = new Worker(getWorkerPath());
      const wrapper: WorkerWrapper = { worker, busy: false, taskQueue: [] };

      worker.on('message', (msg: { id: number; result?: any; error?: string }) => {
        const task = wrapper.taskQueue.shift();
        if (task) {
          if (msg.error) {
            task.reject(new Error(msg.error));
          } else {
            task.resolve(msg.result);
          }
        }
        wrapper.busy = false;
        processQueue(wrapper);
      });

      worker.on('error', (err) => {
        const task = wrapper.taskQueue.shift();
        if (task) {
          task.reject(err);
        }
        wrapper.busy = false;
        processQueue(wrapper);
      });

      pool.push(wrapper);
    } catch {
      // Worker 创建失败，回退到主线程
      console.warn('[WorkerPool] Failed to create worker, falling back to main thread');
    }
  }
}

/** 处理队列中的任务 */
function processQueue(wrapper: WorkerWrapper): void {
  if (wrapper.busy || wrapper.taskQueue.length === 0) return;

  const task = wrapper.taskQueue[0];
  wrapper.busy = true;

  wrapper.worker.postMessage({
    id: 0,
    type: task.type,
    payload: task.payload,
  });
}

/** 提交任务到 Worker 池 */
export function submitTask<T>(type: 'parseMetadata' | 'generateWaveform', payload: any): Promise<T> {
  return new Promise((resolve, reject) => {
    // 如果池为空，回退到主线程
    if (pool.length === 0) {
      reject(new Error('Worker pool not initialized'));
      return;
    }

    // 找到最空闲的 Worker
    let best = pool[0];
    for (const w of pool) {
      if (w.taskQueue.length < best.taskQueue.length) {
        best = w;
      }
    }

    const task: WorkerTask = { type, payload, resolve, reject };
    best.taskQueue.push(task);
    processQueue(best);
  });
}

/** 终止 Worker 池 */
export function terminateWorkerPool(): void {
  for (const w of pool) {
    w.worker.terminate();
  }
  pool.length = 0;
}
