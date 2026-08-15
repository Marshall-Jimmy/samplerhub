import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  userData: '',
  backupDatabaseTo: vi.fn(),
  assertValidDatabaseFile: vi.fn(),
  resetDatabaseConnection: vi.fn(),
}));

vi.mock('electron', () => ({
  app: { getPath: () => mocks.userData },
}));

vi.mock('electron-log', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('../../electron/main/services/database', () => ({
  assertValidDatabaseFile: mocks.assertValidDatabaseFile,
  backupDatabaseTo: mocks.backupDatabaseTo,
  getDbPath: () => path.join(mocks.userData, 'samplerhub.db'),
  resetDatabaseConnection: mocks.resetDatabaseConnection,
}));

import { createBackup, restoreBackup } from '../../electron/main/services/backupService';

const tempDirs: string[] = [];

beforeEach(() => {
  mocks.userData = fs.mkdtempSync(path.join(os.tmpdir(), 'samplerhub-backup-test-'));
  tempDirs.push(mocks.userData);
  mocks.backupDatabaseTo.mockReset();
  mocks.assertValidDatabaseFile.mockReset();
  mocks.resetDatabaseConnection.mockReset();
});

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe('backup service', () => {
  it('does not stat or report success until the asynchronous SQLite backup finishes', async () => {
    mocks.backupDatabaseTo.mockImplementation(async (destination: string) => {
      await new Promise(resolve => setTimeout(resolve, 10));
      fs.writeFileSync(destination, Buffer.from('complete-backup'));
    });

    const result = await createBackup();

    expect(result.success).toBe(true);
    expect(result.size).toBe(Buffer.byteLength('complete-backup'));
    expect(result.path && fs.readFileSync(result.path, 'utf8')).toBe('complete-backup');
  });

  it('rejects restore path traversal before closing the live connection', async () => {
    const result = await restoreBackup('../outside.db');

    expect(result).toEqual({ success: false, error: 'Invalid backup file name' });
    expect(mocks.resetDatabaseConnection).not.toHaveBeenCalled();
  });

  it('restores a validated file and explicitly requires a restart', async () => {
    const backupDir = path.join(mocks.userData, 'backups');
    fs.mkdirSync(backupDir, { recursive: true });
    const backupName = 'database_2026-08-15T00-00-00-000Z.db';
    fs.writeFileSync(path.join(backupDir, backupName), Buffer.from('restored-database'));
    fs.writeFileSync(path.join(mocks.userData, 'samplerhub.db'), Buffer.from('old-database'));
    mocks.backupDatabaseTo.mockImplementation(async (destination: string) => {
      fs.writeFileSync(destination, Buffer.from('safety-backup'));
    });

    const result = await restoreBackup(backupName);

    expect(result).toEqual({ success: true, requiresRestart: true });
    expect(mocks.assertValidDatabaseFile).toHaveBeenCalledTimes(2);
    expect(mocks.resetDatabaseConnection).toHaveBeenCalledWith('Database backup restored');
    expect(fs.readFileSync(path.join(mocks.userData, 'samplerhub.db'), 'utf8')).toBe('restored-database');
  });
});
