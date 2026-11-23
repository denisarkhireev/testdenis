import { describe, expect, it } from 'vitest';
import { recordRound } from '../match';
import { createRng } from '../rng';
import { applyMove, getLegalMoves, startRound } from '../round';
import { resolveRound } from '../scoring';
import type { RoundState } from '../types';
import {
  classicVariant,
  DEFAULT_VARIANT,
  getVariant,
  kozelVariant,
  roundScorer,
  VARIANT_IDS,
  type VariantId,
} from './index';

describe('реестр вариантов (V-1)', () => {
  it('V-1: getVariant возвращает объекты вариантов; неизвестный id — throw', () => {
    expect(getVariant('classic')).toBe(classicVariant);
    expect(getVariant('kozel')).toBe(kozelVariant);
    expect(() => getVariant('goat' as VariantId)).toThrow();
    expect(() => getVariant('toString' as VariantId)).toThrow();
    expect(VARIANT_IDS).toEqual(['classic', 'kozel']);
    expect(DEFAULT_VARIANT).toBe('classic');
  });

  it('V-1: классика — ровно существующие функции', () => {
    expect(getVariant('classic').recordRound).toBe(recordRound);
    expect(getVariant('classic').resolveRound).toBe(resolveRound);
  });
});

/** Цепочка состояний раунда случайными легальными ходами. */
function chain(seed: number, handSize: number, withVariant: boolean): RoundState[] {
  const rng = createRng(seed + 777);
  let s = startRound({ seed, handSize });
  const states = [s];
  for (let i = 0; s.status === 'playing'; i++) {
    if (i > 200) throw new Error('round did not finish');
    const moves = getLegalMoves(s);
    const move = moves[Math.floor(rng() * moves.length)]!;
    const r = withVariant
      ? applyMove(s, s.currentPlayer, move, classicVariant)
      : applyMove(s, s.currentPlayer, move);
    if (!r.ok) throw new Error(r.error);
    s = r.state;
    states.push(s);
  }
  return states;
}

describe('applyMove без варианта ≡ classicVariant (V-2)', () => {
  for (const handSize of [5, 6, 7]) {
    it(`V-2: 40 seed × handSize ${handSize} — идентичные цепочки состояний`, () => {
      for (let seed = 0; seed < 40; seed++) {
        expect(chain(seed, handSize, true)).toEqual(chain(seed, handSize, false));
      }
    });
  }

  it('V-2: классика не заполняет scorer', () => {
    const last = chain(1, 7, false).at(-1)!;
    expect(last.result).not.toHaveProperty('scorer');
  });
});

describe('roundScorer (V-3)', () => {
  it('V-3: нет поля → winner; scorer null → null; scorer 1 → 1', () => {
    const base = {
      reason: 'domino' as const,
      winner: 0 as const,
      points: 3,
      handPoints: [0, 3] as [number, number],
    };
    expect(roundScorer(base)).toBe(0);
    expect(roundScorer({ ...base, reason: 'fish', winner: null, points: 0 })).toBeNull();
    expect(roundScorer({ ...base, scorer: null })).toBeNull();
    expect(roundScorer({ ...base, scorer: 1 })).toBe(1);
  });
});
