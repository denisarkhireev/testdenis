import { describe, expect, it } from 'vitest';
import { pickAutoMove } from './autoMove';
import { pickBotMove } from './bot';
import { applyMove, getLegalMoves, startRound } from './round';
import { deepFreeze, makeState, pt } from './test-utils';
import type { RoundState } from './types';
import { toPlayerView } from './view';

const MAX_ACTIONS = 100;
const BOT = 1;

/** Позиция, где ходит бот (место 1); вход заморожен — функция не должна его мутировать. */
function botView(overrides: Partial<RoundState>) {
  return deepFreeze(toPlayerView(makeState({ currentPlayer: BOT, ...overrides }), BOT));
}

describe('pickBotMove (spec-15 B1)', () => {
  it('B1a: empty board, bot to move → the opening tile on the right', () => {
    const view = botView({
      openingTile: [5, 5],
      hands: [
        [[6, 6]],
        [
          [5, 5],
          [0, 1],
        ],
      ],
    });
    expect(pickBotMove(view)).toEqual({ type: 'play', tile: [5, 5], end: 'right' });
  });

  it('B1b: the heaviest fitting tile wins ([3,4] = 7 over [1,5] = 6)', () => {
    const view = botView({
      board: [pt(4, 1)],
      hands: [
        [],
        [
          [1, 5],
          [3, 4],
          [0, 0],
        ],
      ],
      boneyard: [[6, 6]],
    });
    expect(pickBotMove(view)).toEqual({ type: 'play', tile: [3, 4], end: 'left' });
  });

  it('B1c: equal sums → the double ([3,3] over [2,4])', () => {
    const view = botView({
      board: [pt(3, 2)],
      hands: [
        [],
        [
          [2, 4],
          [3, 3],
        ],
      ],
    });
    expect(pickBotMove(view)).toEqual({ type: 'play', tile: [3, 3], end: 'left' });
  });

  it('B1d: equal sums, no doubles → the first of them in legalMoves order', () => {
    const view = botView({
      board: [pt(1, 4)],
      hands: [
        [],
        [
          [1, 6],
          [3, 4],
        ],
      ],
    });
    const plays = view.legalMoves.filter((m) => m.type === 'play');
    expect(plays).toHaveLength(2);
    expect(pickBotMove(view)).toEqual(plays[0]);
    expect(pickBotMove(view)).toEqual({ type: 'play', tile: [1, 6], end: 'left' });
  });

  it('B1e: a tile fitting both ends → the end of the first matching legalMoves entry', () => {
    const view = botView({ board: [pt(5, 3)], hands: [[], [[3, 5]]] });
    expect(view.legalMoves).toHaveLength(2);
    expect(pickBotMove(view)).toEqual(view.legalMoves[0]);
  });

  it('B1f: nothing fits, boneyard not empty → draw', () => {
    const view = botView({ board: [pt(6, 6)], hands: [[], [[0, 1]]], boneyard: [[2, 2]] });
    expect(pickBotMove(view)).toEqual({ type: 'draw' });
  });

  it('B1g: nothing fits, boneyard empty → pass', () => {
    const view = botView({ board: [pt(6, 6)], hands: [[[1, 2]], [[0, 1]]], boneyard: [] });
    expect(pickBotMove(view)).toEqual({ type: 'pass' });
  });

  it("B1h: opponent's turn or finished round → null", () => {
    const opponentsTurn = botView({
      currentPlayer: 0,
      board: [pt(4, 1)],
      hands: [[[1, 1]], [[4, 4]]],
    });
    expect(opponentsTurn.legalMoves).toEqual([]);
    expect(pickBotMove(opponentsTurn)).toBeNull();

    const finished = botView({
      status: 'finished',
      result: { reason: 'domino', winner: 1, points: 3, handPoints: [3, 0] },
    });
    expect(pickBotMove(finished)).toBeNull();
  });

  it('B1i: a heavier tile that does not fit is ignored ([1,4] over [6,6])', () => {
    const view = botView({
      board: [pt(4, 0)],
      hands: [
        [],
        [
          [6, 6],
          [1, 4],
        ],
      ],
    });
    expect(pickBotMove(view)).toEqual({ type: 'play', tile: [1, 4], end: 'left' });
  });

  it('B1j: for 200 seeds a bot-vs-bot round is always legal and finishes', () => {
    for (let seed = 0; seed < 200; seed++) {
      let s: RoundState = deepFreeze(startRound({ seed }));
      let actions = 0;
      while (s.status === 'playing') {
        if (++actions > MAX_ACTIONS) expect.fail(`seed ${seed}: round did not finish`);
        const move = pickBotMove(toPlayerView(s, s.currentPlayer));
        if (!move) expect.fail(`seed ${seed}: null while playing`);
        const res = applyMove(s, s.currentPlayer, move);
        if (!res.ok) expect.fail(`seed ${seed}: ${res.error}`);
        s = deepFreeze(res.state);
      }
      expect(pickBotMove(toPlayerView(s, 0))).toBeNull();
      expect(pickBotMove(toPlayerView(s, 1))).toBeNull();
    }
  });

  it('B1k: pickAutoMove(state) ≡ pickBotMove(view of the current player) for 200 seeds', () => {
    for (let seed = 0; seed < 200; seed++) {
      let s: RoundState = startRound({ seed });
      while (s.status === 'playing') {
        const auto = pickAutoMove(s);
        expect(pickBotMove(toPlayerView(s, s.currentPlayer))).toEqual(auto);
        expect(getLegalMoves(s).length).toBeGreaterThan(0);
        const res = applyMove(s, s.currentPlayer, auto!);
        if (!res.ok) expect.fail(`seed ${seed}: ${res.error}`);
        s = res.state;
      }
    }
  });
});
