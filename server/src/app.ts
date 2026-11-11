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

export interface StartServerOptions {
  port: number;
  host?: string;
  corsOrigin?: string | string[];
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

  return new Promise((resolve, reject) => {
    httpServer.once('error', reject);
    httpServer.listen(opts.port, opts.host, () => {
      httpServer.off('error', reject);
      const { port } = httpServer.address() as AddressInfo;
      resolve({
        port,
        close: () =>
          new Promise<void>((resolveClose, rejectClose) => {
            // io.close() отключает клиентов и закрывает http-сервер.
            io.close((err) => (err ? rejectClose(err) : resolveClose()));
          }),
      });
    });
  });
}
