// @vitest-environment node

import { describe, expect, it } from 'vitest';
import { runChunkedTransaction } from '../../electron/main/services/scanTransactions';

function fakeSqlite(log: string[]) {
  return { exec: (sql: string) => { log.push(sql); } };
}

describe('runChunkedTransaction', () => {
  it('does not open a dangling transaction at an exact 500-item boundary', () => {
    const sql: string[] = [];
    const processed = runChunkedTransaction(
      fakeSqlite(sql),
      Array.from({ length: 500 }, (_, index) => index),
      () => {},
      { batchSize: 500 },
    );

    expect(processed).toBe(500);
    expect(sql).toEqual(['BEGIN TRANSACTION', 'COMMIT']);
  });

  it('commits a cancelled partial batch and leaves no transaction open', () => {
    const sql: string[] = [];
    const controller = new AbortController();
    const processed = runChunkedTransaction(
      fakeSqlite(sql),
      Array.from({ length: 100 }, (_, index) => index),
      (item) => { if (item === 6) controller.abort(); },
      { batchSize: 500, signal: controller.signal },
    );

    expect(processed).toBe(7);
    expect(sql).toEqual(['BEGIN TRANSACTION', 'COMMIT']);
  });

  it('rolls back the open batch when item processing throws', () => {
    const sql: string[] = [];
    expect(() => runChunkedTransaction(
      fakeSqlite(sql),
      [1, 2, 3, 4, 5],
      (item) => { if (item === 4) throw new Error('classification failed'); },
      { batchSize: 500 },
    )).toThrow('classification failed');

    expect(sql).toEqual(['BEGIN TRANSACTION', 'ROLLBACK']);
  });
});
