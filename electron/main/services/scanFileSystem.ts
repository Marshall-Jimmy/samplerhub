import { createHash } from 'node:crypto';
import { readdir, stat } from 'node:fs/promises';
import path from 'node:path';

export interface ScannedFileInfo {
  path: string;
  name: string;
  size: number;
  modifiedAt: Date;
  hash: string;
}

export interface ExistingScannedFile {
  id: number;
  filePath: string;
  fileHash: string;
  fileSize: number;
  modifiedAt: Date | number | null;
}

export interface ScanDiff {
  toAdd: ScannedFileInfo[];
  toUpdate: ScannedFileInfo[];
  toDelete: number[];
}

export interface CollectFilesOptions {
  directoryConcurrency?: number;
  statConcurrency?: number;
  signal?: AbortSignal;
  onConcurrencyChange?: (kind: 'directory' | 'stat', active: number) => void;
}

const DEFAULT_DIRECTORY_CONCURRENCY = 8;
const DEFAULT_STAT_CONCURRENCY = 32;

function pathApi(platform: NodeJS.Platform): typeof path.win32 | typeof path.posix {
  return platform === 'win32' ? path.win32 : path.posix;
}

function positiveConcurrency(value: number | undefined, fallback: number): number {
  if (!Number.isFinite(value) || value == null) return fallback;
  return Math.max(1, Math.trunc(value));
}

export function createAbortError(): Error {
  const error = new Error('Scan aborted');
  error.name = 'AbortError';
  return error;
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw createAbortError();
}

/** Canonical path used for storage and indexed prefix queries. */
export function canonicalizeLibraryPath(
  input: string,
  platform: NodeJS.Platform = process.platform,
): string {
  const api = pathApi(platform);
  return api.normalize(api.resolve(input));
}

/** Case-insensitive comparison keys on Windows without changing display paths. */
export function libraryPathKey(
  input: string,
  platform: NodeJS.Platform = process.platform,
): string {
  const canonical = canonicalizeLibraryPath(input, platform);
  return platform === 'win32' ? canonical.toLocaleLowerCase('en-US') : canonical;
}

/**
 * Indexed half-open range containing descendants of root and excluding sibling
 * prefixes such as `C:\\Samples-Backup` for root `C:\\Samples`.
 */
export function getDescendantPathRange(
  root: string,
  platform: NodeJS.Platform = process.platform,
): { start: string; end: string } {
  const api = pathApi(platform);
  const canonicalRoot = canonicalizeLibraryPath(root, platform);
  const start = canonicalRoot.endsWith(api.sep) ? canonicalRoot : `${canonicalRoot}${api.sep}`;
  return { start, end: `${start}\uffff` };
}

export function isPathInsideRoot(
  candidate: string,
  root: string,
  platform: NodeJS.Platform = process.platform,
): boolean {
  const api = pathApi(platform);
  const rootKey = libraryPathKey(root, platform);
  const candidateKey = libraryPathKey(candidate, platform);
  return candidateKey === rootKey || candidateKey.startsWith(`${rootKey}${api.sep}`);
}

export function computeFileFingerprint(filePath: string, fileSize: number, mtimeMs: number): string {
  const hash = createHash('md5');
  hash.update(`${filePath}:${fileSize}:${mtimeMs}`);
  return hash.digest('hex');
}

/**
 * SQLite timestamp columns use Unix seconds, while older scanner builds wrote
 * JavaScript milliseconds directly. Accept both during the migration window.
 */
export function databaseTimestampToMilliseconds(value: Date | number | null): number {
  if (value instanceof Date) return value.getTime();
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return Number.NaN;
  return Math.abs(numeric) < 100_000_000_000 ? numeric * 1000 : numeric;
}

export function dateToDatabaseTimestamp(value: Date): number {
  return Math.trunc(value.getTime() / 1000);
}

async function collectCandidates(
  root: string,
  extensions: ReadonlySet<string>,
  options: Required<Pick<CollectFilesOptions, 'directoryConcurrency'>> & CollectFilesOptions,
): Promise<Array<{ path: string; name: string }>> {
  const signal = options.signal;
  throwIfAborted(signal);

  return new Promise((resolve, reject) => {
    const directories = [root];
    const files: Array<{ path: string; name: string }> = [];
    let active = 0;
    let settled = false;

    const cleanup = () => signal?.removeEventListener('abort', onAbort);
    const fail = (error: unknown) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error);
    };
    const succeed = () => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(files);
    };
    const onAbort = () => fail(createAbortError());

    const pump = () => {
      if (settled) return;
      if (signal?.aborted) {
        onAbort();
        return;
      }

      while (active < options.directoryConcurrency && directories.length > 0 && !settled) {
        const currentDir = directories.shift()!;
        active++;
        options.onConcurrencyChange?.('directory', active);

        void readdir(currentDir, { withFileTypes: true })
          .then((entries) => {
            if (settled || signal?.aborted) return;
            for (const entry of entries) {
              if (entry.name.startsWith('.')) continue;
              const fullPath = canonicalizeLibraryPath(path.join(currentDir, entry.name));
              if (entry.isDirectory()) {
                directories.push(fullPath);
              } else if (entry.isFile() && extensions.has(path.extname(entry.name).toLowerCase())) {
                files.push({ path: fullPath, name: entry.name });
              }
            }
          })
          .catch(fail)
          .finally(() => {
            active--;
            options.onConcurrencyChange?.('directory', active);
            if (settled) return;
            if (directories.length === 0 && active === 0) succeed();
            else pump();
          });
      }
    };

    signal?.addEventListener('abort', onAbort, { once: true });
    pump();
  });
}

async function statCandidates(
  candidates: Array<{ path: string; name: string }>,
  options: Required<Pick<CollectFilesOptions, 'statConcurrency'>> & CollectFilesOptions,
): Promise<ScannedFileInfo[]> {
  const signal = options.signal;
  throwIfAborted(signal);
  if (candidates.length === 0) return [];

  return new Promise((resolve, reject) => {
    const results: Array<ScannedFileInfo | null> = new Array(candidates.length).fill(null);
    let nextIndex = 0;
    let completed = 0;
    let active = 0;
    let settled = false;

    const cleanup = () => signal?.removeEventListener('abort', onAbort);
    const fail = (error: unknown) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error);
    };
    const succeed = () => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(results.filter((item): item is ScannedFileInfo => item !== null));
    };
    const onAbort = () => fail(createAbortError());

    const pump = () => {
      if (settled) return;
      if (signal?.aborted) {
        onAbort();
        return;
      }

      while (active < options.statConcurrency && nextIndex < candidates.length && !settled) {
        const index = nextIndex++;
        const candidate = candidates[index];
        active++;
        options.onConcurrencyChange?.('stat', active);

        void stat(candidate.path)
          .then((stats) => {
            if (settled || signal?.aborted || !stats.isFile()) return;
            results[index] = {
              path: candidate.path,
              name: candidate.name,
              size: stats.size,
              modifiedAt: stats.mtime,
              hash: computeFileFingerprint(candidate.path, stats.size, stats.mtimeMs),
            };
          })
          // A file may disappear between readdir and stat; preserve the old
          // scanner's allSettled behavior and skip only that entry.
          .catch(() => {})
          .finally(() => {
            active--;
            completed++;
            options.onConcurrencyChange?.('stat', active);
            if (settled) return;
            if (completed === candidates.length) succeed();
            else pump();
          });
      }
    };

    signal?.addEventListener('abort', onAbort, { once: true });
    pump();
  });
}

/** Recursively collect supported files with scan-wide bounded task pools. */
export async function collectSupportedFiles(
  root: string,
  extensions: ReadonlySet<string>,
  options: CollectFilesOptions = {},
): Promise<ScannedFileInfo[]> {
  const canonicalRoot = canonicalizeLibraryPath(root);
  const normalizedOptions = {
    ...options,
    directoryConcurrency: positiveConcurrency(options.directoryConcurrency, DEFAULT_DIRECTORY_CONCURRENCY),
    statConcurrency: positiveConcurrency(options.statConcurrency, DEFAULT_STAT_CONCURRENCY),
  };
  const candidates = await collectCandidates(canonicalRoot, extensions, normalizedOptions);
  return statCandidates(candidates, normalizedOptions);
}

export function diffScannedFiles(
  root: string,
  files: ScannedFileInfo[],
  existingRows: ExistingScannedFile[],
  platform: NodeJS.Platform = process.platform,
): ScanDiff {
  const rowsInRoot = existingRows.filter((row) => isPathInsideRoot(row.filePath, root, platform));
  const existingMap = new Map(rowsInRoot.map((row) => [libraryPathKey(row.filePath, platform), row]));
  const seenKeys = new Set<string>();
  const toAdd: ScannedFileInfo[] = [];
  const toUpdate: ScannedFileInfo[] = [];

  for (const file of files) {
    const key = libraryPathKey(file.path, platform);
    seenKeys.add(key);
    const existing = existingMap.get(key);
    if (!existing) {
      toAdd.push(file);
      continue;
    }

    const existingMtime = databaseTimestampToMilliseconds(existing.modifiedAt);
    const sameMtime = Number.isFinite(existingMtime)
      && Math.abs(existingMtime - file.modifiedAt.getTime()) < 1000;
    // The fingerprint includes the canonical path. Do not force an update for
    // a legacy spelling difference when size and mtime prove the file is
    // unchanged; a real content-affecting change alters at least one of them.
    if (!sameMtime || existing.fileSize !== file.size) {
      toUpdate.push(file);
    }
  }

  const toDelete = rowsInRoot
    .filter((row) => !seenKeys.has(libraryPathKey(row.filePath, platform)))
    .map((row) => row.id);

  return { toAdd, toUpdate, toDelete };
}
