import { describe, it, expect } from 'vitest';
import { computeSimilarityRadar } from '../../src/components/samples/SimilarityRadar';

describe('computeSimilarityRadar', () => {
  it('returns 4 data points', () => {
    const result = computeSimilarityRadar(
      { bpm: 120, key: 'C', duration: 5, category: { name: 'kick' } },
      { bpm: 120, key: 'C', duration: 5, category: { name: 'kick' } }
    );
    expect(result).toHaveLength(4);
    expect(result.map(r => r.label)).toEqual(['BPM', 'Key', 'Duration', 'Category']);
  });

  it('returns high similarity for identical samples', () => {
    const result = computeSimilarityRadar(
      { bpm: 120, key: 'C', duration: 5, category: { name: 'kick' } },
      { bpm: 120, key: 'C', duration: 5, category: { name: 'kick' } }
    );
    result.forEach(r => expect(r.value).toBeGreaterThanOrEqual(0.9));
  });

  it('returns low BPM similarity for distant BPMs', () => {
    const result = computeSimilarityRadar(
      { bpm: 80, key: 'C', duration: 5, category: { name: 'kick' } },
      { bpm: 160, key: 'C', duration: 5, category: { name: 'kick' } }
    );
    const bpmSim = result.find(r => r.label === 'BPM')!;
    expect(bpmSim.value).toBeLessThan(0.2);
  });

  it('returns partial key similarity for same root note', () => {
    const result = computeSimilarityRadar(
      { bpm: 120, key: 'Cm', duration: 5, category: { name: 'kick' } },
      { bpm: 120, key: 'C', duration: 5, category: { name: 'kick' } }
    );
    const keySim = result.find(r => r.label === 'Key')!;
    expect(keySim.value).toBe(0.7);
  });

  it('handles null fields gracefully', () => {
    const result = computeSimilarityRadar(
      { bpm: null, key: null, duration: null, category: null },
      { bpm: 120, key: 'C', duration: 5, category: { name: 'kick' } }
    );
    expect(result).toHaveLength(4);
    result.forEach(r => expect(r.value).toBeGreaterThanOrEqual(0));
  });
});
