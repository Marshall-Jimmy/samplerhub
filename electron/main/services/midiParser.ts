/**
 * MIDI 元数据解析服务
 * 独立于 audioParser，专门处理 .mid/.midi 文件
 * 使用 @tonejs/midi 提取 BPM、调性、音轨、音符、乐器等元数据
 */
import { readFile } from 'fs/promises';
import { extname } from 'path';
import { MIDI_EXTENSIONS } from '../../../shared/constants/audioFormats';

export interface MidiMetadata {
  duration: number;
  bpm: number | null;
  key: string | null;
  timeSignature: string | null;
  trackCount: number;
  noteCount: number;
  instruments: string[];
  /** 标记为 MIDI 文件类型 */
  fileType: 'midi';
}

/**
 * 判断文件是否为 MIDI 格式
 */
export function isMidiFile(filePath: string): boolean {
  return MIDI_EXTENSIONS.has(extname(filePath).toLowerCase());
}

/**
 * 解析 MIDI 文件元数据
 */
export async function parseMidiFile(filePath: string): Promise<MidiMetadata> {
  try {
    const { Midi } = await import('@tonejs/midi');
    const buffer = await readFile(filePath);
    const midi = new Midi(buffer);

    // 提取 BPM（取第一个有效 BPM）
    let bpm: number | null = null;
    if (midi.header.tempos.length > 0) {
      bpm = Math.round(midi.header.tempos[0].bpm);
    }

    // 提取调性（取第一个调性标记）
    let key: string | null = null;
    if (midi.header.keySignatures.length > 0) {
      const ks = midi.header.keySignatures[0] as any;
      key = formatKeySignature(Number(ks.key), ks.scale);
    }

    // 提取拍号
    let timeSignature: string | null = null;
    if (midi.header.timeSignatures.length > 0) {
      const ts = midi.header.timeSignatures[0];
      timeSignature = `${ts.timeSignature[0]}/${ts.timeSignature[1]}`;
    }

    // 统计音符数和乐器
    let noteCount = 0;
    const instrumentSet = new Set<string>();

    for (const track of midi.tracks) {
      noteCount += track.notes.length;
      if (track.instrument?.name) {
        instrumentSet.add(track.instrument.name);
      } else if (track.channel !== undefined && track.channel === 9) {
        instrumentSet.add('Drums');
      }
    }

    return {
      duration: midi.duration,
      bpm,
      key,
      timeSignature,
      trackCount: midi.tracks.length,
      noteCount,
      instruments: Array.from(instrumentSet),
      fileType: 'midi',
    };
  } catch (error) {
    console.warn(`[MidiParser] Failed to parse: ${filePath}`, error);
    return {
      duration: 0,
      bpm: null,
      key: null,
      timeSignature: null,
      trackCount: 0,
      noteCount: 0,
      instruments: [],
      fileType: 'midi',
    };
  }
}

/**
 * 格式化调性标记
 */
function formatKeySignature(key: number, scale: number | string): string {
  const sharpKeys = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const flatKeys = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
  
  const idx = Math.abs(key) % 12;
  const noteName = key < 0 ? flatKeys[idx] : sharpKeys[idx];
  const mode = scale === 0 || scale === 'minor' ? 'm' : '';
  
  return `${noteName}${mode}`;
}
