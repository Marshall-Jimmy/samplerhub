import { sql } from 'drizzle-orm';
import { samples } from './schema';

/**
 * Library/search projection.
 *
 * The samples table contains several potentially large fields. A list query
 * must not materialize those values for every row. The NULL placeholders keep
 * the common Sample response keys stable while avoiding BLOB/vector transfer.
 *
 * Note: samples.tags stores inferred spectral labels. The UI-facing property
 * is named inferredTags; real user tags are hydrated from sample_tags/tags by
 * sampleRepository.ts.
 */
export const sampleListSelection = {
  id: samples.id,
  filePath: samples.filePath,
  fileName: samples.fileName,
  fileSize: samples.fileSize,
  fileHash: samples.fileHash,
  fileType: samples.fileType,
  createdAt: samples.createdAt,
  modifiedAt: samples.modifiedAt,
  duration: samples.duration,
  sampleRate: samples.sampleRate,
  bitRate: samples.bitRate,
  channels: samples.channels,
  bpm: samples.bpm,
  key: samples.key,
  categoryId: samples.categoryId,

  waveformData: sql<null>`NULL`,

  isCorrupted: samples.isCorrupted,
  isFavorite: samples.isFavorite,
  playCount: samples.playCount,
  lastPlayedAt: samples.lastPlayedAt,
  indexedAt: samples.indexedAt,
  inferredTags: samples.tags,

  featureVector: sql<null>`NULL`,
  clapEmbedding: sql<null>`NULL`,
  rating: samples.rating,
  notes: sql<null>`NULL`,

  midiTrackCount: samples.midiTrackCount,
  midiNoteCount: samples.midiNoteCount,
  midiInstruments: samples.midiInstruments,
  midiTimeSignature: samples.midiTimeSignature,
} as const;
