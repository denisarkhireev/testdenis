import { BOT_NAME, type MatchView, type PlayerView, type RoomStatePayload } from '@domino/shared';

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
    opponentHand: null,
    legalMoves: [{ type: 'play', tile: [6, 6], end: 'right' }],
    ...partial,
  };
}

/** Матч в начале: 0:0 до 101, раунд 1, никто не готов. */
export function makeMatch(partial: Partial<MatchView> = {}): MatchView {
  return {
    target: 101,
    scores: [0, 0],
    roundNumber: 1,
    rounds: [],
    winner: null,
    forfeit: null,
    ready: [false, false],
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
      { seat: 0, name: 'Аня', connected: true, reconnectRemainingMs: null, bot: false },
      { seat: 1, name: 'Боб', connected: true, reconnectRemainingMs: null, bot: false },
    ],
    game: view,
    match: makeMatch(),
    turnSeconds: 0,
    matchTarget: 101,
    handSize: 7,
    variant: 'classic',
    mode: '1x1',
    turnTimer: null,
    ...overrides,
  };
}

/** spec-15: `room:state` комнаты с ботом — Аня (0, вы) против «Бот» (1). */
export function makeBotRoom(
  view: PlayerView | null = makeView(),
  overrides: Partial<RoomStatePayload> = {},
): RoomStatePayload {
  return makeRoom(view, {
    players: [
      { seat: 0, name: 'Аня', connected: true, reconnectRemainingMs: null, bot: false },
      { seat: 1, name: BOT_NAME, connected: true, reconnectRemainingMs: null, bot: true },
    ],
    ...overrides,
  });
}

/** spec-17: игроки стола 2×2 — команда 0: Аня (0) и Вера (2), команда 1: Боб (1) и Гена (3). */
export const TEAM_NAMES = ['Аня', 'Боб', 'Вера', 'Гена'] as const;

/** spec-17: вид 4 мест — по 7 костей, базара нет, ход `you = 0`, первый ход 6-6. */
export function makeTeamView(partial: Partial<PlayerView> = {}): PlayerView {
  return makeView({
    opponentHandCount: 0,
    boneyardCount: 0,
    handCounts: [7, 7, 7, 7],
    hands: null,
    ...partial,
  });
}

/** spec-17: `room:state` комнаты 2×2 (по умолчанию глазами места 0). */
export function makeTeamRoom(
  view: PlayerView | null = makeTeamView(),
  overrides: Partial<RoomStatePayload> = {},
): RoomStatePayload {
  return makeRoom(view, {
    mode: '2x2',
    players: TEAM_NAMES.map((name, seat) => ({
      seat: seat as 0 | 1 | 2 | 3,
      name,
      connected: true,
      reconnectRemainingMs: null,
      bot: false,
    })),
    match: makeMatch({ ready: [false, false, false, false] }),
    ...overrides,
  });
}
