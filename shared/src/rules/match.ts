import type { PlayerIndex, RoundResult, TeamIndex } from './types';

/** Цель матча по умолчанию: побеждает первый, у кого счёт ≥ 101 (M3). */
export const MATCH_TARGET = 101;

/** Матч из нескольких раундов в одной комнате (spec-7 §3). Plain JSON. */
export interface MatchState {
  target: number;
  /** Счёт команд 0 и 1 (в 1×1 команда = место, spec-17 Q8). */
  scores: [number, number];
  /** Номер текущего (или последнего сыгранного) раунда, с 1. */
  roundNumber: number;
  /** Итоги сыгранных раундов по порядку. */
  rounds: RoundResult[];
  /** != null ⇔ матч окончен (M3). */
  winner: TeamIndex | null;
  /** != null ⇔ матч окончен техническим поражением этой команды (spec-9 RC5, spec-17 Q14). Тогда winner = 1 − forfeit. */
  forfeit: TeamIndex | null;
  /** spec-17 Q14: только в 2×2 — место, не вернувшееся в игру. */
  forfeitSeat?: PlayerIndex;
}

/** M1, M5: новый матч 0:0. `target` — целое > 0, иначе throw. */
export function createMatch(target: number = MATCH_TARGET): MatchState {
  if (!Number.isInteger(target) || target <= 0) {
    throw new Error(`match target must be a positive integer, got ${target}`);
  }
  return { target, scores: [0, 0], roundNumber: 1, rounds: [], winner: null, forfeit: null };
}

/**
 * M2, M3: начисляет очки раунда победителю и добавляет итог в историю.
 * Ничья — счёт не меняется. Матч окончен, если счёт победителя раунда ≥ target.
 * Вход не мутируется; для оконченного матча — throw.
 */
export function recordRound(match: MatchState, result: RoundResult): MatchState {
  if (match.winner !== null) throw new Error('match is already finished');
  const scores: [number, number] = [match.scores[0], match.scores[1]];
  let winner: TeamIndex | null = null;
  if (result.winner !== null) {
    scores[result.winner] += result.points;
    if (scores[result.winner] >= match.target) winner = result.winner;
  }
  return { ...match, scores, rounds: [...match.rounds, result], winner };
}

/** M4: следующий раунд того же матча. */
export function nextRoundNumber(match: MatchState): MatchState {
  return { ...match, roundNumber: match.roundNumber + 1 };
}

/**
 * RC5: техническое поражение команды `loser` (её игрок не вернулся за `RECONNECT_TIMEOUT`).
 * Счёт и история не меняются, победитель — соперник. Вход не мутируется; матч уже окончен — throw.
 * spec-17 Q14: `loserSeat` (2×2) записывается в `forfeitSeat`, только если передан.
 */
export function forfeitMatch(
  match: MatchState,
  loser: TeamIndex,
  loserSeat?: PlayerIndex,
): MatchState {
  if (match.winner !== null) throw new Error('match is already finished');
  const winner: TeamIndex = loser === 0 ? 1 : 0;
  const next: MatchState = { ...match, winner, forfeit: loser };
  if (loserSeat !== undefined) next.forfeitSeat = loserSeat;
  return next;
}
