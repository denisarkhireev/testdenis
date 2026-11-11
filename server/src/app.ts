import { randomInt } from 'node:crypto';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { Server } from 'socket.io';
import {
  PROTOCOL_VERSION,
  type ClientToServerEvents,
  type InterServerEvents,
  type ServerToClientEvents,
  type SocketData,
} from '@domino/shared';
import { notifyRoomClosed, registerRoomHandlers } from './rooms/handlers';
import { RoomManager } from './rooms/RoomManager';

export const DEFAULT_RECONNECT_GRACE_MS = 60_000;

export interface StartServerOptions {
  port: number;
  host?: string;
  corsOrigin?: string | string[];
  /** Seed каждого нового раунда. По умолчанию crypto.randomInt(0, 2 ** 32). Тесты подставляют константу. */
  roundSeed?: () => number;
  /** Сколько держать место отключившегося игрока, мс. По умолчанию 60_000. */
  reconnectGraceMs?: number;
}

export interface RunningServer {
  port: number;
  close(): Promise<void>;
}

export function startServer(opts: StartServerOptions): Promise<RunningServer> {
  const httpServer = createServer((req, res) => {
    // Запросы /socket.io/* Socket.IO перехватывает раньше и сюда не передаёт.
    if (req.method === 'GET' && req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok' }));
      return;
    }
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not Found' }));
  });

  const io = new Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>(
    httpServer,
    { cors: { origin: opts.corsOrigin } },
  );

  const rooms = new RoomManager({
    roundSeed: opts.roundSeed ?? (() => randomInt(0, 2 ** 32)),
    reconnectGraceMs: opts.reconnectGraceMs ?? DEFAULT_RECONNECT_GRACE_MS,
    onClose: (room, reason) => notifyRoomClosed(io, room, reason),
  });

  io.on('connection', (socket) => {
    console.info(`connected ${socket.id}`);
    socket.emit('server:hello', {
      protocolVersion: PROTOCOL_VERSION,
      serverTime: new Date().toISOString(),
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
