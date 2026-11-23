import type { Tile } from './types';

/** spec-14 S1: допустимые размеры руки. */
export const HAND_SIZES: readonly number[] = [5, 6, 7];
/** Размер руки по умолчанию (R3). */
export const HAND_SIZE = 7;

/** Fisher–Yates: for i = n-1 … 1: j = floor(rng() * (i + 1)); swap(i, j). Возвращает новый массив. */
export function shuffle<T>(items: readonly T[], rng: () => number): T[] {
  const result = items.slice();
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = result[i] as T;
    result[i] = result[j] as T;
    result[j] = tmp;
  }
  return result;
}

/**
 * Раздача по R3 / spec-14 S4: [0..h) → игроку 0, [h..2h) → игроку 1, остальное → базар
 * (порядок сохраняется). h ∉ HAND_SIZES → throw.
 */
export function deal(
  deck: readonly Tile[],
  handSize: number = HAND_SIZE,
): { hands: [Tile[], Tile[]]; boneyard: Tile[] } {
  if (!HAND_SIZES.includes(handSize)) {
    throw new Error(`deal: hand size must be one of ${HAND_SIZES.join(', ')}, got ${handSize}`);
  }
  return {
    hands: [deck.slice(0, handSize), deck.slice(handSize, handSize * 2)],
    boneyard: deck.slice(handSize * 2),
  };
}
