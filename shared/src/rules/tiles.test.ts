import { describe, expect, it } from 'vitest';
import { compareOpening, createDoubleSix, isDouble, sameTile, tileKey, tilePips } from './tiles';

describe('tiles', () => {
  it('R1: createDoubleSix returns 28 unique canonical tiles (T1)', () => {
    const tiles = createDoubleSix();
    expect(tiles).toHaveLength(28);
    expect(tiles.every(([a, b]) => a <= b && a >= 0 && b <= 6)).toBe(true);
    expect(new Set(tiles.map(tileKey)).size).toBe(28);
    expect(tiles.filter(isDouble)).toHaveLength(7);
    expect(tiles.reduce((sum, t) => sum + tilePips(t), 0)).toBe(168);
    expect(tiles[0]).toEqual([0, 0]);
    expect(tiles[1]).toEqual([0, 1]);
    expect(tiles[27]).toEqual([6, 6]);
  });

  it('R1: tileKey / sameTile / isDouble ignore half order (T2)', () => {
    expect(tileKey([5, 3])).toBe('3-5');
    expect(tileKey([3, 5])).toBe('3-5');
    expect(sameTile([5, 3], [3, 5])).toBe(true);
    expect(sameTile([3, 5], [3, 6])).toBe(false);
    expect(isDouble([4, 4])).toBe(true);
    expect(isDouble([4, 5])).toBe(false);
    expect(tilePips([2, 6])).toBe(8);
  });

  it('R4: compareOpening ranks doubles, then sum, then higher half', () => {
    expect(compareOpening([6, 6], [5, 5])).toBeGreaterThan(0);
    expect(compareOpening([0, 0], [5, 6])).toBeGreaterThan(0);
    expect(compareOpening([5, 6], [4, 6])).toBeGreaterThan(0);
    expect(compareOpening([1, 6], [2, 5])).toBeGreaterThan(0);
    expect(compareOpening([2, 5], [3, 4])).toBeGreaterThan(0);
    expect(compareOpening([3, 4], [2, 5])).toBeLessThan(0);
    expect(compareOpening([3, 4], [4, 3])).toBe(0);
  });
});
