import { describe, it, expect, beforeEach } from 'vitest';
import {
  getCachedWaveform,
  getCachedWaveformByPath,
  setCachedWaveformByPath,
  clearWaveformCache,
} from '../../src/utils/waveformCache';

describe('waveformCache', () => {
  beforeEach(() => {
    clearWaveformCache();
  });

  describe('getCachedWaveform (by sampleId)', () => {
    it('returns null for uncached id', () => {
      expect(getCachedWaveform(999, null)).toBeNull();
    });

    it('caches and returns waveform data', () => {
      const rawData = new Float32Array([0.1, 0.5, 0.9]);
      const result = getCachedWaveform(1, rawData.buffer);
      expect(result).toHaveLength(3);
      expect(result![0]).toBeCloseTo(0.1, 5);
      expect(result![1]).toBe(0.5);
      expect(result![2]).toBeCloseTo(0.9, 5);
    });

    it('returns cached data on second call without rawData', () => {
      const rawData = new Float32Array([0.2, 0.6]);
      getCachedWaveform(2, rawData.buffer);
      const result = getCachedWaveform(2, null);
      expect(result).toHaveLength(2);
      expect(result![0]).toBeCloseTo(0.2, 5);
      expect(result![1]).toBeCloseTo(0.6, 5);
    });

    it('returns null or empty for invalid rawData', () => {
      // String is treated as empty array by Float32Array constructor
      const result = getCachedWaveform(3, 'invalid');
      expect(result === null || (Array.isArray(result) && result.length === 0)).toBe(true);
    });
  });

  describe('getCachedWaveformByPath / setCachedWaveformByPath (LRU)', () => {
    it('returns null for uncached path', () => {
      expect(getCachedWaveformByPath('/foo/bar.wav')).toBeNull();
    });

    it('stores and retrieves by path', () => {
      const data = [0.1, 0.2, 0.3];
      setCachedWaveformByPath('/test/file.wav', data);
      expect(getCachedWaveformByPath('/test/file.wav')).toEqual(data);
    });

    it('evicts oldest entry when cache is full', () => {
      // Fill cache beyond MAX (50) — just test with a few entries
      for (let i = 0; i < 55; i++) {
        setCachedWaveformByPath(`/file${i}.wav`, [i * 0.1]);
      }
      // First few should be evicted
      expect(getCachedWaveformByPath('/file0.wav')).toBeNull();
      expect(getCachedWaveformByPath('/file1.wav')).toBeNull();
      // Later ones should still exist
      expect(getCachedWaveformByPath('/file54.wav')).toEqual([5.4]);
    });

    it('LRU moves accessed item to end', () => {
      setCachedWaveformByPath('/old.wav', [0.1]);
      // Add enough to push /old.wav near eviction
      for (let i = 0; i < 49; i++) {
        setCachedWaveformByPath(`/file${i}.wav`, [i]);
      }
      // Access /old.wav to move it to end (LRU refresh)
      getCachedWaveformByPath('/old.wav');
      // Add one more — should evict the oldest unaccessed, not /old.wav
      setCachedWaveformByPath('/new.wav', [99]);
      expect(getCachedWaveformByPath('/old.wav')).toEqual([0.1]);
    });
  });
});
