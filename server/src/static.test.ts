import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { request } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { io as ioc, type Socket } from 'socket.io-client';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { ClientToServerEvents, ServerToClientEvents } from '@domino/shared';
import { startServer, type RunningServer } from './app';

const INDEX = '<!doctype html><title>Domino</title>';
const APP_JS = 'console.log("app");';

let parent: string;
let staticDir: string;
let server: RunningServer;

interface RawResponse {
  status: number;
  headers: Record<string, string | string[] | undefined>;
  body: string;
}

/** Сырой HTTP-запрос: fetch нормализовал бы `..` и `%2e%2e` до отправки. */
function raw(method: string, rawPath: string): Promise<RawResponse> {
  return new Promise((resolve, reject) => {
    const req = request({ host: '127.0.0.1', port: server.port, method, path: rawPath }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk: string) => (body += chunk));
      res.on('end', () => resolve({ status: res.statusCode!, headers: res.headers, body }));
    });
    req.on('error', reject);
    req.end();
  });
}

beforeAll(async () => {
  vi.spyOn(console, 'info').mockImplementation(() => {});
  parent = await mkdtemp(path.join(tmpdir(), 'domino-static-'));
  staticDir = path.join(parent, 'dist');
  await mkdir(path.join(staticDir, 'assets'), { recursive: true });
  await writeFile(path.join(staticDir, 'index.html'), INDEX);
  await writeFile(path.join(staticDir, 'assets', 'app-abc.js'), APP_JS);
  // Файл рядом со staticDir — не должен отдаваться.
  await writeFile(path.join(parent, 'secret'), 'top secret');
  server = await startServer({ port: 0, host: '127.0.0.1', staticDir });
});

afterAll(async () => {
  await server.close();
  await rm(parent, { recursive: true, force: true });
  vi.restoreAllMocks();
});

describe('static client (staticDir)', () => {
  it('S1: GET / serves index.html with no-cache', async () => {
    const res = await raw('GET', '/');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('text/html; charset=utf-8');
    expect(res.headers['cache-control']).toBe('no-cache');
    expect(res.body).toBe(INDEX);
  });

  it.each(['/?room=ABC234', '/some/route', '/foo'])('S2: SPA fallback for %s', async (p) => {
    const res = await raw('GET', p);
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('no-cache');
    expect(res.body).toBe(INDEX);
  });

  it('S3: GET /assets/app-abc.js serves the file as immutable', async () => {
    const res = await raw('GET', '/assets/app-abc.js');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('text/javascript; charset=utf-8');
    expect(res.headers['cache-control']).toBe('public, max-age=31536000, immutable');
    expect(res.headers['content-length']).toBe(String(Buffer.byteLength(APP_JS)));
    expect(res.body).toBe(APP_JS);
  });

  it('S4: missing file with an extension → 404', async () => {
    const res = await raw('GET', '/assets/missing.js');
    expect(res.status).toBe(404);
    expect(JSON.parse(res.body)).toEqual({ error: 'Not Found' });
  });

  it.each([
    '/../package.json',
    '/%2e%2e/%2e%2e/etc/passwd',
    '/assets/..%2f..%2fsecret',
    '/..%2fsecret',
    '/assets/%2e%2e/%2e%2e/secret',
  ])('S5: path traversal %s → 404', async (p) => {
    const res = await raw('GET', p);
    expect(res.status).toBe(404);
    expect(res.body).not.toContain('top secret');
  });

  it('S6: malformed escape → 400', async () => {
    const res = await raw('GET', '/%E0%A4%A');
    expect(res.status).toBe(400);
  });

  it('S7: POST / → 404', async () => {
    const res = await raw('POST', '/');
    expect(res.status).toBe(404);
  });

  it('S8: HEAD /assets/app-abc.js → headers like GET, empty body', async () => {
    const res = await raw('HEAD', '/assets/app-abc.js');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('text/javascript; charset=utf-8');
    expect(res.headers['cache-control']).toBe('public, max-age=31536000, immutable');
    expect(res.headers['content-length']).toBe(String(Buffer.byteLength(APP_JS)));
    expect(res.body).toBe('');
  });

  it('S9: Socket.IO still works alongside static files', async () => {
    const socket: Socket<ServerToClientEvents, ClientToServerEvents> = ioc(
      `http://127.0.0.1:${server.port}`,
      { forceNew: true, reconnection: false },
    );
    try {
      const hello = await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('server:hello timeout')), 2000);
        socket.once('server:hello', (payload) => {
          clearTimeout(timer);
          resolve(payload);
        });
      });
      expect(hello).toMatchObject({ protocolVersion: expect.any(Number) });
    } finally {
      socket.disconnect();
    }
  });

  it('healthz is served before static files', async () => {
    const res = await raw('GET', '/healthz');
    expect(res.status).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ status: 'ok' });
  });
});
