import { DEFAULT_HAND_SIZE, type MatchView, type RoomPlayer } from '@domino/shared';

export interface MatchScoreProps {
  match: MatchView;
  players: RoomPlayer[];
  /** spec-11: время на ход, с; 0 — подпись не показывается. */
  turnSeconds?: number;
  /** spec-14 S8: размер руки; «по h костей» — только при h ≠ 7. */
  handSize?: number;
}

/** spec-7 §4.3.1: табло матча «Аня 34 : 12 Боб · до 101 · Раунд 3» (место 0 : место 1). */
export function MatchScore({
  match,
  players,
  turnSeconds = 0,
  handSize = DEFAULT_HAND_SIZE,
}: MatchScoreProps) {
  const name = (seat: 0 | 1) => players.find((player) => player.seat === seat)?.name ?? '';
  return (
    <p className="match-score" data-testid="match-score">
      <span className="match-score-names">
        {name(0)} <strong data-testid="match-score-0">{match.scores[0]}</strong>
        {' : '}
        <strong data-testid="match-score-1">{match.scores[1]}</strong> {name(1)}
      </span>
      {/* spec-13 UI7: разделитель « · » перед каждой частью рисует CSS. */}
      <span className="match-score-meta">
        <span className="match-score-item">
          до <span data-testid="match-target">{match.target}</span>
        </span>
        {handSize !== DEFAULT_HAND_SIZE && (
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
