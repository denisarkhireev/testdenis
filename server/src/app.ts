import { randomInt } from 'node:crypto';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { Server } from 'socket.io';
import {
  createMatch,
  MATCH_TARGET,
  PROTOCOL_VERSION,
  TURN_SECONDS_OPTIONS,
  type ClientToServerEvents,
  type InterServerEvents,
  type ServerToClientEvents,
  type SocketData,
} from '@domino/shared';
import {
  broadcastState,
  notifyForfeit,
  notifyRoomClosed,
  registerRoomHandlers,
} from './rooms/handlers';
import { RoomManager } from './rooms/RoomManager';
import { createStaticHandler, type StaticHandler } from './static';

export const DEFAULT_RECONNECT_TIMEOUT_MS = 120_000;

export interface StartServerOptions {
  port: number;
  host?: string;
  corsOrigin?: string | string[];
  /** Seed каждого нового раунда. По умолчанию crypto.randomInt(0, 2 ** 32). Тесты подставляют константу. */
  roundSeed?: () => number;
  /** spec-9 RC2: сколько ждать возвращения отключившегося игрока, мс. По умолчанию 120_000. */
  reconnectTimeoutMs?: number;
  /** Цель матча, очков (spec-7 M1). По умолчанию MATCH_TARGET = 101. */
  matchTarget?: number;
  /** spec-8 D8/D9: публичный origin для ссылок-приглашений; уходит клиенту в `server:hello`. */
  publicUrl?: string;
  /** spec-8 D2: каталог собранного клиента; не задан — статика выключена (D7). */
  staticDir?: string;
  /** spec-11 §4.2: доп. значение времени на ход, с (только e2e, TURN_TIMER_TEST_SECONDS). */
  turnTimerTestSeconds?: number;
  /** Часы RoomManager (дедлайны, кулдаун реакций spec-12). По умолчанию Date.now; только для тестов. */
  now?: () => number;
}

export interface RunningServer {
  port: number;
  close(): Promise<void>;
}

export function startServer(opts: StartServerOptions): Promise<RunningServer> {
  const matchTarget = opts.matchTarget ?? MATCH_TARGET;
  createMatch(matchTarget); // throw на старте, а не при первом room:join
  // spec-11: [0, (тест), 30, 60] — для room:create и server:hello.turnSecondsOptions.
  const allowedTurnSeconds = [
    ...new Set([
      ...TURN_SECONDS_OPTIONS,
      ...(opts.turnTimerTestSeconds ? [opts.turnTimerTestSeconds] : []),
    ]),
  ].sort((a, b) => a - b);
  const serveStatic = opts.staticDir ? createStaticHandler(opts.staticDir) : undefined;
  const httpServer = createServer((req, res) => {
    // Запросы /socket.io/* Socket.IO перехватывает раньше и сюда не передаёт.
    void handleHttp(req, res, serveStatic).catch((err: unknown) => {
      console.error('HTTP handler failed', err);
      if (!res.headersSent) sendJson(res, 500, { error: 'Internal Server Error' });
      else res.destroy();
    });
  });

  const io = new Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>(
    httpServer,
    // RC16: пропажа сети без закрытия сокета обнаруживается ≤ 15 с.
    { cors: { origin: opts.corsOrigin }, pingInterval: 10_000, pingTimeout: 5_000 },
  );

  const rooms = new RoomManager({
    roundSeed: opts.roundSeed ?? (() => randomInt(0, 2 ** 32)),
    reconnectTimeoutMs: opts.reconnectTimeoutMs ?? DEFAULT_RECONNECT_TIMEOUT_MS,
    matchTarget,
    ...(opts.now ? { now: opts.now } : {}),
    onClose: (room, reason) => notifyRoomClosed(io, room, reason),
    onForfeit: (room, loser) => notifyForfeit(io, room, loser),
    allowedTurnSeconds,
    onAutoMove: (room) => broadcastState(io, room),
  });

  io.on('connection', (socket) => {
    console.info(`connected ${socket.id}`);
    socket.emit('server:hello', {
      protocolVersion: PROTOCOL_VERSION,
      serverTime: new Date().toISOString(),
      // D9: ключа нет вовсе, если PUBLIC_URL не задан.
      ...(opts.publicUrl ? { publicUrl: opts.publicUrl } : {}),
      turnSecondsOptions: [...allowedTurnSeconds],
    });
    socket.on('disconnect', (reason) => {
      console.info(`disconnected ${socket.id} ${reason}`);
    });
  });

  registerRoomHandlers(io, rooms);

  return new Promise((resolve, reject) => {
    httpServer.once('error', reject);
    httpServer.listen(opts.port, opts.host, () => {
      httpServer.off('error', reject);
      const { port } = httpServer.address() as AddressInfo;
      resolve({
        port,
        close: () =>
          new Promise<void>((resolveClose, rejectClose) => {
            // io.close() отключает клиентов и закрывает http-сервер; таймеры
            // отключений, поставленные при этом, снимает closeAll().
            io.close((err) => {
              rooms.closeAll();
              if (err) rejectClose(err);
              else resolveClose();
            });
          }),
      });
    });
  });
}

const HEALTH_PATHS = new Set(['/healthz', '/health']);

async function handleHttp(
  req: IncomingMessage,
  res: ServerResponse,
  serveStatic: StaticHandler | undefined,
): Promise<void> {
  const { pathname } = new URL(req.url ?? '/', 'http://x');
  if ((req.method === 'GET' || req.method === 'HEAD') && HEALTH_PATHS.has(pathname)) {
    sendJson(res, 200, { status: 'ok' });
    return;
  }
  if (serveStatic && (await serveStatic(req, res))) return;
  sendJson(res, 404, { error: 'Not Found' });
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(payload),
  });
  // HEAD: Node сам не отправит тело.
  res.end(payload);
}
