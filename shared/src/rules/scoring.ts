import { tilePips } from './tiles';
import type { PlayerIndex, RoundEndReason, RoundResult, Tile } from './types';

/** Очки руки — сумма всех половин всех костей (R13). */
export function handPoints(hand: readonly Tile[]): number {
  return hand.reduce((sum, t) => sum + tilePips(t), 0);
}

/**
 * Итог раунда (R11–R13). Для 'domino' победитель задан явно (сыгравший последнюю кость),
 * для 'fish' — у кого меньше очков на руке; при равенстве — ничья.
 * @internal
 */
export function resolveRound(
  reason: RoundEndReason,
  hands: readonly [readonly Tile[], readonly Tile[]],
  dominoWinner?: PlayerIndex,
): RoundResult {
  const points: [number, number] = [handPoints(hands[0]), handPoints(hands[1])];
  let winner: PlayerIndex | null;
  if (reason === 'domino') {
    winner = dominoWinner ?? (hands[0].length === 0 ? 0 : 1);
  } else if (points[0] === points[1]) {
    winner = null;
  } else {
    winner = points[0] < points[1] ? 0 : 1;
  }
  return {
    reason,
    winner,
    points: winner === null ? 0 : points[winner === 0 ? 1 : 0],
    handPoints: points,
  };
}
