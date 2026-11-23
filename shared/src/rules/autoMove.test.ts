import { describe, expect, it } from 'vitest';
import { pickAutoMove } from './autoMove';
import { applyMove, getLegalMoves, startRound } from './round';
import { deepFreeze, makeState, pt } from './test-utils';
import type { RoundState } from './types';

const MAX_ACTIONS = 100;

describe('pickAutoMove (spec-11 T5)', () => {
  it('T5a: empty board → the opening tile on the right', () => {
    const s = deepFreeze(startRound({ seed: 42 }));
    expect(pickAutoMove(s)).toEqual({ type: 'play', tile: s.openingTile, end: 'right' });
  });

  it('T5b: the heaviest fitting tile wins ([3,4] = 7 over [1,5] = 6)', () => {
    const s = makeState({
      board: [pt(4, 1)],
      hands: [
        [
          [1, 5],
          [3, 4],
          [0, 0],
        ],
        [],
      ],
      boneyard: [[6, 6]],
    });
    expect(pickAutoMove(deepFreeze(s))).toEqual({ type: 'play', tile: [3, 4], end: 'left' });
  });

  it('T5c: equal sums → the double ([3,3] over [2,4])', () => {
    const s = makeState({
      board: [pt(3, 2)],
      hands: [
        [
          [2, 4],
          [3, 3],
        ],
        [],
      ],
    });
    expect(pickAutoMove(deepFreeze(s))).toEqual({ type: 'play', tile: [3, 3], end: 'left' });
  });

  it('T5d: a tile fitting both ends → the first option of getLegalMoves', () => {
    const s = makeState({
      board: [pt(2, 3), pt(3, 5)],
      hands: [
        [
          [0, 2],
          [2, 5],
        ],
        [],
      ],
    });
    const legal = getLegalMoves(s).filter((m) => m.type === 'play' && m.tile[1] === 5);
    expect(legal).toHaveLength(2);
    expect(pickAutoMove(deepFreeze(s))).toEqual(legal[0]);
    expect(legal[0]).toEqual({ type: 'play', tile: [2, 5], end: 'left' });
  });

  it('T5e: nothing fits, boneyard not empty → draw', () => {
    const s = makeState({ board: [pt(6, 6)], hands: [[[0, 1]], []], boneyard: [[2, 2]] });
    expect(pickAutoMove(deepFreeze(s))).toEqual({ type: 'draw' });
  });

  it('T5f: nothing fits, boneyard empty → pass', () => {
    const s = makeState({ board: [pt(6, 6)], hands: [[[0, 1]], [[1, 2]]], boneyard: [] });
    expect(pickAutoMove(deepFreeze(s))).toEqual({ type: 'pass' });
  });

  it('T5g: finished round → null', () => {
    const s = makeState({
      status: 'finished',
      result: { reason: 'domino', winner: 0, points: 3, handPoints: [0, 3] },
    });
    expect(pickAutoMove(deepFreeze(s))).toBeNull();
  });

  it('T5h: for 200 seeds every auto move is legal and the input is not mutated', () => {
    for (let seed = 0; seed < 200; seed++) {
      let s: RoundState = deepFreeze(startRound({ seed }));
      for (let i = 0; s.status === 'playing'; i++) {
        if (i > MAX_ACTIONS) expect.fail(`seed ${seed}: round did not finish`);
        const move = pickAutoMove(s);
        if (!move) expect.fail(`seed ${seed}: null while playing`);
        if (!getLegalMoves(s).some((m) => JSON.stringify(m) === JSON.stringify(move))) {
          expect.fail(`seed ${seed}: ${JSON.stringify(move)} is not legal`);
        }
        const res = applyMove(s, s.currentPlayer, move);
        if (!res.ok) expect.fail(`seed ${seed}: ${res.error}`);
        s = deepFreeze(res.state);
      }
      expect(pickAutoMove(s)).toBeNull();
    }
  });
});
