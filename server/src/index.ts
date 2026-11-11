import { startServer } from './app';

const port = Number(process.env.PORT ?? 3001);
const host = process.env.HOST ?? '0.0.0.0';
const corsOrigin = process.env.CORS_ORIGIN ?? 'http://localhost:5173';
const reconnectGraceMs = Number(process.env.RECONNECT_GRACE_MS) || undefined;

const server = await startServer({ port, host, corsOrigin, reconnectGraceMs });
console.info(`Server listening on http://${host}:${server.port}`);

let closing = false;
const shutdown = async () => {
  if (closing) return;
  closing = true;
  await server.close();
  process.exit(0);
};

process.on('SIGINT', () => void shutdown());
process.on('SIGTERM', () => void shutdown());
