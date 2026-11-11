import { describe, expect, it } from 'vitest';
import { createRng } from './rng';

describe('createRng (mulberry32)', () => {
  it('R2: produces reference values for seed 1 (T3)', () => {
    const rng = createRng(1);
    expect(rng()).toBe(0.6270739405881613);
    expect(rng()).toBe(0.002735721180215478);
    expect(rng()).toBe(0.5274470399599522);
  });

  it('R2: same seed gives the same sequence in [0, 1) (T4)', () => {
    const a = createRng(7);
    const b = createRng(7);
    const seqA = Array.from({ length: 100 }, () => a());
    const seqB = Array.from({ length: 100 }, () => b());
    expect(seqA).toEqual(seqB);
    expect(seqA.every((x) => x >= 0 && x < 1)).toBe(true);
  });

  it('R2: non-integer seed throws (T5)', () => {
    expect(() => createRng(1.5)).toThrow();
    expect(() => createRng(Number.NaN)).toThrow();
  });

  it('R2: seed is coerced with >>> 0', () => {
    expect(createRng(-1)()).toBe(createRng(0xffffffff)());
  });
});
