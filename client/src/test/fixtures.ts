import type { PlayerView, RoomStatePayload } from '@domino/shared';

/** Вид раунда для компонентных тестов: начало раунда, ход `you = 0`, первый ход 6-6. */
export function makeView(partial: Partial<PlayerView> = {}): PlayerView {
  return {
    you: 0,
    hand: [
      [6, 6],
      [0, 1],
      [1, 2],
      [2, 4],
      [3, 5],
      [0, 0],
      [1, 5],
    ],
    opponentHandCount: 7,
    boneyardCount: 14,
    board: [],
    currentPlayer: 0,
    status: 'playing',
    result: null,
    legalMoves: [{ type: 'play', tile: [6, 6], end: 'right' }],
    ...partial,
  };
}

/** `room:state` в фазе `playing` для Аня (0, вы) и Боб (1). */
export function makeRoom(
  view: PlayerView | null = makeView(),
  overrides: Partial<RoomStatePayload> = {},
): RoomStatePayload {
  return {
    roomId: 'ABC234',
    you: view?.you ?? 0,
    phase: view?.status === 'finished' ? 'finished' : 'playing',
    players: [
      { seat: 0, name: 'Аня', connected: true },
      { seat: 1, name: 'Боб', connected: true },
    ],
    game: view,
    ...overrides,
  };
}
