import { randomInt } from 'node:crypto';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { Server } from 'socket.io';
import {
  createMatch,
  MATCH_TARGET,
  PROTOCOL_VERSION,
  type ClientToServerEvents,
  type InterServerEvents,
  type ServerToClientEvents,
  type SocketData,
} from '@domino/shared';
import { notifyRoomClosed, registerRoomHandlers } from './rooms/handlers';
import { RoomManager } from './rooms/RoomManager';
import { createStaticHandler, type StaticHandler } from './static';

export const DEFAULT_RECONNECT_GRACE_MS = 60_000;

export interface StartServerOptions {
  port: number;
  host?: string;
  corsOrigin?: string | string[];
  /** Seed каждого нового раунда. По умолчанию crypto.randomInt(0, 2 ** 32). Тесты подставляют константу. */
  roundSeed?: () => number;
  /** Сколько держать место отключившегося игрока, мс. По умолчанию 60_000. */
  reconnectGraceMs?: number;
  /** Цель матча, очков (spec-7 M1). По умолчанию MATCH_TARGET = 101. */
  matchTarget?: number;
  /** spec-8 D8/D9: публичный origin для ссылок-приглашений; уходит клиенту в `server:hello`. */
  publicUrl?: string;
  /** spec-8 D2: каталог собранного клиента; не задан — статика выключена (D7). */
  staticDir?: string;
}

export interface RunningServer {
  port: number;
  close(): Promise<void>;
}

export function startServer(opts: StartServerOptions): Promise<RunningServer> {
  const matchTarget = opts.matchTarget ?? MATCH_TARGET;
  createMatch(matchTarget); // throw на старте, а не при первом room:join
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
    { cors: { origin: opts.corsOrigin } },
  );

  const rooms = new RoomManager({
    roundSeed: opts.roundSeed ?? (() => randomInt(0, 2 ** 32)),
    reconnectGraceMs: opts.reconnectGraceMs ?? DEFAULT_RECONNECT_GRACE_MS,
    matchTarget,
    onClose: (room, reason) => notifyRoomClosed(io, room, reason),
  });

  io.on('connection', (socket) => {
    console.info(`connected ${socket.id}`);
    socket.emit('server:hello', {
      protocolVersion: PROTOCOL_VERSION,
      serverTime: new Date().toISOString(),
      // D9: ключа нет вовсе, если PUBLIC_URL не задан.
      ...(opts.publicUrl ? { publicUrl: opts.publicUrl } : {}),
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
            // io.close() отключает клиентов и закрывает http-сервер; grace-таймеры
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
