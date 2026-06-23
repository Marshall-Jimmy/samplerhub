/**
 * DecoderPool — 音频解码池
 *
 * 管理并发解码任务，支持优先级队列调度：
 *   - urgent: 插入队首（用户点击的采样）
 *   - normal: 正常排队（可视区域预加载）
 *   - low: 限速处理（非可视区域）
 *
 * 并发数 = navigator.hardwareConcurrency - 1（至少 1 个，最多 4 个）
 *
 * 注意：decodeAudioData 本身是异步的，浏览器内部在独立线程解码，不阻塞主线程。
 * 因此不需要 Web Worker，直接在主线程调用即可。
 */

import { AudioContextManager } from '../audioContextManager';

type DecodePriority = 'urgent' | 'normal' | 'low';

interface DecodeTask {
  id: string;
  buffer: ArrayBuffer;
  priority: DecodePriority;
  resolve: (audioBuffer: AudioBuffer) => void;
  reject: (error: Error) => void;
}

/** 估算 AudioBuffer 的内存占用（字节） */
export function estimateAudioBufferSize(buffer: AudioBuffer): number {
  return buffer.length * buffer.numberOfChannels * 4; // Float32 = 4 bytes
}

export class DecoderPool {
  private taskQueue: DecodeTask[] = [];
  private activeCount = 0;
  private maxConcurrent: number;
  private nextId = 0;
  private lowRateLimit = 1;
  private lowProcessedThisFrame = 0;

  constructor() {
    const concurrency = navigator.hardwareConcurrency || 4;
    this.maxConcurrent = Math.max(1, Math.min(concurrency - 1, 4));
  }

  /**
   * 提交解码任务
   * @param buffer 原始音频数据 ArrayBuffer
   * @param priority 优先级
   * @returns 解码后的 AudioBuffer
   */
  decode(buffer: ArrayBuffer, priority: DecodePriority = 'normal'): Promise<AudioBuffer> {
    const id = `decode_${++this.nextId}_${Date.now()}`;

    return new Promise<AudioBuffer>((resolve, reject) => {
      const task: DecodeTask = { id, buffer, priority, resolve, reject };

      if (priority === 'urgent') {
        this.taskQueue.unshift(task);
      } else {
        this.taskQueue.push(task);
      }

      this.processQueue();
    });
  }

  private processQueue(): void {
    if (this.taskQueue.length === 0) {
      // 队列为空时重置 low 计数器
      this.lowProcessedThisFrame = 0;
      return;
    }
    if (this.activeCount >= this.maxConcurrent) return;

    const task = this.getNextTask();
    if (!task) {
      // 无可用任务（可能所有 low 任务都被限速），重置计数器
      this.lowProcessedThisFrame = 0;
      return;
    }

    this.activeCount++;
    this.executeTask(task);
  }

  private async executeTask(task: DecodeTask): Promise<void> {
    try {
      const ctx = AudioContextManager.getContext();
      const audioBuffer = await ctx.decodeAudioData(task.buffer);
      this.activeCount--;
      task.resolve(audioBuffer);
    } catch (err) {
      this.activeCount--;
      task.reject(err as Error);
    }

    // 处理队列中下一个任务
    this.processQueue();
  }

  private getNextTask(): DecodeTask | undefined {
    // 优先处理 urgent
    const urgentIdx = this.taskQueue.findIndex((t) => t.priority === 'urgent');
    if (urgentIdx >= 0) {
      return this.taskQueue.splice(urgentIdx, 1)[0];
    }

    // 然后 normal
    const normalIdx = this.taskQueue.findIndex((t) => t.priority === 'normal');
    if (normalIdx >= 0) {
      return this.taskQueue.splice(normalIdx, 1)[0];
    }

    // low 优先级限速
    if (this.lowProcessedThisFrame < this.lowRateLimit) {
      const lowIdx = this.taskQueue.findIndex((t) => t.priority === 'low');
      if (lowIdx >= 0) {
        this.lowProcessedThisFrame++;
        return this.taskQueue.splice(lowIdx, 1)[0];
      }
    }

    return undefined;
  }

  cancel(id: string): void {
    const idx = this.taskQueue.findIndex((t) => t.id === id);
    if (idx >= 0) {
      const task = this.taskQueue.splice(idx, 1)[0];
      task.reject(new Error('Cancelled'));
    }
  }

  cancelAll(): void {
    for (const task of this.taskQueue) {
      task.reject(new Error('Cancelled'));
    }
    this.taskQueue = [];
  }

  get queueLength(): number {
    return this.taskQueue.length;
  }

  get currentActive(): number {
    return this.activeCount;
  }

  destroy(): void {
    this.cancelAll();
  }
}

// 全局单例
let globalPool: DecoderPool | null = null;

export function getDecoderPool(): DecoderPool {
  if (!globalPool) {
    globalPool = new DecoderPool();
  }
  return globalPool;
}

export function destroyDecoderPool(): void {
  if (globalPool) {
    globalPool.destroy();
    globalPool = null;
  }
}