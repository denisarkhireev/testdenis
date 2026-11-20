import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import path from 'node:path';

/** spec-8 D5: Content-Type по расширению. */
const CONTENT_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  // spec-10: звуки клиента
  '.mp3': 'audio/mpeg',
  '.txt': 'text/plain; charset=utf-8',
};

const IMMUTABLE = 'public, max-age=31536000, immutable';
const NO_CACHE = 'no-cache';

export type StaticHandler = (req: IncomingMessage, res: ServerResponse) => Promise<boolean>;

/**
 * Раздача собранного клиента (spec-8 D2–D6). Возвращает `true`, если ответ отправлен;
 * `false` — запрос не наш (вызывающий отвечает 404).
 */
export function createStaticHandler(staticDir: string): StaticHandler {
  const root = path.resolve(staticDir);
  const indexPath = path.join(root, 'index.html');

  return async (req, res) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return false;

    // Работаем с сырым путём: WHATWG URL сам схлопнул бы `..`/`%2e%2e`, и попытка
    // выйти из каталога превратилась бы в SPA-fallback вместо 404.
    const rawPath = (req.url ?? '/').split(/[?#]/, 1)[0]!;
    let decoded: string;
    try {
      decoded = decodeURIComponent(rawPath);
    } catch {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Bad Request' }));
      return true;
    }
    if (!decoded.startsWith('/') || decoded.includes('\0')) return false;
    if (decoded.split(/[\\/]/).includes('..')) return false;

    const filePath = path.join(root, decoded);
    if (filePath !== root && !filePath.startsWith(root + path.sep)) return false;

    if (await isFile(filePath)) {
      const relative = path.relative(root, filePath).split(path.sep).join('/');
      const cacheControl = relative.startsWith('assets/')
        ? IMMUTABLE
        : filePath === indexPath
          ? NO_CACHE
          : undefined;
      await sendFile(req, res, filePath, cacheControl);
      return true;
    }

    // D3: путь с расширением, которого нет, — 404; без расширения — SPA-fallback.
    if (path.posix.extname(decoded) !== '') return false;
    await sendFile(req, res, indexPath, NO_CACHE);
    return true;
  };
}

async function isFile(filePath: string): Promise<boolean> {
  try {
    return (await stat(filePath)).isFile();
  } catch {
    return false;
  }
}

async function sendFile(
  req: IncomingMessage,
  res: ServerResponse,
  filePath: string,
  cacheControl: string | undefined,
): Promise<void> {
  const { size } = await stat(filePath);
  const headers: Record<string, string | number> = {
    'Content-Type':
      CONTENT_TYPES[path.extname(filePath).toLowerCase()] ?? 'application/octet-stream',
    'Content-Length': size,
    'X-Content-Type-Options': 'nosniff',
  };
  if (cacheControl) headers['Cache-Control'] = cacheControl;
  res.writeHead(200, headers);
  if (req.method === 'HEAD') {
    res.end();
    return;
  }
  await new Promise<void>((resolve) => {
    const stream = createReadStream(filePath);
    stream.on('error', () => {
      res.destroy();
      resolve();
    });
    res.on('close', () => {
      stream.destroy();
      resolve();
    });
    stream.pipe(res);
  });
}
