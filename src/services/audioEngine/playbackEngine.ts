/**
 * PlaybackEngine — 原生 Web Audio API 播放内核
 *
 * 核心理念：彻底移除 Howler 依赖，用原生 Web Audio API 构建专为采样管理器设计的轻量播放内核。
 *
 * 架构：
 *   AudioContext (单例) → SourceManager → GainNode → MasterGain → Destination
 *                          ↑
 *   BufferCache (LRU) ← DecoderPool
 *                          ↑
 *   IPC getAudioBuffer(filePath) → ArrayBuffer
 *
 * 播放流程（无延迟路径）：
 *   1. 检查 BufferCache 是否有已解码的 AudioBuffer → 有则直接播放（< 1ms）
 *   2. 检查 ArrayBuffer 缓存 → 有则提交解码 → 播放
 *   3. 无缓存 → IPC 读取 → 缓存 ArrayBuffer → 解码 → 缓存 AudioBuffer → 播放
 *
 * 状态机：idle → loading → playing → paused → stopped
 */

import { AudioContextManager } from '../audioContextManager';
import { getBufferCache, BufferCache } from './bufferCache';
import { getDecoderPool, DecoderPool } from './decoderPool';
import { SourceManager, ActiveSource } from './sourceManager';
import { ipcClient } from '../ipcClient';

// 播放引擎状态
export type EngineState = 'idle' | 'loading' | 'playing' | 'paused' | 'stopped';

// 播放选项
export interface PlayOptions {
  offset?: number;
  volume?: number;
  rate?: number;
  loop?: boolean;
}

// 事件回调
export type EngineEventCallback = (...args: any[]) => void;

// 事件类型
export type EngineEvent =
  | 'play'
  | 'pause'
  | 'stop'
  | 'ended'
  | 'timeupdate'
  | 'error'
  | 'load'
  | 'statechange';

/**
 * PlaybackEngine 单例类
 */
export class PlaybackEngine {
  private ctx: AudioContext;
  private sourceManager: SourceManager;
  private bufferCache: BufferCache;
  private decoderPool: DecoderPool;
  private state: EngineState = 'idle';
  private activeSource: ActiveSource | null = null;
  private pausedOffset: number = 0;
  private currentFilePath: string = '';
  private currentVolume: number = 0.75;
  private currentRate: number = 1;
  private currentLoop: boolean = false;
  private duration: number = 0;
  private rafId: number | null = null;
  private rafActive = false;
  private listeners: Map<EngineEvent, Set<EngineEventCallback>> = new Map();
  // 防止旧异步回调更新状态 —— 唯一权威的 playGeneration
  private playGeneration: number = 0;

  constructor() {
    this.ctx = AudioContextManager.getContext();
    this.sourceManager = new SourceManager();
    this.bufferCache = getBufferCache();
    this.decoderPool = getDecoderPool();
  }

  // ==================== 事件系统 ====================

  on(event: EngineEvent, callback: EngineEventCallback): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(callback);
  }

  off(event: EngineEvent, callback: EngineEventCallback): void {
    this.listeners.get(event)?.delete(callback);
  }

  private emit(event: EngineEvent, ...args: any[]): void {
    this.listeners.get(event)?.forEach((cb) => {
      try {
        cb(...args);
      } catch (err) {
        console.error(`[PlaybackEngine] Error in ${event} listener:`, err);
      }
    });
  }

  private setState(newState: EngineState): void {
    if (this.state !== newState) {
      this.state = newState;
      this.emit('statechange', newState);
    }
  }

  // ==================== 取消（供外部 playerStore 在 loading 期间取消播放） ====================

  /**
   * 取消当前正在进行的异步播放（递增代数，使旧回调跳过）
   * 外部调用 stop() 后也需要调用此方法以确保旧异步回调不会恢复播放
   */
  cancelLoading(): void {
    this.playGeneration++;
    this.stopInternal();
  }

  // ==================== 核心播放 ====================

  /**
   * 播放音频文件
   * @param filePath 文件路径（作为缓存 key）
   * @param options 播放选项
   */
  async play(filePath: string, options: PlayOptions = {}): Promise<void> {
    // 递增代数
    const gen = ++this.playGeneration;

    // 停止当前播放（清除旧 activeSource 和 onended 回调）
    this.stopInternal();

    this.setState('loading');
    this.currentFilePath = filePath;
    this.currentVolume = options.volume ?? this.currentVolume;
    this.currentRate = options.rate ?? this.currentRate;
    this.currentLoop = options.loop ?? this.currentLoop;

    try {
      // 1. 检查 AudioBuffer 缓存
      let audioBuffer = this.bufferCache.getAudio(filePath);

      if (audioBuffer) {
        // 缓存命中 → 直接播放（< 1ms 延迟）
        if (gen !== this.playGeneration) return;
        this.playAudioBuffer(audioBuffer, options.offset ?? 0, gen);
        return;
      }

      // 2. 检查 ArrayBuffer 缓存
      let arrayBuffer = this.bufferCache.getArray(filePath);

      if (!arrayBuffer) {
        // 3. 通过 IPC 读取文件
        arrayBuffer = await ipcClient.getAudioBuffer(filePath);
        if (gen !== this.playGeneration) return;

        // 缓存原始 ArrayBuffer
        this.bufferCache.setArray(filePath, arrayBuffer);
      }

      // 4. 提交解码（urgent 优先级）
      const bufferCopy = arrayBuffer.slice(0);
      audioBuffer = await this.decoderPool.decode(bufferCopy, 'urgent');
      if (gen !== this.playGeneration) return;
      if (!audioBuffer) return;

      // 缓存解码后的 AudioBuffer
      this.bufferCache.setAudio(filePath, audioBuffer);

      // 播放
      this.playAudioBuffer(audioBuffer, options.offset ?? 0, gen);
    } catch (err) {
      if (gen !== this.playGeneration) return;
      console.error('[PlaybackEngine] Play failed:', err);
      this.setState('stopped');
      this.emit('error', err);
    }
  }

  /**
   * 用已解码的 AudioBuffer 直接播放
   * @param gen 当前代数，用于 onEnded 回调中检查是否过期
   */
  private playAudioBuffer(audioBuffer: AudioBuffer, offset: number, gen: number): void {
    this.duration = audioBuffer.duration;

    this.activeSource = this.sourceManager.play(audioBuffer, {
      offset,
      volume: this.currentVolume,
      rate: this.currentRate,
      loop: this.currentLoop,
      onEnded: () => {
        // 代数检查：如果在此期间有新的播放开始，忽略此回调
        if (gen !== this.playGeneration) return;
        if (this.currentLoop) return;
        this.setState('stopped');
        this.stopTimeUpdate();
        this.emit('ended');
      },
    });

    this.setState('playing');
    this.emit('play', {
      filePath: this.currentFilePath,
      duration: this.duration,
    });
    this.emit('load', { duration: this.duration });

    this.startTimeUpdate();
  }

  // ==================== 播放控制 ====================

  /** 暂停。仅在 playing 状态下有效 */
  pause(): boolean {
    if (!this.activeSource || this.state !== 'playing') return false;

    this.pausedOffset = this.sourceManager.pause(this.activeSource);
    this.activeSource = null;
    this.setState('paused');
    this.stopTimeUpdate();
    this.emit('pause', { offset: this.pausedOffset });
    return true;
  }

  /**
   * 恢复播放
   * - paused 状态：从暂停位置恢复
   * - stopped 状态：从头重新播放
   * - 其他状态：no-op
   */
  resume(): boolean {
    if (this.state === 'stopped') {
      // 自然播放结束 → 从头重新播放
      this.play(this.currentFilePath, { offset: 0 });
      return true;
    }

    if (this.state !== 'paused') return false;

    // 检查缓存中是否还有 AudioBuffer
    const audioBuffer = this.bufferCache.getAudio(this.currentFilePath);
    if (!audioBuffer) {
      // 缓存已被淘汰，重新加载
      this.play(this.currentFilePath, { offset: this.pausedOffset });
      return true;
    }

    const gen = this.playGeneration; // 当前代数（不递增，因为不是新播放）

    this.activeSource = this.sourceManager.play(audioBuffer, {
      offset: this.pausedOffset,
      volume: this.currentVolume,
      rate: this.currentRate,
      loop: this.currentLoop,
      onEnded: () => {
        if (gen !== this.playGeneration) return;
        if (this.currentLoop) return;
        this.setState('stopped');
        this.stopTimeUpdate();
        this.emit('ended');
      },
    });

    this.setState('playing');
    this.emit('play', {
      filePath: this.currentFilePath,
      duration: this.duration,
    });
    this.startTimeUpdate();
    return true;
  }

  /** 停止 */
  stop(): void {
    this.stopInternal();
    this.emit('stop');
  }

  private stopInternal(): void {
    this.stopTimeUpdate();
    if (this.activeSource) {
      // 清除 onEnded 回调，防止异步回调竞态
      this.activeSource.onEndedCallback = null;
      this.sourceManager.stop(this.activeSource, 0);
      this.activeSource = null;
    }
    this.pausedOffset = 0;
    this.setState('stopped');
  }

  /** 跳转 */
  seek(time: number): boolean {
    if (!this.activeSource && this.state !== 'paused') return false;

    const clampedTime = Math.max(0, Math.min(time, this.duration));

    if (this.state === 'playing' && this.activeSource) {
      // 停止当前 source，用新 offset 重建
      this.activeSource.onEndedCallback = null;
      this.sourceManager.stop(this.activeSource, 0);
      this.activeSource = null;

      const audioBuffer = this.bufferCache.getAudio(this.currentFilePath);
      if (audioBuffer) {
        const gen = this.playGeneration;
        this.activeSource = this.sourceManager.play(audioBuffer, {
          offset: clampedTime,
          volume: this.currentVolume,
          rate: this.currentRate,
          loop: this.currentLoop,
          onEnded: () => {
            if (gen !== this.playGeneration) return;
            if (this.currentLoop) return;
            this.setState('stopped');
            this.stopTimeUpdate();
            this.emit('ended');
          },
        });
      }
    } else if (this.state === 'paused') {
      this.pausedOffset = clampedTime;
    }

    this.emit('timeupdate', {
      currentTime: clampedTime,
      duration: this.duration,
    });
    return true;
  }

  /** 设置音量 (0-1) */
  setVolume(volume: number): void {
    this.currentVolume = Math.max(0, Math.min(1, volume));
    if (this.activeSource) {
      this.sourceManager.setVolume(this.activeSource, this.currentVolume);
    }
  }

  /** 设置播放速率 */
  setRate(rate: number): void {
    this.currentRate = rate;
    if (this.activeSource) {
      this.sourceManager.setRate(this.activeSource, rate);
    }
  }

  /** 设置循环 */
  setLoop(loop: boolean): void {
    this.currentLoop = loop;
    if (this.activeSource) {
      this.sourceManager.setLoop(this.activeSource, loop);
    }
  }

  // ==================== 预加载 ====================

  async preload(filePath: string, priority: 'normal' | 'low' = 'normal'): Promise<void> {
    if (this.bufferCache.hasAudio(filePath)) return;

    try {
      let arrayBuffer = this.bufferCache.getArray(filePath);
      if (!arrayBuffer) {
        arrayBuffer = await ipcClient.getAudioBuffer(filePath);
        this.bufferCache.setArray(filePath, arrayBuffer);
      }

      const bufferCopy = arrayBuffer.slice(0);
      const audioBuffer = await this.decoderPool.decode(bufferCopy, priority);
      this.bufferCache.setAudio(filePath, audioBuffer);
    } catch (err) {
      console.error(`[PlaybackEngine] Preload failed for ${filePath}:`, err);
    }
  }

  async preloadBatch(filePaths: string[]): Promise<void> {
    const toLoad = filePaths.filter((p) => !this.bufferCache.hasAudio(p));
    if (toLoad.length === 0) return;

    const batchSize = 5;
    for (let i = 0; i < toLoad.length; i += batchSize) {
      const batch = toLoad.slice(i, i + batchSize);
      await Promise.allSettled(
        batch.map((p) => this.preload(p, 'normal')),
      );
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }

  // ==================== 时间更新 ====================

  private startTimeUpdate(): void {
    if (this.rafId !== null) return;

    this.rafActive = true;

    const tick = () => {
      if (!this.rafActive || !this.activeSource || this.state !== 'playing') {
        this.rafId = null;
        this.rafActive = false;
        return;
      }

      const currentTime = this.sourceManager.getCurrentTime(this.activeSource);

      this.emit('timeupdate', {
        currentTime,
        duration: this.duration,
      });

      this.rafId = requestAnimationFrame(tick);
    };

    this.rafId = requestAnimationFrame(tick);
  }

  private stopTimeUpdate(): void {
    this.rafActive = false;
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  // ==================== 状态查询 ====================

  getState(): EngineState {
    return this.state;
  }

  /** 是否正在播放（含 loading 过渡状态） */
  isActive(): boolean {
    return this.state === 'playing' || this.state === 'loading' || this.state === 'paused';
  }

  /** 是否可暂停 */
  canPause(): boolean {
    return this.state === 'playing';
  }

  /** 是否可恢复 */
  canResume(): boolean {
    return this.state === 'paused' || this.state === 'stopped';
  }

  getCurrentTime(): number {
    if (this.state === 'paused') return this.pausedOffset;
    if (!this.activeSource) return 0;
    return this.sourceManager.getCurrentTime(this.activeSource);
  }

  getDuration(): number {
    return this.duration;
  }

  getProgress(): number {
    if (this.duration <= 0) return 0;
    return this.getCurrentTime() / this.duration;
  }

  getVolume(): number {
    return this.currentVolume;
  }

  getRate(): number {
    return this.currentRate;
  }

  isLooping(): boolean {
    return this.currentLoop;
  }

  getCacheStats() {
    return this.bufferCache.getStats();
  }

  getPoolStats() {
    return {
      queueLength: this.decoderPool.queueLength,
      activeDecodes: this.decoderPool.currentActive,
    };
  }

  /** 获取当前文件路径（用于外部判断是否同一采样） */
  getCurrentFilePath(): string {
    return this.currentFilePath;
  }

  // ==================== 生命周期 ====================

  destroy(): void {
    this.stopInternal();
    this.listeners.clear();
    this.bufferCache.clear();
  }
}

// 全局单例
let globalEngine: PlaybackEngine | null = null;

export function getPlaybackEngine(): PlaybackEngine {
  if (!globalEngine) {
    globalEngine = new PlaybackEngine();
  }
  return globalEngine;
}

export function destroyPlaybackEngine(): void {
  if (globalEngine) {
    globalEngine.destroy();
    globalEngine = null;
  }
}