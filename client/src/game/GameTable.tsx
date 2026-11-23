import { useEffect, useRef } from 'react';
import type { MatchView, PlayerView, RoomStatePayload } from '@domino/shared';
import { useReducedMotion } from '../fx/useReducedMotion';
import { useTableEvents } from '../fx/useTableEvents';
import { useTileFlights } from '../fx/useTileFlights';
import { ReactionBubble } from '../reactions/ReactionBubble';
import { ReactionPanel } from '../reactions/ReactionPanel';
import { useReactions } from '../reactions/useReactions';
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
  // spec-12: реакции — отдельный pending, ход и реакция могут лететь одновременно.
  const reactions = useReactions(socket, game.you, status);
  // spec-15 B9: в комнате с ботом реакций нет — бот их не читает и не шлёт.
  const vsBot = room.players.some((player) => player.bot);
  const reactionPanel = vsBot ? null : (
    <ReactionPanel canSend={reactions.canSend} error={reactions.error} onSend={reactions.send} />
  );
  const { cancel, selected } = table;
  const opponentName = room.players.find((player) => player.seat !== game.you)?.name ?? '';
  const myTurn = game.currentPlayer === game.you;
  // spec-13 UI6: без связи «Ваш ход» не подсвечивается (ходить всё равно нельзя).
  const online = status === 'connected';
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
      {match && (
        <MatchScore
          match={match}
          players={room.players}
          turnSeconds={room.turnSeconds}
          handSize={room.handSize}
          variant={room.variant}
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
          {myTurn ? 'Ваш ход' : `Ход соперника: ${opponentName}`}
        </p>
      )}

      {/* После конца раунда обе руки показываются лицом в итогах, рубашки не нужны. */}
      {/* spec-13 UI9: облачко соперника — поверх строки его руки, не над столом. */}
      {!finished && (
        <OpponentHand
          count={game.opponentHandCount}
          bubble={<ReactionBubble who="opponent" bubble={reactions.bubbles.opponent} />}
        />
      )}
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
        <>
          {/* spec-13 UI9: на итогах оба облачка — у подписей своих рук. */}
          <RoundSummary
            game={game}
            result={game.result!}
            match={match}
            players={room.players}
            variant={room.variant}
            error={table.error}
            canContinue={canContinue}
            onContinue={table.ready}
            opponentBubble={<ReactionBubble who="opponent" bubble={reactions.bubbles.opponent} />}
            mineBubble={<ReactionBubble who="mine" side bubble={reactions.bubbles.mine} />}
          />
          {reactionPanel && <div className="controls reactions-row">{reactionPanel}</div>}
        </>
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
            {reactionPanel}
            <p className="move-error" data-testid="move-error" role="alert">
              {table.error ?? ''}
            </p>
          </div>

          {turnTimer && timerMine && (
            <div className="turn-timer-row turn-timer-row--mine">
              <TurnTimer timer={turnTimer} />
            </div>
          )}

          <ReactionBubble who="mine" bubble={reactions.bubbles.mine} />
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
