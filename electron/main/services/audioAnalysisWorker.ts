/**
 * 音频分析 Worker — 在独立线程中处理 CPU 密集型工作
 *
 * 负责：
 * 1. 波形数据提取 (WAV/AIFF 原生解析，其他格式伪随机回退)
 * 2. 频谱特征提取 (Meyda FFT)
 * 3. 自动分类 (基于规则)
 *
 * 通过 parentPort 与主进程通信：
 *   接收: { type: 'analyze', file: { path, name, size } }
 *   发送: { type: 'result', file: {...}, analysis: { bpm, key, waveform, peaks, tags, category, featureVector } }
 *   发送: { type: 'progress', current, total, currentFile }
 *   发送: { type: 'error', file, message }
 *
 * 注意：此文件由 worker_threads 加载，不能使用 Electron API
 *       也不能使用 drizzle/better-sqlite3（它们需要主线程的 Node 上下文）
 */

import { parentPort, threadId } from 'worker_threads';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

// ============ 配置 ============

const WAVEFORM_SAMPLES = 200;
const PEAK_ENVELOPE_SAMPLES = 2000;
const MAX_FILE_SIZE_WAV = 500 * 1024 * 1024; // 500MB
const MAX_FILE_SIZE_FEATURE = 100 * 1024 * 1024; // 100MB
const ANALYSIS_TIMEOUT_MS = 30000; // 单个文件 30 秒超时

// Meyda / Essentia 通过 require 动态加载（CommonJS）
const require = createRequire(import.meta.url);

let Meyda: any = null;
try {
  Meyda = require('meyda');
} catch (err) {
  console.warn(`[Worker #${threadId}] Meyda not available, feature extraction disabled`);
}

// Essentia WASM — 懒加载，仅当收到 analyze-essentia 消息时才初始化
let EssentiaCore: any = null;
let essentiaInitPromise: Promise<any> | null = null;

async function ensureEssentia(): Promise<any> {
  if (EssentiaCore) return EssentiaCore;
  if (essentiaInitPromise) return essentiaInitPromise;

  essentiaInitPromise = (async () => {
    try {
      const essentiaModule = await import('essentia.js/dist/essentia.js-core.es.js');
      const wasmModule = await import('essentia.js/dist/essentia-wasm.es.js');
      const Core = essentiaModule.default;
      const wasm = wasmModule.EssentiaWASM;
      // WASM 需要 locateFile，但在 worker_thread 中 __dirname 不可用
      wasm.locateFile = (p: string) => {
        if (p.endsWith('.wasm')) {
          const nodeRequire = createRequire(import.meta.url);
          const nodePath = nodeRequire('path');
          try {
            return nodePath.join(nodeRequire.resolve('essentia.js').split('essentia.js')[0], 'essentia.js', 'dist', 'essentia-wasm.web.wasm');
          } catch {
            return p;
          }
        }
        return p;
      };
      EssentiaCore = new Core(wasm);
      console.log(`[Worker #${threadId}] Essentia WASM initialized`);
      return EssentiaCore;
    } catch (err) {
      console.warn(`[Worker #${threadId}] Essentia init failed:`, err);
      return null;
    }
  })();

  return essentiaInitPromise;
}

// ============ 消息路由 ============

let isShuttingDown = false;

parentPort?.on('message', (msg) => {
  if (msg?.type === 'analyze') {
    handleAnalyze(msg.files);
  } else if (msg?.type === 'analyze-essentia') {
    handleAnalyzeEssentia(msg.files);
  } else if (msg?.type === 'stop') {
    isShuttingDown = true;
    console.log(`[Worker #${threadId}] Stop signal received`);
  } else if (msg?.type === 'ping') {
    parentPort?.postMessage({ type: 'pong', threadId });
  }
});

function sendProgress(current: number, total: number, currentFile: string) {
  parentPort?.postMessage({ type: 'progress', current, total, currentFile });
}

function sendResult(file: any, analysis: any) {
  parentPort?.postMessage({ type: 'result', file, analysis });
}

function sendError(file: any, message: string) {
  parentPort?.postMessage({ type: 'error', file, message });
}

// ============ 批处理入口 ============

async function handleAnalyze(files: Array<{ path: string; name: string; size: number }>) {
  isShuttingDown = false;
  const total = files.length;

  for (let i = 0; i < files.length; i++) {
    if (isShuttingDown) {
      console.log(`[Worker #${threadId}] Aborted after ${i}/${total} files`);
      break;
    }

    const file = files[i];
    sendProgress(i, total, file.name);

    try {
      const analysis = await analyzeOneFile(file);
      sendResult(file, analysis);
    } catch (err: any) {
      sendError(file, err?.message || String(err));
    }

    // 每个文件之间让出线程，避免完全霸占 CPU
    await new Promise(resolve => setTimeout(resolve, 0));
  }

  parentPort?.postMessage({ type: 'done', processed: files.length });
}

// ============ 单文件分析 ============

interface AnalysisResult {
  isCorrupted: boolean;
  duration: number;
  sampleRate: number;
  bpm: number | null;
  key: string | null;
  waveform: number[] | null;
  peaks: Array<{ min: number; max: number }> | null;
  tags: string[];
  featureVector: number[] | null;
  category: number | null;
  secondaryCategories: number[];
}

async function analyzeOneFile(file: { path: string; name: string; size: number }): Promise<AnalysisResult> {
  // 超时保护
  const timeoutPromise = new Promise<AnalysisResult>((_, reject) => {
    setTimeout(() => reject(new Error('analysis timeout')), ANALYSIS_TIMEOUT_MS);
  });

  return Promise.race([
    doAnalyze(file),
    timeoutPromise
  ]);
}

async function doAnalyze(file: { path: string; name: string; size: number }): Promise<AnalysisResult> {
  const lowerName = file.name.toLowerCase();
  const isMidi = lowerName.endsWith('.mid') || lowerName.endsWith('.midi');

  const result: AnalysisResult = {
    isCorrupted: false,
    duration: 0,
    sampleRate: 0,
    bpm: null,
    key: null,
    waveform: null,
    peaks: null,
    tags: [],
    featureVector: null,
    category: null,
    secondaryCategories: [],
  };

  // --- MIDI 文件：只从文件名解析 BPM/Key ---
  if (isMidi) {
    const inferred = inferBpmAndKeyFromName(file.name);
    result.bpm = inferred.bpm;
    result.key = inferred.key;
    result.waveform = generatePseudoWaveform(file.path);
    result.peaks = generatePseudoPeaks(file.path);
    // MIDI 归到某个分类（使用规则分类）
    const classified = classifyByRules(file.name, file.path);
    result.category = classified.primary;
    result.secondaryCategories = classified.secondary;
    return result;
  }

  // --- 音频文件 ---

  // 1. 波形
  try {
    const wf = extractWaveformStreaming(file.path);
    if (wf) {
      result.waveform = wf.waveform;
      result.peaks = wf.peaks;
    } else {
      // 非 WAV/AIFF → 伪随机波形
      result.waveform = generatePseudoWaveform(file.path);
      result.peaks = generatePseudoPeaks(file.path);
    }
  } catch {
    result.waveform = generatePseudoWaveform(file.path);
    result.peaks = generatePseudoPeaks(file.path);
  }

  // 2. 频谱特征（Meyda）
  if (Meyda) {
    try {
      const features = extractAudioFeatures(file.path);
      if (features) {
        result.featureVector = features.featureVector;
        result.tags = inferTagsFromFeatures(features);
        result.duration = features.duration || 0;
        result.sampleRate = features.sampleRate || 0;
      }
    } catch {
      // 特征提取失败不影响其他分析
    }
  }

  // 3. BPM/Key 从文件名推断（轻量级，避免 Essentia）
  const inferred = inferBpmAndKeyFromName(file.name);
  if (inferred.bpm) result.bpm = inferred.bpm;
  if (inferred.key) result.key = inferred.key;

  // 4. 规则分类
  const classified = classifyByRules(file.name, file.path);
  result.category = classified.primary;
  result.secondaryCategories = classified.secondary;

  return result;
}

// ============ 波形提取 ============

function extractWaveformStreaming(filePath: string): { waveform: number[]; peaks: Array<{ min: number; max: number }> } | null {
  try {
    const stats = fs.statSync(filePath);
    if (stats.size > MAX_FILE_SIZE_WAV) return null;

    const ext = path.extname(filePath).toLowerCase();

    if (ext === '.wav') {
      return extractWavWaveformStreaming(filePath);
    } else if (ext === '.aiff' || ext === '.aif') {
      return extractAiffWaveformStreaming(filePath);
    }

    return null;
  } catch {
    return null;
  }
}

function extractWavWaveformStreaming(filePath: string): { waveform: number[]; peaks: Array<{ min: number; max: number }> } | null {
  try {
    const fd = fs.openSync(filePath, 'r');
    try {
      const header = Buffer.alloc(12);
      fs.readSync(fd, header, 0, 12, 0);
      if (header.toString('ascii', 0, 4) !== 'RIFF') return null;

      let offset = 12;
      let dataStart = -1;
      const chunkHeader = Buffer.alloc(8);

      while (offset < statsSyncSize(filePath)) {
        fs.readSync(fd, chunkHeader, 0, 8, offset);
        const chunkId = chunkHeader.toString('ascii', 0, 4);
        const chunkSize = chunkHeader.readUInt32LE(4);

        if (chunkId === 'data') {
          dataStart = offset + 8;
          const maxRead = Math.min(chunkSize, 10 * 1024 * 1024);
          const pcmBuffer = Buffer.alloc(maxRead);
          const bytesRead = fs.readSync(fd, pcmBuffer, 0, maxRead, dataStart);
          return computeWaveformFromPcm(pcmBuffer, bytesRead, 2, true);
        }
        offset += 8 + chunkSize;
        if (chunkSize > 4 * 1024 * 1024 * 1024 || offset < 0) break;
      }
    } finally {
      fs.closeSync(fd);
    }
  } catch { /* ignore */ }
  return null;
}

function statsSyncSize(filePath: string): number {
  try { return fs.statSync(filePath).size; } catch { return 0; }
}

function extractAiffWaveformStreaming(filePath: string): { waveform: number[]; peaks: Array<{ min: number; max: number }> } | null {
  try {
    const fd = fs.openSync(filePath, 'r');
    try {
      const header = Buffer.alloc(12);
      fs.readSync(fd, header, 0, 12, 0);
      if (header.toString('ascii', 0, 4) !== 'FORM') return null;

      let offset = 12;
      let ssndOffset = -1;
      let ssndSize = 0;
      const chunkHeader = Buffer.alloc(8);

      while (offset < statsSyncSize(filePath)) {
        fs.readSync(fd, chunkHeader, 0, 8, offset);
        const chunkId = chunkHeader.toString('ascii', 0, 4);
        const chunkSize = chunkHeader.readUInt32BE(4);

        if (chunkId === 'SSND') {
          ssndOffset = offset + 16;
          ssndSize = chunkSize - 8;
          break;
        }
        offset += 8 + chunkSize;
        if (chunkSize % 2 !== 0) offset++;
        if (chunkSize > 4 * 1024 * 1024 * 1024 || offset < 0) break;
      }

      if (ssndOffset < 0) return null;
      const maxRead = Math.min(ssndSize, 10 * 1024 * 1024);
      const pcmBuffer = Buffer.alloc(maxRead);
      const bytesRead = fs.readSync(fd, pcmBuffer, 0, maxRead, ssndOffset);
      return computeWaveformFromPcm(pcmBuffer, bytesRead, 2, false);
    } finally {
      fs.closeSync(fd);
    }
  } catch { /* ignore */ }
  return null;
}

function computeWaveformFromPcm(pcmBuffer: Buffer, bytesRead: number, bytesPerSample: number, littleEndian: boolean): { waveform: number[]; peaks: Array<{ min: number; max: number }> } {
  const sampleCount = Math.floor(bytesRead / bytesPerSample);

  // 200 点波形
  const wBlockSize = Math.floor(sampleCount / WAVEFORM_SAMPLES);
  const waveform: number[] = [];
  if (wBlockSize > 0) {
    for (let i = 0; i < WAVEFORM_SAMPLES; i++) {
      let sum = 0;
      const start = i * wBlockSize * bytesPerSample;
      for (let j = 0; j < wBlockSize && (start + j * bytesPerSample + 1) < bytesRead; j++) {
        const sample = littleEndian
          ? pcmBuffer.readInt16LE(start + j * bytesPerSample)
          : pcmBuffer.readInt16BE(start + j * bytesPerSample);
        sum += Math.abs(sample);
      }
      waveform.push(sum / wBlockSize / 32768);
    }
    const max = Math.max(...waveform);
    if (max > 0) for (let i = 0; i < waveform.length; i++) waveform[i] = waveform[i] / max;
  }

  // 2000 点峰值包络
  const pBlockSize = Math.floor(sampleCount / PEAK_ENVELOPE_SAMPLES);
  const peaks: Array<{ min: number; max: number }> = [];
  if (pBlockSize > 0) {
    for (let i = 0; i < PEAK_ENVELOPE_SAMPLES; i++) {
      let min = Infinity;
      let maxVal = -Infinity;
      const start = i * pBlockSize * bytesPerSample;
      for (let j = 0; j < pBlockSize && (start + j * bytesPerSample + 1) < bytesRead; j++) {
        const sample = (littleEndian
          ? pcmBuffer.readInt16LE(start + j * bytesPerSample)
          : pcmBuffer.readInt16BE(start + j * bytesPerSample)) / 32768;
        if (sample < min) min = sample;
        if (sample > maxVal) maxVal = sample;
      }
      peaks.push({ min, max: maxVal });
    }
  }

  return { waveform, peaks };
}

function generatePseudoWaveform(filePath: string): number[] {
  const seed = filePath.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
  const waveform: number[] = [];
  for (let i = 0; i < WAVEFORM_SAMPLES; i++) {
    const x = Math.sin(seed * 9301 + i * 49297 + 233280) * 49297;
    const v = x - Math.floor(x);
    waveform.push(v * 0.6 + 0.2);
  }
  return waveform;
}

function generatePseudoPeaks(filePath: string): Array<{ min: number; max: number }> {
  const seed = filePath.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
  const peaks: Array<{ min: number; max: number }> = [];
  for (let i = 0; i < PEAK_ENVELOPE_SAMPLES; i++) {
    const x = Math.sin(seed * 9301 + i * 49297 + 233280) * 49297;
    const v = x - Math.floor(x);
    const amplitude = v * 0.6 + 0.2;
    peaks.push({ min: -amplitude, max: amplitude });
  }
  return peaks;
}

// ============ 频谱特征提取 ============

interface AudioFeatures {
  spectralCentroid: number;
  spectralRolloff: number;
  spectralFlatness: number;
  spectralSpread: number;
  zeroCrossingRate: number;
  rms: number;
  energy: number;
  lowEnergyRatio: number;
  lowMidEnergyRatio: number;
  midEnergyRatio: number;
  highMidEnergyRatio: number;
  highEnergyRatio: number;
  featureVector: number[];
  duration: number;
  sampleRate: number;
}

function extractAudioFeatures(filePath: string): AudioFeatures | null {
  try {
    const stats = fs.statSync(filePath);
    if (stats.size > MAX_FILE_SIZE_FEATURE) return null;

    const ext = path.extname(filePath).toLowerCase();
    if (ext !== '.wav') return null; // 其他格式没有 ffmpeg 无法处理

    // 读取 WAV 为 mono Float32Array（只取前 30 秒）
    const audioData = readWavAsMono(filePath, 30);
    if (!audioData || audioData.samples.length === 0) return null;

    const { samples, sampleRate } = audioData;
    const duration = samples.length / sampleRate;

    const bufferSize = 2048;
    const hopSize = 1024;
    const frameCount = Math.max(1, Math.floor((samples.length - bufferSize) / hopSize) + 1);

    let sumSC = 0, sumSR = 0, sumSF = 0, sumSS = 0, sumZ = 0, sumR = 0, sumE = 0;
    let sumLow = 0, sumLM = 0, sumM = 0, sumHM = 0, sumH = 0, totalBand = 0;

    for (let i = 0; i < frameCount; i++) {
      const start = i * hopSize;
      const frame = samples.slice(start, start + bufferSize);

      const features = Meyda?.extract({
        sampleRate,
        bufferSize,
        features: ['spectralCentroid', 'spectralRolloff', 'spectralFlatness', 'spectralSpread', 'zcr', 'rms', 'energy', 'amplitudeSpectrum'],
      }, frame);

      if (!features) continue;

      sumSC += features.spectralCentroid || 0;
      sumSR += features.spectralRolloff || 0;
      sumSF += features.spectralFlatness || 0;
      sumSS += features.spectralSpread || 0;
      sumZ += features.zcr || 0;
      sumR += features.rms || 0;
      sumE += features.energy || 0;

      if (features.amplitudeSpectrum) {
        const spectrum = features.amplitudeSpectrum as number[];
        const binFreq = sampleRate / 2 / spectrum.length;
        for (let j = 0; j < spectrum.length; j++) {
          const freq = j * binFreq;
          const amp = spectrum[j] * spectrum[j];
          if (freq < 250) sumLow += amp;
          else if (freq < 1000) sumLM += amp;
          else if (freq < 4000) sumM += amp;
          else if (freq < 8000) sumHM += amp;
          else sumH += amp;
          totalBand += amp;
        }
      }
    }

    const n = Math.max(frameCount, 1);
    const bt = totalBand || 1;

    const featureVector = [
      sumSC / n / (sampleRate / 2),
      sumSR / n / (sampleRate / 2),
      sumSF / n,
      sumSS / n / (sampleRate / 2),
      Math.min(sumZ / n / 0.5, 1),
      sumR / n,
      Math.min(sumE / n / 1000, 1),
      sumLow / bt, sumLM / bt, sumM / bt, sumHM / bt, sumH / bt,
    ];

    return {
      spectralCentroid: sumSC / n,
      spectralRolloff: sumSR / n,
      spectralFlatness: sumSF / n,
      spectralSpread: sumSS / n,
      zeroCrossingRate: sumZ / n,
      rms: sumR / n,
      energy: sumE / n,
      lowEnergyRatio: sumLow / bt,
      lowMidEnergyRatio: sumLM / bt,
      midEnergyRatio: sumM / bt,
      highMidEnergyRatio: sumHM / bt,
      highEnergyRatio: sumH / bt,
      featureVector,
      duration,
      sampleRate,
    };
  } catch {
    return null;
  }
}

function readWavAsMono(filePath: string, maxSeconds: number): { samples: Float32Array; sampleRate: number } | null {
  try {
    const fd = fs.openSync(filePath, 'r');
    try {
      const header = Buffer.alloc(12);
      fs.readSync(fd, header, 0, 12, 0);
      if (header.toString('ascii', 0, 4) !== 'RIFF') return null;

      let offset = 12;
      let dataStart = -1;
      let dataSize = 0;
      let numChannels = 1;
      let sampleRate = 44100;
      let bitsPerSample = 16;
      const chunkHeader = Buffer.alloc(8);
      const fileSize = statsSyncSize(filePath);

      while (offset < fileSize - 8) {
        fs.readSync(fd, chunkHeader, 0, 8, offset);
        const chunkId = chunkHeader.toString('ascii', 0, 4);
        const chunkSize = chunkHeader.readUInt32LE(4);

        if (chunkId === 'fmt ') {
          const fmtData = Buffer.alloc(Math.min(chunkSize, 16));
          fs.readSync(fd, fmtData, 0, fmtData.length, offset + 8);
          numChannels = fmtData.readUInt16LE(2);
          sampleRate = fmtData.readUInt32LE(4);
          bitsPerSample = fmtData.readUInt16LE(14);
        } else if (chunkId === 'data') {
          dataStart = offset + 8;
          dataSize = chunkSize;
          break;
        }
        offset += 8 + chunkSize;
        if (chunkSize > 4 * 1024 * 1024 * 1024 || offset < 0) break;
      }

      if (dataStart < 0 || bitsPerSample !== 16) return null;

      const bytesPerSample = 2;
      const maxBytes = Math.min(dataSize, maxSeconds * sampleRate * numChannels * bytesPerSample);
      const pcmBuffer = Buffer.alloc(maxBytes);
      const bytesRead = fs.readSync(fd, pcmBuffer, 0, maxBytes, dataStart);

      const totalSamples = Math.floor(bytesRead / bytesPerSample / numChannels);
      const mono = new Float32Array(totalSamples);

      for (let i = 0; i < totalSamples; i++) {
        let sum = 0;
        for (let ch = 0; ch < numChannels; ch++) {
          const idx = (i * numChannels + ch) * bytesPerSample;
          if (idx + 1 < bytesRead) {
            sum += pcmBuffer.readInt16LE(idx) / 32768;
          }
        }
        mono[i] = sum / numChannels;
      }

      return { samples: mono, sampleRate };
    } finally {
      fs.closeSync(fd);
    }
  } catch {
    return null;
  }
}

function inferTagsFromFeatures(features: AudioFeatures): string[] {
  const tags: string[] = [];
  if (features.spectralCentroid > 8000) tags.push('bright', 'high-pitched');
  else if (features.spectralCentroid < 2000) tags.push('dark', 'low-pitched');
  if (features.zeroCrossingRate > 0.15) tags.push('noisy', 'percussive');
  else if (features.zeroCrossingRate < 0.05) tags.push('smooth', 'sustained');
  if (features.spectralFlatness > 0.3) tags.push('noise', 'texture');
  else tags.push('tonal', 'pitched');
  if (features.lowEnergyRatio > 0.5) tags.push('sub-bass');
  if (features.midEnergyRatio > 0.4) tags.push('vocal-like');
  if (features.highEnergyRatio > 0.3) tags.push('hihat-like');
  if (features.rms > 0.5) tags.push('loud');
  else if (features.rms < 0.1) tags.push('quiet');
  return tags;
}

// ============ BPM/Key 从文件名推断 ============

function inferBpmAndKeyFromName(fileName: string): { bpm: number | null; key: string | null } {
  // BPM 匹配: 80-200 范围的数字
  const bpmMatch = fileName.match(/\b(0?[8-9]\d|1\d{2}|200)\b/);
  const bpm = bpmMatch ? parseInt(bpmMatch[0], 10) : null;

  // Key 匹配: Am, Cmaj, F#min, 1A 等常见写法
  const keyMatch = fileName.match(/\b([A-Ga-g](#|b)?)\s*(m|min|maj|major|minor)?\b/);
  const key = keyMatch ? keyMatch[0].toUpperCase() : null;

  return { bpm, key };
}

// ============ 规则分类 ============

// 分类 ID 映射 (必须与 DB 中 categories 表一致)
const CATEGORY_KICK = 1;
const CATEGORY_SNARE = 2;
const CATEGORY_CLAP = 3;
const CATEGORY_HIHAT = 4;
const CATEGORY_OPEN_HAT = 5;
const CATEGORY_PERCUSSION = 7;
const CATEGORY_808_BASS = 6;
const CATEGORY_SUB_BASS = 9;
const CATEGORY_SYNTH_LEAD = 10;
const CATEGORY_PAD = 16;
const CATEGORY_DRUM_LOOP = 13;
const CATEGORY_TOP_LOOP = 14;
const CATEGORY_LOOP = 17;
const CATEGORY_VOCAL = 11;
const CATEGORY_FX = 12;
const CATEGORY_ONE_SHOT = 18;
const CATEGORY_PIANO = 30;
const CATEGORY_GUITAR = 31;
const CATEGORY_BRASS = 37;
const CATEGORY_FLUTE = 40;
const CATEGORY_SAX = 41;
const CATEGORY_ORGAN = 39;

function classifyByRules(fileName: string, _filePath: string): { primary: number | null; secondary: number[] } {
  const lower = fileName.toLowerCase();
  const matched: number[] = [];

  // 关键词匹配，顺序即优先级
  const rules: Array<[RegExp, number]> = [
    [/808|sub bass|subbass|sub hit|sub drop/, CATEGORY_808_BASS],
    [/kick|bd |bass drum|\bk\.?wav/, CATEGORY_KICK],
    [/snare|sd /, CATEGORY_SNARE],
    [/clap/, CATEGORY_CLAP],
    [/hi ?hat|hihat|hh|closed hat/, CATEGORY_HIHAT],
    [/open hat|openhat|oh /, CATEGORY_OPEN_HAT],
    [/perc|cong[ao]|bongo|tamb|shaker|tom|cymbal|crash|ride/, CATEGORY_PERCUSSION],
    [/bass/, CATEGORY_SUB_BASS],
    [/synth|chord|pluck|lead|arp/, CATEGORY_SYNTH_LEAD],
    [/pad|atmosphere|ambient|texture/, CATEGORY_PAD],
    [/vocal|vox|voice|chant|choir/, CATEGORY_VOCAL],
    [/fx|sfx|effect|impact|riser|faller|transition|whoosh|glitch|sweep|foley/, CATEGORY_FX],
    [/drum loop|drumloop|full drum|drum break|breakbeat/, CATEGORY_DRUM_LOOP],
    [/top loop|no kick|top loop/, CATEGORY_TOP_LOOP],
    [/loop|full mix|construction kit/, CATEGORY_LOOP],
    [/one ?shot|oneshot|one_shot/, CATEGORY_ONE_SHOT],
    [/piano|keys |key |rhodes|epiano/, CATEGORY_PIANO],
    [/guitar|gtr|acoustic/, CATEGORY_GUITAR],
    [/brass|trumpet|trombone|horn/, CATEGORY_BRASS],
    [/flute|recorder/, CATEGORY_FLUTE],
    [/sax|saxophone/, CATEGORY_SAX],
    [/organ|hammond|b3/, CATEGORY_ORGAN],
  ];

  for (const [pattern, catId] of rules) {
    if (pattern.test(lower)) {
      matched.push(catId);
    }
  }

  if (matched.length === 0) {
    return { primary: null, secondary: [] };
  }
  return { primary: matched[0], secondary: matched.slice(1) };
}

// ============ Essentia 分析 (BPM / Key) ============

interface EssentiaResult {
  bpm: number | null;
  key: string | null;
  pitch: number | null;
}

async function handleAnalyzeEssentia(files: Array<{ path: string; name: string; size: number }>) {
  isShuttingDown = false;
  const total = files.length;

  for (let i = 0; i < files.length; i++) {
    if (isShuttingDown) break;
    const file = files[i];
    sendProgress(i, total, file.name);

    try {
      const result = await analyzeOneFileEssentia(file);
      parentPort?.postMessage({ type: 'essentia-result', file, analysis: result });
    } catch (err: any) {
      parentPort?.postMessage({ type: 'error', file, message: err?.message || String(err) });
    }

    // 每个文件之间让出线程，即使 13k 个文件也不会长时间阻塞 worker
    await new Promise(resolve => setTimeout(resolve, 0));
  }

  parentPort?.postMessage({ type: 'essentia-done', processed: files.length });
}

async function analyzeOneFileEssentia(file: { path: string; name: string; size: number }): Promise<EssentiaResult> {
  const result: EssentiaResult = { bpm: null, key: null, pitch: null };

  // 1. 尝试初始化 Essentia（懒加载，只执行一次）
  const essentia = await ensureEssentia();
  if (!essentia) return result;

  // 2. 读取 WAV 文件为 mono Float32Array（只取前 30 秒）
  const wavData = readWavAsMono(file.path, 30);
  if (!wavData) return result;

  const signal = wavData.samples;
  const sr = wavData.sampleRate;

  // 3. BPM 检测 — BeatTrackerDegara 是同步 WASM 调用，在 worker 中执行不阻塞主进程
  try {
    const beats = essentia.BeatTrackerDegara(signal, 208, 40);
    if (beats && beats.length >= 2) {
      const intervals: number[] = [];
      for (let j = 1; j < beats.length; j++) {
        const iv = beats[j] - beats[j - 1];
        if (iv > 0.2 && iv < 2.0) intervals.push(iv);
      }
      if (intervals.length > 0) {
        intervals.sort((a, b) => a - b);
        const median = intervals[Math.floor(intervals.length / 2)];
        const bpm = Math.round(60 / median);
        if (bpm >= 40 && bpm <= 300) result.bpm = bpm;
      }
    }
  } catch { /* ignore */ }

  // 4. Key 检测 — KeyExtractor（同步 WASM 调用，在 worker 中安全）
  try {
    const keyResult = essentia.KeyExtractor(signal, false, 4096, 2048, 12, 5000, 60, 40, 0.0001, 'tonic', sr, 0.01, 440, 'hann');
    if (keyResult && keyResult.key && keyResult.scale) {
      const suffix = keyResult.scale.toLowerCase() === 'major' ? 'maj' : 'min';
      result.key = `${keyResult.key}${suffix}`;
    }
  } catch { /* ignore */ }

  return result;
}

console.log(`[Worker #${threadId}] Ready`);
