/**
 * ГПСЧ mulberry32 (R2). Возвращает функцию → число в [0, 1).
 * seed приводится `>>> 0`; нецелый seed → throw.
 */
export function createRng(seed: number): () => number {
  if (!Number.isInteger(seed)) {
    throw new Error(`createRng: seed must be an integer, got ${seed}`);
  }
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
