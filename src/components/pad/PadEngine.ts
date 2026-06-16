/**
 * PadEngine - 打击垫音频引擎
 * 支持音高偏移、声像、效果器发送（Delay/Reverb）
 */

import { AudioContextManager } from '../../services/audioContextManager';

export interface PadSample {
  id: string;
  key: string;
  name: string;
  filePath?: string;
  buffer?: AudioBuffer;
}

export interface PlayOptions {
  volume?: number;
  pan?: number;
  pitch?: number; // semitones, -12 ~ +12
  mode?: 'oneshot' | 'loop';
  delaySend?: number;
  reverbSend?: number;
  velocity?: number; // 0~1, for sequencer
}

interface ActiveSource {
  source: AudioBufferSourceNode;
  nodes: AudioNode[];
}

export class PadEngine {
  private context: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private buffers: Map<string, AudioBuffer> = new Map();
  private activeSources: Map<string, ActiveSource> = new Map();

  // Effect buses
  private delayNode: DelayNode | null = null;
  private delayFeedback: GainNode | null = null;
  private delayWet: GainNode | null = null;
  private delayDry: GainNode | null = null;
  private reverbNode: ConvolverNode | null = null;
  private reverbWet: GainNode | null = null;
  private reverbDry: GainNode | null = null;

  async initialize(): Promise<void> {
    this.context = AudioContextManager.getContext();
    this.masterGain = AudioContextManager.getMasterGain();
    AudioContextManager.acquire();
    this._initEffects();
  }

  private _initEffects(): void {
    if (!this.context || !this.masterGain) return;

    // Delay chain: source -> delayDry -> master
    //                    -> delayNode -> delayFeedback -> delayNode (feedback loop)
    //                    -> delayWet -> master
    this.delayNode = this.context.createDelay(5.0);
    this.delayFeedback = this.context.createGain();
    this.delayWet = this.context.createGain();
    this.delayDry = this.context.createGain();

    this.delayNode.connect(this.delayFeedback);
    this.delayFeedback.connect(this.delayNode);
    this.delayNode.connect(this.delayWet);
    this.delayWet.connect(this.masterGain);
    this.delayDry.connect(this.masterGain);

    // Reverb chain (using simple impulse for now)
    this.reverbNode = this.context.createConvolver();
    this.reverbWet = this.context.createGain();
    this.reverbDry = this.context.createGain();

    this._generateReverbIR();
    this.reverbNode.connect(this.reverbWet);
    this.reverbWet.connect(this.masterGain);
    this.reverbDry.connect(this.masterGain);

    // Default effect levels
    this.setDelayTime(0.3);
    this.setDelayFeedback(0.3);
    this.setDelayMix(0.2);
    this.setReverbMix(0.2);
  }

  private _generateReverbIR(): void {
    if (!this.context || !this.reverbNode) return;
    const sampleRate = this.context.sampleRate;
    const length = sampleRate * 2; // 2 seconds
    const impulse = this.context.createBuffer(2, length, sampleRate);
    for (let channel = 0; channel < 2; channel++) {
      const data = impulse.getChannelData(channel);
      for (let i = 0; i < length; i++) {
        const decay = Math.pow(1 - i / length, 2);
        data[i] = (Math.random() * 2 - 1) * decay * 0.5;
      }
    }
    this.reverbNode.buffer = impulse;
  }

  getContext(): AudioContext | null {
    return this.context;
  }

  async loadSampleFromFile(file: File, id: string): Promise<boolean> {
    try {
      await this.initialize();
      const arrayBuffer = await file.arrayBuffer();
      if (!this.context) return false;
      const audioBuffer = await this.context.decodeAudioData(arrayBuffer);
      this.buffers.set(id, audioBuffer);
      return true;
    } catch (error) {
      console.error('[PadEngine] Error loading file:', error);
      return false;
    }
  }

  async loadSampleFromPath(filePath: string, id: string): Promise<boolean> {
    try {
      await this.initialize();
      // 使用 IPC 读取音频文件，避免 file:// URL 特殊字符问题
      const { ipcClient } = await import('../../services/ipcClient');
      const arrayBuffer = await ipcClient.getAudioBuffer(filePath);
      if (!arrayBuffer) return false;
      if (!this.context) return false;
      const audioBuffer = await this.context.decodeAudioData(arrayBuffer);
      this.buffers.set(id, audioBuffer);
      return true;
    } catch (error) {
      console.error('[PadEngine] Error loading sample:', error);
      return false;
    }
  }

  async loadSampleFromArrayBuffer(arrayBuffer: ArrayBuffer, id: string): Promise<boolean> {
    try {
      await this.initialize();
      if (!this.context) return false;
      const audioBuffer = await this.context.decodeAudioData(arrayBuffer);
      this.buffers.set(id, audioBuffer);
      return true;
    } catch (error) {
      console.error('[PadEngine] Error decoding sample:', error);
      return false;
    }
  }

  setBuffer(id: string, buffer: AudioBuffer): void {
    this.buffers.set(id, buffer);
  }

  hasBuffer(id: string): boolean {
    return this.buffers.has(id);
  }

  play(id: string, options: PlayOptions = {}): void {
    if (!this.context || !this.masterGain) return;
    const buffer = this.buffers.get(id);
    if (!buffer) return;

    const {
      volume = 1,
      pan = 0,
      pitch = 0,
      mode = 'oneshot',
      delaySend = 0,
      reverbSend = 0,
      velocity = 1,
    } = options;

    // 如果已有同 id 的 source 在播放，先 stop 它
    const existing = this.activeSources.get(id);
    if (existing) {
      try {
        existing.source.stop();
        existing.nodes.forEach(n => { try { n.disconnect(); } catch {} });
      } catch (e) {
        console.debug('[PadEngine] AudioNode stop failed:', e);
      }
      this.activeSources.delete(id);
    }

    const source = this.context.createBufferSource();
    const gainNode = this.context.createGain();
    const panNode = this.context.createStereoPanner();
    const nodes: AudioNode[] = [gainNode, panNode];

    source.buffer = buffer;
    source.loop = mode === 'loop';

    // Pitch: playbackRate = 2^(pitch/12)
    source.playbackRate.value = Math.pow(2, pitch / 12);

    const finalVolume = volume * velocity;
    gainNode.gain.value = finalVolume;
    panNode.pan.value = pan;

    // Connect to main chain
    source.connect(gainNode);
    gainNode.connect(panNode);
    panNode.connect(this.masterGain);

    // Effect sends
    if (delaySend > 0 && this.delayNode && this.delayDry) {
      const delayGain = this.context.createGain();
      delayGain.gain.value = delaySend * finalVolume;
      panNode.connect(delayGain);
      delayGain.connect(this.delayNode);
      nodes.push(delayGain);
    }

    if (reverbSend > 0 && this.reverbNode && this.reverbDry) {
      const reverbGain = this.context.createGain();
      reverbGain.gain.value = reverbSend * finalVolume;
      panNode.connect(reverbGain);
      reverbGain.connect(this.reverbNode);
      nodes.push(reverbGain);
    }

    source.start();
    this.activeSources.set(id, { source, nodes });

    // 如果是 oneshot，播放结束后自动清理
    if (mode === 'oneshot') {
      source.onended = () => {
        this.activeSources.delete(id);
        nodes.forEach(n => { try { n.disconnect(); } catch {} });
      };
    }
  }

  stop(id: string): void {
    const entry = this.activeSources.get(id);
    if (entry) {
      try {
        entry.source.stop();
        entry.nodes.forEach(n => { try { n.disconnect(); } catch {} });
      } catch (e) {
        console.debug('[PadEngine] AudioNode disconnect failed:', e);
      }
      this.activeSources.delete(id);
    }

  }

  stopAll(): void {
    for (const [, entry] of this.activeSources) {
      try {
        entry.source.stop();
        entry.nodes.forEach(n => { try { n.disconnect(); } catch {} });
      } catch (e) {
        console.debug('[PadEngine] GainNode cleanup failed:', e);
      }
    }
    this.activeSources.clear();
  }

  setMasterVolume(volume: number): void {
    if (this.masterGain) {
      this.masterGain.gain.value = volume;
    }
  }

  // Effect setters
  setDelayTime(time: number): void {
    if (this.delayNode) {
      this.delayNode.delayTime.value = time;
    }
  }

  setDelayFeedback(feedback: number): void {
    if (this.delayFeedback) {
      this.delayFeedback.gain.value = feedback;
    }
  }

  setDelayMix(mix: number): void {
    if (this.delayWet && this.delayDry) {
      this.delayWet.gain.value = mix;
      this.delayDry.gain.value = 1 - mix;
    }
  }

  setReverbMix(mix: number): void {
    if (this.reverbWet && this.reverbDry) {
      this.reverbWet.gain.value = mix;
      this.reverbDry.gain.value = 1 - mix;
    }
  }

  dispose(): void {
    this.stopAll();
    AudioContextManager.release();
    this.context = null;
    this.masterGain = null;
    this.delayNode = null;
    this.delayFeedback = null;
    this.delayWet = null;
    this.delayDry = null;
    this.reverbNode = null;
    this.reverbWet = null;
    this.reverbDry = null;
    this.buffers.clear();
  }
}
