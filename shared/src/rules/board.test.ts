import { describe, expect, it } from 'vitest';
import { boardEnds, canPlace, placeTile } from './board';
import { pt } from './test-utils';

describe('board', () => {
  it('R5: empty board has no ends and accepts any tile (B1)', () => {
    expect(boardEnds([])).toBeNull();
    expect(canPlace([], [2, 3], 'left')).toBe(true);
    expect(placeTile([], [3, 2], 'left')).toEqual([{ tile: [2, 3], left: 2, right: 3 }]);
  });

  it('R5: right end — tile rotates so the matching half touches (B2)', () => {
    const board = placeTile([pt(5, 5)], [3, 5], 'right');
    expect(board).toEqual([pt(5, 5), { tile: [3, 5], left: 5, right: 3 }]);
    expect(boardEnds(board)).toEqual({ left: 5, right: 3 });
  });

  it('R5: left end — tile is prepended and stored canonically (B3)', () => {
    const board = placeTile([pt(5, 5)], [5, 2], 'left');
    expect(board).toEqual([{ tile: [2, 5], left: 2, right: 5 }, pt(5, 5)]);
    expect(boardEnds(board)).toEqual({ left: 2, right: 5 });
  });

  it('R5: tile without a matching half does not fit (B4)', () => {
    const board = [pt(2, 3)];
    expect(canPlace(board, [4, 5], 'left')).toBe(false);
    expect(canPlace(board, [4, 5], 'right')).toBe(false);
    expect(canPlace(board, [2, 5], 'right')).toBe(false);
    expect(() => placeTile(board, [4, 5], 'right')).toThrow();
  });

  it('R5: a double is placed in line with two equal sides (B5)', () => {
    const board = placeTile([pt(2, 3)], [3, 3], 'right');
    expect(board.at(-1)).toEqual({ tile: [3, 3], left: 3, right: 3 });
    expect(boardEnds(board)).toEqual({ left: 2, right: 3 });
  });

  it('R5: placeTile does not mutate a frozen board (B6)', () => {
    const board = Object.freeze([Object.freeze(pt(1, 4))]);
    const next = placeTile(board, [4, 6], 'right');
    expect(board).toEqual([pt(1, 4)]);
    expect(next).toHaveLength(2);
    expect(next).not.toBe(board);
  });
});
