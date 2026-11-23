import {
  DEFAULT_HAND_SIZE,
  DEFAULT_VARIANT,
  type MatchView,
  type RoomMode,
  type RoomPlayer,
  type VariantId,
} from '@domino/shared';
import { variantLabel } from '../lobby/variant';
import { teamName } from './team';

export interface MatchScoreProps {
  match: MatchView;
  players: RoomPlayer[];
  /** spec-11: время на ход, с; 0 — подпись не показывается. */
  turnSeconds?: number;
  /** spec-14 S8: размер руки; «по h костей» — только при h ≠ 7. */
  handSize?: number;
  /** spec-16: вариант правил; показывается всегда, по умолчанию «Классика». */
  variant?: VariantId;
  /** spec-17: в 2×2 — счёт команд «Аня и Вера 34 : 12 Боб и Гена», без «по h костей». */
  mode?: RoomMode;
}

/** spec-7 §4.3.1: табло матча «Аня 34 : 12 Боб · до 101 · Раунд 3» (место 0 : место 1). */
export function MatchScore({
  match,
  players,
  turnSeconds = 0,
  handSize = DEFAULT_HAND_SIZE,
  variant = DEFAULT_VARIANT,
  mode = '1x1',
}: MatchScoreProps) {
  const team = mode === '2x2';
  const name = (seat: 0 | 1) => {
    if (team) return teamName(players, seat);
    const player = players.find((p) => p.seat === seat);
    if (!player) return '';
    // spec-15 §4.3: значок перед именем бота.
    return player.bot ? (
      <>
        <span data-testid="opponent-bot" aria-label="бот" role="img">
          🤖
        </span>{' '}
        {player.name}
      </>
    ) : (
      player.name
    );
  };
  return (
    <p className="match-score" data-testid="match-score">
      <span className="match-score-names">
        {name(0)} <strong data-testid="match-score-0">{match.scores[0]}</strong>
        {' : '}
        <strong data-testid="match-score-1">{match.scores[1]}</strong> {name(1)}
      </span>
      {/* spec-13 UI7: разделитель « · » перед каждой частью рисует CSS. */}
      <span className="match-score-meta">
        <span className="match-score-item" data-testid="variant-label">
          {variantLabel(variant)}
        </span>
        <span className="match-score-item">
          до <span data-testid="match-target">{match.target}</span>
        </span>
        {!team && handSize !== DEFAULT_HAND_SIZE && (
          <span className="match-score-item" data-testid="hand-size-label">
            по {handSize} костей
          </span>
        )}
        <span className="match-score-item">
          Раунд <span data-testid="match-round">{match.roundNumber}</span>
        </span>
        {turnSeconds > 0 && (
          <span className="match-score-item" data-testid="turn-seconds-label">
            ход {turnSeconds} с
          </span>
        )}
      </span>
    </p>
  );
}
