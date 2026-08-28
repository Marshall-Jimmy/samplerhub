// @vitest-environment node
// Run explicitly: npx vitest bench test/benchmarks/scanFileSystem.bench.ts

import { afterAll, beforeAll, bench } from 'vitest';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import {
  collectSupportedFiles,
  diffScannedFiles,
  type ExistingScannedFile,
} from '../../electron/main/services/scanFileSystem';

const FILE_COUNT = 10_000;
const DIRECTORY_COUNT = 100;
const extensions = new Set(['.wav']);
let fixtureRoot = '';
let existingRows: ExistingScannedFile[] = [];
let databaseIteration = 0;

beforeAll(async () => {
  fixtureRoot = await mkdtemp(path.join(os.tmpdir(), 'samplerhub-scan-bench-'));

  // Fixtures are generated outside the timed benchmark and deleted afterward;
  // no large binary fixture is stored in the repository.
  for (let directoryIndex = 0; directoryIndex < DIRECTORY_COUNT; directoryIndex++) {
    const directory = path.join(fixtureRoot, `pack-${directoryIndex.toString().padStart(3, '0')}`);
    await mkdir(directory);
    await Promise.all(Array.from({ length: FILE_COUNT / DIRECTORY_COUNT }, (_, fileIndex) =>
      writeFile(path.join(directory, `sample-${fileIndex.toString().padStart(3, '0')}.wav`), Buffer.alloc(44))));
  }

  const files = await collectSupportedFiles(fixtureRoot, extensions);
  if (files.length !== FILE_COUNT) throw new Error(`Expected ${FILE_COUNT} fixtures, found ${files.length}`);
  existingRows = files.map((file, index) => ({
    id: index + 1,
    filePath: file.path,
    fileHash: file.hash,
    fileSize: file.size,
    modifiedAt: file.modifiedAt.getTime(),
  }));
}, 120_000);

afterAll(async () => {
  if (fixtureRoot.startsWith(os.tmpdir())) {
    await rm(fixtureRoot, { recursive: true, force: true });
  }
});

bench('10k cold index (collect + empty-index diff)', async () => {
  const files = await collectSupportedFiles(fixtureRoot, extensions);
  const diff = diffScannedFiles(fixtureRoot, files, []);
  if (diff.toAdd.length !== FILE_COUNT) throw new Error(`Expected ${FILE_COUNT} additions`);
}, { iterations: 5, time: 0 });

bench('10k first-visible index (collect + diff + durable SQLite insert)', async () => {
  const databasePath = path.join(fixtureRoot, `index-${databaseIteration++}.db`);
  const files = await collectSupportedFiles(fixtureRoot, extensions);
  const diff = diffScannedFiles(fixtureRoot, files, []);
  const database = new Database(databasePath);
  try {
    database.pragma('journal_mode = WAL');
    database.pragma('synchronous = NORMAL');
    database.exec(`
      CREATE TABLE samples (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        file_name TEXT NOT NULL,
        file_path TEXT NOT NULL UNIQUE,
        file_size INTEGER NOT NULL,
        file_hash TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        modified_at INTEGER NOT NULL
      )
    `);
    const insert = database.prepare(`
      INSERT INTO samples (file_name, file_path, file_size, file_hash, created_at, modified_at)
      VALUES (?, ?, ?, ?, unixepoch(), ?)
    `);
    for (let offset = 0; offset < diff.toAdd.length; offset += 500) {
      const batch = diff.toAdd.slice(offset, offset + 500);
      database.transaction(() => {
        for (const file of batch) {
          insert.run(file.name, file.path, file.size, file.hash, Math.trunc(file.modifiedAt.getTime() / 1000));
        }
      })();
    }
    const count = database.prepare('SELECT COUNT(*) AS count FROM samples').get() as { count: number };
    if (count.count !== FILE_COUNT) throw new Error(`Expected ${FILE_COUNT} indexed rows`);
  } finally {
    database.close();
  }
}, { iterations: 5, time: 0 });

bench('10k warm rescan (collect + unchanged diff)', async () => {
  const files = await collectSupportedFiles(fixtureRoot, extensions);
  const diff = diffScannedFiles(fixtureRoot, files, existingRows);
  if (diff.toAdd.length || diff.toUpdate.length || diff.toDelete.length) {
    throw new Error('Warm rescan unexpectedly produced changes');
  }
}, { iterations: 5, time: 0 });
