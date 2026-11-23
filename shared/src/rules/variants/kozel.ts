import type { MatchState } from '../match';
import { resolveRound } from '../scoring';
import type { PlayerIndex, RoundEndReason, RoundResult, TeamIndex, Tile } from '../types';
import { roundScorer } from './scorer';
import type { RulesVariant } from './types';

/**
 * spec-16 K2–K4 (spec-17 Q9 — по командам): winner — как в классике (вышедший / у кого меньше),
 * очки (собственная сумма руки) записываются сопернику победителя; равная рыба — никому.
 */
export function resolveKozelRound(
  reason: RoundEndReason,
  hands: readonly (readonly Tile[])[],
  dominoWinner?: PlayerIndex,
): RoundResult {
  const classic = resolveRound(reason, hands, dominoWinner);
  const scorer: TeamIndex | null = classic.winner === null ? null : classic.winner === 0 ? 1 : 0;
  const points = scorer === null ? 0 : ((classic.teamPoints ?? classic.handPoints)[scorer] ?? 0);
  const result: RoundResult = {
    reason: classic.reason,
    winner: classic.winner,
    points,
    handPoints: classic.handPoints,
    scorer,
  };
  // spec-17 Q9: в 2×2 — командные поля, как в классике.
  if (classic.teamPoints) result.teamPoints = classic.teamPoints;
  if (classic.dominoSeat !== undefined) result.dominoSeat = classic.dominoSeat;
  return result;
}

/**
 * spec-16 K5: очки — scorer'у; кто первым наберёт ≥ target, тот «козёл»: winner = соперник.
 * Вход не мутируется; оконченный матч — throw.
 */
export function recordKozelRound(match: MatchState, result: RoundResult): MatchState {
  if (match.winner !== null) throw new Error('match is already finished');
  const scores: [number, number] = [match.scores[0], match.scores[1]];
  let winner: TeamIndex | null = null;
  const scorer = roundScorer(result);
  if (scorer !== null) {
    scores[scorer] += result.points;
    if (result.points > 0 && scores[scorer] >= match.target) winner = scorer === 0 ? 1 : 0;
  }
  return { ...match, scores, rounds: [...match.rounds, result], winner };
}

export const kozelVariant: RulesVariant = {
  id: 'kozel',
  resolveRound: resolveKozelRound,
  recordRound: recordKozelRound,
};
