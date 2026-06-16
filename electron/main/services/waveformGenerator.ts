/**
 * 波形数据生成服务
 * 在主进程中生成真实波形数据，存入独立文件供渲染进程使用
 */
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { app } from 'electron';
import { getFileIOService } from './fileIOService';

const WAVEFORM_SAMPLES = 200;

/** 峰值包络点数（更高精度，支持缩放） */
const PEAK_ENVELOPE_SAMPLES = 2000;

/** 获取波形数据存储目录 */
function getWaveformDir(): string {
  const dir = path.join(app.getPath('userData'), 'waveforms');
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

/** 根据 sampleId 生成波形文件路径 */
export function getWaveformFilePath(sampleId: number): string {
  return path.join(getWaveformDir(), `${sampleId}.wf`);
}

/** 根据 sampleId 生成峰值包络文件路径 */
export function getPeakEnvelopeFilePath(sampleId: number): string {
  return path.join(getWaveformDir(), `${sampleId}.peak`);
}

/** 将波形数据写入独立文件 */
export async function writeWaveformFile(sampleId: number, waveform: number[]): Promise<void> {
  const filePath = getWaveformFilePath(sampleId);
  const float32 = new Float32Array(waveform);
  const buffer = Buffer.from(float32.buffer);
  await fsp.writeFile(filePath, buffer);
}

/** 将峰值包络数据写入独立文件（min/max 交替存储） */
export async function writePeakEnvelopeFile(sampleId: number, peaks: { min: number; max: number }[]): Promise<void> {
  const filePath = getPeakEnvelopeFilePath(sampleId);
  // 交替存储: [min0, max0, min1, max1, ...]
  const float32 = new Float32Array(peaks.length * 2);
  for (let i = 0; i < peaks.length; i++) {
    float32[i * 2] = peaks[i].min;
    float32[i * 2 + 1] = peaks[i].max;
  }
  const buffer = Buffer.from(float32.buffer);
  await fsp.writeFile(filePath, buffer);
}

/** 从独立文件读取波形数据 */
export function readWaveformFile(sampleId: number): number[] | null {
  const filePath = getWaveformFilePath(sampleId);
  try {
    if (!fs.existsSync(filePath)) return null;
    const buffer = fs.readFileSync(filePath);
    const float32 = new Float32Array(buffer.buffer, buffer.byteOffset, buffer.byteLength / 4);
    return Array.from(float32);
  } catch {
    return null;
  }
}

/** 从独立文件读取峰值包络数据 */
export function readPeakEnvelopeFile(sampleId: number): { min: number; max: number }[] | null {
  const filePath = getPeakEnvelopeFilePath(sampleId);
  try {
    if (!fs.existsSync(filePath)) return null;
    const buffer = fs.readFileSync(filePath);
    const float32 = new Float32Array(buffer.buffer, buffer.byteOffset, buffer.byteLength / 4);
    const count = float32.length / 2;
    const peaks: { min: number; max: number }[] = [];
    for (let i = 0; i < count; i++) {
      peaks.push({ min: float32[i * 2], max: float32[i * 2 + 1] });
    }
    return peaks;
  } catch {
    return null;
  }
}

/**
 * 从 WAV 文件 Buffer 提取波形数据 + 峰值包络
 */
export function extractWavWaveform(buffer: Buffer): { waveform: number[]; peaks: { min: number; max: number }[] } | null {
  try {
    const riff = buffer.toString('ascii', 0, 4);
    if (riff !== 'RIFF') return null;

    // 找到 data chunk
    let offset = 12;
    while (offset < buffer.length - 8) {
      const chunkId = buffer.toString('ascii', offset, offset + 4);
      const chunkSize = buffer.readUInt32LE(offset + 4);
      if (chunkId === 'data') {
        const dataStart = offset + 8;
        const pcmData = buffer.subarray(dataStart, Math.min(dataStart + chunkSize, buffer.length));

        // 16-bit PCM
        const sampleCount = Math.floor(pcmData.length / 2);

        // 生成 200 点平均波形（兼容旧逻辑）
        const blockSize = Math.floor(sampleCount / WAVEFORM_SAMPLES);
        if (blockSize === 0) return null;

        const waveform: number[] = [];
        for (let i = 0; i < WAVEFORM_SAMPLES; i++) {
          let sum = 0;
          const start = i * blockSize * 2;
          for (let j = 0; j < blockSize && (start + j * 2 + 1) < pcmData.length; j++) {
            const sample = pcmData.readInt16LE(start + j * 2);
            sum += Math.abs(sample);
          }
          waveform.push(sum / blockSize / 32768);
        }

        // 归一化
        const max = Math.max(...waveform);
        if (max > 0) {
          for (let i = 0; i < waveform.length; i++) {
            waveform[i] = waveform[i] / max;
          }
        }

        // 生成 2000 点峰值包络（min/max）
        const peakBlockSize = Math.floor(sampleCount / PEAK_ENVELOPE_SAMPLES);
        if (peakBlockSize === 0) return { waveform, peaks: [] };

        const peaks: { min: number; max: number }[] = [];
        for (let i = 0; i < PEAK_ENVELOPE_SAMPLES; i++) {
          let min = Infinity;
          let maxVal = -Infinity;
          const start = i * peakBlockSize * 2;
          for (let j = 0; j < peakBlockSize && (start + j * 2 + 1) < pcmData.length; j++) {
            const sample = pcmData.readInt16LE(start + j * 2) / 32768;
            if (sample < min) min = sample;
            if (sample > maxVal) maxVal = sample;
          }
          peaks.push({ min, max: maxVal });
        }

        return { waveform, peaks };
      }
      offset += 8 + chunkSize;
      if (chunkSize > buffer.length - offset || offset < 0) break; // 防止溢出和死循环
    }
  } catch {
    // 解析失败
  }

  return null;
}

/**
 * WAV 流式波形提取 — 只读取文件头 + PCM data chunk，避免加载整个文件
 * 对于 50MB 的 WAV 文件，只读取几百 KB 的数据
 */
function extractWavWaveformStreaming(filePath: string): { waveform: number[]; peaks: { min: number; max: number }[] } | null {
  try {
    const fd = fs.openSync(filePath, 'r');
    try {
      // 读取 RIFF 头（12 字节）
      const header = Buffer.alloc(12);
      fs.readSync(fd, header, 0, 12, 0);
      const riff = header.toString('ascii', 0, 4);
      if (riff !== 'RIFF') {
        fs.closeSync(fd);
        return null;
      }

      // 遍历 chunks 找到 data
      let offset = 12;
      const chunkHeader = Buffer.alloc(8);
      while (true) {
        fs.readSync(fd, chunkHeader, 0, 8, offset);
        const chunkId = chunkHeader.toString('ascii', 0, 4);
        const chunkSize = chunkHeader.readUInt32LE(4);

        if (chunkId === 'data') {
          const dataStart = offset + 8;
          // 只读取前 10MB 的 PCM 数据用于波形生成（足够精确）
          const maxRead = Math.min(chunkSize, 10 * 1024 * 1024);
          const pcmBuffer = Buffer.alloc(maxRead);
          const bytesRead = fs.readSync(fd, pcmBuffer, 0, maxRead, dataStart);

          const sampleCount = Math.floor(bytesRead / 2);
          const blockSize = Math.floor(sampleCount / WAVEFORM_SAMPLES);
          if (blockSize === 0) return null;

          const waveform: number[] = [];
          for (let i = 0; i < WAVEFORM_SAMPLES; i++) {
            let sum = 0;
            const start = i * blockSize * 2;
            for (let j = 0; j < blockSize && (start + j * 2 + 1) < bytesRead; j++) {
              const sample = pcmBuffer.readInt16LE(start + j * 2);
              sum += Math.abs(sample);
            }
            waveform.push(sum / blockSize / 32768);
          }

          const max = Math.max(...waveform);
          if (max > 0) {
            for (let i = 0; i < waveform.length; i++) {
              waveform[i] = waveform[i] / max;
            }
          }

          const peakBlockSize = Math.floor(sampleCount / PEAK_ENVELOPE_SAMPLES);
          if (peakBlockSize === 0) return { waveform, peaks: [] };

          const peaks: { min: number; max: number }[] = [];
          for (let i = 0; i < PEAK_ENVELOPE_SAMPLES; i++) {
            let min = Infinity;
            let maxVal = -Infinity;
            const start = i * peakBlockSize * 2;
            for (let j = 0; j < peakBlockSize && (start + j * 2 + 1) < bytesRead; j++) {
              const sample = pcmBuffer.readInt16LE(start + j * 2) / 32768;
              if (sample < min) min = sample;
              if (sample > maxVal) maxVal = sample;
            }
            peaks.push({ min, max: maxVal });
          }

          return { waveform, peaks };
        }

        offset += 8 + chunkSize;
        if (chunkSize > 4 * 1024 * 1024 * 1024 || offset < 0) break; // 防止溢出
      }
    } finally {
      fs.closeSync(fd);
    }
  } catch {
    return null;
  }
  return null;
}

/**
 * AIFF 流式波形提取
 */
function extractAiffWaveformStreaming(filePath: string): { waveform: number[]; peaks: { min: number; max: number }[] } | null {
  try {
    const fd = fs.openSync(filePath, 'r');
    try {
      const header = Buffer.alloc(12);
      fs.readSync(fd, header, 0, 12, 0);
      const form = header.toString('ascii', 0, 4);
      if (form !== 'FORM') return null;
      const formType = header.toString('ascii', 8, 12);
      if (formType !== 'AIFF' && formType !== 'AIFC') return null;

      let offset = 12;
      let numChannels = 1;
      let sampleSize = 16;
      let ssndOffset = -1;
      let ssndSize = 0;

      const chunkHeader = Buffer.alloc(8);
      while (offset < 100 * 1024 * 1024) { // 只扫描前 100MB 的 chunk headers
        fs.readSync(fd, chunkHeader, 0, 8, offset);
        const chunkId = chunkHeader.toString('ascii', 0, 4);
        const chunkSize = chunkHeader.readUInt32BE(4);

        if (chunkId === 'COMM') {
          const commData = Buffer.alloc(Math.min(chunkSize, 16));
          fs.readSync(fd, commData, 0, commData.length, offset + 8);
          numChannels = commData.readUInt16BE(0);
          sampleSize = commData.readUInt16BE(6);
        } else if (chunkId === 'SSND') {
          ssndOffset = offset + 8;
          ssndSize = chunkSize;
          break;
        }

        offset += 8 + chunkSize;
        if (chunkSize > 4 * 1024 * 1024 * 1024 || offset < 0) break;
      }

      if (ssndOffset < 0) return null;

      // 读取 PCM 数据（最多 10MB）
      const maxRead = Math.min(ssndSize, 10 * 1024 * 1024);
      const pcmBuffer = Buffer.alloc(maxRead);
      const bytesRead = fs.readSync(fd, pcmBuffer, 0, maxRead, ssndOffset);

      const bytesPerSample = (sampleSize || 16) / 8;
      const sampleCount = Math.floor(bytesRead / bytesPerSample);
      const blockSize = Math.floor(sampleCount / WAVEFORM_SAMPLES);
      if (blockSize === 0) return null;

      const waveform: number[] = [];
      for (let i = 0; i < WAVEFORM_SAMPLES; i++) {
        let sum = 0;
        const start = i * blockSize * bytesPerSample;
        for (let j = 0; j < blockSize && (start + j * bytesPerSample + 1) < bytesRead; j++) {
          const sample = pcmBuffer.readInt16BE(start + j * bytesPerSample);
          sum += Math.abs(sample);
        }
        waveform.push(sum / blockSize / 32768);
      }

      const max = Math.max(...waveform);
      if (max > 0) {
        for (let i = 0; i < waveform.length; i++) {
          waveform[i] = waveform[i] / max;
        }
      }

      const peakBlockSize = Math.floor(sampleCount / PEAK_ENVELOPE_SAMPLES);
      if (peakBlockSize === 0) return { waveform, peaks: [] };

      const peaks: { min: number; max: number }[] = [];
      for (let i = 0; i < PEAK_ENVELOPE_SAMPLES; i++) {
        let min = Infinity;
        let maxVal = -Infinity;
        const start = i * peakBlockSize * bytesPerSample;
        for (let j = 0; j < peakBlockSize && (start + j * bytesPerSample + 1) < bytesRead; j++) {
          const sample = pcmBuffer.readInt16BE(start + j * bytesPerSample) / 32768;
          if (sample < min) min = sample;
          if (sample > maxVal) maxVal = sample;
        }
        peaks.push({ min, max: maxVal });
      }

      return { waveform, peaks };
    } finally {
      fs.closeSync(fd);
    }
  } catch {
    return null;
  }
}

/**
 * 从 AIFF 文件提取波形数据
 * AIFF 格式：FORM + AIFF + chunks (COMM, SSND 等)
 */
export function extractAiffWaveform(buffer: Buffer): { waveform: number[]; peaks: { min: number; max: number }[] } | null {
  try {
    const form = buffer.toString('ascii', 0, 4);
    if (form !== 'FORM') return null;
    const formType = buffer.toString('ascii', 8, 12);
    if (formType !== 'AIFF' && formType !== 'AIFC') return null;

    // 查找 COMM chunk 获取采样信息
    let offset = 12;
    let numChannels = 0;
    let numSampleFrames = 0;
    let sampleSize = 0;
    let ssndOffset = -1;
    let ssndSize = 0;

    while (offset < buffer.length - 8) {
      const chunkId = buffer.toString('ascii', offset, offset + 4);
      const chunkSize = buffer.readUInt32BE(offset + 4);

      if (chunkId === 'COMM') {
        numChannels = buffer.readUInt16BE(offset + 8);
        numSampleFrames = buffer.readUInt32BE(offset + 10);
        sampleSize = buffer.readUInt16BE(offset + 14);
      } else if (chunkId === 'SSND') {
        ssndOffset = offset + 8;
        ssndSize = chunkSize;
        break;
      }

      offset += 8 + chunkSize;
      // AIFF chunks are padded to even size
      if (chunkSize % 2 !== 0) offset++;
      if (chunkSize > buffer.length - offset || offset < 0) break; // 防止溢出和死循环
    }

    if (ssndOffset < 0 || numChannels === 0 || sampleSize === 0) return null;

    // SSND chunk: 4 bytes offset + 4 bytes blockSize + audio data
    const audioDataStart = ssndOffset + 8;
    const bytesPerSample = sampleSize / 8;
    const pcmData = buffer.subarray(audioDataStart, Math.min(audioDataStart + ssndSize - 8, buffer.length));

    // 仅支持 16-bit PCM
    if (sampleSize !== 16) return null;

    const sampleCount = Math.floor(pcmData.length / (bytesPerSample * numChannels));

    // 生成 200 点平均波形
    const blockSize = Math.floor(sampleCount / WAVEFORM_SAMPLES);
    if (blockSize === 0) return null;

    const waveform: number[] = [];
    for (let i = 0; i < WAVEFORM_SAMPLES; i++) {
      let sum = 0;
      for (let j = 0; j < blockSize; j++) {
        const sampleIdx = (i * blockSize + j) * numChannels;
        const byteOffset = sampleIdx * 2;
        if (byteOffset + 1 < pcmData.length) {
          const sample = pcmData.readInt16BE(byteOffset); // AIFF is big-endian
          sum += Math.abs(sample);
        }
      }
      waveform.push(sum / blockSize / 32768);
    }

    // 归一化
    const max = Math.max(...waveform);
    if (max > 0) {
      for (let i = 0; i < waveform.length; i++) {
        waveform[i] = waveform[i] / max;
      }
    }

    // 生成 2000 点峰值包络
    const peakBlockSize = Math.floor(sampleCount / PEAK_ENVELOPE_SAMPLES);
    if (peakBlockSize === 0) return { waveform, peaks: [] };

    const peaks: { min: number; max: number }[] = [];
    for (let i = 0; i < PEAK_ENVELOPE_SAMPLES; i++) {
      let min = Infinity;
      let maxVal = -Infinity;
      for (let j = 0; j < peakBlockSize; j++) {
        const sampleIdx = (i * peakBlockSize + j) * numChannels;
        const byteOffset = sampleIdx * 2;
        if (byteOffset + 1 < pcmData.length) {
          const sample = pcmData.readInt16BE(byteOffset) / 32768;
          if (sample < min) min = sample;
          if (sample > maxVal) maxVal = sample;
        }
      }
      peaks.push({ min, max: maxVal });
    }

    return { waveform, peaks };
  } catch {
    return null;
  }
}

/**
 * 从音频文件生成波形数据
 * 优先使用 WAV 直接解析，其他格式使用伪随机波形
 * 返回波形数据和峰值包络
 * @param input 文件路径或 Buffer
 */
export async function generateWaveform(
  input: string | Buffer
): Promise<{ waveform: number[]; peaks: { min: number; max: number }[] } | null> {
  try {
    let buffer: Buffer;

    if (typeof input === 'string') {
      if (!fs.existsSync(input)) return null;
      const stats = fs.statSync(input);
      if (stats.size > 500 * 1024 * 1024) return null; // 超过500MB跳过
      buffer = await getFileIOService().readFile(input);
    } else {
      buffer = input;
      if (buffer.length > 500 * 1024 * 1024) return null;
    }

    const filePath = typeof input === 'string' ? input : '';

    // WAV 文件：直接从 Buffer 解析
    if (filePath.toLowerCase().endsWith('.wav') || (!filePath && buffer.length > 0)) {
      const result = extractWavWaveform(buffer);
      if (result) return result;
    }

    // AIFF 文件：直接从 Buffer 解析
    if (filePath.toLowerCase().endsWith('.aiff') || filePath.toLowerCase().endsWith('.aif')) {
      const result = extractAiffWaveform(buffer);
      if (result) return result;
    }

    // 其他格式：生成基于文件特征的伪随机波形（不读文件内容）
    const waveform = typeof input === 'string'
      ? generatePseudoWaveform(input)
      : generatePseudoWaveform('buffer');
    const peaks = typeof input === 'string'
      ? generatePseudoPeaks(input)
      : generatePseudoPeaks('buffer');
    return { waveform, peaks };
  } catch {
    return null;
  }
}

/**
 * 伪随机峰值包络生成（非 WAV 文件回退）
 */
function generatePseudoPeaks(filePath: string): { min: number; max: number }[] {
  const seed = filePath.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
  const peaks: { min: number; max: number }[] = [];
  for (let i = 0; i < PEAK_ENVELOPE_SAMPLES; i++) {
    const x = Math.sin(seed * 9301 + i * 49297 + 233280) * 49297;
    const v = x - Math.floor(x);
    const amplitude = v * 0.6 + 0.2;
    peaks.push({ min: -amplitude, max: amplitude });
  }
  return peaks;
}

/**
 * 伪随机波形生成（非 WAV 文件回退）
 * 基于文件路径生成确定性的波形，同一文件每次结果一致
 */
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

/**
 * 将波形数据编码为 Buffer（用于存入数据库 blob 字段）
 * 使用 Float32Array 紧凑存储
 */
export function encodeWaveform(waveform: number[]): Buffer {
  const float32 = new Float32Array(waveform);
  return Buffer.from(float32.buffer);
}

/**
 * 从数据库 blob 字段解码波形数据
 */
export function decodeWaveform(blob: Buffer): number[] {
  const float32 = new Float32Array(blob.buffer, blob.byteOffset, blob.byteLength / 4);
  return Array.from(float32);
}

/**
 * 检测音频文件的前后空白（静默区域）
 * 返回有效音频的起止时间（秒）
 * threshold: 振幅阈值，低于此值视为静默（0-1，默认0.01，即-40dB）
 * minSilenceFrames: 最少连续静默帧数才算有效空白（默认50帧）
 * @param input 文件路径或 Buffer
 */
export function detectSilence(
  input: string | Buffer,
  threshold: number = 0.01,
  minSilenceFrames: number = 50
): { startTime: number; endTime: number; duration: number } | null {
  try {
    let buffer: Buffer;

    if (typeof input === 'string') {
      if (!fs.existsSync(input)) return null;
      const stats = fs.statSync(input);
      if (stats.size > 500 * 1024 * 1024) return null;
      buffer = fs.readFileSync(input);
    } else {
      buffer = input;
      if (buffer.length > 500 * 1024 * 1024) return null;
    }

    const ext = typeof input === 'string' ? input.toLowerCase() : '';

    let pcmData: Buffer | null = null;
    let sampleRate = 44100;
    let numChannels = 1;

    if (ext.endsWith('.wav')) {
      const result = parseWavPcm(buffer);
      if (!result) return null;
      pcmData = result.pcmData;
      sampleRate = result.sampleRate;
      numChannels = result.numChannels;
    } else if (ext.endsWith('.aiff') || ext.endsWith('.aif')) {
      const result = parseAiffPcm(buffer);
      if (!result) return null;
      pcmData = result.pcmData;
      sampleRate = result.sampleRate;
      numChannels = result.numChannels;
    } else {
      // 非 PCM 格式，无法直接解析
      return null;
    }

    if (!pcmData || pcmData.length < 2) return null;

    const totalSamples = Math.floor(pcmData.length / 2 / numChannels);
    const thresholdAbs = threshold * 32768;

    // 从头找第一个非静默帧
    let startSample = 0;
    let silentRun = 0;
    for (let i = 0; i < totalSamples; i++) {
      let frameMax = 0;
      for (let ch = 0; ch < numChannels; ch++) {
        const offset = (i * numChannels + ch) * 2;
        if (offset + 1 < pcmData.length) {
          const sample = Math.abs(pcmData.readInt16LE(offset));
          if (sample > frameMax) frameMax = sample;
        }
      }
      if (frameMax > thresholdAbs) {
        silentRun = 0;
      } else {
        silentRun++;
      }
      // 如果连续静默帧不够，说明还没到真正的空白
      if (frameMax > thresholdAbs) {
        startSample = i;
        break;
      }
      if (silentRun >= minSilenceFrames && i >= minSilenceFrames) {
        startSample = i - minSilenceFrames;
        break;
      }
    }

    // 从尾找第一个非静默帧
    let endSample = totalSamples - 1;
    silentRun = 0;
    for (let i = totalSamples - 1; i >= 0; i--) {
      let frameMax = 0;
      for (let ch = 0; ch < numChannels; ch++) {
        const offset = (i * numChannels + ch) * 2;
        if (offset + 1 < pcmData.length) {
          const sample = Math.abs(pcmData.readInt16LE(offset));
          if (sample > frameMax) frameMax = sample;
        }
      }
      if (frameMax > thresholdAbs) {
        silentRun = 0;
      } else {
        silentRun++;
      }
      if (frameMax > thresholdAbs) {
        endSample = i;
        break;
      }
      if (silentRun >= minSilenceFrames && (totalSamples - 1 - i) >= minSilenceFrames) {
        endSample = i + minSilenceFrames;
        break;
      }
    }

    const startTime = startSample / sampleRate;
    const endTime = endSample / sampleRate;
    const duration = totalSamples / sampleRate;

    return { startTime, endTime, duration };
  } catch {
    return null;
  }
}

/** 解析 WAV PCM 数据 */
function parseWavPcm(buffer: Buffer): { pcmData: Buffer; sampleRate: number; numChannels: number } | null {
  try {
    const riff = buffer.toString('ascii', 0, 4);
    if (riff !== 'RIFF') return null;

    let offset = 12;
    let sampleRate = 44100;
    let numChannels = 1;
    let dataOffset = -1;
    let dataSize = 0;

    while (offset < buffer.length - 8) {
      const chunkId = buffer.toString('ascii', offset, offset + 4);
      const chunkSize = buffer.readUInt32LE(offset + 4);

      if (chunkId === 'fmt ') {
        numChannels = buffer.readUInt16LE(offset + 10);
        sampleRate = buffer.readUInt32LE(offset + 12);
        const bitsPerSample = buffer.readUInt16LE(offset + 22);
        if (bitsPerSample !== 16) return null; // 仅支持 16-bit
      } else if (chunkId === 'data') {
        dataOffset = offset + 8;
        dataSize = chunkSize;
        break;
      }

      offset += 8 + chunkSize;
      if (chunkSize > buffer.length - offset || offset < 0) break; // 防止溢出和死循环
    }

    if (dataOffset < 0) return null;
    return {
      pcmData: buffer.subarray(dataOffset, dataOffset + dataSize),
      sampleRate,
      numChannels,
    };
  } catch {
    return null;
  }
}

/** 解析 AIFF PCM 数据 */
function parseAiffPcm(buffer: Buffer): { pcmData: Buffer; sampleRate: number; numChannels: number } | null {
  try {
    const form = buffer.toString('ascii', 0, 4);
    if (form !== 'FORM') return null;
    const formType = buffer.toString('ascii', 8, 12);
    if (formType !== 'AIFF' && formType !== 'AIFC') return null;

    let offset = 12;
    let numChannels = 1;
    let sampleRate = 44100;
    let sampleSize = 16;
    let ssndOffset = -1;
    let ssndSize = 0;

    while (offset < buffer.length - 8) {
      const chunkId = buffer.toString('ascii', offset, offset + 4);
      const chunkSize = buffer.readUInt32BE(offset + 4);

      if (chunkId === 'COMM') {
        numChannels = buffer.readUInt16BE(offset + 8);
        sampleSize = buffer.readUInt16BE(offset + 14);
        if (sampleSize !== 16) return null;
        // AIFF sample rate 是 80-bit 扩展精度，简化处理
        const srBytes = buffer.subarray(offset + 16, offset + 20);
        sampleRate = srBytes.readUInt32BE(0);
      } else if (chunkId === 'SSND') {
        ssndOffset = offset + 16; // skip offset + blockSize
        ssndSize = chunkSize - 8;
        break;
      }

      offset += 8 + chunkSize;
      if (chunkSize % 2 !== 0) offset++;
      if (chunkSize > buffer.length - offset || offset < 0) break; // 防止溢出和死循环
    }

    if (ssndOffset < 0) return null;
    return {
      pcmData: buffer.subarray(ssndOffset, ssndOffset + ssndSize),
      sampleRate,
      numChannels,
    };
  } catch {
    return null;
  }
}
