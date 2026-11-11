import type { RoomStatePayload } from '@domino/shared';

export interface GameScreenProps {
  room: RoomStatePayload;
}

/** Заглушка до #6: #6 заменит содержимое, сохранив data-testid="game-screen". */
export function GameScreen({ room }: GameScreenProps) {
  const opponent = room.players.find((player) => player.seat !== room.you);

  return (
    <section data-testid="game-screen">
      <h2>Игра началась</h2>
      <ul>
        {room.players.map((player) => (
          <li key={player.seat} data-testid={`player-name-${player.seat}`}>
            {player.name}
            {player.seat === room.you && ' (вы)'}
          </li>
        ))}
      </ul>
      {opponent && !opponent.connected && (
        <p data-testid="opponent-offline">Соперник отключился, ждём возвращения…</p>
      )}
    </section>
  );
}
