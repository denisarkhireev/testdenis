import { startServer } from './app';

const port = Number(process.env.PORT ?? 3001);
const host = process.env.HOST ?? '0.0.0.0';
const corsOrigin = process.env.CORS_ORIGIN ?? 'http://localhost:5173';
const reconnectGraceMs = Number(process.env.RECONNECT_GRACE_MS) || undefined;
const matchTarget = parseMatchTarget(process.env.MATCH_TARGET);

/** spec-7: MATCH_TARGET — целое > 0; не задана — 101 (по умолчанию в startServer). */
function parseMatchTarget(raw: string | undefined): number | undefined {
  if (raw === undefined || raw.trim() === '') return undefined;
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`MATCH_TARGET must be a positive integer, got "${raw}"`);
  }
  return value;
}

const server = await startServer({ port, host, corsOrigin, reconnectGraceMs, matchTarget });
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
