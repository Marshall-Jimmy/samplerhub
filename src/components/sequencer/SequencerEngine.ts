/**
 * SequencerEngine - 步进音序器播放引擎（用于 SequencerPage）
 * 基于 Web Audio API 的精确调度
 */

import { Track, TimeSignature } from '../../stores/sequencerStore';
import { AudioContextManager } from '../../services/audioContextManager';

interface ActiveSourceEntry {
  source: AudioBufferSourceNode;
  gainNode: GainNode;
}

export class SequencerEngine {
  private context: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private delayNode: DelayNode | null = null;
  private delayGain: GainNode | null = null;
  private reverbNode: GainNode | null = null; // 简化为增益节点作为混响总线
  private isPlaying = false;
  private currentStep = 0;
  private tracks: Track[] = [];
  private bpm = 120;
  private swing = 0;
  private timeSignature: TimeSignature = '4/4';
  private buffers: Map<string, AudioBuffer> = new Map();
  // 允许多个音源同时存在，用数组存储同一轨道的所有活跃音源
  private activeSources: Map<string, ActiveSourceEntry[]> = new Map();
  private loopSources: Map<string, AudioBufferSourceNode> = new Map();
  private onStepCallback: ((step: number) => void) | null = null;
  private nextNoteTime = 0;
  private scheduleAheadTime = 0.25; // 增大预调度窗口，避免 32 步模式下调度不及时
  private lookahead = 25;
  private timerId: number | null = null;
  // 用 Set 存储待执行的 timeout ID，已执行的自动清理，避免数组无限增长
  private scheduledTimeouts: Set<number> = new Set();

  async initialize(): Promise<void> {
    this.context = AudioContextManager.getContext();
    this.masterGain = AudioContextManager.getMasterGain();
    AudioContextManager.acquire();
    // 初始化效果器总线
    if (!this.delayNode) {
      this.delayNode = this.context.createDelay(5.0);
      this.delayGain = this.context.createGain();
      this.delayGain.gain.value = 0.3;
      this.delayNode.connect(this.delayGain);
      this.delayGain.connect(this.delayNode); // 反馈
      this.delayGain.connect(this.masterGain);
    }
    if (!this.reverbNode) {
      this.reverbNode = this.context.createGain();
      this.reverbNode.connect(this.masterGain);
    }
  }

  getContext(): AudioContext | null {
    return this.context;
  }

  setOnStep(callback: (step: number) => void): void {
    this.onStepCallback = callback;
  }

  setBpm(bpm: number): void {
    this.bpm = bpm;
  }

  setSwing(swing: number): void {
    this.swing = swing;
  }

  setTimeSignature(ts: TimeSignature): void {
    this.timeSignature = ts;
  }

  setMasterVolume(volume: number): void {
    if (this.masterGain) {
      this.masterGain.gain.value = volume;
    }
  }

  hasBuffer(id: string): boolean {
    return this.buffers.has(id);
  }

  getBuffer(id: string): AudioBuffer | undefined {
    return this.buffers.get(id);
  }

  loadBuffer(id: string, buffer: AudioBuffer): void {
    this.buffers.set(id, buffer);
  }

  updateTracks(tracks: Track[]): void {
    this.tracks = tracks;
  }

  /**
   * 返回一个 16th note 的时长（秒）。
   * 所有轨道以此为基础，按各自的 stepCount 进行缩放。
   */
  private getStepDuration(): number {
    const beatsPerSecond = this.bpm / 60;
    const stepsPerBeat = 4; // 16th notes
    return 1 / (beatsPerSecond * stepsPerBeat);
  }

  /**
   * 改进的 Swing 算法，支持不同拍号。
   * Swing 作用于每拍的第 2 个 8 分音符（即第 2、4 个 16 分音符）。
   * 在 3/4 和 6/8 下也能正确工作。
   */
  private getSwingOffset(stepIndex: number): number {
    if (this.swing === 0) return 0;

    // 计算当前 step 在哪一拍内
    // 32nd-note grid: 8 steps per beat in 4/4
    const stepsPerBeat = 8; // 32nd notes per beat
    const beatIndex = Math.floor(stepIndex / stepsPerBeat);
    const stepInBeat = stepIndex % stepsPerBeat;

    // Swing 只影响每拍的第 2 和第 4 个 16 分音符
    // 在 32nd grid 中，这对应 stepInBeat = 2, 3, 6, 7
    // 但标准 swing 只偏移第 2 个 8 分音符（即 16 分音符 3-4）
    const isSwungStep = stepInBeat === 2 || stepInBeat === 3 ||
                        stepInBeat === 6 || stepInBeat === 7;
    if (!isSwungStep) return 0;

    const swingRatio = this.swing / 100;
    const stepDuration = this.getStepDuration() / 2; // 32nd note duration

    // 对于 swung steps，向后偏移最多一个 16 分音符的时长
    // swing=100% 时，第 2 个 8 分音符完全落在正拍上（triplet feel）
    return stepDuration * 2 * swingRatio;
  }

  private playDrumTrack(track: Track, time: number): void {
    if (!this.context || !this.masterGain) return;
    const buffer = this.buffers.get(track.id);
    if (!buffer) return;

    const source = this.context.createBufferSource();
    const gainNode = this.context.createGain();
    const panNode = this.context.createStereoPanner();

    source.buffer = buffer;
    // 将 pitch 转换为半音（原来直接 +track.pitch 不正确）
    source.playbackRate.value = Math.pow(2, track.pitch / 12);
    gainNode.gain.value = track.velocity;
    panNode.pan.value = track.pan;

    // 主输出链
    source.connect(gainNode);
    gainNode.connect(panNode);
    panNode.connect(this.masterGain);

    // Delay Send
    if (track.delaySend > 0 && this.delayNode) {
      const sendGain = this.context.createGain();
      sendGain.gain.value = track.delaySend * track.velocity;
      panNode.connect(sendGain);
      sendGain.connect(this.delayNode);
    }

    // Reverb Send
    if (track.reverbSend > 0 && this.reverbNode) {
      const sendGain = this.context.createGain();
      sendGain.gain.value = track.reverbSend * track.velocity;
      panNode.connect(sendGain);
      sendGain.connect(this.reverbNode);
    }

    source.start(time);

    // 添加到活跃音源数组
    const entries = this.activeSources.get(track.id) || [];
    const entry: ActiveSourceEntry = { source, gainNode };
    entries.push(entry);
    this.activeSources.set(track.id, entries);

    source.onended = () => {
      // 从数组中移除当前音源
      const currentEntries = this.activeSources.get(track.id);
      if (currentEntries) {
        const idx = currentEntries.indexOf(entry);
        if (idx !== -1) {
          currentEntries.splice(idx, 1);
        }
        if (currentEntries.length === 0) {
          this.activeSources.delete(track.id);
        }
      }
      try { gainNode.disconnect(); } catch {}
      try { panNode.disconnect(); } catch {}
    };
  }

  private startLoopTrack(track: Track): void {
    if (!this.context || !this.masterGain) return;
    if (this.loopSources.has(track.id)) return;

    const buffer = this.buffers.get(track.id);
    if (!buffer) return;

    const source = this.context.createBufferSource();
    const gainNode = this.context.createGain();
    const panNode = this.context.createStereoPanner();

    source.buffer = buffer;
    source.playbackRate.value = Math.pow(2, track.pitch / 12);
    source.loop = true;
    gainNode.gain.value = track.velocity;
    panNode.pan.value = track.pan;

    source.connect(gainNode);
    gainNode.connect(panNode);
    panNode.connect(this.masterGain);

    // Delay Send
    if (track.delaySend > 0 && this.delayNode) {
      const sendGain = this.context.createGain();
      sendGain.gain.value = track.delaySend * track.velocity;
      panNode.connect(sendGain);
      sendGain.connect(this.delayNode);
    }

    // Reverb Send
    if (track.reverbSend > 0 && this.reverbNode) {
      const sendGain = this.context.createGain();
      sendGain.gain.value = track.reverbSend * track.velocity;
      panNode.connect(sendGain);
      sendGain.connect(this.reverbNode);
    }

    source.start();
    this.loopSources.set(track.id, source);
    // loop 轨道只存一个音源
    const entries = this.activeSources.get(track.id) || [];
    entries.push({ source, gainNode });
    this.activeSources.set(track.id, entries);
  }

  private stopLoopTrack(trackId: string): void {
    const source = this.loopSources.get(trackId);
    if (source) {
      try { source.stop(); } catch {}
      this.loopSources.delete(trackId);
    }
    const entries = this.activeSources.get(trackId);
    if (entries) {
      for (const entry of entries) {
        try { entry.gainNode.disconnect(); } catch {}
      }
      this.activeSources.delete(trackId);
    }
  }

  private playTrack(track: Track, time: number): void {
    if (track.type === 'loop') {
      // Loop 轨道不参与步进触发，由 play()/stop() 统一管理
      return;
    } else {
      this.playDrumTrack(track, time);
    }
  }

  private scheduleNote(stepIndex: number, time: number): void {
    const swingOffset = this.getSwingOffset(stepIndex);
    const actualTime = time + swingOffset;

    if (this.onStepCallback) {
      const delayMs = (actualTime - this.context!.currentTime) * 1000;
      if (delayMs > 0) {
        const tid = window.setTimeout(() => {
          this.scheduledTimeouts.delete(tid); // 执行后自动清理
          this.onStepCallback?.(stepIndex);
        }, delayMs);
        this.scheduledTimeouts.add(tid);
      }
    }

    for (const track of this.tracks) {
      // Map global stepIndex to track-local step based on stepCount ratio
      const ratio = 32 / track.stepCount; // 32 is our base grid
      // 只在格子的起始列触发，避免重复触发
      if (stepIndex % ratio !== 0) continue;
      const trackStep = Math.floor(stepIndex / ratio);
      if (trackStep < track.steps.length && track.steps[trackStep]) {
        this.playTrack(track, actualTime);
      }
    }
  }

  private getTotalSteps(): number {
    // Total steps per bar in our base 32nd-note grid
    switch (this.timeSignature) {
      case '3/4':
        return 24; // 3 beats * 8 (32nd notes per beat in 4/4), but let's use 32nd base: 3 * 8 = 24
      case '6/8':
        return 24; // 6 eighth notes = 3 quarter notes, in 32nd grid: 6 * 4 = 24
      case '4/4':
      default:
        return 32; // 4 beats * 8 = 32
    }
  }

  private scheduler = (): void => {
    if (!this.context || !this.isPlaying) return;

    const stepDuration = this.getStepDuration() / 2; // 32nd note duration (base grid)
    const totalSteps = this.getTotalSteps();

    while (this.nextNoteTime < this.context.currentTime + this.scheduleAheadTime) {
      this.scheduleNote(this.currentStep, this.nextNoteTime);

      this.nextNoteTime += stepDuration;
      this.currentStep = (this.currentStep + 1) % totalSteps;
    }

    this.timerId = window.setTimeout(this.scheduler, this.lookahead);
  };

  play(tracks: Track[]): void {
    if (this.isPlaying || !this.context) return;

    this.tracks = tracks;
    this.isPlaying = true;
    this.currentStep = 0;
    this.nextNoteTime = this.context.currentTime;

    // 自动启动所有已加载音频的 loop 轨道
    for (const track of tracks) {
      if (track.type === 'loop' && this.buffers.has(track.id)) {
        this.startLoopTrack(track);
      }
    }

    this.scheduler();
  }

  stop(): void {
    this.isPlaying = false;
    if (this.timerId !== null) {
      clearTimeout(this.timerId);
      this.timerId = null;
    }
    this.scheduledTimeouts.forEach(tid => clearTimeout(tid));
    this.scheduledTimeouts.clear();
    // 停止并断开所有活跃音源
    for (const [, entries] of this.activeSources) {
      for (const entry of entries) {
        try {
          entry.source.onended = null; // 移除回调避免递归
          entry.source.stop();
        } catch {}
        try {
          entry.gainNode.disconnect();
        } catch {}
      }
    }
    this.activeSources.clear();
    this.loopSources.clear();
  }

  dispose(): void {
    this.stop();
    // 断开效果器节点
    try { this.delayNode?.disconnect(); } catch {}
    try { this.delayGain?.disconnect(); } catch {}
    try { this.reverbNode?.disconnect(); } catch {}
    this.delayNode = null;
    this.delayGain = null;
    this.reverbNode = null;
    AudioContextManager.release();
    this.context = null;
    this.masterGain = null;
    this.buffers.clear();
  }
}
