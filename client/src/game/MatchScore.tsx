import type { MatchView, RoomPlayer } from '@domino/shared';

export interface MatchScoreProps {
  match: MatchView;
  players: RoomPlayer[];
}

/** spec-7 §4.3.1: табло матча «Аня 34 : 12 Боб · до 101 · Раунд 3» (место 0 : место 1). */
export function MatchScore({ match, players }: MatchScoreProps) {
  const name = (seat: 0 | 1) => players.find((player) => player.seat === seat)?.name ?? '';
  return (
    <p className="match-score" data-testid="match-score">
      <span className="match-score-names">
        {name(0)} <strong data-testid="match-score-0">{match.scores[0]}</strong>
        {' : '}
        <strong data-testid="match-score-1">{match.scores[1]}</strong> {name(1)}
      </span>
      <span className="match-score-meta">
        {' · до '}
        <span data-testid="match-target">{match.target}</span>
        {' · Раунд '}
        <span data-testid="match-round">{match.roundNumber}</span>
      </span>
    </p>
  );
}
