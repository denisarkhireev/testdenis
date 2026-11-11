import { afterEach, beforeEach, vi } from 'vitest';
import { io as ioc, type Socket } from 'socket.io-client';
import type {
  ClientToServerEvents,
  RoomClosedPayload,
  RoomStatePayload,
  ServerToClientEvents,
} from '@domino/shared';
import { startServer, type RunningServer, type StartServerOptions } from './app';

export type TestSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

type EventName = keyof ClientToServerEvents;
type PayloadOf<E extends EventName> = Parameters<ClientToServerEvents[E]>[0];
type AckResOf<E extends EventName> = Parameters<Parameters<ClientToServerEvents[E]>[1]>[0];

export const WAIT_MS = 2000;

export interface TestServer {
  readonly server: RunningServer;
  connectClient(): Promise<TestSocket>;
  /** Останавливает сервер раньше afterEach (для тестов close()). */
  stop(): Promise<void>;
}

/**
 * Регистрирует beforeEach/afterEach: поднимает сервер на случайном порту
 * и закрывает его вместе со всеми клиентами после теста.
 */
export function useTestServer(opts: Omit<StartServerOptions, 'port' | 'host'>): TestServer {
  let server: RunningServer | undefined;
  let clients: TestSocket[] = [];

  beforeEach(async () => {
    vi.spyOn(console, 'info').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    server = await startServer({ port: 0, host: '127.0.0.1', ...opts });
  });

  afterEach(async () => {
    for (const c of clients) c.disconnect();
    clients = [];
    if (server) await server.close();
    server = undefined;
    vi.restoreAllMocks();
  });

  return {
    get server() {
      if (!server) throw new Error('server is not running');
      return server;
    },
    connectClient() {
      if (!server) throw new Error('server is not running');
      const socket: TestSocket = ioc(`http://127.0.0.1:${server.port}`, {
        transports: ['websocket'],
        forceNew: true,
        reconnection: false,
      });
      clients.push(socket);
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('connect timeout')), WAIT_MS);
        socket.once('connect', () => {
          clearTimeout(timer);
          resolve(socket);
        });
      });
    },
    async stop() {
      const s = server;
      server = undefined;
      await s?.close();
    },
  };
}

/** emit с ack → Promise ответа сервера. */
export function emitAck<E extends EventName>(
  socket: TestSocket,
  event: E,
  payload: PayloadOf<E>,
): Promise<AckResOf<E>> {
  // Типизированный emitWithAck не выражает обобщённый E; payload проверен сигнатурой выше.
  const untyped = socket as unknown as Socket;
  return untyped.timeout(WAIT_MS).emitWithAck(event, payload) as Promise<AckResOf<E>>;
}

/** emit без ack-функции — сервер должен проигнорировать событие. */
export function emitRaw(socket: TestSocket, event: string, payload: unknown): void {
  (socket as unknown as Socket).emit(event, payload);
}

/** emit произвольного (невалидного) payload с ack — для проверок INVALID_PAYLOAD. */
export function emitRawAck(socket: TestSocket, event: string, payload: unknown): Promise<unknown> {
  return (socket as unknown as Socket).timeout(WAIT_MS).emitWithAck(event, payload);
}

function waitFor<T>(
  socket: TestSocket,
  event: 'room:state' | 'room:closed',
  predicate: (payload: T) => boolean,
): Promise<T> {
  const untyped = socket as unknown as Socket;
  return new Promise((resolve, reject) => {
    const listener = (payload: T) => {
      if (!predicate(payload)) return;
      clearTimeout(timer);
      untyped.off(event, listener);
      resolve(payload);
    };
    const timer = setTimeout(() => {
      untyped.off(event, listener);
      reject(new Error(`${event} timeout`));
    }, WAIT_MS);
    untyped.on(event, listener);
  });
}

/** Следующий room:state (удовлетворяющий predicate). Подписываться до действия. */
export function nextState(
  socket: TestSocket,
  predicate: (s: RoomStatePayload) => boolean = () => true,
): Promise<RoomStatePayload> {
  return waitFor(socket, 'room:state', predicate);
}

export function nextClosed(socket: TestSocket): Promise<RoomClosedPayload> {
  return waitFor(socket, 'room:closed', () => true);
}

/** Убеждается, что за `ms` сокет не получил room:state. */
export function expectNoState(socket: TestSocket, ms = 200): Promise<void> {
  return new Promise((resolve, reject) => {
    const listener = () => {
      clearTimeout(timer);
      reject(new Error('unexpected room:state'));
    };
    const timer = setTimeout(() => {
      socket.off('room:state', listener);
      resolve();
    }, ms);
    socket.on('room:state', listener);
  });
}

export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Все room:state, полученные сокетом с момента вызова. */
export function recordStates(socket: TestSocket): RoomStatePayload[] {
  const received: RoomStatePayload[] = [];
  socket.on('room:state', (s) => received.push(s));
  return received;
}

export interface Room2 {
  a: TestSocket;
  b: TestSocket;
  roomId: string;
  tokens: [string, string];
  /** room:state, полученные сразу после старта раунда. */
  start: [RoomStatePayload, RoomStatePayload];
}

/** A создаёт комнату, B входит; ждёт стартовые room:state обоих. */
export async function createPlayingRoom(ctx: TestServer): Promise<Room2> {
  const a = await ctx.connectClient();
  const b = await ctx.connectClient();
  const created = await emitAck(a, 'room:create', { name: 'A' });
  if (!created.ok) throw new Error(`create failed: ${created.error}`);
  const startA = nextState(a, (s) => s.phase !== 'waiting');
  const startB = nextState(b);
  const joined = await emitAck(b, 'room:join', { roomId: created.roomId, name: 'B' });
  if (!joined.ok) throw new Error(`join failed: ${joined.error}`);
  return {
    a,
    b,
    roomId: created.roomId,
    tokens: [created.playerToken, joined.playerToken],
    start: [await startA, await startB],
  };
}
