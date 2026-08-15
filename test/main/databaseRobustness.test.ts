import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({
  app: {
    getPath: () => '',
    relaunch: vi.fn(),
    exit: vi.fn(),
  },
}));

import { applyPendingSqlMigrations } from '../../electron/main/services/database';

const require = createRequire(import.meta.url);
const Database = require('better-sqlite3');
const tempDirs: string[] = [];

function makeTempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'samplerhub-db-test-'));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe('applyPendingSqlMigrations', () => {
  it('applies and records pending files even when user_version is already current', () => {
    const migrationsDir = makeTempDir();
    fs.writeFileSync(
      path.join(migrationsDir, '0001_create_widget.sql'),
      'CREATE TABLE widgets (id INTEGER PRIMARY KEY, name TEXT NOT NULL);',
    );

    const sqlite = new Database(':memory:');
    sqlite.pragma('user_version = 2');

    expect(applyPendingSqlMigrations(sqlite, migrationsDir)).toEqual(['0001_create_widget.sql']);
    expect(sqlite.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='widgets'").get()).toBeTruthy();
    expect(sqlite.prepare('SELECT name FROM migrations').pluck().all()).toEqual(['0001_create_widget.sql']);
    expect(applyPendingSqlMigrations(sqlite, migrationsDir)).toEqual([]);

    sqlite.close();
  });

  it('rolls back the whole file and leaves it pending when a statement fails', () => {
    const migrationsDir = makeTempDir();
    fs.writeFileSync(
      path.join(migrationsDir, '0001_broken.sql'),
      'CREATE TABLE should_rollback (id INTEGER); INSERT INTO missing_table VALUES (1);',
    );

    const sqlite = new Database(':memory:');

    expect(() => applyPendingSqlMigrations(sqlite, migrationsDir)).toThrow();
    expect(sqlite.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='should_rollback'").get()).toBeUndefined();
    expect(sqlite.prepare('SELECT name FROM migrations').all()).toEqual([]);

    sqlite.close();
  });
});
