import type { ReactNode } from 'react';
import {
  DEFAULT_VARIANT,
  roundScorer,
  tileKey,
  type MatchView,
  type PlayerIndex,
  type PlayerView,
  type RoomPlayer,
  type RoundResult,
  type Tile,
  type VariantId,
} from '@domino/shared';
import { TileFace } from './TileFace';

export interface RoundSummaryProps {
  game: PlayerView;
  result: RoundResult;
  match: MatchView | null;
  players: RoomPlayer[];
  /** spec-16: вариант правил; при 'classic' (по умолчанию) тексты прежние. */
  variant?: VariantId;
  error: string | null;
  /** Кнопка «Следующий раунд»/«Реванш» активна (связь есть, не ждём ack, ещё не нажата). */
  canContinue: boolean;
  onContinue: () => void;
  /** spec-13 UI9: облачко реакции соперника — внутри его руки, рядом с подписью. */
  opponentBubble?: ReactNode;
  /** spec-13 UI9: своё облачко — внутри своей руки. */
  mineBubble?: ReactNode;
}

function playerName(players: RoomPlayer[], seat: PlayerIndex): string {
  return players.find((player) => player.seat === seat)?.name ?? '';
}

/** Заголовок итога раунда (testid `round-finished` сохранён из #6). */
function roundTitle(result: RoundResult, you: PlayerIndex, opponentName: string): string {
  if (result.winner === null) return 'Рыба — ничья';
  const reason = result.reason === 'domino' ? ' (домино)' : ' (рыба)';
  if (result.winner === you) return `Вы выиграли раунд: +${result.points}${reason}`;
  return `Раунд выиграл ${opponentName}: +${result.points}${reason}`;
}

/** spec-16 §4.3: заголовок итога раунда в «Козле» — кому записаны очки. */
function kozelRoundTitle(result: RoundResult, you: PlayerIndex, opponentName: string): string {
  const scorer = roundScorer(result);
  if (scorer === null) return 'Рыба — ничья, очков никому';
  const reason = result.reason === 'domino' ? ' (домино)' : ' (рыба)';
  if (scorer === you) return `Очки записаны вам: +${result.points}${reason}`;
  return `Очки записаны: ${opponentName} +${result.points}${reason}`;
}

/** Строка итога матча (без счёта): классика — spec-7, «Козёл» — spec-16 §4.3. */
function matchTitle(
  variant: VariantId,
  winner: PlayerIndex,
  you: PlayerIndex,
  players: RoomPlayer[],
): string {
  if (variant === 'kozel') {
    const goat: PlayerIndex = winner === 0 ? 1 : 0;
    return goat === you
      ? `Вы — козёл! Матч выиграл ${playerName(players, winner)}`
      : `Вы выиграли матч! ${playerName(players, goat)} — козёл`;
  }
  return winner === you ? 'Вы выиграли матч!' : `Матч выиграл ${playerName(players, winner)}`;
}

function readyText(match: MatchView, you: PlayerIndex): string {
  const opponent: PlayerIndex = you === 0 ? 1 : 0;
  if (match.ready[you]) return 'Ждём соперника…';
  if (match.ready[opponent]) return 'Соперник готов';
  return '';
}

function SummaryHand({
  seat,
  name,
  tiles,
  points,
  bubble,
}: {
  seat: PlayerIndex;
  name: string;
  tiles: readonly Tile[];
  points: number;
  bubble?: ReactNode;
}) {
  return (
    <div className="summary-hand" data-testid={`summary-hand-${seat}`}>
      <p className="summary-hand-label">
        {name}: <span data-testid={`summary-hand-points-${seat}`}>{points}</span> очк.
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
 * spec-7 §4.3.2: экран итогов раунда — кто выиграл, обе руки лицом, очки, итог матча,
 * «Следующий раунд» / «Реванш». Все числа — из `result` и `match` сервера.
 */
export function RoundSummary({
  game,
  result,
  match,
  players,
  variant = DEFAULT_VARIANT,
  error,
  canContinue,
  onContinue,
  opponentBubble,
  mineBubble,
}: RoundSummaryProps) {
  const you = game.you;
  const opponent: PlayerIndex = you === 0 ? 1 : 0;
  const handOf = (seat: PlayerIndex): readonly Tile[] =>
    seat === you ? game.hand : (game.opponentHand ?? []);
  const matchOver = match !== null && match.winner !== null;

  return (
    <section className="round-summary" data-testid="round-summary" aria-label="Итоги раунда">
      <p className="round-finished" data-testid="round-finished" role="status">
        {(variant === 'kozel' ? kozelRoundTitle : roundTitle)(
          result,
          you,
          playerName(players, opponent),
        )}
      </p>
      <p className="round-points">
        Очки за раунд: <strong data-testid="round-points">{result.points}</strong>
      </p>

      <div className="summary-hands">
        {([0, 1] as const).map((seat) => (
          <SummaryHand
            key={seat}
            seat={seat}
            name={playerName(players, seat)}
            tiles={handOf(seat)}
            points={result.handPoints[seat]}
            bubble={seat === you ? mineBubble : opponentBubble}
          />
        ))}
      </div>

      {matchOver && (
        <p className="match-finished" data-testid="match-finished" role="status">
          {matchTitle(variant, match.winner!, you, players)}
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
            {readyText(match, you)}
          </p>
        </div>
      )}

      <p className="move-error" data-testid="move-error" role="alert">
        {error ?? ''}
      </p>
    </section>
  );
}
