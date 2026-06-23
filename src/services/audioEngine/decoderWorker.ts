/**
 * DecoderWorker — Web Worker 音频解码器
 * 在独立线程中执行 decodeAudioData，通过 Transferable 零拷贝回传 PCM 数据
 *
 * 流程：
 *   主线程 postMessage({ id, buffer: ArrayBuffer }) [transfer]
 *     → Worker: decodeAudioData → 提取各声道 Float32Array
 *     → Worker: postMessage({ id, sampleRate, numberOfChannels, length, channels }) [transfer channels]
 *     → 主线程: AudioContext.createBuffer → copyToChannel → 完成
 */

// Worker 内部持有自己的 AudioContext（不阻塞主线程）
let ctx: AudioContext | null = null;

function getContext(): AudioContext {
  if (!ctx) {
    ctx = new AudioContext();
  }
  return ctx;
}

interface DecodeRequest {
  id: string;
  buffer: ArrayBuffer;
}

interface DecodeSuccess {
  id: string;
  sampleRate: number;
  numberOfChannels: number;
  length: number;
  duration: number;
  channels: ArrayBuffer[];
}

interface DecodeError {
  id: string;
  error: string;
}

self.onmessage = async (e: MessageEvent<DecodeRequest>) => {
  const { id, buffer } = e.data;

  try {
    const audioCtx = getContext();
    const audioBuffer = await audioCtx.decodeAudioData(buffer);

    // 提取所有声道数据为独立的 ArrayBuffer（用于 Transferable 传输）
    const channels: ArrayBuffer[] = [];
    for (let i = 0; i < audioBuffer.numberOfChannels; i++) {
      const channelData = audioBuffer.getChannelData(i);
      // 获取底层 ArrayBuffer 的精确切片（处理可能的 offset）
      const raw = channelData.buffer;
      const byteOffset = channelData.byteOffset;
      const byteLength = channelData.byteLength;
      if (byteOffset === 0 && byteLength === raw.byteLength) {
        channels.push(raw);
      } else {
        // 需要切片以确保独立传输
        const copy = raw.slice(byteOffset, byteOffset + byteLength);
        channels.push(copy);
      }
    }

    const response: DecodeSuccess = {
      id,
      sampleRate: audioBuffer.sampleRate,
      numberOfChannels: audioBuffer.numberOfChannels,
      length: audioBuffer.length,
      duration: audioBuffer.duration,
      channels,
    };

    // Transferable: 将 channels 的 ArrayBuffer 所有权转移给主线程
    (self as any).postMessage(response, channels);
  } catch (err) {
    const response: DecodeError = {
      id,
      error: (err as Error).message || String(err),
    };
    self.postMessage(response);
  }
};