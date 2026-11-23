import { getLegalMoves } from './round';
import { isDouble, tilePips } from './tiles';
import type { Move, RoundState, Tile } from './types';

/** Больше — тяжелее: сначала сумма очков, при равенстве дубль (spec-11 T5). */
function weight(tile: Tile): number {
  return tilePips(tile) * 2 + (isDouble(tile) ? 1 : 0);
}

/**
 * spec-11 T5 / spec-15 B1: самый тяжёлый `play` (max очков → дубль → первый по порядку `moves`);
 * нет `play` — единственный ход (`draw` или `pass`). Пусто — null. Вход не мутирует.
 */
export function chooseHeaviest(moves: readonly Move[]): Move | null {
  let best: Move | null = null;
  for (const move of moves) {
    if (move.type !== 'play') return move; // draw/pass — всегда единственный ход
    if (best?.type !== 'play' || weight(move.tile) > weight(best.tile)) best = move;
  }
  return best;
}

/** spec-11 T5: ход, который сервер делает за игрока по истечении таймера. null — раунд окончен. */
export function pickAutoMove(state: RoundState): Move | null {
  return chooseHeaviest(getLegalMoves(state));
}
