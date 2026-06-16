import { readFile } from 'fs/promises';
import os from 'os';
import LRUCache from 'lru-cache';
import type { AudioFileHelper } from './audioFileHelper';

type LRUType = InstanceType<typeof LRUCache>;

export interface FileIOOptions {
  /** 最大缓存条目数，默认 100 */
  maxCacheSize?: number;
  /** 最大缓存字节数，默认 500MB（lru-cache v6 通过 length 函数实现） */
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
  private cache: LRUType;
  private maxCacheBytes: number;
  private currentBytes = 0;

  constructor(options: FileIOOptions = {}) {
    const {
      maxCacheSize = 100,
      maxCacheBytes = 500 * 1024 * 1024,
    } = options;

    this.maxCacheBytes = maxCacheBytes;

    this.cache = new (LRUCache as any)({
      max: maxCacheSize,
      length: (buf: Buffer) => buf.length,
      maxAge: 0, // 永不过期
      dispose: (_key: string, buf: Buffer) => {
        this.currentBytes -= buf.length;
      },
    });
  }

  /**
   * 读取文件，优先从缓存返回
   */
  async readFile(filePath: string): Promise<Buffer> {
    const cached = this.cache.get(filePath);
    if (cached) {
      return cached;
    }

    const buffer = await readFile(filePath);

    // 检查是否超过字节限制
    if (this.currentBytes + buffer.length > this.maxCacheBytes) {
      // 清理最旧的条目直到有足够空间
      this.evictForSpace(buffer.length);
    }

    this.cache.set(filePath, buffer);
    this.currentBytes += buffer.length;
    return buffer;
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
        batch.map(async (path) => {
          try {
            const buffer = await readFile(path);

            // 检查字节限制
            if (this.currentBytes + buffer.length > this.maxCacheBytes) {
              this.evictForSpace(buffer.length);
            }

            this.cache.set(path, buffer);
            this.currentBytes += buffer.length;
          } catch (err) {
            console.warn(`[FileIO] Preload failed for ${path}:`, err);
          }
        })
      );
    }
  }

  /**
   * 为腾出空间而淘汰旧条目
   */
  private evictForSpace(neededBytes: number): void {
    // lru-cache v6 使用 keys() 获取键（按 LRU 顺序）
    const keys = this.cache.keys();
    while (this.currentBytes + neededBytes > this.maxCacheBytes && this.cache.itemCount > 0) {
      const oldest = keys[0];
      if (oldest) {
        this.cache.del(oldest);
      } else {
        break;
      }
    }
  }

  /**
   * 清除缓存
   */
  clearCache(): void {
    this.cache.reset();
    this.currentBytes = 0;
  }

  /**
   * 获取缓存统计
   */
  getStats(): { size: number; bytes: number; keys: string[] } {
    return {
      size: this.cache.itemCount,
      bytes: this.currentBytes,
      keys: this.cache.keys(),
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