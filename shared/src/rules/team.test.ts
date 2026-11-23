import { describe, expect, it } from 'vitest';
import { deal } from './deck';
import { createMatch, forfeitMatch, recordRound } from './match';
import { createRng } from './rng';
import { applyMove, getLegalMoves, startRound } from './round';
import { resolveRound } from './scoring';
import { makeState, pt } from './test-utils';
import { createDoubleSix, sameTile } from './tiles';
import type { ApplyResult, RoundState, Tile } from './types';
import { kozelVariant } from './variants';
import { toPlayerView } from './view';

function expectOk(result: ApplyResult): RoundState {
  if (!result.ok) throw new Error(`expected ok, got ${result.error}`);
  return result.state;
}

/** Состояние 2×2 после первой кости 6:6 (базар пуст). */
function teamState(hands: [Tile[], Tile[], Tile[], Tile[]], currentPlayer: 0 | 1 | 2 | 3) {
  return makeState({ board: [pt(6, 6)], hands, currentPlayer });
}

describe('раздача 2×2 (Q2)', () => {
  const deck = createDoubleSix();

  it('Q2-1: deal(deck, 7, 4) — 4 руки по 7 подряд из колоды, базар пуст', () => {
    const { hands, boneyard } = deal(deck, 7, 4);
    expect(hands).toHaveLength(4);
    hands.forEach((hand, i) => expect(hand).toEqual(deck.slice(7 * i, 7 * i + 7)));
    expect(boneyard).toEqual([]);
  });

  it('Q2-1: deal(deck, 6, 4) → throw; deal(deck, 7) — прежний результат', () => {
    expect(() => deal(deck, 6, 4)).toThrow();
    expect(deal(deck, 7)).toEqual({
      hands: [deck.slice(0, 7), deck.slice(7, 14)],
      boneyard: deck.slice(14),
    });
  });

  it('Q2-1: startRound({ playerCount: 4, handSize: 5 }) → throw', () => {
    expect(() => startRound({ playerCount: 4, handSize: 5 })).toThrow();
  });
});

describe('первый ход и очередь 2×2 (Q3, Q4, Q5)', () => {
  it('Q3-1: 20 seed — первый ход [6,6] у его владельца', () => {
    for (let seed = 0; seed < 20; seed++) {
      const s = startRound({ seed, playerCount: 4 });
      expect(s.hands.map((h) => h.length)).toEqual([7, 7, 7, 7]);
      expect(s.boneyard).toEqual([]);
      expect(s.openingTile).toEqual([6, 6]);
      expect(s.hands[s.currentPlayer]!.some((t) => sameTile(t, [6, 6]))).toBe(true);
    }
  });

  it('Q4-1: после play места 3 ходит 0; после pass места 1 ходит 2', () => {
    const afterPlay = expectOk(
      applyMove(
        teamState(
          [
            [[0, 1]],
            [[1, 1]],
            [[2, 2]],
            [
              [5, 6],
              [0, 0],
            ],
          ],
          3,
        ),
        3,
        { type: 'play', tile: [5, 6], end: 'right' },
      ),
    );
    expect(afterPlay.status).toBe('playing');
    expect(afterPlay.currentPlayer).toBe(0);

    const afterPass = expectOk(
      applyMove(teamState([[[0, 1]], [[1, 1]], [[2, 6]], [[0, 0]]], 1), 1, { type: 'pass' }),
    );
    expect(afterPass.status).toBe('playing');
    expect(afterPass.currentPlayer).toBe(2);
  });

  it('Q4-1: очередь 0→1→2→3→0 со старта раунда', () => {
    let s = startRound({ seed: 5, playerCount: 4 });
    const order = [s.currentPlayer];
    for (let i = 0; i < 4 && s.status === 'playing'; i++) {
      s = expectOk(applyMove(s, s.currentPlayer, getLegalMoves(s)[0]!));
      order.push(s.currentPlayer);
    }
    const first = order[0]!;
    expect(order).toEqual([0, 1, 2, 3, 4].map((k) => (first + k) % 4));
  });

  it('Q4-2: 100 случайных раундов — draw никогда не легален, раунд всегда заканчивается', () => {
    for (let seed = 0; seed < 100; seed++) {
      const rng = createRng(seed + 99);
      let s = startRound({ seed, playerCount: 4 });
      for (let i = 0; s.status === 'playing'; i++) {
        if (i > 200) throw new Error('round did not finish');
        const moves = getLegalMoves(s);
        expect(moves.some((m) => m.type === 'draw')).toBe(false);
        const before = s.currentPlayer;
        s = expectOk(applyMove(s, before, moves[Math.floor(rng() * moves.length)]!));
        if (s.status === 'playing') expect(s.currentPlayer).toBe((before + 1) % 4);
      }
      const total = s.hands.reduce((n, h) => n + h.length, 0) + s.board.length;
      expect(total).toBe(28);
      expect(s.result?.teamPoints).toBeDefined();
    }
  });

  it('Q5-1: нет play → [{ type: "pass" }]; draw → MUST_PLAY / BONEYARD_EMPTY', () => {
    const stuck = teamState([[[0, 1]], [[1, 1]], [[2, 6]], [[0, 0]]], 1);
    expect(getLegalMoves(stuck)).toEqual([{ type: 'pass' }]);
    expect(applyMove(stuck, 1, { type: 'draw' })).toEqual({ ok: false, error: 'BONEYARD_EMPTY' });
    const canPlay = teamState([[[0, 1]], [[1, 1]], [[2, 6]], [[0, 0]]], 2);
    expect(applyMove(canPlay, 2, { type: 'draw' })).toEqual({ ok: false, error: 'MUST_PLAY' });
    expect(applyMove(canPlay, 1, { type: 'pass' })).toEqual({ ok: false, error: 'NOT_YOUR_TURN' });
  });
});

describe('итог раунда 2×2 (Q6, Q7)', () => {
  it('Q6-1: место 2 выкладывает последнюю → команда 0, очки соперников', () => {
    const s = expectOk(
      applyMove(teamState([[[2, 3]], [[4, 5]], [[1, 6]], [[0, 4]]], 2), 2, {
        type: 'play',
        tile: [1, 6],
        end: 'right',
      }),
    );
    expect(s.status).toBe('finished');
    expect(s.result).toEqual({
      reason: 'domino',
      winner: 0,
      points: 13,
      handPoints: [5, 9, 0, 4],
      teamPoints: [5, 13],
      dominoSeat: 2,
    });
  });

  it('Q6-2: рука напарника вышедшего не входит в points', () => {
    const r = resolveRound('domino', [[], [[0, 1]], [[6, 6]], [[0, 2]]], 0);
    expect(r.winner).toBe(0);
    expect(r.points).toBe(3);
    expect(r.teamPoints).toEqual([12, 3]);
  });

  it('Q7-1: рыба [3,10,6,2] → команда 0, points 12, без dominoSeat', () => {
    const s = expectOk(
      applyMove(teamState([[[1, 2]], [[5, 5]], [[2, 4]], [[0, 2]]], 0), 0, { type: 'pass' }),
    );
    expect(s.status).toBe('finished');
    expect(s.result).toEqual({
      reason: 'fish',
      winner: 0,
      points: 12,
      handPoints: [3, 10, 6, 2],
      teamPoints: [9, 12],
    });
    expect(s.result).not.toHaveProperty('dominoSeat');
  });

  it('Q7-2: рыба поровну [4,5,6,5] → ничья, 0 очков', () => {
    expect(resolveRound('fish', [[[0, 4]], [[1, 4]], [[2, 4]], [[2, 3]]])).toEqual({
      reason: 'fish',
      winner: null,
      points: 0,
      handPoints: [4, 5, 6, 5],
      teamPoints: [10, 10],
    });
  });

  it('Q7-3: рыба только если все 4 без хода', () => {
    const s = expectOk(
      applyMove(teamState([[[1, 2]], [[5, 5]], [[3, 6]], [[0, 2]]], 0), 0, { type: 'pass' }),
    );
    expect(s.status).toBe('playing');
    expect(s.currentPlayer).toBe(1);
  });
});

describe('матч и «Козёл» 2×2 (Q8, Q9, Q-F1)', () => {
  it('Q8-1: recordRound с командным результатом', () => {
    const result = resolveRound('domino', [[[2, 3]], [[4, 5]], [], [[0, 4]]], 2);
    const m1 = recordRound(createMatch(20), result);
    expect(m1.scores).toEqual([13, 0]);
    expect(m1.winner).toBeNull();
    const m2 = recordRound(m1, result);
    expect(m2.scores).toEqual([26, 0]);
    expect(m2.winner).toBe(0);
  });

  it('Q9-1: Козёл — место 1 вышло, [6,0,8,3] → winner 1, scorer 0, points 14', () => {
    const s = expectOk(
      applyMove(
        teamState([[[1, 5]], [[2, 6]], [[3, 5]], [[0, 3]]], 1),
        1,
        { type: 'play', tile: [2, 6], end: 'right' },
        kozelVariant,
      ),
    );
    expect(s.result).toEqual({
      reason: 'domino',
      winner: 1,
      scorer: 0,
      points: 14,
      handPoints: [6, 0, 8, 3],
      teamPoints: [14, 3],
      dominoSeat: 1,
    });
  });

  it('Q9-1: Козёл — рыба поровну → scorer null, 0; команда-козлы проигрывает матч', () => {
    const tie = kozelVariant.resolveRound('fish', [[[0, 4]], [[1, 4]], [[2, 4]], [[2, 3]]]);
    expect(tie).toMatchObject({ winner: null, scorer: null, points: 0, teamPoints: [10, 10] });
    const fish = kozelVariant.resolveRound('fish', [[[1, 2]], [[5, 5]], [[2, 4]], [[0, 2]]]);
    expect(fish).toMatchObject({ winner: 0, scorer: 1, points: 12 });
    const after = kozelVariant.recordRound({ ...createMatch(101), scores: [0, 95] }, fish);
    expect(after.scores).toEqual([0, 107]);
    expect(after.winner).toBe(0);
  });

  it('Q-F1: forfeitMatch(m, 1, 3) → forfeitSeat 3; без места — нет ключа', () => {
    expect(forfeitMatch(createMatch(), 1, 3)).toMatchObject({
      winner: 0,
      forfeit: 1,
      forfeitSeat: 3,
    });
    expect(forfeitMatch(createMatch(), 1)).not.toHaveProperty('forfeitSeat');
    expect(createMatch()).not.toHaveProperty('forfeitSeat');
  });
});

describe('вид 2×2 (Q-V1)', () => {
  it('Q-V1: своя рука, handCounts, руки скрыты до конца раунда', () => {
    const s = startRound({ seed: 7, playerCount: 4 });
    for (const you of [0, 1, 2, 3] as const) {
      const view = toPlayerView(s, you);
      expect(view.hand).toEqual(s.hands[you]);
      expect(view.handCounts).toEqual([7, 7, 7, 7]);
      expect(view.hands).toBeNull();
      expect(view.opponentHandCount).toBe(0);
      expect(view.opponentHand).toBeNull();
      expect(view.boneyardCount).toBe(0);
      expect(view.legalMoves.length > 0).toBe(s.currentPlayer === you);
      const json = JSON.stringify(view);
      for (const other of [0, 1, 2, 3].filter((o) => o !== you)) {
        for (const t of s.hands[other]!) expect(json).not.toContain(JSON.stringify(t));
      }
    }
  });

  it('Q-V1: при finished — все 4 руки', () => {
    const s = expectOk(
      applyMove(teamState([[[2, 3]], [[4, 5]], [[1, 6]], [[0, 4]]], 2), 2, {
        type: 'play',
        tile: [1, 6],
        end: 'right',
      }),
    );
    const view = toPlayerView(s, 1);
    expect(view.hands).toEqual([[[2, 3]], [[4, 5]], [], [[0, 4]]]);
    expect(view.handCounts).toEqual([1, 1, 0, 1]);
  });
});
