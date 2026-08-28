import { readFile } from 'fs/promises';
import os from 'os';
import type { AudioFileHelper } from './audioFileHelper';

export interface FileIOOptions {
  /** 最大缓存条目数，默认 100 */
  maxCacheSize?: number;
  /** 最大缓存字节数，默认 500MB */
  maxCacheBytes?: number;
  /** 预读文件数，默认 5 */
  preloadAhead?: number;
}

export interface CachedFile {
  path: string;
  buffer: Buffer;
  size: number;
  lastAccessed: number;
}

class FileIOService {
  /** Map insertion order is used as the LRU order (oldest first). */
  private readonly cache = new Map<string, Buffer>();
  private readonly maxCacheSize: number;
  private readonly maxCacheBytes: number;
  private currentBytes = 0;
  private readonly inFlightReads = new Map<string, Promise<Buffer>>();

  constructor(options: FileIOOptions = {}) {
    const {
      maxCacheSize = 100,
      maxCacheBytes = 500 * 1024 * 1024,
    } = options;

    this.maxCacheSize = maxCacheSize;
    this.maxCacheBytes = maxCacheBytes;
  }

  /**
   * 读取文件，优先从缓存返回
   */
  async readFile(filePath: string): Promise<Buffer> {
    const cached = this.cache.get(filePath);
    if (cached) {
      // Refresh insertion order so the first key always remains the LRU entry.
      this.cache.delete(filePath);
      this.cache.set(filePath, cached);
      return cached;
    }

    const existingRead = this.inFlightReads.get(filePath);
    if (existingRead) {
      return existingRead;
    }

    const pendingRead = readFile(filePath).then((buffer) => {
      this.cacheBuffer(filePath, buffer);
      return buffer;
    }).finally(() => {
      this.inFlightReads.delete(filePath);
    });

    this.inFlightReads.set(filePath, pendingRead);
    return pendingRead;
  }

  private cacheBuffer(filePath: string, buffer: Buffer): void {
    if (buffer.byteLength > this.maxCacheBytes || this.maxCacheSize <= 0) return;

    const previous = this.cache.get(filePath);
    if (previous) {
      this.currentBytes -= previous.byteLength;
      this.cache.delete(filePath);
    }

    while (
      this.cache.size > 0 &&
      (this.cache.size >= this.maxCacheSize || this.currentBytes + buffer.byteLength > this.maxCacheBytes)
    ) {
      const oldestKey = this.cache.keys().next().value as string | undefined;
      if (oldestKey === undefined) break;
      const oldest = this.cache.get(oldestKey);
      this.cache.delete(oldestKey);
      if (oldest) this.currentBytes -= oldest.byteLength;
    }

    this.cache.set(filePath, buffer);
    this.currentBytes += buffer.byteLength;
  }

  /**
   * 批量预读文件到缓存
   */
  async preloadFiles(filePaths: string[]): Promise<void> {
    const uncached = filePaths.filter((p) => !this.cache.has(p));
    if (uncached.length === 0) return;

    // 限制并发数
    const concurrency = 8;
    for (let i = 0; i < uncached.length; i += concurrency) {
      const batch = uncached.slice(i, i + concurrency);
      await Promise.all(
        batch.map(async (filePath) => {
          try {
            await this.readFile(filePath);
          } catch (err) {
            console.warn(`[FileIO] Preload failed for ${filePath}:`, err);
          }
        })
      );
    }
  }

  /**
   * 清除缓存
   */
  clearCache(): void {
    this.cache.clear();
    this.currentBytes = 0;
    this.inFlightReads.clear();
  }

  /**
   * 获取缓存统计
   */
  getStats(): { size: number; bytes: number; keys: string[] } {
    return {
      size: this.cache.size,
      bytes: this.currentBytes,
      keys: Array.from(this.cache.keys()),
    };
  }
}

// 单例
let instance: FileIOService | null = null;

export function getFileIOService(options?: FileIOOptions): FileIOService {
  if (!instance) {
    instance = new FileIOService(options);
  }
  return instance;
}

export function resetFileIOService(): void {
  instance = null;
}

export { FileIOService };

// ============ AudioFileCache ============

export interface AudioFileCacheOptions {
  /** 最大内存占用（MB），默认 512 */
  maxMemoryMB?: number;
  /** 内存占用阈值（百分比），超过此值触发清理，默认 80 */
  memoryThreshold?: number;
}

class AudioFileCache {
  private helpers: Map<string, AudioFileHelper> = new Map();
  private accessOrder: string[] = []; // LRU 访问顺序记录
  private memoryThreshold: number; // 内存占用阈值（百分比）

  constructor(options: AudioFileCacheOptions = {}) {
    this.memoryThreshold = options.memoryThreshold ?? 80;
  }

  /**
   * 获取 AudioFileHelper（优先从缓存返回）
   * 如果已缓存，直接返回；否则加载文件并缓存
   */
  async get(filePath: string): Promise<AudioFileHelper> {
    // 检查内存压力
    this.checkMemoryPressure();

    const existing = this.helpers.get(filePath);
    if (existing) {
      // 更新 LRU 顺序
      this.touch(filePath);
      return existing;
    }

    // 创建新实例
    const { AudioFileHelper } = await import('./audioFileHelper');
    const helper = await AudioFileHelper.load(filePath);
    this.helpers.set(filePath, helper);
    this.accessOrder.push(filePath);
    return helper;
  }

  /**
   * 从已有 Buffer 创建（不重复读取文件）
   */
  async fromBuffer(filePath: string, buffer: Buffer): Promise<AudioFileHelper> {
    const existing = this.helpers.get(filePath);
    if (existing) return existing;

    const { AudioFileHelper } = await import('./audioFileHelper');
    const helper = AudioFileHelper.fromBuffer(filePath, buffer);
    this.helpers.set(filePath, helper);
    this.accessOrder.push(filePath);
    return helper;
  }

  /**
   * 标记最近访问
   */
  private touch(filePath: string): void {
    const idx = this.accessOrder.indexOf(filePath);
    if (idx !== -1) {
      this.accessOrder.splice(idx, 1);
    }
    this.accessOrder.push(filePath);
  }

  /**
   * 检查系统内存压力，超阈值时清理最久未使用的缓存
   */
  private checkMemoryPressure(): void {
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedPercent = ((totalMem - freeMem) / totalMem) * 100;

    if (usedPercent > this.memoryThreshold) {
      const toFree = Math.ceil(this.helpers.size * 0.3); // 清理 30% 最久未使用的
      this.evictLRU(toFree);
      console.log(`[AudioFileCache] Memory pressure: ${usedPercent.toFixed(1)}%, evicted ${toFree} entries`);
    }
  }

  /**
   * 清理最久未使用的 N 个缓存
   */
  private evictLRU(count: number): void {
    for (let i = 0; i < count && this.accessOrder.length > 0; i++) {
      const oldest = this.accessOrder.shift()!;
      const helper = this.helpers.get(oldest);
      if (helper) {
        helper.dispose();
        this.helpers.delete(oldest);
      }
    }
  }

  /**
   * 手动清理所有缓存
   */
  clear(): void {
    for (const helper of this.helpers.values()) {
      helper.dispose();
    }
    this.helpers.clear();
    this.accessOrder = [];
  }

  /**
   * 缓存统计
   */
  get stats(): {
    count: number;
    accessOrder: string[];
    memoryThreshold: number;
    currentMemoryPercent: number;
  } {
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedPercent = ((totalMem - freeMem) / totalMem) * 100;
    return {
      count: this.helpers.size,
      accessOrder: [...this.accessOrder],
      memoryThreshold: this.memoryThreshold,
      currentMemoryPercent: usedPercent,
    };
  }
}

// 单例
let cacheInstance: AudioFileCache | null = null;

export function getAudioFileCache(): AudioFileCache {
  if (!cacheInstance) {
    cacheInstance = new AudioFileCache();
  }
  return cacheInstance;
}

export function resetAudioFileCache(): void {
  if (cacheInstance) {
    cacheInstance.clear();
  }
  cacheInstance = null;
}
