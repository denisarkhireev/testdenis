import type { Hands, PlayerCount, Tile } from './types';

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
 * spec-17 Q2: при 4 местах — hands[i] = deck[7i..7i+7), базар пуст; h ≠ 7 → throw.
 */
export function deal(
  deck: readonly Tile[],
  handSize: number = HAND_SIZE,
  playerCount: PlayerCount = 2,
): { hands: Hands; boneyard: Tile[] } {
  if (!HAND_SIZES.includes(handSize)) {
    throw new Error(`deal: hand size must be one of ${HAND_SIZES.join(', ')}, got ${handSize}`);
  }
  if (playerCount === 4) {
    if (handSize !== HAND_SIZE) {
      throw new Error(`deal: 4 players require hand size ${HAND_SIZE}, got ${handSize}`);
    }
    return {
      hands: [
        deck.slice(0, handSize),
        deck.slice(handSize, handSize * 2),
        deck.slice(handSize * 2, handSize * 3),
        deck.slice(handSize * 3, handSize * 4),
      ],
      boneyard: deck.slice(handSize * 4),
    };
  }
  return {
    hands: [deck.slice(0, handSize), deck.slice(handSize, handSize * 2)],
    boneyard: deck.slice(handSize * 2),
  };
}
