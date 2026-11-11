import { describe, expect, it } from 'vitest';
import { handPoints } from './scoring';

describe('handPoints', () => {
  it('R13: sums all halves of all tiles, 0-0 is worth 0 (E8)', () => {
    expect(handPoints([])).toBe(0);
    expect(handPoints([[0, 0]])).toBe(0);
    expect(
      handPoints([
        [6, 6],
        [2, 3],
      ]),
    ).toBe(17);
  });
});
