import { useEffect, useRef } from 'react';
import type { MatchView, PlayerView, RoomStatePayload } from '@domino/shared';
import { useReducedMotion } from '../fx/useReducedMotion';
import { useTableEvents } from '../fx/useTableEvents';
import { useTileFlights } from '../fx/useTileFlights';
import type { ClientSocket } from '../socket';
import { useSound } from '../sound/useSound';
import type { ConnectionStatus } from '../useConnectionStatus';
import { BoardView } from './BoardView';
import { HandView } from './HandView';
import { canDraw, canPass } from './moves';
import { OpponentHand } from './OpponentHand';
import { MatchScore } from './MatchScore';
import { RoundSummary } from './RoundSummary';
import { TurnTimer } from './TurnTimer';
import { useGameTable } from './useGameTable';
import './game.css';

/** spec-10 S2: «Ваш ход» и конец раунда — после стука/полёта. */
export const DELAYED_SOUND_MS = 250;

export interface GameTableProps {
  room: RoomStatePayload;
  game: PlayerView;
  /** Счёт матча; null только в waiting (тогда табло не рисуется). */
  match: MatchView | null;
  socket: ClientSocket;
  status: ConnectionStatus;
}

/** 3.1: игровой стол в одну колонку; spec-7: табло матча и экран итогов раунда. */
export function GameTable({ room, game, match, socket, status }: GameTableProps) {
  const table = useGameTable(socket, game, status);
  const { cancel, selected } = table;
  const opponentName = room.players.find((player) => player.seat !== game.you)?.name ?? '';
  const myTurn = game.currentPlayer === game.you;
  const finished = game.status === 'finished' && game.result !== null;
  // spec-11: ровно один отсчёт — у игрока, чей ход.
  const turnTimer = finished ? null : (room.turnTimer ?? null);
  const timerMine = turnTimer !== null && turnTimer.seat === game.you;
  const canContinue =
    status === 'connected' && !table.pending && match !== null && !match.ready[game.you];

  // spec-10: события стола → полёты костей и звуки.
  const tableRef = useRef<HTMLDivElement>(null);
  const events = useTableEvents(game);
  const reducedMotion = useReducedMotion();
  useTileFlights(tableRef, events, reducedMotion);
  const { play } = useSound();

  // Отложенные звуки не отменяются следующим room:state — только размонтированием стола.
  const timersRef = useRef(new Set<ReturnType<typeof setTimeout>>());
  useEffect(() => {
    for (const event of events) {
      if (event.type === 'play') play('tile');
      else if (event.type === 'draw') play('draw');
      else {
        const name = event.type === 'turn' ? 'turn' : 'roundEnd';
        const timer = setTimeout(() => {
          timersRef.current.delete(timer);
          play(name);
        }, DELAYED_SOUND_MS);
        timersRef.current.add(timer);
      }
    }
  }, [events, play]);

  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      timers.forEach(clearTimeout);
      timers.clear();
    };
  }, []);

  useEffect(() => {
    if (!selected) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') cancel();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [selected, cancel]);

  return (
    <div className="game-table" ref={tableRef}>
      {match && <MatchScore match={match} players={room.players} turnSeconds={room.turnSeconds} />}

      {!finished && (
        <p
          className={`turn-indicator${myTurn ? ' turn-indicator--mine' : ''}`}
          data-testid="turn-indicator"
          data-my-turn={myTurn ? 'true' : 'false'}
          role="status"
        >
          {myTurn ? 'Ваш ход' : `Ход соперника: ${opponentName}`}
        </p>
      )}

      {/* После конца раунда обе руки показываются лицом в итогах, рубашки не нужны. */}
      {!finished && <OpponentHand count={game.opponentHandCount} />}
      {turnTimer && !timerMine && (
        <div className="turn-timer-row turn-timer-row--opponent">
          <TurnTimer timer={turnTimer} />
        </div>
      )}

      <BoardView
        board={game.board}
        choosingEnd={table.interactive && selected !== null}
        onChooseEnd={table.chooseEnd}
      />

      <p className="boneyard" data-testid="boneyard">
        Базар: <span data-testid="boneyard-count">{game.boneyardCount}</span>
      </p>

      {finished ? (
        <RoundSummary
          game={game}
          result={game.result!}
          match={match}
          players={room.players}
          error={table.error}
          canContinue={canContinue}
          onContinue={table.ready}
        />
      ) : (
        <>
          <div className="controls" data-testid="controls">
            <button
              type="button"
              data-testid="draw-button"
              disabled={!table.interactive || !canDraw(game.legalMoves)}
              onClick={table.draw}
            >
              Взять из базара
            </button>
            <button
              type="button"
              data-testid="pass-button"
              disabled={!table.interactive || !canPass(game.legalMoves)}
              onClick={table.pass}
            >
              Пропустить
            </button>
            <p className="move-error" data-testid="move-error" role="alert">
              {table.error ?? ''}
            </p>
          </div>

          {turnTimer && timerMine && (
            <div className="turn-timer-row turn-timer-row--mine">
              <TurnTimer timer={turnTimer} />
            </div>
          )}

          <HandView
            hand={game.hand}
            legalMoves={game.legalMoves}
            interactive={table.interactive}
            selected={selected}
            onTileClick={table.clickTile}
          />
        </>
      )}
    </div>
  );
}
