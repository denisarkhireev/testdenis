import type { ReactNode } from 'react';
import {
  DEFAULT_VARIANT,
  otherTeam,
  roundScorer,
  tileKey,
  type MatchView,
  type PlayerIndex,
  type PlayerView,
  type RoomPlayer,
  type RoundResult,
  type TeamIndex,
  type Tile,
  type VariantId,
} from '@domino/shared';
import { seatName, teamName, teamOfSeat, teamReadyText } from './team';
import { TileFace } from './TileFace';

export interface TeamRoundSummaryProps {
  game: PlayerView;
  result: RoundResult;
  match: MatchView | null;
  players: RoomPlayer[];
  variant?: VariantId;
  error: string | null;
  canContinue: boolean;
  onContinue: () => void;
  /** spec-12/17: облачко реакции места — у подписи его руки. */
  bubbleOf?: (seat: PlayerIndex) => ReactNode;
}

const SEATS = [0, 1, 2, 3] as const;

function reasonText(result: RoundResult): string {
  return result.reason === 'domino' ? ' (домино)' : ' (рыба)';
}

/** spec-17 §4.3: заголовок итога раунда 2×2 (классика). */
function roundTitle(result: RoundResult, myTeam: TeamIndex, players: RoomPlayer[]): string {
  if (result.winner === null) return 'Рыба — ничья';
  const tail = `+${result.points}${reasonText(result)}`;
  if (result.winner === myTeam) return `Ваша команда выиграла раунд: ${tail}`;
  return `Раунд выиграла команда ${teamName(players, result.winner)}: ${tail}`;
}

/** spec-17 §4.3: заголовок итога раунда 2×2 («Козёл») — какой команде записаны очки. */
function kozelRoundTitle(result: RoundResult, myTeam: TeamIndex, players: RoomPlayer[]): string {
  const scorer = roundScorer(result);
  if (scorer === null) return 'Рыба — ничья, очков никому';
  const tail = `+${result.points}${reasonText(result)}`;
  if (scorer === myTeam) return `Очки записаны вашей команде: ${tail}`;
  return `Очки записаны команде ${teamName(players, scorer)}: ${tail}`;
}

/** spec-17 §4.3: итог матча 2×2 (без счёта). */
function matchTitle(
  variant: VariantId,
  winner: TeamIndex,
  myTeam: TeamIndex,
  players: RoomPlayer[],
): string {
  if (variant === 'kozel') {
    const goats = otherTeam(winner);
    return goats === myTeam
      ? `Ваша команда — козлы! Матч выиграла команда ${teamName(players, winner)}`
      : `Вы выиграли матч! ${teamName(players, goats)} — козлы`;
  }
  return winner === myTeam
    ? 'Ваша команда выиграла матч!'
    : `Матч выиграла команда ${teamName(players, winner)}`;
}

function SummaryHand({
  seat,
  label,
  tiles,
  points,
  bubble,
}: {
  seat: PlayerIndex;
  label: string;
  tiles: readonly Tile[];
  points: number;
  bubble?: ReactNode;
}) {
  return (
    <div className="summary-hand" data-testid={`summary-hand-${seat}`} data-seat={seat}>
      <p className="summary-hand-label">
        {label}: <span data-testid={`summary-hand-points-${seat}`}>{points}</span> очк.
      </p>
      {bubble}
      <div className="summary-hand-tiles">
        {tiles.length === 0 ? (
          <span className="summary-hand-empty">пусто</span>
        ) : (
          tiles.map((tile) => (
            <TileFace key={tileKey(tile)} a={tile[0]} b={tile[1]} orientation="vertical" />
          ))
        )}
      </div>
    </div>
  );
}

/**
 * spec-17 §4.3: итоги раунда 2×2 — командный заголовок, четыре руки лицом (по командам),
 * суммы команд, итог матча и «Следующий раунд» / «Реванш» (ждём всех четверых).
 */
export function TeamRoundSummary({
  game,
  result,
  match,
  players,
  variant = DEFAULT_VARIANT,
  error,
  canContinue,
  onContinue,
  bubbleOf,
}: TeamRoundSummaryProps) {
  const you = game.you;
  const myTeam = teamOfSeat(you);
  const hands = game.hands ?? [];
  const teamPoints = result.teamPoints ?? [0, 0];
  const matchOver = match !== null && match.winner !== null;
  const title = variant === 'kozel' ? kozelRoundTitle : roundTitle;

  return (
    <section className="round-summary" data-testid="round-summary" aria-label="Итоги раунда">
      <p className="round-finished" data-testid="round-finished" role="status">
        {title(result, myTeam, players)}
      </p>
      <p className="round-points">
        Очки за раунд: <strong data-testid="round-points">{result.points}</strong>
      </p>

      <div className="summary-teams">
        {([0, 1] as const).map((team) => (
          <div key={team} className="summary-team" data-testid={`summary-team-${team}`}>
            <p className="summary-team-label">
              {team === myTeam ? 'Ваша команда' : 'Соперники'} ({teamName(players, team)}):{' '}
              <strong data-testid={`summary-team-points-${team}`}>{teamPoints[team]}</strong> очк.
            </p>
            {SEATS.filter((seat) => teamOfSeat(seat) === team).map((seat) => (
              <SummaryHand
                key={seat}
                seat={seat}
                label={`${seatName(players, seat)}${seat === you ? ' (вы)' : ''}`}
                tiles={hands[seat] ?? []}
                points={result.handPoints[seat] ?? 0}
                bubble={bubbleOf?.(seat)}
              />
            ))}
          </div>
        ))}
      </div>

      {matchOver && (
        <p className="match-finished" data-testid="match-finished" role="status">
          {matchTitle(variant, match.winner!, myTeam, players)}
          {` · Счёт ${match.scores[0]} : ${match.scores[1]}`}
        </p>
      )}

      {match && (
        <div className="summary-actions">
          <button
            type="button"
            className="continue-button"
            data-testid="continue-button"
            disabled={!canContinue}
            onClick={onContinue}
          >
            {matchOver ? 'Реванш' : 'Следующий раунд'}
          </button>
          <p className="ready-status" data-testid="ready-status" role="status">
            {teamReadyText(match, you)}
          </p>
        </div>
      )}

      <p className="move-error" data-testid="move-error" role="alert">
        {error ?? ''}
      </p>
    </section>
  );
}
