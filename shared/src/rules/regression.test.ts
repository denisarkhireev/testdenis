import { describe, expect, it } from 'vitest';
import { twoSeatDigest } from './twoSeatDigest';
import { TWO_SEAT_DIGESTS } from './twoSeatDigests';
import { startRound } from './round';
import { toPlayerView } from './view';

describe('регресс 1×1 (spec-17 Q-R1)', () => {
  for (const handSize of [5, 6, 7]) {
    it(`Q-R1: 40 seed × handSize ${handSize} — цепочки и виды равны снимку старого кода`, () => {
      for (let seed = 0; seed < 40; seed++) {
        expect(twoSeatDigest(seed, handSize), `seed ${seed}`).toBe(
          TWO_SEAT_DIGESTS[`${seed}:${handSize}`],
        );
      }
    });
  }

  it('Q-R1: набор ключей PlayerView и RoundResult для 2 мест прежний', () => {
    const view = toPlayerView(startRound({ seed: 3 }), 0);
    expect(Object.keys(view).sort()).toEqual(
      [
        'board',
        'boneyardCount',
        'currentPlayer',
        'hand',
        'legalMoves',
        'opponentHand',
        'opponentHandCount',
        'result',
        'status',
        'you',
      ].sort(),
    );
  });
});
