import { chooseHeaviest } from './autoMove';
import type { Move } from './types';
import type { PlayerView } from './view';

/**
 * spec-15 B1: ход бота по его собственному виду раунда (без руки соперника и базара).
 * null — не его ход или раунд окончен. Вход не мутирует.
 */
export function pickBotMove(view: PlayerView): Move | null {
  if (view.status !== 'playing') return null;
  return chooseHeaviest(view.legalMoves);
}
