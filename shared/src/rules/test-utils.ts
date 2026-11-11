// Хелперы для unit-тестов правил. Не входит в публичный API (`index.ts`).
import { createDoubleSix, sameTile } from './tiles';
import type { Pip, PlacedTile, RoundState, Tile } from './types';

/** Кость на столе в заданной ориентации: left/right — как лежит в цепочке. */
export function pt(left: Pip, right: Pip): PlacedTile {
  return { tile: left <= right ? [left, right] : [right, left], left, right };
}

/** Колода для startRound({ deck }): руки игроков, затем остальные кости в каноническом порядке. */
export function deckFrom(hand0: readonly Tile[], hand1: readonly Tile[]): Tile[] {
  const dealt = [...hand0, ...hand1];
  const rest = createDoubleSix().filter((t) => !dealt.some((d) => sameTile(d, t)));
  return [...dealt, ...rest];
}

/** Ручное состояние раунда для точечных тестов (инвариант R15 не соблюдается). */
export function makeState(overrides: Partial<RoundState> = {}): RoundState {
  return {
    hands: [[], []],
    boneyard: [],
    board: [],
    openingTile: [6, 6],
    currentPlayer: 0,
    status: 'playing',
    result: null,
    ...overrides,
  };
}

/** Глубокая заморозка для проверки, что функции не мутируют вход. */
export function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const key of Object.keys(value)) {
      deepFreeze((value as Record<string, unknown>)[key]);
    }
  }
  return value;
}
