export interface SqliteTransactionExecutor {
  exec(sql: string): unknown;
}

export interface ChunkedTransactionOptions {
  batchSize?: number;
  signal?: AbortSignal;
}

/**
 * Run synchronous SQLite work in bounded transactions without ever leaving an
 * empty or partial transaction open. A cancelled final partial batch commits,
 * matching the scanner's existing resumable partial-progress behavior.
 */
export function runChunkedTransaction<T>(
  sqlite: SqliteTransactionExecutor,
  items: readonly T[],
  processItem: (item: T) => void,
  options: ChunkedTransactionOptions = {},
): number {
  const batchSize = Math.max(1, Math.trunc(options.batchSize ?? 500));
  let transactionOpen = false;
  let batchCount = 0;
  let processed = 0;

  const begin = () => {
    sqlite.exec('BEGIN TRANSACTION');
    transactionOpen = true;
  };
  const commit = () => {
    sqlite.exec('COMMIT');
    transactionOpen = false;
    batchCount = 0;
  };

  try {
    for (const item of items) {
      if (options.signal?.aborted) break;
      if (!transactionOpen) begin();

      processItem(item);
      processed++;
      batchCount++;

      if (batchCount >= batchSize) commit();
    }

    if (transactionOpen) commit();
    return processed;
  } catch (error) {
    if (transactionOpen) {
      try { sqlite.exec('ROLLBACK'); } catch {}
      transactionOpen = false;
    }
    throw error;
  }
}
