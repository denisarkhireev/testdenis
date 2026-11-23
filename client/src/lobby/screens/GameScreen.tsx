import type { RoomStatePayload } from '@domino/shared';
import { ForfeitSummary } from '../../game/ForfeitSummary';
import { GameTable } from '../../game/GameTable';
import { formatMmSs, useCountdown } from '../../game/useCountdown';
import type { ClientSocket } from '../../socket';
import type { ConnectionStatus } from '../../useConnectionStatus';

export interface GameScreenProps {
  room: RoomStatePayload;
  socket: ClientSocket;
  status: ConnectionStatus;
  /** «На главную» с экрана техпоражения. */
  onHome: () => void;
}

/**
 * spec-9 RC8: плашка «Соперник отключился, ждём… mm:ss» с обратным отсчётом.
 * spec-17: в 2×2 — «{имя} отключился, ждём…».
 */
function OpponentOffline({ remainingMs, name }: { remainingMs: number | null; name?: string }) {
  const left = useCountdown(remainingMs);
  return (
    <p className="opponent-offline" data-testid="opponent-offline" role="status">
      {name === undefined ? 'Соперник' : name} отключился, ждём…
      {left !== null && (
        <>
          {' '}
          <span data-testid="opponent-countdown">{formatMmSs(left)}</span>
        </>
      )}
    </p>
  );
}

/**
 * Экран игры: игроки и плашка отключения (#5, #9) + игровой стол (#6) с табло и итогами (#7).
 * После техпоражения (spec-9 RC5) вместо стола — итог матча.
 */
export function GameScreen({ room, socket, status, onHome }: GameScreenProps) {
  const team = room.mode === '2x2';
  // spec-17 §4.3: в 2×2 плашка — для первого отключённого чужого места.
  const opponent = team
    ? room.players.find((player) => player.seat !== room.you && !player.connected)
    : room.players.find((player) => player.seat !== room.you);
  const match = room.match;
  const forfeited = match !== null && match.forfeit != null;

  return (
    <section className="game-screen" data-testid="game-screen">
      <ul className="players" data-testid="players">
        {room.players.map((player) => (
          <li key={player.seat} data-testid={`player-name-${player.seat}`}>
            {player.name}
            {player.seat === room.you && ' (вы)'}
          </li>
        ))}
      </ul>
      {forfeited ? (
        <ForfeitSummary room={{ ...room, match }} onHome={onHome} />
      ) : (
        <>
          {opponent && !opponent.connected && (
            <OpponentOffline
              remainingMs={opponent.reconnectRemainingMs}
              {...(team ? { name: opponent.name } : {})}
            />
          )}
          {room.game && (
            <GameTable
              room={room}
              game={room.game}
              match={room.match}
              socket={socket}
              status={status}
            />
          )}
        </>
      )}
    </section>
  );
}
