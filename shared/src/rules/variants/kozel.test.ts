import { describe, expect, it } from 'vitest';
import { createMatch, type MatchState } from '../match';
import { applyMove, getLegalMoves } from '../round';
import { deepFreeze, makeState, pt } from '../test-utils';
import type { RoundResult, RoundState, Tile } from '../types';
import { classicVariant } from './classic';
import { kozelVariant } from './kozel';

const kozel = kozelVariant;

function result(overrides: Partial<RoundResult>): RoundResult {
  return { reason: 'domino', winner: 0, points: 0, handPoints: [0, 0], scorer: 1, ...overrides };
}

function match(scores: [number, number], target = 101): MatchState {
  return { ...createMatch(target), scores };
}

describe('kozel.resolveRound — домино (K2)', () => {
  it('K2-1: игрок 0 вышел → очки руки игрока 1 записаны игроку 1', () => {
    expect(
      kozel.resolveRound(
        'domino',
        [
          [],
          [
            [6, 6],
            [0, 1],
          ],
        ],
        0,
      ),
    ).toEqual({ reason: 'domino', winner: 0, scorer: 1, points: 13, handPoints: [0, 13] });
  });

  it('K2-2: игрок 1 вышел → scorer 0, points = handPoints[0]', () => {
    expect(
      kozel.resolveRound(
        'domino',
        [
          [
            [2, 3],
            [4, 4],
          ],
          [],
        ],
        1,
      ),
    ).toEqual({ reason: 'domino', winner: 1, scorer: 0, points: 13, handPoints: [13, 0] });
  });

  it('K2-3: у проигравшего только [0,0] → points 0, scorer — он', () => {
    expect(kozel.resolveRound('domino', [[], [[0, 0]]], 0)).toEqual({
      reason: 'domino',
      winner: 0,
      scorer: 1,
      points: 0,
      handPoints: [0, 0],
    });
  });
});

describe('kozel.resolveRound — рыба (K3, K4)', () => {
  it('K3-1: суммы [4, 9] → winner 0, scorer 1, points 9 (не 13 и не 4)', () => {
    const hands: [Tile[], Tile[]] = [
      [[1, 3]],
      [
        [2, 3],
        [0, 4],
      ],
    ];
    expect(kozel.resolveRound('fish', hands)).toEqual({
      reason: 'fish',
      winner: 0,
      scorer: 1,
      points: 9,
      handPoints: [4, 9],
    });
  });

  it('K3-2: суммы [12, 3] → winner 1, scorer 0, points 12', () => {
    const hands: [Tile[], Tile[]] = [
      [
        [6, 6],
        [0, 0],
      ],
      [[1, 2]],
    ];
    expect(kozel.resolveRound('fish', hands)).toEqual({
      reason: 'fish',
      winner: 1,
      scorer: 0,
      points: 12,
      handPoints: [12, 3],
    });
  });

  it('K4-1: суммы [7, 7] → ничья, scorer null, points 0', () => {
    const hands: [Tile[], Tile[]] = [[[3, 4]], [[1, 6]]];
    expect(kozel.resolveRound('fish', hands)).toEqual({
      reason: 'fish',
      winner: null,
      scorer: null,
      points: 0,
      handPoints: [7, 7],
    });
  });
});

describe('kozel.recordRound (K5)', () => {
  it('K5-1: очки записаны scorer, матч продолжается, вход не мутирован', () => {
    const before = deepFreeze(createMatch(101));
    const r = result({ winner: 0, scorer: 1, points: 13, handPoints: [0, 13] });
    const after = kozel.recordRound(before, r);
    expect(after.scores).toEqual([0, 13]);
    expect(after.winner).toBeNull();
    expect(after.rounds).toEqual([r]);
    expect(before.scores).toEqual([0, 0]);
    expect(before.rounds).toHaveLength(0);
  });

  it('K5-2: [95, 40] + 9 игроку 0 → [104, 40], игрок 0 — козёл, winner 1', () => {
    const after = kozel.recordRound(
      match([95, 40]),
      result({ reason: 'fish', winner: 1, scorer: 0, points: 9, handPoints: [9, 4] }),
    );
    expect(after.scores).toEqual([104, 40]);
    expect(after.winner).toBe(1);
    expect(after.forfeit).toBeNull();
  });

  it('K5-3: ровно до цели [92, 0] + 9 → [101, 0], winner 1 (≥, не >)', () => {
    const after = kozel.recordRound(
      match([92, 0]),
      result({ winner: 1, scorer: 0, points: 9, handPoints: [9, 0] }),
    );
    expect(after.scores).toEqual([101, 0]);
    expect(after.winner).toBe(1);
  });

  it('K5-4: ничья (K4) при [100, 100] → счёт прежний, матч идёт, итог в rounds', () => {
    const r = result({ reason: 'fish', winner: null, scorer: null, points: 0, handPoints: [7, 7] });
    const after = kozel.recordRound(match([100, 100]), r);
    expect(after.scores).toEqual([100, 100]);
    expect(after.winner).toBeNull();
    expect(after.rounds).toEqual([r]);
  });

  it('K5-5: оконченный матч → throw', () => {
    const finished: MatchState = { ...match([104, 40]), winner: 1 };
    expect(() => kozel.recordRound(finished, result({ points: 1 }))).toThrow();
  });

  it('K5: классический результат без scorer → очки записываются winner', () => {
    const after = kozel.recordRound(match([0, 0]), {
      reason: 'domino',
      winner: 0,
      points: 5,
      handPoints: [0, 5],
    });
    expect(after.scores).toEqual([5, 0]);
  });
});

/** Прогоняет раунд, на каждом шаге беря первый легальный ход; возвращает цепочку состояний. */
function playFirstMoves(start: RoundState, variant = classicVariant): RoundState[] {
  const states = [start];
  let s = start;
  for (let i = 0; s.status === 'playing'; i++) {
    if (i > 200) throw new Error('round did not finish');
    const move = getLegalMoves(s)[0];
    if (!move) throw new Error('no legal moves');
    const r = applyMove(s, s.currentPlayer, move, variant);
    if (!r.ok) throw new Error(r.error);
    s = r.state;
    states.push(s);
  }
  return states;
}

describe('applyMove с kozelVariant (K1)', () => {
  it('K1-1: раунд по фиксированной раздаче до домино — ходы те же, result.scorer — проигравший', () => {
    // Игрок 0 выходит за 2 хода (5:6, 4:5), игрок 1 пропускает — базар пуст.
    const start = makeState({
      board: [pt(6, 6)],
      hands: [
        [
          [5, 6],
          [4, 5],
        ],
        [
          [0, 0],
          [1, 2],
        ],
      ],
      currentPlayer: 0,
    });
    const classic = playFirstMoves(start, classicVariant);
    const goat = playFirstMoves(start, kozelVariant);
    expect(goat).toHaveLength(classic.length);
    goat.forEach((s, i) => {
      expect({ ...s, result: null }).toEqual({ ...classic[i], result: null });
    });
    expect(classic.at(-1)!.result).toEqual({
      reason: 'domino',
      winner: 0,
      points: 3,
      handPoints: [0, 3],
    });
    expect(goat.at(-1)!.result).toEqual({
      reason: 'domino',
      winner: 0,
      scorer: 1,
      points: 3,
      handPoints: [0, 3],
    });
  });

  it('K1-2: pass, ведущий к рыбе → result по K3 (собственная сумма большего)', () => {
    const state = makeState({
      board: [pt(6, 6)],
      hands: [
        [[0, 1]],
        [
          [2, 3],
          [0, 4],
        ],
      ],
      currentPlayer: 0,
      openingTile: [6, 6],
    });
    const r = applyMove(state, 0, { type: 'pass' }, kozelVariant);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.state.status).toBe('finished');
    expect(r.state.result).toEqual({
      reason: 'fish',
      winner: 0,
      scorer: 1,
      points: 9,
      handPoints: [1, 9],
    });
  });
});
