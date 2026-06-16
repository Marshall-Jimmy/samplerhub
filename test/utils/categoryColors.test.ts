import { describe, it, expect } from 'vitest';
import { getCategoryColor, CATEGORY_COLORS, FALLBACK_COLOR } from '../../src/utils/categoryColors';

describe('getCategoryColor', () => {
  it('returns correct color for kick', () => {
    expect(getCategoryColor('kick')).toBe('#EF4444');
  });

  it('returns correct color for Kick (case insensitive)', () => {
    expect(getCategoryColor('Kick')).toBe('#EF4444');
  });

  it('returns correct color for snare', () => {
    expect(getCategoryColor('snare')).toBe('#F59E0B');
  });

  it('returns correct color for hihat', () => {
    expect(getCategoryColor('hihat')).toBe('#EAB308');
  });

  it('returns correct color for 808 bass', () => {
    expect(getCategoryColor('808 bass')).toBe('#22D3EE');
  });

  it('returns correct color for bass', () => {
    expect(getCategoryColor('bass')).toBe('#22D3EE');
  });

  it('returns correct color for vocal', () => {
    expect(getCategoryColor('vocal')).toBe('#FB7185');
  });

  it('returns correct color for fx', () => {
    expect(getCategoryColor('fx')).toBe('#34D399');
  });

  it('returns fallback color for unknown category', () => {
    expect(getCategoryColor('unknown')).toBe(FALLBACK_COLOR);
  });

  it('returns fallback color for empty string', () => {
    expect(getCategoryColor('')).toBe(FALLBACK_COLOR);
  });
});

describe('CATEGORY_COLORS', () => {
  it('contains expected categories', () => {
    expect(CATEGORY_COLORS).toHaveProperty('kick');
    expect(CATEGORY_COLORS).toHaveProperty('snare');
    expect(CATEGORY_COLORS).toHaveProperty('hihat');
    expect(CATEGORY_COLORS).toHaveProperty('bass');
    expect(CATEGORY_COLORS).toHaveProperty('vocal');
    expect(CATEGORY_COLORS).toHaveProperty('fx');
  });

  it('all colors are valid hex strings', () => {
    Object.values(CATEGORY_COLORS).forEach((color) => {
      expect(color).toMatch(/^#[0-9A-Fa-f]{6}$/);
    });
  });
});
