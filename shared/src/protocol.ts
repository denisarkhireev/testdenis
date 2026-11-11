/**
 * Единый контракт Socket.IO между сервером и клиентом.
 *
 * Соглашения:
 * - имена событий — `<домен>:<действие>` (`server:hello`, `room:join`, `game:move` …);
 * - ошибки действий возвращаются только через ack (`{ ok: false, error }`);
 * - при несовместимом изменении контракта увеличивать `PROTOCOL_VERSION`.
 */
import type { Move, MoveError, PlayerIndex, PlayerView } from './rules';

export const PROTOCOL_VERSION = 1;

export interface ServerHelloPayload {
  protocolVersion: number;
  /** ISO-8601 */
  serverTime: string;
}

export type RoomPhase = 'waiting' | 'playing' | 'finished';

export interface RoomPlayer {
  seat: PlayerIndex;
  name: string;
  connected: boolean;
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

export type GameErrorCode = MoveError | 'INVALID_PAYLOAD' | 'NOT_IN_ROOM' | 'GAME_NOT_STARTED';

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
}

export type InterServerEvents = Record<string, never>;

/** Привязка сокета к месту в комнате (K6). */
export interface SocketData {
  roomId?: string;
  seat?: PlayerIndex;
}
