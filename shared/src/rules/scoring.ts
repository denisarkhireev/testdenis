import { otherTeam, teamOf } from './seats';
import { tilePips } from './tiles';
import type { PlayerIndex, RoundEndReason, RoundResult, TeamIndex, Tile } from './types';

/** Очки руки — сумма всех половин всех костей (R13). */
export function handPoints(hand: readonly Tile[]): number {
  return hand.reduce((sum, t) => sum + tilePips(t), 0);
}

/**
 * Итог раунда (R11–R13). Для 'domino' победитель задан явно (сыгравший последнюю кость),
 * для 'fish' — у кого меньше очков на руке; при равенстве — ничья.
 * spec-17 Q6/Q7: при 4 руках — командный итог с `teamPoints` (и `dominoSeat` для домино).
 * @internal
 */
export function resolveRound(
  reason: RoundEndReason,
  hands: readonly (readonly Tile[])[],
  dominoWinner?: PlayerIndex,
): RoundResult {
  if (hands.length === 4) return resolveTeamRound(reason, hands, dominoWinner);
  const h0 = hands[0] ?? [];
  const points: [number, number] = [handPoints(h0), handPoints(hands[1] ?? [])];
  let winner: TeamIndex | null;
  if (reason === 'domino') {
    winner = (dominoWinner as TeamIndex | undefined) ?? (h0.length === 0 ? 0 : 1);
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

/** spec-17 Q6/Q7: итог раунда 2×2 по командам (места 0+2 и 1+3). */
function resolveTeamRound(
  reason: RoundEndReason,
  hands: readonly (readonly Tile[])[],
  dominoWinner?: PlayerIndex,
): RoundResult {
  const seatPoints = hands.map(handPoints);
  const teamPoints: [number, number] = [
    (seatPoints[0] ?? 0) + (seatPoints[2] ?? 0),
    (seatPoints[1] ?? 0) + (seatPoints[3] ?? 0),
  ];
  if (reason === 'domino') {
    const seat = dominoWinner ?? (hands.findIndex((h) => h.length === 0) as PlayerIndex);
    const winner = teamOf(seat, 4);
    return {
      reason,
      winner,
      points: teamPoints[otherTeam(winner)],
      handPoints: seatPoints,
      teamPoints,
      dominoSeat: seat,
    };
  }
  const winner: TeamIndex | null =
    teamPoints[0] === teamPoints[1] ? null : teamPoints[0] < teamPoints[1] ? 0 : 1;
  return {
    reason,
    winner,
    points: winner === null ? 0 : teamPoints[otherTeam(winner)],
    handPoints: seatPoints,
    teamPoints,
  };
}
