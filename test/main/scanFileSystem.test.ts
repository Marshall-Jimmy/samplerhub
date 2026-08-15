// @vitest-environment node

import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  canonicalizeLibraryPath,
  collectSupportedFiles,
  computeFileFingerprint,
  databaseTimestampToMilliseconds,
  dateToDatabaseTimestamp,
  diffScannedFiles,
  getDescendantPathRange,
  isPathInsideRoot,
} from '../../electron/main/services/scanFileSystem';

const temporaryDirectories: string[] = [];

async function makeTempDir(): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'samplerhub-scan-test-'));
  temporaryDirectories.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe('scan path boundaries', () => {
  it('uses native Windows separators for storage and descendant ranges', () => {
    expect(canonicalizeLibraryPath('C:/Samples/Drums/../Bass', 'win32')).toBe('C:\\Samples\\Bass');
    expect(getDescendantPathRange('C:/Samples', 'win32')).toEqual({
      start: 'C:\\Samples\\',
      end: 'C:\\Samples\\\uffff',
    });
  });

  it('does not treat sibling prefixes as descendants', () => {
    expect(isPathInsideRoot('C:\\Samples\\Kick\\one.wav', 'C:\\Samples', 'win32')).toBe(true);
    expect(isPathInsideRoot('c:\\samples\\Kick\\one.wav', 'C:\\Samples', 'win32')).toBe(true);
    expect(isPathInsideRoot('C:\\Samples-Backup\\one.wav', 'C:\\Samples', 'win32')).toBe(false);
  });

  it('never deletes a sibling row even if it is supplied by a widened query', () => {
    const modifiedAt = new Date('2026-01-01T00:00:00.000Z');
    const filePath = 'C:\\Samples\\Kick\\one.wav';
    const hash = computeFileFingerprint(filePath, 4, modifiedAt.getTime());
    const diff = diffScannedFiles('C:\\Samples', [{
      path: filePath,
      name: 'one.wav',
      size: 4,
      modifiedAt,
      hash,
    }], [{
      id: 1,
      filePath,
      fileHash: hash,
      fileSize: 4,
      modifiedAt: modifiedAt.getTime(),
    }, {
      id: 2,
      filePath: 'C:\\Samples-Backup\\keep.wav',
      fileHash: 'sibling',
      fileSize: 4,
      modifiedAt: modifiedAt.getTime(),
    }], 'win32');

    expect(diff).toEqual({ toAdd: [], toUpdate: [], toDelete: [] });
  });
});

describe('database timestamps', () => {
  it('writes Unix seconds and reads both legacy milliseconds and seconds', () => {
    const date = new Date('2026-08-15T12:34:56.789Z');
    const seconds = dateToDatabaseTimestamp(date);

    expect(seconds).toBe(Math.trunc(date.getTime() / 1000));
    expect(databaseTimestampToMilliseconds(seconds)).toBe(Math.trunc(date.getTime() / 1000) * 1000);
    expect(databaseTimestampToMilliseconds(date.getTime())).toBe(date.getTime());
  });
});

describe('globally bounded collection', () => {
  it('keeps directory and stat work under their global limits', async () => {
    const root = await makeTempDir();
    await Promise.all(Array.from({ length: 12 }, async (_, dirIndex) => {
      const subdir = path.join(root, `dir-${dirIndex}`);
      await mkdir(subdir);
      await Promise.all(Array.from({ length: 20 }, (_, fileIndex) =>
        writeFile(path.join(subdir, `sample-${fileIndex}.wav`), Buffer.alloc(16))));
    }));

    let maxDirectories = 0;
    let maxStats = 0;
    const files = await collectSupportedFiles(root, new Set(['.wav']), {
      directoryConcurrency: 2,
      statConcurrency: 3,
      onConcurrencyChange: (kind, active) => {
        if (kind === 'directory') maxDirectories = Math.max(maxDirectories, active);
        else maxStats = Math.max(maxStats, active);
      },
    });

    expect(files).toHaveLength(240);
    expect(maxDirectories).toBeLessThanOrEqual(2);
    expect(maxStats).toBeLessThanOrEqual(3);
  });

  it('rejects promptly when aborted during stat scheduling', async () => {
    const root = await makeTempDir();
    await Promise.all(Array.from({ length: 100 }, (_, index) =>
      writeFile(path.join(root, `sample-${index}.wav`), Buffer.alloc(16))));
    const controller = new AbortController();

    const scan = collectSupportedFiles(root, new Set(['.wav']), {
      statConcurrency: 1,
      signal: controller.signal,
      onConcurrencyChange: (kind, active) => {
        if (kind === 'stat' && active === 1 && !controller.signal.aborted) controller.abort();
      },
    });

    await expect(scan).rejects.toMatchObject({ name: 'AbortError' });
  });
});
