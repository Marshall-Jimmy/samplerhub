/**
 * BufferCache — LRU 缓存
 *
 * 两层缓存策略：
 *   1. AudioBuffer 缓存（已解码，可直接播放）— 上限 300MB
 *   2. ArrayBuffer 缓存（原始文件数据，未解码）— 上限 100MB
 *
 * 淘汰策略：LRU（Map 保证插入顺序），超出上限时淘汰最久未使用的条目。
 */

import { estimateAudioBufferSize } from './decoderPool';

interface CacheEntry<T> {
  value: T;
  size: number;
}

class LRUCache<T> {
  private cache = new Map<string, CacheEntry<T>>();
  private currentSize = 0;
  private maxSize: number;
  private name: string;

  constructor(maxSize: number, name: string = 'cache') {
    this.maxSize = maxSize;
    this.name = name;
  }

  get(key: string): T | undefined {
    const entry = this.cache.get(key);
    if (!entry) return undefined;
    // 移动到末尾（最近使用）
    this.cache.delete(key);
    this.cache.set(key, entry);
    return entry.value;
  }

  set(key: string, value: T, size: number): void {
    // 如果 key 已存在，先删除旧条目
    const existing = this.cache.get(key);
    if (existing) {
      this.currentSize -= existing.size;
      this.cache.delete(key);
    }

    // 淘汰最旧的条目直到有足够空间
    this.evictForSpace(size);

    this.cache.set(key, { value, size });
    this.currentSize += size;
  }

  private evictForSpace(neededSize: number): void {
    let evicted = 0;
    while (
      this.currentSize + neededSize > this.maxSize &&
      this.cache.size > 0
    ) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey === undefined) break;
      const entry = this.cache.get(oldestKey);
      if (entry) {
        this.currentSize -= entry.size;
      }
      this.cache.delete(oldestKey);
      evicted++;
    }
    if (evicted > 0) {
      console.log(
        `[BufferCache:${this.name}] Evicted ${evicted} entries (${(evicted > 0 ? 'freed space' : '')})`,
      );
    }
  }

  has(key: string): boolean {
    return this.cache.has(key);
  }

  delete(key: string): boolean {
    const entry = this.cache.get(key);
    if (entry) {
      this.currentSize -= entry.size;
      this.cache.delete(key);
      return true;
    }
    return false;
  }

  clear(): void {
    this.cache.clear();
    this.currentSize = 0;
  }

  get size(): number {
    return this.cache.size;
  }

  get bytesUsed(): number {
    return this.currentSize;
  }

  get bytesMax(): number {
    return this.maxSize;
  }

  keys(): IterableIterator<string> {
    return this.cache.keys();
  }
}

/**
 * 双层 BufferCache
 */
export class BufferCache {
  // 已解码的 AudioBuffer 缓存（优先级高）
  private audioCache: LRUCache<AudioBuffer>;
  // 原始 ArrayBuffer 缓存（优先级低，仅存不解码）
  private arrayCache: LRUCache<ArrayBuffer>;

  constructor(
    maxAudioBytes: number = 300 * 1024 * 1024, // 300MB
    maxArrayBytes: number = 100 * 1024 * 1024, // 100MB
  ) {
    this.audioCache = new LRUCache<AudioBuffer>(maxAudioBytes, 'AudioBuffer');
    this.arrayCache = new LRUCache<ArrayBuffer>(maxArrayBytes, 'ArrayBuffer');
  }

  // === AudioBuffer 缓存 ===

  getAudio(key: string): AudioBuffer | undefined {
    return this.audioCache.get(key);
  }

  setAudio(key: string, buffer: AudioBuffer): void {
    const size = estimateAudioBufferSize(buffer);
    this.audioCache.set(key, buffer, size);
  }

  hasAudio(key: string): boolean {
    return this.audioCache.has(key);
  }

  // === ArrayBuffer 缓存 ===

  getArray(key: string): ArrayBuffer | undefined {
    return this.arrayCache.get(key);
  }

  setArray(key: string, buffer: ArrayBuffer): void {
    this.arrayCache.set(key, buffer, buffer.byteLength);
  }

  hasArray(key: string): boolean {
    return this.arrayCache.has(key);
  }

  // === 通用操作 ===

  delete(key: string): void {
    this.audioCache.delete(key);
    this.arrayCache.delete(key);
  }

  clear(): void {
    this.audioCache.clear();
    this.arrayCache.clear();
  }

  /** 动态调整音频缓存上限（根据内存压力） */
  setMaxAudioBytes(bytes: number): void {
    (this.audioCache as any).maxSize = bytes;
  }

  getStats() {
    return {
      audioEntries: this.audioCache.size,
      audioBytes: this.audioCache.bytesUsed,
      audioBytesMax: this.audioCache.bytesMax,
      arrayEntries: this.arrayCache.size,
      arrayBytes: this.arrayCache.bytesUsed,
      arrayBytesMax: this.arrayCache.bytesMax,
    };
  }
}

// 全局单例
let globalCache: BufferCache | null = null;

export function getBufferCache(): BufferCache {
  if (!globalCache) {
    globalCache = new BufferCache();
  }
  return globalCache;
}

export function destroyBufferCache(): void {
  if (globalCache) {
    globalCache.clear();
    globalCache = null;
  }
}