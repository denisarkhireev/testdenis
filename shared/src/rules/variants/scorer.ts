import type { PlayerIndex, RoundResult } from '../types';

/** spec-16: кому записаны очки раунда; для классики (поля нет) — winner. */
export function roundScorer(result: RoundResult): PlayerIndex | null {
  return result.scorer === undefined ? result.winner : result.scorer;
}
