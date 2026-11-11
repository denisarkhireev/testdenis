import type { Tile } from './types';

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

/** Раздача по R3: [0..6] → игроку 0, [7..13] → игроку 1, остальное → базар (порядок сохраняется). */
export function deal(deck: readonly Tile[]): { hands: [Tile[], Tile[]]; boneyard: Tile[] } {
  return {
    hands: [deck.slice(0, HAND_SIZE), deck.slice(HAND_SIZE, HAND_SIZE * 2)],
    boneyard: deck.slice(HAND_SIZE * 2),
  };
}
