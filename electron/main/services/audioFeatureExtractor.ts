/**
 * 音频频谱特征提取器
 *
 * 使用 meyda 提取音频的频谱特征，用于：
 * 1. 相似度搜索：基于频谱特征找到音色相似的采样
 * 2. 自动标签：基于频谱特征推断音色类型
 * 3. 语义搜索：结合频谱特征和标签进行搜索
 *
 * 特征向量维度：13 (spectralCentroid + spectralRolloff + spectralFlatness +
 *                   spectralSpread + zeroCrossingRate + rms + energy +
 *                   5个频带能量比例)
 */

import { statSync, unlinkSync } from 'fs';
import { readWavAsMono } from './audioAnalyzer';
import { execSync } from 'child_process';
import { tmpdir } from 'os';
import { join } from 'path';
import { extname } from 'path';
import { createRequire } from 'node:module';
import { getFileIOService } from './fileIOService';

// meyda 是 CommonJS 模块
const require = createRequire(import.meta.url);
const Meyda = require('meyda');

/** 支持的音频格式 */
const SUPPORTED_FORMATS = new Set(['.wav', '.mp3', '.flac', '.ogg', '.aiff', '.aif', '.m4a', '.aac', '.wma']);

/** 检测系统是否安装了 ffmpeg */
var ffmpegAvailable: boolean | null = null;
export function hasFfmpeg(): boolean {
  if (ffmpegAvailable !== null) return ffmpegAvailable;
  try {
    execSync('ffmpeg -version', { stdio: 'ignore' });
    ffmpegAvailable = true;
  } catch {
    ffmpegAvailable = false;
  }
  return ffmpegAvailable;
}

/**
 * 使用 ffmpeg 将任意格式音频转换为临时 WAV（PCM 16bit  mono 44100Hz）
 * 返回临时文件路径，调用方负责清理
 */
function convertToWav(filePath: string): string | null {
  if (!hasFfmpeg()) return null;
  const tmpPath = join(tmpdir(), `samplerhub_analyze_${Date.now()}.wav`);
  try {
    execSync(
      `ffmpeg -y -i "${filePath}" -ar 44100 -ac 1 -acodec pcm_s16le -t 30 "${tmpPath}"`,
      { stdio: 'ignore', timeout: 30000 }
    );
    return tmpPath;
  } catch {
    return null;
  }
}

export interface AudioFeatures {
  /** 频谱质心 — 感知亮度 */
  spectralCentroid: number;
  /** 频谱滚降 — 频率分布 */
  spectralRolloff: number;
  /** 频谱平坦度 — 噪声 vs 音调 */
  spectralFlatness: number;
  /** 频谱展宽 — 频率分散度 */
  spectralSpread: number;
  /** 过零率 — 高频/噪声指示 */
  zeroCrossingRate: number;
  /** RMS 能量 — 响度 */
  rms: number;
  /** 总能量 */
  energy: number;
  /** 低频能量比例 (0-250Hz) */
  lowEnergyRatio: number;
  /** 中低频比例 (250-1000Hz) */
  lowMidEnergyRatio: number;
  /** 中频比例 (1-4kHz) */
  midEnergyRatio: number;
  /** 中高频比例 (4-8kHz) */
  highMidEnergyRatio: number;
  /** 高频比例 (8-20kHz) */
  highEnergyRatio: number;
  /** 特征向量（用于相似度计算） */
  featureVector: number[];
}

/**
 * 从音频文件提取频谱特征
 * 支持格式：WAV（原生）、MP3/FLAC/OGG/AIFF/M4A/AAC/WMA（通过 ffmpeg 转换）
 * @param input 文件路径或 Buffer
 */
export function extractAudioFeatures(input: string | Buffer): AudioFeatures | null {
  try {
    let buffer: Buffer | null = null;
    let filePath: string | null = null;

    if (typeof input === 'string') {
      filePath = input;
      const stats = statSync(input);
      if (stats.size > 100 * 1024 * 1024) return null; // 超过100MB跳过
      const ext = input.slice(input.lastIndexOf('.')).toLowerCase();
      if (!SUPPORTED_FORMATS.has(ext)) return null;
    } else {
      buffer = input;
      if (buffer.length > 100 * 1024 * 1024) return null;
      // Buffer 输入：假设为 WAV 格式（无法判断扩展名）
    }

    let audioData: { samples: Float32Array; sampleRate: number } | null = null;
    let tmpFile: string | null = null;

    if (buffer) {
      // Buffer 输入：直接尝试 WAV 解析
      audioData = readWavAsMono(buffer, 30);
    } else if (filePath) {
      const ext = filePath.slice(filePath.lastIndexOf('.')).toLowerCase();
      if (ext === '.wav') {
        // WAV 直接读取
        audioData = readWavAsMono(filePath, 30);
      } else if (hasFfmpeg()) {
        // 其他格式通过 ffmpeg 转换为临时 WAV
        tmpFile = convertToWav(filePath);
        if (tmpFile) {
          audioData = readWavAsMono(tmpFile, 30);
        }
      }
    }

    // 清理临时文件
    if (tmpFile) {
      try {
        unlinkSync(tmpFile);
      } catch {}
    }

    if (!audioData || audioData.samples.length === 0) {
      return null;
    }

    return extractFeaturesFromBuffer(audioData.samples, audioData.sampleRate);
  } catch (err) {
    console.warn('[AudioFeatureExtractor] Failed to extract features:', typeof input === 'string' ? input : '(buffer)', err);
    return null;
  }
}

/**
 * 从 Float32Array 提取频谱特征
 */
export function extractFeaturesFromBuffer(
  samples: Float32Array,
  sampleRate: number
): AudioFeatures {
  const bufferSize = 2048; // FFT 窗口大小
  const hopSize = 1024; // 步进

  // 分帧并提取特征
  const frameCount = Math.floor((samples.length - bufferSize) / hopSize) + 1;

  let sumSpectralCentroid = 0;
  let sumSpectralRolloff = 0;
  let sumSpectralFlatness = 0;
  let sumSpectralSpread = 0;
  let sumZcr = 0;
  let sumRms = 0;
  let sumEnergy = 0;

  // 频带能量累积
  let sumLow = 0;      // 0-250Hz
  let sumLowMid = 0;   // 250-1000Hz
  let sumMid = 0;      // 1-4kHz
  let sumHighMid = 0;  // 4-8kHz
  let sumHigh = 0;     // 8-20kHz
  let totalBandEnergy = 0;

  for (let i = 0; i < frameCount; i++) {
    const start = i * hopSize;
    const frame = samples.slice(start, start + bufferSize);

    const features = Meyda.extract({
      sampleRate,
      bufferSize,
      features: [
        'spectralCentroid',
        'spectralRolloff',
        'spectralFlatness',
        'spectralSpread',
        'zcr',
        'rms',
        'energy',
        'amplitudeSpectrum',
      ],
    }, frame);

    if (!features) continue;

    sumSpectralCentroid += features.spectralCentroid || 0;
    sumSpectralRolloff += features.spectralRolloff || 0;
    sumSpectralFlatness += features.spectralFlatness || 0;
    sumSpectralSpread += features.spectralSpread || 0;
    sumZcr += features.zcr || 0;
    sumRms += features.rms || 0;
    sumEnergy += features.energy || 0;

    // 频带能量分析
    if (features.amplitudeSpectrum) {
      const spectrum = features.amplitudeSpectrum as number[];
      const binFreq = sampleRate / 2 / spectrum.length;

      for (let j = 0; j < spectrum.length; j++) {
        const freq = j * binFreq;
        const amp = spectrum[j] * spectrum[j]; // 能量 = 振幅平方

        if (freq < 250) sumLow += amp;
        else if (freq < 1000) sumLowMid += amp;
        else if (freq < 4000) sumMid += amp;
        else if (freq < 8000) sumHighMid += amp;
        else sumHigh += amp;

        totalBandEnergy += amp;
      }
    }
  }

  const n = Math.max(frameCount, 1);

  const spectralCentroid = sumSpectralCentroid / n;
  const spectralRolloff = sumSpectralRolloff / n;
  const spectralFlatness = sumSpectralFlatness / n;
  const spectralSpread = sumSpectralSpread / n;
  const zeroCrossingRate = sumZcr / n;
  const rms = sumRms / n;
  const energy = sumEnergy / n;

  // 频带能量比例
  const bandTotal = totalBandEnergy || 1;
  const lowEnergyRatio = sumLow / bandTotal;
  const lowMidEnergyRatio = sumLowMid / bandTotal;
  const midEnergyRatio = sumMid / bandTotal;
  const highMidEnergyRatio = sumHighMid / bandTotal;
  const highEnergyRatio = sumHigh / bandTotal;

  // 构建特征向量（归一化）
  const featureVector = [
    spectralCentroid / (sampleRate / 2), // 归一化到 0-1
    spectralRolloff / (sampleRate / 2),
    spectralFlatness,
    spectralSpread / (sampleRate / 2),
    Math.min(zeroCrossingRate / 0.5, 1), // 典型范围 0-0.5
    rms,
    Math.min(energy / 1000, 1),
    lowEnergyRatio,
    lowMidEnergyRatio,
    midEnergyRatio,
    highMidEnergyRatio,
    highEnergyRatio,
  ];

  return {
    spectralCentroid,
    spectralRolloff,
    spectralFlatness,
    spectralSpread,
    zeroCrossingRate,
    rms,
    energy,
    lowEnergyRatio,
    lowMidEnergyRatio,
    midEnergyRatio,
    highMidEnergyRatio,
    highEnergyRatio,
    featureVector,
  };
}

/**
 * 计算两个特征向量之间的欧氏距离（越小越相似）
 */
export function euclideanDistance(a: number[], b: number[]): number {
  if (a.length !== b.length) return Infinity;
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    const diff = a[i] - b[i];
    sum += diff * diff;
  }
  return Math.sqrt(sum);
}

/**
 * 计算余弦相似度（1 = 完全相同，0 = 完全无关）
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  let dot = 0;
  let magA = 0;
  let magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  if (magA === 0 || magB === 0) return 0;
  return dot / (Math.sqrt(magA) * Math.sqrt(magB));
}

/**
 * 基于频谱特征推断音色标签
 */
export function inferTagsFromFeatures(features: AudioFeatures): string[] {
  const tags: string[] = [];

  // 基于频谱质心判断亮度
  if (features.spectralCentroid > 8000) {
    tags.push('bright', 'high-pitched');
  } else if (features.spectralCentroid < 2000) {
    tags.push('dark', 'low-pitched', 'bass');
  }

  // 基于过零率判断噪声/打击乐
  if (features.zeroCrossingRate > 0.15) {
    tags.push('noisy', 'percussive');
  } else if (features.zeroCrossingRate < 0.05) {
    tags.push('smooth', 'sustained');
  }

  // 基于频谱平坦度判断音调性
  if (features.spectralFlatness > 0.3) {
    tags.push('noise', 'texture');
  } else {
    tags.push('tonal', 'pitched');
  }

  // 基于频带能量判断类型
  if (features.lowEnergyRatio > 0.5) {
    tags.push('sub-bass', 'kick-like');
  }
  if (features.midEnergyRatio > 0.4) {
    tags.push('vocal-like', 'snare-like');
  }
  if (features.highEnergyRatio > 0.3) {
    tags.push('hihat-like', 'cymbal-like', 'airy');
  }

  // 基于 RMS 判断动态
  if (features.rms > 0.5) {
    tags.push('loud', 'punchy');
  } else if (features.rms < 0.1) {
    tags.push('quiet', 'soft');
  }

  return tags;
}
