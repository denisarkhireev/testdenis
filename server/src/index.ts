import { startServer } from './app';
import { loadConfig } from './config';

// Невалидные PUBLIC_URL / MATCH_TARGET / RECONNECT_TIMEOUT / STATIC_DIR — throw здесь, процесс падает на старте.
const config = loadConfig(process.env);

const server = await startServer(config);
console.info(`Server listening on http://${config.host}:${server.port}`);
console.info(`publicUrl: ${config.publicUrl ?? '(not set, clients use their own origin)'}`);
console.info(config.staticDir ? `staticDir: ${config.staticDir}` : 'static: off');

let closing = false;
const shutdown = async () => {
  if (closing) return;
  closing = true;
  await server.close();
  process.exit(0);
};

process.on('SIGINT', () => void shutdown());
process.on('SIGTERM', () => void shutdown());
