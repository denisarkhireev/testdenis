import type { Move } from '@domino/shared';
import { describe, expect, it } from 'vitest';
import { canDraw, canPass, isPlayable, playEnds, tileTestId } from './moves';

const play35left: Move = { type: 'play', tile: [3, 5], end: 'left' };
const play35right: Move = { type: 'play', tile: [3, 5], end: 'right' };

describe('moves', () => {
  it('T-1: isPlayable looks only at play moves in legalMoves', () => {
    expect(isPlayable([play35left], [3, 5])).toBe(true);
    expect(isPlayable([play35left], [1, 2])).toBe(false);
    expect(isPlayable([], [3, 5])).toBe(false);
    expect(isPlayable([{ type: 'draw' }], [3, 5])).toBe(false);
  });

  it('T-2: playEnds returns unique ends in left/right order', () => {
    expect(playEnds([play35right], [3, 5])).toEqual(['right']);
    expect(playEnds([play35right, play35left], [3, 5])).toEqual(['left', 'right']);
    expect(playEnds([play35right, play35right], [3, 5])).toEqual(['right']);
    expect(playEnds([play35left], [1, 2])).toEqual([]);
  });

  it('T-3: canDraw / canPass', () => {
    const cases: [Move[], boolean, boolean][] = [
      [[{ type: 'draw' }], true, false],
      [[{ type: 'pass' }], false, true],
      [[play35left], false, false],
      [[], false, false],
    ];
    for (const [moves, draw, pass] of cases) {
      expect(canDraw(moves)).toBe(draw);
      expect(canPass(moves)).toBe(pass);
    }
  });

  it('tileTestId is hand-tile-<low>-<high>', () => {
    expect(tileTestId([3, 5])).toBe('hand-tile-3-5');
    expect(tileTestId([6, 6])).toBe('hand-tile-6-6');
  });
});
