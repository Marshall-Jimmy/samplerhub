/**
 * Lightweight IPC input validation utilities.
 * No external dependencies - pure TypeScript.
 */

/** Validate that value is a non-empty string */
export function validateString(value: unknown, fieldName: string = 'field'): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`Invalid ${fieldName}: must be a non-empty string`);
  }
  return value;
}

/** Validate that value is a number (integer or float) */
export function validateNumber(value: unknown, fieldName: string = 'field'): number {
  if (typeof value !== 'number' || isNaN(value)) {
    throw new Error(`Invalid ${fieldName}: must be a number`);
  }
  return value;
}

/** Validate that value is a positive integer */
export function validatePositiveInt(value: unknown, fieldName: string = 'field'): number {
  const n = validateNumber(value, fieldName);
  if (!Number.isInteger(n) || n < 0) {
    throw new Error(`Invalid ${fieldName}: must be a non-negative integer`);
  }
  return n;
}

/** Validate that value is an array */
export function validateArray<T>(value: unknown, fieldName: string = 'field', itemValidator?: (item: unknown, fieldName?: string) => T): T[] {
  if (!Array.isArray(value)) {
    throw new Error(`Invalid ${fieldName}: must be an array`);
  }
  if (itemValidator) {
    return value.map((item) => itemValidator(item, fieldName));
  }
  return value as T[];
}

/** Validate that value is an object (not null, not array) */
export function validateObject(value: unknown, fieldName: string = 'field'): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`Invalid ${fieldName}: must be an object`);
  }
  return value as Record<string, unknown>;
}

/**
 * Sanitize FTS5 query string to prevent injection.
 * FTS5 MATCH syntax uses special characters: " * ( ) : ^
 * We strip/escape these to prevent query manipulation.
 */
export function sanitizeFtsQuery(query: string): string {
  // Remove characters that have special meaning in FTS5
  return query.replace(/["*()^:]/g, ' ').trim();
}

/**
 * Validate a file path is safe (no null bytes, no extreme length).
 * Note: This does NOT validate path existence - that's the handler's job.
 */
export function validatePath(value: unknown, fieldName: string = 'path'): string {
  const str = validateString(value, fieldName);
  if (str.includes('\0')) {
    throw new Error(`Invalid ${fieldName}: contains null bytes`);
  }
  if (str.length > 4096) {
    throw new Error(`Invalid ${fieldName}: path too long (max 4096 characters)`);
  }
  return str;
}

/**
 * Validate an audio file extension.
 */
export function validateAudioExtension(filePath: string): void {
  const ext = filePath.split('.').pop()?.toLowerCase() || '';
  const allowed = ['wav', 'mp3', 'flac', 'ogg', 'aiff', 'aif', 'opus', 'm4a', 'aac', 'wma', 'mid', 'midi'];
  if (!allowed.includes(ext)) {
    throw new Error(`Unsupported audio format: .${ext}`);
  }
}

/**
 * Wrap an ipcMain.handle handler with input validation.
 * Returns a standardized error response on validation failure.
 */
export function withValidation<TArgs>(
  handler: (event: Electron.IpcMainInvokeEvent, args: TArgs) => Promise<any>,
  validator?: (args: TArgs) => void
) {
  return async (event: Electron.IpcMainInvokeEvent, args: TArgs) => {
    try {
      if (validator) {
        validator(args);
      }
      return await handler(event, args);
    } catch (err) {
      if (err instanceof Error) {
        return { success: false, error: err.message };
      }
      return { success: false, error: String(err) };
    }
  };
}
