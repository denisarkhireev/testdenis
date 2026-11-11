/**
 * Единый контракт Socket.IO между сервером и клиентом.
 *
 * Соглашения:
 * - имена событий — `<домен>:<действие>` (`server:hello`, далее `room:join`, `game:move` …);
 * - при несовместимом изменении контракта увеличивать `PROTOCOL_VERSION`.
 */
export const PROTOCOL_VERSION = 1;

export interface ServerHelloPayload {
  protocolVersion: number;
  /** ISO-8601 */
  serverTime: string;
}

export interface ServerToClientEvents {
  'server:hello': (payload: ServerHelloPayload) => void;
}

/** Пока пусто; игровые намерения добавят следующие карточки. */
export type ClientToServerEvents = Record<string, never>;

export type InterServerEvents = Record<string, never>;

export type SocketData = Record<string, never>;
