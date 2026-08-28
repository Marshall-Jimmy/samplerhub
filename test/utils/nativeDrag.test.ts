import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  MAX_NATIVE_DRAG_SAMPLES,
  buildNativeDragFileFields,
  parseDragStartPayload,
  validateDragSampleRows,
  type DragSampleRow,
} from '../../electron/main/services/nativeDrag';
import { getNativeDragSampleIds } from '../../src/utils/nativeDrag';

const audioPath = (name: string) => path.resolve('test-fixtures', name);
const regularFile = () => ({ isFile: () => true });

describe('native file drag validation', () => {
  it('accepts a bounded, unique list of positive sample IDs', () => {
    expect(parseDragStartPayload({ sampleIds: [3, 1, 2] })).toEqual({ sampleIds: [3, 1, 2] });
  });

  it.each([
    null,
    {},
    { sampleIds: [] },
    { sampleIds: [0] },
    { sampleIds: [1.5] },
    { sampleIds: [1, 1] },
    { sampleIds: Array.from({ length: MAX_NATIVE_DRAG_SAMPLES + 1 }, (_, index) => index + 1) },
  ])('rejects an invalid payload', (payload) => {
    expect(() => parseDragStartPayload(payload)).toThrow();
  });

  it('resolves rows in requested order and validates ordinary audio files', () => {
    const rows: DragSampleRow[] = [
      { id: 2, filePath: audioPath('snare.flac'), fileType: 'audio' },
      { id: 1, filePath: audioPath('kick.wav'), fileType: 'audio' },
    ];

    expect(validateDragSampleRows([1, 2], rows, regularFile)).toEqual([
      audioPath('kick.wav'),
      audioPath('snare.flac'),
    ]);
  });

  it.each([
    [[{ id: 1, filePath: audioPath('clip.mid'), fileType: 'midi' }], 'only supports audio'],
    [[{ id: 1, filePath: audioPath('notes.txt'), fileType: 'audio' }], 'Unsupported'],
    [[{ id: 1, filePath: 'relative.wav', fileType: 'audio' }], 'absolute'],
  ])('rejects invalid database rows', (rows, expectedMessage) => {
    expect(() => validateDragSampleRows([1], rows as DragSampleRow[], regularFile)).toThrow(expectedMessage as string);
  });

  it('rejects missing rows and non-files without silently dropping them', () => {
    expect(() => validateDragSampleRows([1], [], regularFile)).toThrow('not found');
    const rows = [{ id: 1, filePath: audioPath('folder.wav'), fileType: 'audio' }];
    expect(() => validateDragSampleRows([1], rows, () => ({ isFile: () => false }))).toThrow('not a regular file');
  });
});

describe('native DragItem file fields', () => {
  it('uses file for one item', () => {
    expect(buildNativeDragFileFields(['one.wav'])).toEqual({ file: 'one.wav' });
  });

  it('uses a string file plus the files array for multiple items', () => {
    expect(buildNativeDragFileFields(['one.wav', 'two.wav'])).toEqual({
      file: 'one.wav',
      files: ['one.wav', 'two.wav'],
    });
  });

  it('rejects an empty file list', () => {
    expect(() => buildNativeDragFileFields([])).toThrow();
  });
});

describe('selected sample drag ordering', () => {
  it('drags only an unselected sample', () => {
    expect(getNativeDragSampleIds(9, new Set([1, 2]), [1, 2, 9])).toEqual([9]);
  });

  it('drags all selected visible samples in display order', () => {
    expect(getNativeDragSampleIds(2, new Set([3, 2]), [1, 2, 3, 4])).toEqual([2, 3]);
  });
});
