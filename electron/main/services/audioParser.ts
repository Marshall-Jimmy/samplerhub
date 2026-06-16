import { getDatabase } from './database';
import { samples } from '../../../drizzle/schema';
import { eq, isNull, and } from 'drizzle-orm';
import { getFileIOService } from './fileIOService';

export interface AudioMetadata {
  duration: number;
  sampleRate: number;
  bitRate: number;
  channels: number;
  bpm: number | null;
  key: string | null;
}

async function parseFileMetadata(input: string | Buffer): Promise<any> {
  const mm = await import('music-metadata');

  if (typeof input === 'string') {
    if ('parseFile' in mm) return (mm as any).parseFile(input);
    // fallback: use parseStream with createReadStream
    const { parseStream } = mm;
    const fs = await import('fs');
    const stream = fs.createReadStream(input);
    return parseStream(stream, input);
  }

  // Buffer input: use parseBuffer
  if ('parseBuffer' in mm) {
    return (mm as any).parseBuffer(input);
  }
  // fallback: parseNodeStream from buffer
  const { Readable } = await import('stream');
  const stream = Readable.from(input);
  return (mm as any).parseStream(stream as any, 'buffer');
}

export async function parseAudioFile(input: string | Buffer): Promise<AudioMetadata> {
  let filePath: string;
  if (typeof input === 'string') {
    filePath = input;
  } else {
    filePath = '(buffer)';
  }

  try {
    const metadata = await parseFileMetadata(input);
    const format = metadata.format;
    const native = metadata.native;

    // 尝试从 native tags 中提取 BPM 和 Key
    let bpm: number | null = null;
    let key: string | null = null;

    // 检查 common tags
    if (metadata.common.bpm) {
      bpm = Math.round(metadata.common.bpm);
    }
    if (metadata.common.key) {
      key = metadata.common.key;
    }

    // 检查 ID3v2 TBPM/TKEY
    if (native && native['ID3v2.3'] || native?.['ID3v2.4']) {
      const id3Tags = native['ID3v2.3'] || native['ID3v2.4'];
      for (const tag of id3Tags) {
        if (tag.id === 'TBPM' && !bpm) {
          bpm = Math.round(parseFloat(tag.value as string));
        }
        if (tag.id === 'TKEY' && !key) {
          key = tag.value as string;
        }
      }
    }

    return {
      duration: format.duration ?? 0,
      sampleRate: format.sampleRate ?? 0,
      bitRate: format.bitrate ?? 0,
      channels: format.numberOfChannels ?? 0,
      bpm,
      key,
    };
  } catch (error) {
    console.warn(`Failed to parse audio file: ${filePath}`, error);
    return { duration: 0, sampleRate: 0, bitRate: 0, channels: 0, bpm: null, key: null };
  }
}

export async function parseUnresolvedSamples(): Promise<number> {
  const db = getDatabase();

  const unresolved = await db.select().from(samples)
    .where(and(eq(samples.duration, 0), isNull(samples.waveformData)))
    .limit(50);

  let parsed = 0;
  for (const sample of unresolved) {
    const metadata = await parseAudioFile(sample.filePath);
    if (metadata.duration > 0) {
      await db.update(samples)
        .set({
          duration: metadata.duration,
          sampleRate: metadata.sampleRate,
          bitRate: metadata.bitRate,
          channels: metadata.channels,
          bpm: metadata.bpm,
          key: metadata.key,
        })
        .where(eq(samples.id, sample.id));
      parsed++;
    }
  }

  return parsed;
}

export async function parseSingleSample(sampleId: number): Promise<AudioMetadata | null> {
  const db = getDatabase();
  const sample = await db.select().from(samples).where(eq(samples.id, sampleId)).get();
  if (!sample) return null;

  const metadata = await parseAudioFile(sample.filePath);
  if (metadata.duration > 0) {
    await db.update(samples)
      .set({
        duration: metadata.duration,
        sampleRate: metadata.sampleRate,
        bitRate: metadata.bitRate,
        channels: metadata.channels,
        bpm: metadata.bpm,
        key: metadata.key,
      })
      .where(eq(samples.id, sample.id));
  }

  return metadata;
}
