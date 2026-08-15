import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { FileIOService } from '../../electron/main/services/fileIOService';

describe('FileIOService', () => {
  let fixtureDir: string;

  beforeEach(async () => {
    fixtureDir = await mkdtemp(join(tmpdir(), 'samplerhub-file-io-'));
  });

  afterEach(async () => {
    await rm(fixtureDir, { recursive: true, force: true });
  });

  it('deduplicates concurrent reads and caches one buffer', async () => {
    const filePath = join(fixtureDir, 'kick.wav');
    await writeFile(filePath, Buffer.from('12345678'));
    const service = new FileIOService({ maxCacheSize: 10, maxCacheBytes: 1024 });

    const [first, second] = await Promise.all([
      service.readFile(filePath),
      service.readFile(filePath),
    ]);

    expect(first).toBe(second);
    expect(service.getStats()).toMatchObject({ size: 1, bytes: 8 });
  });

  it('enforces the byte limit as well as the entry limit', async () => {
    const firstPath = join(fixtureDir, 'first.wav');
    const secondPath = join(fixtureDir, 'second.wav');
    await Promise.all([
      writeFile(firstPath, Buffer.from('12345678')),
      writeFile(secondPath, Buffer.from('abcdefgh')),
    ]);
    const service = new FileIOService({ maxCacheSize: 10, maxCacheBytes: 10 });

    await service.readFile(firstPath);
    await service.readFile(secondPath);

    const stats = service.getStats();
    expect(stats.size).toBe(1);
    expect(stats.bytes).toBe(8);
    expect(stats.keys).toEqual([secondPath]);
  });

  it('does not cache a file larger than the configured cache', async () => {
    const filePath = join(fixtureDir, 'long.wav');
    await writeFile(filePath, Buffer.alloc(32));
    const service = new FileIOService({ maxCacheSize: 10, maxCacheBytes: 16 });

    await service.readFile(filePath);

    expect(service.getStats()).toMatchObject({ size: 0, bytes: 0, keys: [] });
  });

  it('clears cached buffers and reports empty statistics', async () => {
    const filePath = join(fixtureDir, 'snare.wav');
    await writeFile(filePath, Buffer.from('sample'));
    const service = new FileIOService({ maxCacheSize: 10, maxCacheBytes: 1024 });
    await service.readFile(filePath);

    service.clearCache();

    expect(service.getStats()).toEqual({ size: 0, bytes: 0, keys: [] });
  });
});
