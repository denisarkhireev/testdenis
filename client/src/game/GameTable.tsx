import { useEffect } from 'react';
import type { PlayerView, RoomStatePayload } from '@domino/shared';
import type { ClientSocket } from '../socket';
import type { ConnectionStatus } from '../useConnectionStatus';
import { BoardView } from './BoardView';
import { HandView } from './HandView';
import { canDraw, canPass } from './moves';
import { OpponentHand } from './OpponentHand';
import { RoundResultBanner } from './RoundResultBanner';
import { useGameTable } from './useGameTable';
import './game.css';

export interface GameTableProps {
  room: RoomStatePayload;
  game: PlayerView;
  socket: ClientSocket;
  status: ConnectionStatus;
}

/** 3.1: игровой стол в одну колонку. */
export function GameTable({ room, game, socket, status }: GameTableProps) {
  const table = useGameTable(socket, game, status);
  const { cancel, selected } = table;
  const opponentName = room.players.find((player) => player.seat !== game.you)?.name ?? '';
  const myTurn = game.currentPlayer === game.you;
  const finished = game.status === 'finished' && game.result !== null;

  useEffect(() => {
    if (!selected) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') cancel();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [selected, cancel]);

  return (
    <div className="game-table">
      {finished ? (
        <RoundResultBanner result={game.result!} you={game.you} opponentName={opponentName} />
      ) : (
        <p
          className={`turn-indicator${myTurn ? ' turn-indicator--mine' : ''}`}
          data-testid="turn-indicator"
          data-my-turn={myTurn ? 'true' : 'false'}
          role="status"
        >
          {myTurn ? 'Ваш ход' : `Ход соперника: ${opponentName}`}
        </p>
      )}

      <OpponentHand count={game.opponentHandCount} />

      <BoardView
        board={game.board}
        choosingEnd={table.interactive && selected !== null}
        onChooseEnd={table.chooseEnd}
      />

      <p className="boneyard" data-testid="boneyard">
        Базар: <span data-testid="boneyard-count">{game.boneyardCount}</span>
      </p>

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

      <HandView
        hand={game.hand}
        legalMoves={game.legalMoves}
        interactive={table.interactive}
        selected={selected}
        onTileClick={table.clickTile}
      />
    </div>
  );
}
