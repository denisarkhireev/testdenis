import type { MatchState } from '../match';
import type { PlayerIndex, RoundEndReason, RoundResult, Tile } from '../types';

/** spec-16: идентификатор варианта правил. */
export type VariantId = 'classic' | 'kozel';

/** Подключаемая часть правил: итог раунда и начисление очков в матч. Ходы — общие (K1). */
export interface RulesVariant {
  id: VariantId;
  /** Итог раунда по причине конца и рукам. dominoWinner — сыгравший последнюю кость. */
  resolveRound(
    reason: RoundEndReason,
    hands: readonly [readonly Tile[], readonly Tile[]],
    dominoWinner?: PlayerIndex,
  ): RoundResult;
  /** Записать итог раунда в матч, определить конец матча. Вход не мутируется; оконченный матч — throw. */
  recordRound(match: MatchState, result: RoundResult): MatchState;
}
