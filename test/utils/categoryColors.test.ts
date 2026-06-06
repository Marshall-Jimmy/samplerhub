import { describe, it, expect } from 'vitest';
import { getCategoryColor, CATEGORY_COLORS, FALLBACK_COLOR } from '../../src/utils/categoryColors';

describe('getCategoryColor', () => {
  it('returns correct color for known category', () => {
    expect(getCategoryColor('kick')).toBe('#EF4444');
    expect(getCategoryColor('snare')).toBe('#F59E0B');
    expect(getCategoryColor('bass')).toBe('#22D3EE');
  });

  it('is case-insensitive', () => {
    expect(getCategoryColor('Kick')).toBe('#EF4444');
    expect(getCategoryColor('SNARE')).toBe('#F59E0B');
    expect(getCategoryColor('Bass')).toBe('#22D3EE');
  });

  it('returns fallback for unknown category', () => {
    expect(getCategoryColor('unknown-category')).toBe(FALLBACK_COLOR);
  });

  it('returns fallback for empty string', () => {
    expect(getCategoryColor('')).toBe(FALLBACK_COLOR);
  });

  it('CATEGORY_COLORS has entries', () => {
    expect(Object.keys(CATEGORY_COLORS).length).toBeGreaterThan(0);
  });
});
