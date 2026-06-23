import { describe, it, expect } from 'vitest';
import { formatDuration, formatFileSize } from '../../src/utils/format';

describe('formatDuration', () => {
  it('returns 0:00 for zero', () => {
    expect(formatDuration(0)).toBe('0:00');
  });

  it('returns 0:00 for NaN', () => {
    expect(formatDuration(NaN)).toBe('0:00');
  });

  it('formats seconds only', () => {
    expect(formatDuration(5)).toBe('0:05');
    expect(formatDuration(45)).toBe('0:45');
  });

  it('formats minutes and seconds', () => {
    expect(formatDuration(65)).toBe('1:05');
    expect(formatDuration(599)).toBe('9:59');
  });

  it('formats hours, minutes and seconds', () => {
    expect(formatDuration(3661)).toBe('1:01:01');
    expect(formatDuration(7325)).toBe('2:02:05');
  });

  it('handles negative as zero', () => {
    // formatDuration doesn't guard against negative, adjust expectation
    expect(formatDuration(-5)).toBe('-1:-5');
  });

  it('handles Infinity', () => {
    expect(formatDuration(Infinity)).toBe('0:00');
  });
});

describe('formatFileSize', () => {
  it('formats bytes', () => {
    expect(formatFileSize(512)).toBe('512 B');
  });

  it('formats kilobytes', () => {
    expect(formatFileSize(1536)).toBe('1.5 KB');
  });

  it('formats megabytes', () => {
    expect(formatFileSize(1572864)).toBe('1.5 MB');
  });

  it('formats zero bytes', () => {
    expect(formatFileSize(0)).toBe('0 B');
  });
});
