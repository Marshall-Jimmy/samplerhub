/**
 * AudioAnalyzer - 基于 essentia.js 的音频信号分析服务
 * 提供 BPM、调性、音高、响度等音频特征提取
 * 
 * 注意：essentia.js 使用 WASM，首次加载需要初始化
 * 在 Electron 主进程中运行，通过 IPC 调用
 */

import log from 'electron-log';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { getFileIOService } from './fileIOService';

// 获取 essentia.js WASM 文件所在目录
const __filename_node = fileURLToPath(import.meta.url);
const __dirname_node = dirname(__filename_node);
const essentiaWasmDir = join(__dirname_node, '..', '..', '..', 'node_modules', 'essentia.js', 'dist');

export interface AudioAnalysisResult {
  bpm: number | null;
  key: string | null;
  pitch: number | null; // Hz
  loudness: number | null; // LUFS
  confidence: number; // 0-1, 分析置信度
}

// essentia 模块类型
type EssentiaType = {
  BeatTrackerDegara: (signal: Float32Array, maxTempo: number, minTempo: number) => Float32Array;
  KeyExtractor: (signal: Float32Array, ...args: any[]) => { key: string; scale: string };
  shutdown: () => void;
};

// 为函数参数声明 Essentia 别名
type Essentia = EssentiaType;

// 全局 essentia 实例（WASM 只需初始化一次）
var essentiaInstance: EssentiaType | null = null;
var isInitializing = false;

/**
 * 初始化 essentia.js WASM 引擎
 * 使用动态 import 避免 ESM/CJS 冲突
 */
export async function initEssentia(): Promise<void> {
  if (essentiaInstance) return;
  if (isInitializing) {
    while (isInitializing) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    return;
  }

  isInitializing = true;
  try {
    log.info('[AudioAnalyzer] Initializing essentia.js WASM...');

    // 使用动态 import 加载 essentia.js 的 ESM 版本
    const essentiaModule = await import('essentia.js/dist/essentia.js-core.es.js');
    const wasmModule = await import('essentia.js/dist/essentia-wasm.es.js');

    const EssentiaCore = essentiaModule.default;
    // 通过 locateFile 指定 WASM 文件路径，绕过 __dirname 问题
    const wasmModuleInstance = wasmModule.EssentiaWASM;
    wasmModuleInstance.locateFile = (path: string) => {
      if (path.endsWith('.wasm')) {
        return join(essentiaWasmDir, 'essentia-wasm.web.wasm');
      }
      return join(essentiaWasmDir, path);
    };

    essentiaInstance = new EssentiaCore(wasmModuleInstance);
    log.info('[AudioAnalyzer] essentia.js initialized successfully');
  } catch (err) {
    log.error('[AudioAnalyzer] Failed to initialize essentia.js:', err);
    essentiaInstance = null;
    throw err;
  } finally {
    isInitializing = false;
  }
}

/**
 * 获取 essentia 实例
 */
function getEssentia(): EssentiaType {
  if (!essentiaInstance) {
    throw new Error('essentia.js not initialized. Call initEssentia() first.');
  }
  return essentiaInstance;
}

/**
 * 从音频文件路径或 Buffer 读取 PCM 数据（单声道 Float32Array）
 * 支持的格式：WAV（PCM 16/24/32 bit）
 * 对于其他格式，返回 null（需要先解码）
 */
export function readWavAsMono(
  input: string | Buffer,
  maxDurationSeconds?: number
): { samples: Float32Array; sampleRate: number } | null {
  try {
    let buffer: Buffer;

    if (typeof input === 'string') {
      buffer = readFileSync(input);
    } else {
      buffer = input;
    }

    // 检查 WAV 头
    if (buffer.toString('ascii', 0, 4) !== 'RIFF') {
      return null; // 不是 WAV 文件
    }

    // 解析 WAV 头获取格式信息
    const fmtOffset = findChunk(buffer, 'fmt ');
    if (fmtOffset === -1) return null;

    const audioFormat = buffer.readUInt16LE(fmtOffset + 8);
    const numChannels = buffer.readUInt16LE(fmtOffset + 10);
    const sampleRate = buffer.readUInt32LE(fmtOffset + 12);
    const bitsPerSample = buffer.readUInt16LE(fmtOffset + 22);

    // 只支持 PCM 格式 (1)
    if (audioFormat !== 1) return null;

    // 找到 data chunk
    const dataOffset = findChunk(buffer, 'data');
    if (dataOffset === -1) return null;

    const dataSize = buffer.readUInt32LE(dataOffset + 4);
    const data = buffer.subarray(dataOffset + 8, dataOffset + 8 + dataSize);

    // 转换为 Float32Array [-1, 1]
    const bytesPerSample = bitsPerSample / 8;
    const numSamples = Math.floor(dataSize / (bytesPerSample * numChannels));

    // 如果指定了最大时长，限制采样数
    const maxSamples = maxDurationSeconds ? Math.min(numSamples, maxDurationSeconds * sampleRate) : numSamples;

    const mono = new Float32Array(maxSamples);

    for (let i = 0; i < maxSamples; i++) {
      let sum = 0;
      for (let ch = 0; ch < numChannels; ch++) {
        const offset = (i * numChannels + ch) * bytesPerSample;
        if (bitsPerSample === 16) {
          const val = data.readInt16LE(offset);
          sum += val / 32768.0;
        } else if (bitsPerSample === 24) {
          let val = (data[offset + 2] << 16) | (data[offset + 1] << 8) | data[offset];
          if (val & 0x800000) val |= ~0xFFFFFF;
          sum += val / 8388608.0;
        } else if (bitsPerSample === 32) {
          sum += data.readInt32LE(offset) / 2147483648.0;
        }
      }
      mono[i] = sum / numChannels;
    }

    return { samples: mono, sampleRate };
  } catch (err) {
    log.warn('[AudioAnalyzer] Failed to read WAV file:', err);
    return null;
  }
}

/**
 * 在 WAV buffer 中查找 chunk
 */
function findChunk(buffer: Buffer, id: string): number {
  const idBytes = Buffer.from(id, 'ascii');
  let offset = 12; // 跳过 RIFF header
  while (offset < buffer.length - 8) {
    if (buffer.subarray(offset, offset + 4).equals(idBytes)) {
      return offset;
    }
    const chunkSize = buffer.readUInt32LE(offset + 4);
    offset += 8 + chunkSize;
    // 确保对齐到偶数
    if (offset % 2 !== 0) offset++;
  }
  return -1;
}

/**
 * 分析音频文件
 * @param input 音频文件路径或 Buffer
 * @param sampleRate 采样率（可选，从文件中读取）
 * @returns 分析结果
 */
export async function analyzeAudioFile(
  input: string | Buffer,
  sampleRate?: number
): Promise<AudioAnalysisResult> {
  const result: AudioAnalysisResult = {
    bpm: null,
    key: null,
    pitch: null,
    loudness: null,
    confidence: 0,
  };

  try {
    const essentia = getEssentia();

    // 读取音频数据
    const wavData = readWavAsMono(input, 30); // 最多读取30秒
    if (!wavData) {
      log.warn('[AudioAnalyzer] Cannot read audio data from:', typeof input === 'string' ? input : '(buffer)');
      return result;
    }

    // 确保采样率
    const sr = sampleRate || wavData.sampleRate || 44100;
    const analysisData = wavData.samples;

    // 并行执行多项分析
    const [bpmResult, keyResult] = await Promise.allSettled([
      analyzeBPM(essentia, analysisData, sr),
      analyzeKey(essentia, analysisData, sr),
    ]);

    // BPM
    if (bpmResult.status === 'fulfilled' && bpmResult.value !== null) {
      result.bpm = bpmResult.value;
      result.confidence += 0.4;
    }

    // Key
    if (keyResult.status === 'fulfilled' && keyResult.value !== null) {
      result.key = keyResult.value;
      result.confidence += 0.6;
    }

    log.info(`[AudioAnalyzer] Analysis complete: BPM=${result.bpm}, Key=${result.key}, Confidence=${result.confidence}`);
  } catch (err) {
    log.error('[AudioAnalyzer] Analysis failed:', err);
  }

  return result;
}

/**
 * BPM 分析
 */
async function analyzeBPM(
  essentia: Essentia,
  signal: Float32Array,
  sampleRate: number
): Promise<number | null> {
  try {
    // 使用 BeatTrackerDegara 进行 BPM 检测
    const beats = essentia.BeatTrackerDegara(signal, 208, 40);
    
    if (beats && beats.length >= 2) {
      // 从节拍间隔计算 BPM
      const intervals: number[] = [];
      for (let i = 1; i < beats.length; i++) {
        const interval = beats[i] - beats[i - 1];
        if (interval > 0.2 && interval < 2.0) { // 合理的节拍间隔范围
          intervals.push(interval);
        }
      }

      if (intervals.length > 0) {
        // 计算中位数间隔
        intervals.sort((a, b) => a - b);
        const medianInterval = intervals[Math.floor(intervals.length / 2)];
        const bpm = Math.round(60 / medianInterval);

        // BPM 合理性检查
        if (bpm >= 40 && bpm <= 300) {
          return bpm;
        }
      }
    }

    return null;
  } catch (err) {
    log.warn('[AudioAnalyzer] BPM analysis failed:', err);
    return null;
  }
}

/**
 * 调性分析
 */
async function analyzeKey(
  essentia: Essentia,
  signal: Float32Array,
  sampleRate: number
): Promise<string | null> {
  try {
    // 使用 KeyExtractor 直接从音频信号提取调性
    const keyResult = essentia.KeyExtractor(signal, false, 4096, 2048, 12, 5000, 60, 40, 0.0001, 'tonic', sampleRate, 0.01, 440, 'hann');

    if (keyResult && keyResult.key && keyResult.scale) {
      // 格式化调性名称
      const key = formatKeyName(keyResult.key, keyResult.scale);
      return key;
    }

    return null;
  } catch (err) {
    log.warn('[AudioAnalyzer] Key analysis failed:', err);
    return null;
  }
}

/**
 * 格式化调性名称
 * essentia 返回如 "C", "A#", "Gb" 等，加上 "major"/"minor"
 * 转换为项目标准格式如 "Cmaj", "A#min"
 */
function formatKeyName(key: string, scale: string): string | null {
  if (!key || !scale) return null;

  const scaleMap: Record<string, string> = {
    'major': 'maj',
    'minor': 'min',
  };

  const suffix = scaleMap[scale.toLowerCase()] || scale;
  return `${key}${suffix}`;
}

/**
 * 关闭 essentia 实例，释放 WASM 资源
 */
export function shutdownEssentia(): void {
  if (essentiaInstance) {
    try {
      essentiaInstance.shutdown();
    } catch {
      // ignore
    }
    essentiaInstance = null;
    log.info('[AudioAnalyzer] essentia.js shut down');
  }
}
