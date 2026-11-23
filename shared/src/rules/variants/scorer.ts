import type { RoundResult, TeamIndex } from '../types';

/** spec-16: кому записаны очки раунда; для классики (поля нет) — winner. */
export function roundScorer(result: RoundResult): TeamIndex | null {
  return result.scorer === undefined ? result.winner : result.scorer;
}
