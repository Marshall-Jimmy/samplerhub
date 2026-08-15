import fs from 'node:fs';
import path from 'node:path';
import { AUDIO_EXTENSIONS } from '../../../shared/constants/audioFormats';

export const MAX_NATIVE_DRAG_SAMPLES = 100;

export interface DragStartPayload {
  sampleIds: number[];
}

export interface DragSampleRow {
  id: number;
  filePath: string;
  fileType: string;
}

export interface NativeDragFileFields {
  file: string;
  files?: string[];
}

type StatFile = (filePath: string) => { isFile(): boolean };

export function parseDragStartPayload(payload: unknown): DragStartPayload {
  if (!payload || typeof payload !== 'object' || !Array.isArray((payload as { sampleIds?: unknown }).sampleIds)) {
    throw new Error('Invalid native drag payload');
  }

  const sampleIds = (payload as { sampleIds: unknown[] }).sampleIds;
  if (sampleIds.length === 0 || sampleIds.length > MAX_NATIVE_DRAG_SAMPLES) {
    throw new Error(`Native drag requires 1-${MAX_NATIVE_DRAG_SAMPLES} samples`);
  }

  const seen = new Set<number>();
  const validatedIds = sampleIds.map((value) => {
    if (!Number.isSafeInteger(value) || (value as number) <= 0) {
      throw new Error('Native drag sample IDs must be positive integers');
    }
    const id = value as number;
    if (seen.has(id)) {
      throw new Error('Native drag sample IDs must be unique');
    }
    seen.add(id);
    return id;
  });

  return { sampleIds: validatedIds };
}

export function validateDragSampleRows(
  sampleIds: number[],
  rows: DragSampleRow[],
  statFile: StatFile = fs.statSync,
): string[] {
  const rowsById = new Map(rows.map((row) => [row.id, row]));
  const seenPaths = new Set<string>();

  return sampleIds.map((id) => {
    const row = rowsById.get(id);
    if (!row) {
      throw new Error(`Native drag sample not found: ${id}`);
    }
    if (row.fileType !== 'audio') {
      throw new Error(`Native drag only supports audio files: ${id}`);
    }
    if (typeof row.filePath !== 'string' || !path.isAbsolute(row.filePath)) {
      throw new Error(`Native drag requires an absolute file path: ${id}`);
    }

    const extension = path.extname(row.filePath).toLowerCase();
    if (!AUDIO_EXTENSIONS.has(extension)) {
      throw new Error(`Unsupported native drag audio extension: ${extension || '(none)'}`);
    }

    let isFile = false;
    try {
      isFile = statFile(row.filePath).isFile();
    } catch {
      // Treat missing, inaccessible, or stale library entries as invalid.
    }
    if (!isFile) {
      throw new Error(`Native drag source is not a regular file: ${id}`);
    }

    const normalizedPath = path.normalize(row.filePath);
    const pathKey = process.platform === 'win32' ? normalizedPath.toLowerCase() : normalizedPath;
    if (seenPaths.has(pathKey)) {
      throw new Error('Native drag file paths must be unique');
    }
    seenPaths.add(pathKey);
    return normalizedPath;
  });
}

export function buildNativeDragFileFields(filePaths: string[]): NativeDragFileFields {
  if (filePaths.length === 0) {
    throw new Error('Cannot build a native drag item without files');
  }

  return filePaths.length === 1
    ? { file: filePaths[0] }
    : { file: filePaths[0], files: [...filePaths] };
}
