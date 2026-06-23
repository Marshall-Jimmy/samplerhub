import { ipcMain, dialog, BrowserWindow } from 'electron';
import { IPC_CHANNELS } from '../../../shared/types/ipc.types';
import type { IpcContext } from './ipcTypes';
import { samples } from '../../../drizzle/schema';
import { eq } from 'drizzle-orm';
import fs from 'node:fs';
import path from 'node:path';
import { extractWavWaveform, generatePseudoWaveform, createZipBuffer } from './ipcUtils';
import { decodeWaveform, readWaveformFile, readPeakEnvelopeFile, writeWaveformFile } from './waveformGenerator';
import { analyzeAudioFile } from './audioAnalyzer';
import { isMidiFile, parseMidiFile } from './midiParser';
import { validatePath, validateNumber, validatePositiveInt, validateArray } from './ipcValidation';
import { getFileIOService } from './fileIOService';

export function registerAudioHandlers(ctx: IpcContext): void {
  const { db, sqlite } = ctx;

  // 导出选区（使用 ffmpeg 裁剪）
  ipcMain.handle(IPC_CHANNELS.EXPORT_SELECTION, async (_event, data: { filePath: string; startTime: number; endTime: number }) => {
    try {
      const filePath = validatePath(data?.filePath, 'filePath');
      const startTime = validateNumber(data?.startTime, 'startTime');
      const endTime = validateNumber(data?.endTime, 'endTime');
      if (startTime < 0 || endTime <= startTime) {
        return { success: false, error: 'Invalid time range: startTime must be >= 0 and endTime > startTime' };
      }
      const path = await import('path');
      const fs = await import('fs');
      const { execFile } = await import('child_process');
      const { promisify } = await import('util');
      const execFileAsync = promisify(execFile);

      const ext = path.extname(filePath);
      const baseName = path.basename(filePath, ext);
      const dir = path.dirname(filePath);
      const outputPath = path.join(dir, `${baseName}_clip_${startTime.toFixed(1)}s-${endTime.toFixed(1)}s${ext}`);

      // 尝试使用 ffmpeg（优先查找应用内置路径，其次系统 PATH）
      let ffmpegPath = 'ffmpeg';
      try {
        const { app } = await import('electron');
        const resourcesPath = process.resourcesPath || app.getAppPath();
        // 检查 resources 目录下是否有 ffmpeg
        const possiblePaths = [
          path.join(resourcesPath, 'ffmpeg', 'ffmpeg.exe'),
          path.join(resourcesPath, 'ffmpeg.exe'),
          path.join(path.dirname(process.execPath), 'ffmpeg.exe'),
        ];
        for (const p of possiblePaths) {
          if (fs.existsSync(p)) {
            ffmpegPath = p;
            break;
          }
        }
      } catch (e) {
        console.warn('[ipc] Failed to locate bundled ffmpeg, falling back to system PATH:', (e as Error)?.message);
      }
      const duration = endTime - startTime;
      try {
        await execFileAsync(ffmpegPath, [
          '-i', filePath,
          '-ss', String(startTime),
          '-t', String(duration),
          '-y',
          '-c', 'copy',
          outputPath,
        ], { timeout: 30000 });
        return { success: true, data: outputPath };
      } catch {
        // ffmpeg 不可用，使用简单复制方式
        fs.copyFileSync(filePath, outputPath);
        return { success: true, data: outputPath };
      }
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  });

  // 获取波形数据：优先从数据库读取，回退到实时生成
  ipcMain.handle(IPC_CHANNELS.GET_WAVEFORM, async (_event, data: { filePath: string }) => {
    try {
      const filePath = validatePath(data?.filePath, 'filePath');

      // 1. 优先从独立波形文件读取
      const sampleRow = sqlite.prepare('SELECT id FROM samples WHERE file_path = ?').get(filePath) as { id: number } | undefined;
      if (sampleRow) {
        const fileWaveform = readWaveformFile(sampleRow.id);
        if (fileWaveform) {
          return { success: true, data: fileWaveform };
        }
      }

      // 2. 回退：从数据库 BLOB 读取（兼容旧数据）
      const result = await db.select({ waveformData: samples.waveformData })
        .from(samples)
        .where(eq(samples.filePath, filePath))
        .limit(1);

      if (result.length > 0 && result[0].waveformData) {
        const waveform = decodeWaveform(result[0].waveformData as Buffer);
        return { success: true, data: waveform };
      }

      // 3. 数据库无波形数据，实时生成
      if (!fs.existsSync(filePath)) {
        return { success: false, error: 'File not found' };
      }

      const fileBuffer = await getFileIOService().readFile(filePath);

      if (filePath.toLowerCase().endsWith('.wav')) {
        const waveform = extractWavWaveform(fileBuffer);
        if (waveform) {
          return { success: true, data: waveform };
        }
      }

      const waveform = generatePseudoWaveform(filePath);
      return { success: true, data: waveform };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  });

  // 保存波形数据到 .wf 文件（用于伪随机波形升级为真实波形）
  ipcMain.handle(IPC_CHANNELS.SAVE_WAVEFORM, async (_event, data: { sampleId: number; waveform: number[] }) => {
    try {
      const sampleId = validatePositiveInt(data?.sampleId, 'sampleId');
      const waveform = validateArray<number>(data?.waveform, 'waveform', (item) => validateNumber(item));
      if (waveform.length === 0) {
        return { success: false, error: 'waveform array is empty' };
      }
      writeWaveformFile(sampleId, waveform);
      return { success: true };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  });

  // 获取峰值包络数据（高精度 min/max，支持缩放）
  ipcMain.handle('audio:getPeakEnvelope', async (_event, data: { filePath: string }) => {
    try {
      const filePath = validatePath(data?.filePath, 'filePath');

      const sampleRow = sqlite.prepare('SELECT id FROM samples WHERE file_path = ?').get(filePath) as { id: number } | undefined;
      if (sampleRow) {
        const peaks = readPeakEnvelopeFile(sampleRow.id);
        if (peaks && peaks.length > 0) {
          return { success: true, data: peaks };
        }
      }
      return { success: false, error: 'No peak envelope data' };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  });

  // 获取音频文件 Buffer（供渲染进程 Web Audio API 解码获取真实波形）
  ipcMain.handle('audio:getBuffer', async (_event, data: { filePath: string }) => {
    try {
      const filePath = validatePath(data?.filePath, 'filePath');
      if (!fs.existsSync(filePath)) {
        return { success: false, error: 'File not found' };
      }
      const fileBuffer = await getFileIOService().readFile(filePath);
      // 转为 base64 传输
      const base64 = fileBuffer.toString('base64');
      return { success: true, data: base64 };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  });

  // ── MIDI 解析 ──────────────────────────────────
  // 解析 MIDI 文件元数据
  ipcMain.handle(IPC_CHANNELS.PARSE_MIDI, async (_event, data: { filePath: string }) => {
    try {
      if (!isMidiFile(data.filePath)) {
        return { success: false, error: 'Not a MIDI file' };
      }
      const metadata = await parseMidiFile(data.filePath);
      return { success: true, data: metadata };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  });

  // 获取 MIDI 文件预览数据（音符列表，用于钢琴卷帘渲染）
  ipcMain.handle(IPC_CHANNELS.GET_MIDI_PREVIEW, async (_event, data: { filePath: string }) => {
    try {
      if (!isMidiFile(data.filePath)) {
        return { success: false, error: 'Not a MIDI file' };
      }
      const { Midi } = await import('@tonejs/midi');
      const buffer = await import('fs/promises').then(fs => fs.readFile(data.filePath));
      const midi = new Midi(buffer);

      const tracks = midi.tracks.map(track => ({
        name: track.name || `Track ${(track as any).channel + 1}`,
        channel: (track as any).channel,
        notes: track.notes.map(note => ({
          midi: note.midi,
          time: note.time,
          duration: note.duration,
          velocity: note.velocity,
          name: note.name,
        })),
        instrument: track.instrument?.name || null,
      }));

      return {
        success: true,
        data: {
          duration: midi.duration,
          tracks,
          header: {
            tempos: midi.header.tempos.map((t: any) => ({ bpm: t.bpm, time: t.time ?? t.ticks })),
            timeSignatures: midi.header.timeSignatures.map((ts: any) => ({
              timeSignature: ts.timeSignature,
              time: ts.time ?? ts.ticks,
            })),
            keySignatures: midi.header.keySignatures.map((ks: any) => ({
              key: ks.key,
              scale: ks.scale,
              time: ks.time ?? ks.ticks,
            })),
          },
        },
      };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  });

  // ─── 音频信号分析（essentia.js） ────────────────────────────────────────

  ipcMain.handle(IPC_CHANNELS.AUDIO_ANALYZE_FILE, async (_event, filePath: string) => {
    try {
      const result = await analyzeAudioFile(filePath);
      // 更新数据库
      if (result.bpm !== null || result.key !== null) {
        await db.update(samples)
          .set({
            ...(result.bpm !== null ? { bpm: result.bpm } : {}),
            ...(result.key !== null ? { key: result.key } : {}),
          })
          .where(eq(samples.filePath, filePath));
      }
      return { success: true, data: result };
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  });

  ipcMain.handle(IPC_CHANNELS.AUDIO_ANALYZE_BATCH, async (_event, filePaths: string[]) => {
    try {
      const results: Array<{ filePath: string; bpm: number | null; key: string | null }> = [];
      for (const filePath of filePaths) {
        try {
          const result = await analyzeAudioFile(filePath);
          if (result.bpm !== null || result.key !== null) {
            await db.update(samples)
              .set({
                ...(result.bpm !== null ? { bpm: result.bpm } : {}),
                ...(result.key !== null ? { key: result.key } : {}),
              })
              .where(eq(samples.filePath, filePath));
          }
          results.push({ filePath, bpm: result.bpm, key: result.key });
        } catch (e) {
          console.warn(`[ipc] Failed to analyze ${filePath}:`, (e as Error)?.message);
          results.push({ filePath, bpm: null, key: null });
        }
      }
      return { success: true, data: results };
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  });
}
