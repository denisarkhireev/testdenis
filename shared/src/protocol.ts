/**
 * Единый контракт Socket.IO между сервером и клиентом.
 *
 * Соглашения:
 * - имена событий — `<домен>:<действие>` (`server:hello`, `room:join`, `game:move` …);
 * - ошибки действий возвращаются только через ack (`{ ok: false, error }`);
 * - при несовместимом изменении контракта увеличивать `PROTOCOL_VERSION`.
 */
import type { MatchState, Move, MoveError, PlayerIndex, PlayerView } from './rules';

export const PROTOCOL_VERSION = 1;

export interface ServerHelloPayload {
  protocolVersion: number;
  /** ISO-8601 */
  serverTime: string;
  /** spec-8 D9: публичный origin для ссылок-приглашений (`PUBLIC_URL`), без завершающего `/`. Нет — клиент берёт свой origin. */
  publicUrl?: string;
  /**
   * spec-11 T1: значения времени на ход для экрана создания, с, по возрастанию, начиная с 0.
   * Обычно [0, 30, 60]; с TURN_TIMER_TEST_SECONDS — плюс тестовое.
   */
  turnSecondsOptions: number[];
}

/** spec-11 T1: допустимые значения времени на ход, с. 0 — таймер выключен. */
export const TURN_SECONDS_OPTIONS: readonly number[] = [0, 30, 60];
export const DEFAULT_TURN_SECONDS = 60;

/** Таймер текущего хода глазами игрока (spec-11 T2–T10). */
export interface TurnTimerView {
  /** Чей ход тикает (= game.currentPlayer). */
  seat: PlayerIndex;
  /** Остаток, мс, на момент отправки. На паузе — замороженный остаток. */
  remainingMs: number;
  /** T7: стоит ли таймер (кто-то отключён). */
  paused: boolean;
}

export type RoomPhase = 'waiting' | 'playing' | 'finished';

export interface RoomPlayer {
  seat: PlayerIndex;
  name: string;
  connected: boolean;
  /** spec-9 RC8: сколько мс ещё ждём возвращения; null — игрок подключён. */
  reconnectRemainingMs: number | null;
}

/** Состояние комнаты глазами одного игрока. Единственное событие с состоянием. */
export interface RoomStatePayload {
  roomId: string;
  you: PlayerIndex;
  phase: RoomPhase;
  /** По месту: players[0] — создатель; длина 1 в waiting, 2 потом. */
  players: RoomPlayer[];
  /** null в waiting; иначе toPlayerView(round, you). */
  game: PlayerView | null;
  /** null в waiting; иначе состояние матча (spec-7 M1). */
  match: MatchView | null;
  /** spec-11 T1: настройка комнаты, с; 0 — выкл. */
  turnSeconds: number;
  /** spec-11: null — таймер не идёт (T3). */
  turnTimer: TurnTimerView | null;
}

/** Матч глазами игроков: счёт, история и готовность к следующему раунду/реваншу. */
export interface MatchView extends MatchState {
  /** Нажал ли игрок места i «Следующий раунд»/«Реванш» (M4–M6). Всегда [false,false] при playing. */
  ready: [boolean, boolean];
}

export type RoomClosedReason = 'player_left' | 'replaced';

export interface RoomClosedPayload {
  roomId: string;
  reason: RoomClosedReason;
}

export type RoomErrorCode =
  | 'INVALID_PAYLOAD'
  | 'INVALID_NAME'
  | 'ROOM_NOT_FOUND'
  | 'ROOM_FULL'
  | 'ALREADY_IN_ROOM'
  | 'INVALID_TOKEN';

export type GameErrorCode =
  MoveError | 'INVALID_PAYLOAD' | 'NOT_IN_ROOM' | 'GAME_NOT_STARTED' | 'ROUND_NOT_FINISHED';

export type AckResult<T, E extends string> = ({ ok: true } & T) | { ok: false; error: E };

export interface RoomJoinedAck {
  roomId: string;
  seat: PlayerIndex;
  playerToken: string;
}

export interface RoomRejoinedAck {
  roomId: string;
  seat: PlayerIndex;
}

export interface RoomCreatePayload {
  name: string;
  /** spec-11 T1: необязательно; нет — DEFAULT_TURN_SECONDS. Не из списка — INVALID_PAYLOAD. */
  turnSeconds?: number;
}

export interface RoomJoinPayload {
  roomId: string;
  name: string;
}

export interface RoomRejoinPayload {
  roomId: string;
  playerToken: string;
}

export interface GameMovePayload {
  move: Move;
}

/** «Следующий раунд» / «Реванш»: `{}`, лишние поля игнорируются. */
export type GameReadyPayload = Record<string, never>;

export interface ServerToClientEvents {
  'server:hello': (payload: ServerHelloPayload) => void;
  'room:state': (payload: RoomStatePayload) => void;
  'room:closed': (payload: RoomClosedPayload) => void;
}

export interface ClientToServerEvents {
  'room:create': (
    payload: RoomCreatePayload,
    ack: (res: AckResult<RoomJoinedAck, RoomErrorCode>) => void,
  ) => void;
  'room:join': (
    payload: RoomJoinPayload,
    ack: (res: AckResult<RoomJoinedAck, RoomErrorCode>) => void,
  ) => void;
  'room:rejoin': (
    payload: RoomRejoinPayload,
    ack: (res: AckResult<RoomRejoinedAck, RoomErrorCode>) => void,
  ) => void;
  'game:move': (
    payload: GameMovePayload,
    ack: (res: AckResult<object, GameErrorCode>) => void,
  ) => void;
  'game:ready': (
    payload: GameReadyPayload,
    ack: (res: AckResult<object, GameErrorCode>) => void,
  ) => void;
}

export type InterServerEvents = Record<string, never>;

/** Привязка сокета к месту в комнате (K6). */
export interface SocketData {
  roomId?: string;
  seat?: PlayerIndex;
}
