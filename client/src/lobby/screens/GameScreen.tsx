import type { RoomStatePayload } from '@domino/shared';
import { GameTable } from '../../game/GameTable';
import type { ClientSocket } from '../../socket';
import type { ConnectionStatus } from '../../useConnectionStatus';

export interface GameScreenProps {
  room: RoomStatePayload;
  socket: ClientSocket;
  status: ConnectionStatus;
}

/** Экран игры: игроки и баннер отключения (#5) + игровой стол (#6). */
export function GameScreen({ room, socket, status }: GameScreenProps) {
  const opponent = room.players.find((player) => player.seat !== room.you);

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
      {opponent && !opponent.connected && (
        <p className="opponent-offline" data-testid="opponent-offline">
          Соперник отключился, ждём возвращения…
        </p>
      )}
      {room.game && <GameTable room={room} game={room.game} socket={socket} status={status} />}
    </section>
  );
}
