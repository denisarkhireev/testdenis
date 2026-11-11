import { describe, expect, it } from 'vitest';
import { boardEnds } from './board';
import { applyMove, getLegalMoves, startRound } from './round';
import { deckFrom, deepFreeze, makeState, pt } from './test-utils';
import { createDoubleSix, tileKey } from './tiles';
import type { ApplyResult, RoundState, Tile } from './types';

const keys = (tiles: readonly Tile[]) => tiles.map(tileKey).join(' ');

function expectOk(result: ApplyResult): RoundState {
  if (!result.ok) throw new Error(`expected ok, got ${result.error}`);
  return result.state;
}

describe('startRound', () => {
  it('R3: seed 42 gives the golden deal (G1)', () => {
    const s = startRound({ seed: 42 });
    expect(keys(s.hands[0])).toBe('0-5 3-5 2-4 0-1 1-1 0-3 1-3');
    expect(keys(s.hands[1])).toBe('1-4 4-6 0-0 5-5 3-3 3-6 0-2');
    expect(keys(s.boneyard)).toBe('3-4 1-5 2-3 4-5 1-2 2-6 2-2 0-6 5-6 0-4 6-6 4-4 1-6 2-5');
    expect(tileKey(s.openingTile)).toBe('5-5');
    expect(s.currentPlayer).toBe(1);
    expect(s.board).toEqual([]);
    expect(s.status).toBe('playing');
    expect(s.result).toBeNull();
  });

  it('R2: seed 1 control deal; same seed — same state, default seed is 0', () => {
    const s = startRound({ seed: 1 });
    expect(keys(s.hands[0])).toBe('2-5 1-5 1-3 0-4 1-1 1-4 0-1');
    expect(keys(s.hands[1])).toBe('1-6 2-3 3-6 5-6 0-5 3-5 0-3');
    expect(tileKey(s.openingTile)).toBe('1-1');
    expect(s.currentPlayer).toBe(0);
    expect(startRound({ seed: 1 })).toEqual(s);
    expect(startRound()).toEqual(startRound({ seed: 0 }));
  });

  it('R3: deals 7 / 7 / 14 with an empty board (T7)', () => {
    for (const seed of [0, 1, 2, 3, 99, 123456]) {
      const s = startRound({ seed });
      expect(s.hands[0]).toHaveLength(7);
      expect(s.hands[1]).toHaveLength(7);
      expect(s.boneyard).toHaveLength(14);
      expect(s.board).toEqual([]);
    }
  });

  it('R1: an invalid deck throws (T8)', () => {
    const full = createDoubleSix();
    expect(() => startRound({ deck: full.slice(1) })).toThrow();
    expect(() => startRound({ deck: [...full.slice(1), [6, 6]] })).toThrow();
    expect(() => startRound({ deck: [[7, 1] as unknown as Tile, ...full.slice(1)] })).toThrow();
    expect(() =>
      startRound({ deck: [[1, 0] as unknown as Tile, ...full.slice(0, 1), ...full.slice(2)] }),
    ).toThrow();
    expect(() => startRound({ seed: 0.5 })).toThrow();
    expect(() => startRound({ deck: full })).not.toThrow();
  });
});

describe('first move', () => {
  it('R4: the highest double opens (F1)', () => {
    const s = startRound({
      deck: deckFrom(
        [
          [3, 3],
          [0, 1],
          [0, 2],
          [0, 3],
          [0, 4],
          [0, 5],
          [0, 6],
        ],
        [
          [6, 6],
          [1, 2],
          [1, 3],
          [1, 4],
          [1, 5],
          [1, 6],
          [2, 3],
        ],
      ),
    });
    expect(s.currentPlayer).toBe(1);
    expect(s.openingTile).toEqual([6, 6]);
  });

  it('R4: without doubles the heaviest tile opens (F2)', () => {
    const s = startRound({
      deck: deckFrom(
        [
          [5, 6],
          [0, 1],
          [0, 2],
          [0, 3],
          [0, 4],
          [0, 5],
          [1, 2],
        ],
        [
          [4, 6],
          [1, 3],
          [1, 4],
          [1, 5],
          [2, 3],
          [2, 4],
          [0, 6],
        ],
      ),
    });
    expect(s.openingTile).toEqual([5, 6]);
    expect(s.currentPlayer).toBe(0);
  });

  it('R4: equal sums — the higher half wins: 1-6 > 2-5 > 3-4 (F3)', () => {
    const s = startRound({
      deck: deckFrom(
        [
          [0, 1],
          [0, 2],
          [0, 3],
          [0, 4],
          [0, 5],
          [1, 2],
          [1, 6],
        ],
        [
          [3, 4],
          [2, 5],
          [0, 6],
          [1, 3],
          [1, 4],
          [1, 5],
          [2, 3],
        ],
      ),
    });
    expect(s.openingTile).toEqual([1, 6]);
    expect(s.currentPlayer).toBe(0);
  });

  it('R4: the first move must be the opening tile (F4)', () => {
    const s = startRound({ seed: 42 });
    expect(applyMove(s, 1, { type: 'play', tile: [1, 4], end: 'right' })).toEqual({
      ok: false,
      error: 'MUST_PLAY_OPENING_TILE',
    });
  });

  it('R4: on an empty board the only legal move is the opening tile (F5)', () => {
    const s = startRound({ seed: 42 });
    expect(getLegalMoves(s)).toEqual([{ type: 'play', tile: [5, 5], end: 'right' }]);
  });

  it('R10: after the opening move the turn passes to the opponent (F6)', () => {
    const s = startRound({ seed: 42 });
    const next = expectOk(applyMove(s, 1, { type: 'play', tile: [5, 5], end: 'left' }));
    expect(next.board).toEqual([pt(5, 5)]);
    expect(next.currentPlayer).toBe(0);
    expect(next.hands[1]).toHaveLength(6);
    expect(next.hands[0]).toBe(s.hands[0]);
  });
});

describe('applyMove: play / draw / pass', () => {
  const board55 = [pt(5, 5)];

  it('NOT_YOUR_TURN leaves the state untouched (M1)', () => {
    const s = startRound({ seed: 42 });
    const before = structuredClone(s);
    expect(applyMove(s, 0, { type: 'play', tile: [0, 5], end: 'right' })).toEqual({
      ok: false,
      error: 'NOT_YOUR_TURN',
    });
    expect(s).toEqual(before);
  });

  it('TILE_NOT_IN_HAND for a tile the player does not hold (M2)', () => {
    const s = startRound({ seed: 42 });
    expect(applyMove(s, 1, { type: 'play', tile: [2, 5], end: 'right' })).toEqual({
      ok: false,
      error: 'TILE_NOT_IN_HAND',
    });
  });

  it('R5: TILE_DOES_NOT_FIT for a non-matching tile (M3)', () => {
    const s = makeState({
      board: board55,
      hands: [
        [
          [1, 2],
          [5, 6],
        ],
        [[0, 0]],
      ],
      boneyard: [[4, 4]],
    });
    expect(applyMove(s, 0, { type: 'play', tile: [1, 2], end: 'right' })).toEqual({
      ok: false,
      error: 'TILE_DOES_NOT_FIT',
    });
  });

  it('R5: a tile given as [5,3] matches [3,5] in hand (M4)', () => {
    const s = makeState({
      board: board55,
      hands: [
        [
          [3, 5],
          [1, 2],
        ],
        [[0, 0]],
      ],
      boneyard: [[4, 4]],
    });
    const next = expectOk(applyMove(s, 0, { type: 'play', tile: [5, 3], end: 'right' }));
    expect(next.hands[0]).toEqual([[1, 2]]);
    expect(next.board.at(-1)).toEqual({ tile: [3, 5], left: 5, right: 3 });
  });

  it('R9: draw is rejected while a play is available (M5)', () => {
    const s = makeState({ board: board55, hands: [[[3, 5]], [[0, 0]]], boneyard: [[4, 4]] });
    expect(applyMove(s, 0, { type: 'draw' })).toEqual({ ok: false, error: 'MUST_PLAY' });
  });

  it('R9: pass is rejected while a play is available (M6)', () => {
    const s = makeState({ board: board55, hands: [[[3, 5]], [[0, 0]]], boneyard: [[4, 4]] });
    expect(applyMove(s, 0, { type: 'pass' })).toEqual({ ok: false, error: 'MUST_PLAY' });
    const empty = makeState({ board: board55, hands: [[[3, 5]], [[0, 0]]] });
    expect(applyMove(empty, 0, { type: 'pass' })).toEqual({ ok: false, error: 'MUST_PLAY' });
  });

  it('R7: draw takes boneyard[0] into the hand and keeps the turn (M7)', () => {
    const s = makeState({
      board: board55,
      hands: [[[1, 2]], [[0, 0]]],
      boneyard: [
        [0, 3],
        [5, 6],
      ],
    });
    const next = expectOk(applyMove(s, 0, { type: 'draw' }));
    expect(next.hands[0]).toEqual([
      [1, 2],
      [0, 3],
    ]);
    expect(next.boneyard).toEqual([[5, 6]]);
    expect(next.currentPlayer).toBe(0);
    expect(next.status).toBe('playing');
  });

  it('R7: draw again after a non-matching tile, then play passes the turn (M8)', () => {
    let s = makeState({
      board: board55,
      hands: [[[1, 2]], [[0, 0]]],
      boneyard: [
        [0, 3],
        [5, 6],
        [4, 4],
      ],
    });
    s = expectOk(applyMove(s, 0, { type: 'draw' }));
    expect(getLegalMoves(s)).toEqual([{ type: 'draw' }]);
    s = expectOk(applyMove(s, 0, { type: 'draw' }));
    expect(s.currentPlayer).toBe(0);
    expect(getLegalMoves(s)).toEqual([{ type: 'play', tile: [5, 6], end: 'right' }]);
    s = expectOk(applyMove(s, 0, { type: 'play', tile: [5, 6], end: 'right' }));
    expect(s.currentPlayer).toBe(1);
    expect(s.status).toBe('playing');
  });

  it('R7: draw from an empty boneyard is rejected (M9)', () => {
    const s = makeState({ board: board55, hands: [[[1, 2]], [[5, 6]]] });
    expect(applyMove(s, 0, { type: 'draw' })).toEqual({ ok: false, error: 'BONEYARD_EMPTY' });
  });

  it('R8: pass with nothing to play and an empty boneyard passes the turn (M10)', () => {
    const s = makeState({ board: board55, hands: [[[1, 2]], [[5, 6]]] });
    const next = expectOk(applyMove(s, 0, { type: 'pass' }));
    expect(next).toEqual({ ...s, currentPlayer: 1 });
  });

  it('R8: pass is rejected while the boneyard is not empty (M11)', () => {
    const s = makeState({ board: board55, hands: [[[1, 2]], [[5, 6]]], boneyard: [[4, 4]] });
    expect(applyMove(s, 0, { type: 'pass' })).toEqual({ ok: false, error: 'BONEYARD_NOT_EMPTY' });
  });

  it('R6: legal moves list every fitting tile and end in hand order (M12)', () => {
    const s = makeState({
      board: [pt(2, 3), pt(3, 4)],
      hands: [
        [
          [2, 4],
          [1, 2],
          [6, 6],
        ],
        [[0, 0]],
      ],
      boneyard: [[5, 5]],
    });
    expect(getLegalMoves(s)).toEqual([
      { type: 'play', tile: [2, 4], end: 'left' },
      { type: 'play', tile: [2, 4], end: 'right' },
      { type: 'play', tile: [1, 2], end: 'left' },
    ]);
  });

  it('R6: equal ends give a single right-end entry, left is still accepted (M13)', () => {
    const s = makeState({ board: [pt(3, 3)], hands: [[[3, 5]], [[0, 0]]], boneyard: [[1, 1]] });
    expect(getLegalMoves(s)).toEqual([{ type: 'play', tile: [3, 5], end: 'right' }]);
    const left = expectOk(applyMove(s, 0, { type: 'play', tile: [3, 5], end: 'left' }));
    expect(left.board[0]).toEqual({ tile: [3, 5], left: 5, right: 3 });
  });

  it('R6: no fitting tile — draw if boneyard has tiles, otherwise pass (M14)', () => {
    const base = { board: board55, hands: [[[1, 2]], [[5, 6]]] as [Tile[], Tile[]] };
    expect(getLegalMoves(makeState({ ...base, boneyard: [[4, 4]] }))).toEqual([{ type: 'draw' }]);
    expect(getLegalMoves(makeState(base))).toEqual([{ type: 'pass' }]);
  });

  it('applyMove never mutates a deeply frozen input (M16)', () => {
    const s = startRound({ seed: 42 });
    const before = structuredClone(s);
    deepFreeze(s);
    let state = s;
    for (let i = 0; i < 6 && state.status === 'playing'; i++) {
      const frozen = deepFreeze(state);
      const snapshot = structuredClone(frozen);
      const move = getLegalMoves(frozen)[0];
      if (!move) break;
      state = expectOk(applyMove(frozen, frozen.currentPlayer, move));
      expect(frozen).toEqual(snapshot);
    }
    expect(s).toEqual(before);
  });
});

describe('end of round and scoring', () => {
  it('R11: emptying the hand ends the round with "domino" (E1)', () => {
    const s = makeState({
      board: [pt(1, 5)],
      hands: [
        [[5, 6]],
        [
          [6, 6],
          [0, 1],
        ],
      ],
    });
    const next = expectOk(applyMove(s, 0, { type: 'play', tile: [5, 6], end: 'right' }));
    expect(next.status).toBe('finished');
    expect(next.currentPlayer).toBe(0);
    expect(next.result).toEqual({ reason: 'domino', winner: 0, points: 13, handPoints: [0, 13] });
  });

  it('R13: domino winner scores the loser hand points (E1, player 1)', () => {
    const s = makeState({
      board: [pt(1, 5)],
      hands: [
        [
          [2, 3],
          [4, 4],
        ],
        [[1, 2]],
      ],
      currentPlayer: 1,
    });
    const next = expectOk(applyMove(s, 1, { type: 'play', tile: [1, 2], end: 'left' }));
    expect(next.result).toEqual({ reason: 'domino', winner: 1, points: 13, handPoints: [13, 0] });
  });

  it('R12: fish is detected right after a play, lower hand wins (E2)', () => {
    const s = makeState({
      board: [pt(6, 3)],
      hands: [
        [
          [3, 6],
          [0, 4],
        ],
        [
          [0, 1],
          [2, 3],
          [1, 2],
        ],
      ],
    });
    const next = expectOk(applyMove(s, 0, { type: 'play', tile: [3, 6], end: 'right' }));
    expect(next.status).toBe('finished');
    expect(next.result).toEqual({ reason: 'fish', winner: 0, points: 9, handPoints: [4, 9] });
  });

  it('R12: fish with equal hands is a draw (E3)', () => {
    const s = makeState({
      board: [pt(6, 3)],
      hands: [
        [
          [3, 6],
          [3, 4],
        ],
        [[2, 5]],
      ],
    });
    const next = expectOk(applyMove(s, 0, { type: 'play', tile: [3, 6], end: 'right' }));
    expect(next.result).toEqual({ reason: 'fish', winner: null, points: 0, handPoints: [7, 7] });
  });

  it('R12: fish right after drawing the last boneyard tile (E4)', () => {
    const s = makeState({
      board: [pt(6, 3), pt(3, 6)],
      hands: [[[0, 1]], [[1, 2]]],
      boneyard: [[0, 2]],
    });
    const next = expectOk(applyMove(s, 0, { type: 'draw' }));
    expect(next.status).toBe('finished');
    expect(next.result?.reason).toBe('fish');
    expect(next.hands[0]).toEqual([
      [0, 1],
      [0, 2],
    ]);
  });

  it('R12: not fish while the opponent can still play (E5)', () => {
    const open = makeState({
      board: [pt(5, 5)],
      hands: [
        [[1, 2]],
        [
          [5, 6],
          [0, 0],
        ],
      ],
    });
    expect(open.status).toBe('playing');
    expect(getLegalMoves(open)).toEqual([{ type: 'pass' }]);
    const passed = expectOk(applyMove(open, 0, { type: 'pass' }));
    expect(passed.status).toBe('playing');
    expect(passed.currentPlayer).toBe(1);
  });

  it('R14: any move after the round is finished is rejected first (E6)', () => {
    const s = makeState({
      board: [pt(1, 5)],
      hands: [
        [[5, 6]],
        [
          [6, 6],
          [0, 1],
        ],
      ],
    });
    const done = expectOk(applyMove(s, 0, { type: 'play', tile: [5, 6], end: 'right' }));
    for (const player of [0, 1] as const) {
      expect(applyMove(done, player, { type: 'pass' })).toEqual({
        ok: false,
        error: 'ROUND_FINISHED',
      });
      expect(applyMove(done, player, { type: 'play', tile: [6, 6], end: 'right' })).toEqual({
        ok: false,
        error: 'ROUND_FINISHED',
      });
    }
  });

  it('R14: no legal moves after the round is finished (E7)', () => {
    const s = makeState({
      board: [pt(1, 5)],
      hands: [
        [[5, 6]],
        [
          [6, 6],
          [0, 1],
        ],
      ],
    });
    const done = expectOk(applyMove(s, 0, { type: 'play', tile: [5, 6], end: 'right' }));
    expect(getLegalMoves(done)).toEqual([]);
  });

  it('R11: the last tile wins even with a non-empty boneyard (E9)', () => {
    const s = makeState({
      board: [pt(1, 5)],
      hands: [
        [[5, 6]],
        [
          [6, 6],
          [0, 1],
        ],
      ],
      boneyard: [
        [2, 2],
        [3, 4],
      ],
    });
    const next = expectOk(applyMove(s, 0, { type: 'play', tile: [5, 6], end: 'right' }));
    expect(next.result).toEqual({ reason: 'domino', winner: 0, points: 13, handPoints: [0, 13] });
    expect(boardEnds(next.board)).toEqual({ left: 1, right: 6 });
  });
});
