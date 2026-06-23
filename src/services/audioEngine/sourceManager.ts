/**
 * SourceManager — 管理所有活跃的 AudioBufferSourceNode
 *
 * 每个播放实例创建一个新的 AudioBufferSourceNode，
 * 通过 GainNode 控制音量，播放完毕后自动断开并回收。
 *
 * 支持：
 *   - 单次触发（one-shot）
 *   - 循环播放
 *   - 停止（带 fadeOut）
 *   - 暂停/恢复（通过记录 offset 重建 SourceNode）
 *   - 变速（playbackRate）
 *   - 音量控制（GainNode）
 */

import { AudioContextManager } from '../audioContextManager';

export interface ActiveSource {
  sourceNode: AudioBufferSourceNode;
  gainNode: GainNode;
  startTime: number; // context.currentTime 当 source.start() 被调用时
  offset: number; // 当前播放偏移（秒），用于 pause/resume
  audioBuffer: AudioBuffer;
  isLooping: boolean;
  playbackRate: number;
  onEndedCallback: (() => void) | null;
}

export class SourceManager {
  private activeSources: ActiveSource[] = [];
  private masterGain: GainNode;
  private ctx: AudioContext;

  constructor() {
    this.ctx = AudioContextManager.getContext();
    this.masterGain = AudioContextManager.getMasterGain();
  }

  /**
   * 创建并播放一个新的 AudioBufferSourceNode
   */
  play(
    audioBuffer: AudioBuffer,
    options: {
      offset?: number;
      volume?: number;
      rate?: number;
      loop?: boolean;
      onEnded?: () => void;
    } = {},
  ): ActiveSource {
    const ctx = this.ctx;

    // 确保 AudioContext 处于运行状态
    if (ctx.state === 'suspended') {
      ctx.resume();
    }

    const sourceNode = ctx.createBufferSource();
    sourceNode.buffer = audioBuffer;

    const gainNode = ctx.createGain();
    gainNode.gain.value = options.volume ?? 1;

    sourceNode.connect(gainNode);
    gainNode.connect(this.masterGain);

    const offset = options.offset ?? 0;
    const rate = options.rate ?? 1;
    const loop = options.loop ?? false;

    sourceNode.playbackRate.value = rate;
    sourceNode.loop = loop;

    const active: ActiveSource = {
      sourceNode,
      gainNode,
      startTime: ctx.currentTime,
      offset,
      audioBuffer,
      isLooping: loop,
      playbackRate: rate,
      onEndedCallback: options.onEnded ?? null,
    };

    sourceNode.onended = () => {
      // 如果不是因为 pause 导致的停止，触发 onEnded 回调
      const idx = this.activeSources.indexOf(active);
      if (idx >= 0) {
        this.activeSources.splice(idx, 1);
        // 清理连接
        try { sourceNode.disconnect(); } catch {}
        try { gainNode.disconnect(); } catch {}
        if (active.onEndedCallback) {
          active.onEndedCallback();
        }
      }
    };

    this.activeSources.push(active);

    // 开始播放
    if (loop) {
      sourceNode.start(0, offset);
    } else {
      sourceNode.start(0, offset);
    }

    return active;
  }

  /**
   * 停止所有活跃的音源
   * @param fadeOutSeconds 淡出时间（秒），0 表示立即停止
   */
  stopAll(fadeOutSeconds: number = 0): void {
    const now = this.ctx.currentTime;
    const sources = [...this.activeSources];

    for (const active of sources) {
      // 清除回调，防止 onended 触发额外的清理逻辑
      active.onEndedCallback = null;
      if (fadeOutSeconds > 0) {
        active.gainNode.gain.linearRampToValueAtTime(0, now + fadeOutSeconds);
        active.sourceNode.stop(now + fadeOutSeconds + 0.01);
      } else {
        try {
          active.sourceNode.stop(0);
        } catch {
          // 可能已经停止
        }
      }
      // 手动 disconnect，避免 onended 回调中 disconnect 被跳过（因为数组已被清空）
      try { active.sourceNode.disconnect(); } catch {}
      try { active.gainNode.disconnect(); } catch {}
    }

    this.activeSources = [];
  }

  /**
   * 停止单个音源
   */
  stop(source: ActiveSource, fadeOutSeconds: number = 0): void {
    const idx = this.activeSources.indexOf(source);
    if (idx < 0) return;

    const now = this.ctx.currentTime;
    if (fadeOutSeconds > 0) {
      source.gainNode.gain.linearRampToValueAtTime(0, now + fadeOutSeconds);
      source.sourceNode.stop(now + fadeOutSeconds + 0.01);
    } else {
      try {
        source.sourceNode.stop(0);
      } catch {}
    }
    // onended 回调会自动清理
  }

  /**
   * 暂停播放（记录当前 offset，停止 SourceNode）
   * 返回当前的 offset 用于后续 resume
   */
  pause(source: ActiveSource): number {
    const elapsed = (this.ctx.currentTime - source.startTime) * source.playbackRate;
    const currentOffset = source.offset + elapsed;
    const duration = source.audioBuffer.duration;

    // 如果已播放完毕，返回 0
    const clampedOffset = source.isLooping
      ? currentOffset % duration
      : Math.min(currentOffset, duration);

    // 停止 source
    try {
      source.sourceNode.stop(0);
    } catch {}

    // 移除活跃列表
    const idx = this.activeSources.indexOf(source);
    if (idx >= 0) {
      this.activeSources.splice(idx, 1);
    }

    try { source.sourceNode.disconnect(); } catch {}
    try { source.gainNode.disconnect(); } catch {}

    return clampedOffset;
  }

  /**
   * 恢复播放（用记录的 offset 创建新的 SourceNode）
   */
  resume(
    source: ActiveSource,
    offset: number,
  ): ActiveSource {
    const newSource = this.play(source.audioBuffer, {
      offset,
      volume: source.gainNode.gain.value,
      rate: source.playbackRate,
      loop: source.isLooping,
      onEnded: source.onEndedCallback ?? undefined,
    });

    return newSource;
  }

  /**
   * 设置音量
   */
  setVolume(source: ActiveSource, volume: number): void {
    source.gainNode.gain.value = volume;
  }

  /**
   * 设置播放速率
   */
  setRate(source: ActiveSource, rate: number): void {
    source.playbackRate = rate;
    source.sourceNode.playbackRate.value = rate;
  }

  /**
   * 设置循环
   */
  setLoop(source: ActiveSource, loop: boolean): void {
    source.isLooping = loop;
    source.sourceNode.loop = loop;
  }

  /**
   * 获取当前播放时间（秒）
   */
  getCurrentTime(source: ActiveSource): number {
    const elapsed = (this.ctx.currentTime - source.startTime) * source.playbackRate;
    const rawOffset = source.offset + elapsed;

    if (source.isLooping) {
      return rawOffset % source.audioBuffer.duration;
    }
    return Math.min(rawOffset, source.audioBuffer.duration);
  }

  /**
   * 获取活跃音源数量
   */
  get activeCount(): number {
    return this.activeSources.length;
  }

  /**
   * 销毁所有音源
   */
  destroy(): void {
    this.stopAll(0);
  }
}