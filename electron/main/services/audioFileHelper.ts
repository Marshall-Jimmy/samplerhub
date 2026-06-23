import { getFileIOService } from './fileIOService';
import { parseAudioFile } from './audioParser';
import { parseMidiFile, isMidiFile } from './midiParser';
import { generateWaveform } from './waveformGenerator';
import { extractAudioFeatures, type AudioFeatures } from './audioFeatureExtractor';
import { analyzeAudioFile, type AudioAnalysisResult } from './audioAnalyzer';

export interface AudioMetadata {
  duration: number;
  sampleRate: number;
  bitRate: number;
  channels: number;
  bpm: number | null;
  key: string | null;
  isMidi: boolean;
  midiMeta?: {
    trackCount: number;
    noteCount: number;
    instruments: string[];
    timeSignature: string | null;
  };
}

export interface AudioWaveform {
  waveform: number[];
  peaks: Array<{ min: number; max: number }>;
}

export interface AudioAnalysis {
  bpm: number | null;
  key: string | null;
}

export class AudioFileHelper {
  private filePath: string;
  private buffer: Buffer | null = null;
  private _metadata: AudioMetadata | null = null;
  private _waveform: AudioWaveform | null = null;
  private _features: AudioFeatures | null = null;
  private _analysis: AudioAnalysisResult | null = null;
  private disposed = false;

  private constructor(filePath: string) {
    this.filePath = filePath;
  }

  /**
   * 工厂方法：加载文件到内存（通过 FileIOService 缓存）
   */
  static async load(filePath: string): Promise<AudioFileHelper> {
    const helper = new AudioFileHelper(filePath);
    // 预读到缓存（通过 FileIOService）
    helper.buffer = await getFileIOService().readFile(filePath);
    return helper;
  }

  /**
   * 从已有 Buffer 创建（不重复读取文件）
   */
  static fromBuffer(filePath: string, buffer: Buffer): AudioFileHelper {
    const helper = new AudioFileHelper(filePath);
    helper.buffer = buffer;
    return helper;
  }

  /**
   * 确保 Buffer 已加载
   */
  private async ensureBuffer(): Promise<Buffer> {
    if (this.disposed) {
      throw new Error('AudioFileHelper already disposed');
    }
    if (!this.buffer) {
      this.buffer = await getFileIOService().readFile(this.filePath);
    }
    return this.buffer;
  }

  /**
   * 获取元数据（懒加载 + 缓存）
   * 第一次调用时解析，后续直接返回缓存
   */
  async ensureMetadata(): Promise<AudioMetadata> {
    if (this._metadata) return this._metadata;
    if (this.disposed) throw new Error('AudioFileHelper already disposed');

    const buffer = await this.ensureBuffer();

    if (isMidiFile(this.filePath)) {
      const midi = await parseMidiFile(buffer);
      this._metadata = {
        duration: midi.duration,
        sampleRate: 0,
        bitRate: 0,
        channels: 0,
        bpm: midi.bpm,
        key: midi.key,
        isMidi: true,
        midiMeta: {
          trackCount: midi.trackCount,
          noteCount: midi.noteCount,
          instruments: midi.instruments,
          timeSignature: midi.timeSignature,
        },
      };
    } else {
      const meta = await parseAudioFile(buffer);
      this._metadata = {
        ...meta,
        isMidi: false,
      };
    }

    return this._metadata;
  }

  /**
   * 获取波形数据（懒加载 + 缓存）
   */
  async ensureWaveform(): Promise<AudioWaveform | null> {
    if (this._waveform) return this._waveform;
    if (this.disposed) throw new Error('AudioFileHelper already disposed');
    const metadata = await this.ensureMetadata();
    if (metadata.isMidi) return null;

    const buffer = await this.ensureBuffer();
    const result = await generateWaveform(buffer);
    if (result) {
      this._waveform = {
        waveform: result.waveform,
        peaks: result.peaks,
      };
    }
    return this._waveform;
  }

  /**
   * 获取频谱特征（懒加载 + 缓存）
   */
  async ensureFeatures(): Promise<AudioFeatures | null> {
    if (this._features) return this._features;
    if (this.disposed) throw new Error('AudioFileHelper already disposed');
    const metadata = await this.ensureMetadata();
    if (metadata.isMidi) return null;

    const buffer = await this.ensureBuffer();
    const result = extractAudioFeatures(buffer);
    if (result) {
      this._features = result;
    }
    return this._features;
  }

  /**
   * 获取 BPM/Key 分析结果（懒加载 + 缓存）
   */
  async ensureAnalysis(): Promise<AudioAnalysisResult | null> {
    if (this._analysis) return this._analysis;
    if (this.disposed) throw new Error('AudioFileHelper already disposed');
    const metadata = await this.ensureMetadata();
    if (metadata.isMidi) return null;

    const buffer = await this.ensureBuffer();
    const sampleRate = this._metadata?.sampleRate;
    const result = await analyzeAudioFile(buffer, sampleRate || undefined);
    if (result) {
      this._analysis = result;
    }
    return this._analysis;
  }

  /**
   * 获取完整元数据（同步 getter，如果还没解析返回 null）
   * 配合 ensureMetadata 使用：先检查是否已解析，没解析再调用 ensure
   */
  get metadata(): AudioMetadata | null {
    return this._metadata;
  }

  /**
   * 获取波形（同步 getter）
   */
  get waveform(): AudioWaveform | null {
    return this._waveform;
  }

  /**
   * 获取特征（同步 getter）
   */
  get features(): AudioFeatures | null {
    return this._features;
  }

  /**
   * 获取分析结果（同步 getter）
   */
  get analysis(): AudioAnalysisResult | null {
    return this._analysis;
  }

  /**
   * 获取原始 Buffer（谨慎使用）
   */
  get rawBuffer(): Buffer | null {
    return this.buffer;
  }

  /**
   * 获取文件路径
   */
  get path(): string {
    return this.filePath;
  }

  /**
   * 是否已经被 dispose
   */
  get isDisposed(): boolean {
    return this.disposed;
  }

  /**
   * 切片（用于预览）
   * 当前简化实现：返回完整 buffer（后续可优化）
   */
  async slice(startSec: number, endSec: number): Promise<Buffer | null> {
    if (this.disposed) throw new Error('AudioFileHelper already disposed');
    const metadata = await this.ensureMetadata();
    if (metadata.isMidi) return null;

    const buffer = await this.ensureBuffer();
    // TODO: 实现真正的切片（提取指定时间范围内的 PCM 数据）
    return buffer;
  }

  /**
   * 释放内存
   */
  dispose(): void {
    this.buffer = null;
    this._metadata = null;
    this._waveform = null;
    this._features = null;
    this._analysis = null;
    this.disposed = true;
  }
}