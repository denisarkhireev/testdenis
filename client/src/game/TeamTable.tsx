import type { MatchView, PlayerView, RoomStatePayload, TurnTimerView } from '@domino/shared';
import { ReactionBubble } from '../reactions/ReactionBubble';
import type { Reactions } from '../reactions/useReactions';
import type { ReactNode } from 'react';
import { BoardView } from './BoardView';
import { HandView } from './HandView';
import { MatchScore } from './MatchScore';
import { canPass } from './moves';
import { SeatHand } from './SeatHand';
import { seatAt, seatName, type SeatSide } from './team';
import { TeamRoundSummary } from './TeamRoundSummary';
import { TurnTimer } from './TurnTimer';
import type { GameTable } from './useGameTable';

export interface TeamTableProps {
  room: RoomStatePayload;
  /** Вид 4 мест: `handCounts` заполнен. */
  game: PlayerView;
  match: MatchView | null;
  table: GameTable;
  reactions: Reactions;
  reactionPanel: ReactNode;
  turnTimer: TurnTimerView | null;
  online: boolean;
  canContinue: boolean;
}

const SIDES: readonly SeatSide[] = ['top', 'left', 'right'];

/** spec-17 §4.3: «Ваш ход» / «Ход напарника: Вера» / «Ход: Боб». */
function turnText(room: RoomStatePayload, game: PlayerView): string {
  const current = game.currentPlayer;
  if (current === game.you) return 'Ваш ход';
  const name = seatName(room.players, current);
  return current === seatAt(game.you, 'top') ? `Ход напарника: ${name}` : `Ход: ${name}`;
}

/**
 * spec-17 §4.3: стол на четверых — сетка «top / left board right / me». Своя рука снизу,
 * напарник сверху, соперники слева и справа рубашкой; базара нет. На итогах раунда вместо
 * стола — `TeamRoundSummary`.
 */
export function TeamTable({
  room,
  game,
  match,
  table,
  reactions,
  reactionPanel,
  turnTimer,
  online,
  canContinue,
}: TeamTableProps) {
  const finished = game.status === 'finished' && game.result !== null;
  const myTurn = game.currentPlayer === game.you;
  const counts = game.handCounts ?? [];
  const bubbleOf = (seat: number) => {
    const bubble = reactions.bySeat[seat as 0 | 1 | 2 | 3] ?? null;
    return seat === game.you ? (
      <ReactionBubble who="mine" side bubble={bubble} />
    ) : (
      <ReactionBubble who="opponent" bubble={bubble} />
    );
  };

  return (
    <>
      {match && (
        <MatchScore
          match={match}
          players={room.players}
          turnSeconds={room.turnSeconds}
          handSize={room.handSize}
          variant={room.variant}
          mode="2x2"
        />
      )}

      {!finished && (
        <p
          className={`turn-indicator${myTurn && online ? ' turn-indicator--mine' : ''}`}
          data-testid="turn-indicator"
          data-my-turn={myTurn ? 'true' : 'false'}
          data-offline={online ? undefined : 'true'}
          role="status"
        >
          {turnText(room, game)}
        </p>
      )}

      {finished ? (
        <>
          <TeamRoundSummary
            game={game}
            result={game.result!}
            match={match}
            players={room.players}
            variant={room.variant}
            error={table.error}
            canContinue={canContinue}
            onContinue={table.ready}
            bubbleOf={bubbleOf}
          />
          {reactionPanel && <div className="controls reactions-row">{reactionPanel}</div>}
        </>
      ) : (
        <>
          <div className="team-grid" data-testid="team-table">
            {SIDES.map((side) => {
              const seat = seatAt(game.you, side);
              return (
                <SeatHand
                  key={side}
                  side={side}
                  seat={seat}
                  player={room.players.find((p) => p.seat === seat)}
                  count={counts[seat] ?? 0}
                  active={game.currentPlayer === seat}
                  partner={side === 'top'}
                  timer={turnTimer?.seat === seat ? turnTimer : null}
                  bubble={bubbleOf(seat)}
                />
              );
            })}
            <div className="team-board">
              <BoardView
                board={game.board}
                choosingEnd={table.interactive && table.selected !== null}
                onChooseEnd={table.chooseEnd}
              />
            </div>
          </div>

          <div className="controls" data-testid="controls">
            <button
              type="button"
              data-testid="pass-button"
              disabled={!table.interactive || !canPass(game.legalMoves)}
              onClick={table.pass}
            >
              Пропустить
            </button>
            {reactionPanel}
            <p className="move-error" data-testid="move-error" role="alert">
              {table.error ?? ''}
            </p>
          </div>

          {turnTimer && turnTimer.seat === game.you && (
            <div className="turn-timer-row turn-timer-row--mine">
              <TurnTimer timer={turnTimer} />
            </div>
          )}

          <ReactionBubble who="mine" bubble={reactions.bySeat[game.you] ?? null} />
          <div className="team-me" data-seat={game.you}>
            <HandView
              hand={game.hand}
              legalMoves={game.legalMoves}
              interactive={table.interactive}
              selected={table.selected}
              onTileClick={table.clickTile}
            />
          </div>
        </>
      )}
    </>
  );
}
