/**
 * Worker Thread 脚本 - 在独立线程中执行元数据解析和波形生成
 * 通过 postMessage 与主进程通信
 */

import { parentPort } from 'node:worker_threads';
import { parseAudioFile } from './audioParser';
import { generateWaveform } from './waveformGenerator';

parentPort?.on('message', async (msg: { id: number; type: string; payload: any }) => {
  try {
    let result: any;

    switch (msg.type) {
      case 'parseMetadata': {
        const { filePath } = msg.payload;
        result = await parseAudioFile(filePath);
        break;
      }
      case 'generateWaveform': {
        const { filePath } = msg.payload;
        const waveformResult = await generateWaveform(filePath);
        result = waveformResult ? {
          waveform: waveformResult.waveform,
          hasPeaks: waveformResult.peaks.length > 0,
        } : null;
        break;
      }
      default:
        throw new Error(`Unknown task type: ${msg.type}`);
    }

    parentPort?.postMessage({ id: msg.id, result });
  } catch (error) {
    parentPort?.postMessage({ id: msg.id, error: (error as Error).message });
  }
});
