import { getLegalMoves } from './round';
import { isDouble, tilePips } from './tiles';
import type { Move, RoundState, Tile } from './types';

/** Больше — тяжелее: сначала сумма очков, при равенстве дубль (spec-11 T5). */
function weight(tile: Tile): number {
  return tilePips(tile) * 2 + (isDouble(tile) ? 1 : 0);
}

/**
 * spec-11 T5: ход, который сервер делает за игрока по истечении таймера. null — раунд окончен.
 * Есть `play` — самая тяжёлая кость (max очков → дубль → первый по порядку `getLegalMoves`);
 * иначе — единственный допустимый ход (`draw` или `pass`). Вход не мутирует.
 */
export function pickAutoMove(state: RoundState): Move | null {
  const moves = getLegalMoves(state);
  let best: Move | null = null;
  for (const move of moves) {
    if (move.type !== 'play') return move; // draw/pass — всегда единственный ход
    if (best?.type !== 'play' || weight(move.tile) > weight(best.tile)) best = move;
  }
  return best;
}
