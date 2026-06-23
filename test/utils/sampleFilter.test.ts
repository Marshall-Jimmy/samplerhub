import { describe, it, expect } from 'vitest';
import { PAD_TYPE_TO_CATEGORY, clearCategoryCache } from '../../src/utils/sampleFilter';

describe('PAD_TYPE_TO_CATEGORY', () => {
  it('maps Kick pad to Kick category', () => {
    expect(PAD_TYPE_TO_CATEGORY['Kick']).toBe('Kick');
  });

  it('maps Snare pad to Snare category', () => {
    expect(PAD_TYPE_TO_CATEGORY['Snare']).toBe('Snare');
  });

  it('maps Hi-Hat C to Hi-Hat category', () => {
    expect(PAD_TYPE_TO_CATEGORY['Hi-Hat C']).toBe('Hi-Hat');
  });

  it('maps Hi-Hat O to Hi-Hat category', () => {
    expect(PAD_TYPE_TO_CATEGORY['Hi-Hat O']).toBe('Hi-Hat');
  });

  it('maps Crash to Cymbal category', () => {
    expect(PAD_TYPE_TO_CATEGORY['Crash']).toBe('Cymbal');
  });

  it('maps Ride to Cymbal category', () => {
    expect(PAD_TYPE_TO_CATEGORY['Ride']).toBe('Cymbal');
  });

  it('maps all Tom variants to Tom category', () => {
    expect(PAD_TYPE_TO_CATEGORY['Tom Hi']).toBe('Tom');
    expect(PAD_TYPE_TO_CATEGORY['Tom Mid']).toBe('Tom');
    expect(PAD_TYPE_TO_CATEGORY['Tom Lo']).toBe('Tom');
  });

  it('returns undefined for unknown pad type', () => {
    expect(PAD_TYPE_TO_CATEGORY['Unknown']).toBeUndefined();
  });
});

describe('clearCategoryCache', () => {
  it('does not throw when called', () => {
    expect(() => clearCategoryCache()).not.toThrow();
  });
});
