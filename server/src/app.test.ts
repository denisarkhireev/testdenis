import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { io as ioc, type Socket } from 'socket.io-client';
import {
  PROTOCOL_VERSION,
  type ClientToServerEvents,
  type ServerHelloPayload,
  type ServerToClientEvents,
} from '@domino/shared';
import { startServer, type RunningServer } from './app';

type TestSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

let server: RunningServer | undefined;
let clients: TestSocket[] = [];

const url = () => `http://localhost:${server!.port}`;

function connectClient(opts: { reconnection?: boolean } = {}): TestSocket {
  const socket: TestSocket = ioc(url(), {
    transports: ['websocket'],
    forceNew: true,
    reconnection: opts.reconnection ?? false,
  });
  clients.push(socket);
  return socket;
}

function waitForHello(socket: TestSocket, timeoutMs = 2000): Promise<ServerHelloPayload> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('server:hello timeout')), timeoutMs);
    socket.once('server:hello', (payload) => {
      clearTimeout(timer);
      resolve(payload);
    });
  });
}

beforeEach(async () => {
  vi.spyOn(console, 'info').mockImplementation(() => {});
  server = await startServer({ port: 0, host: '127.0.0.1' });
});

afterEach(async () => {
  for (const c of clients) c.disconnect();
  clients = [];
  if (server) await server.close();
  server = undefined;
  vi.restoreAllMocks();
});

describe('startServer', () => {
  it('I1: sends server:hello with protocol version and ISO time on connect', async () => {
    const hello = await waitForHello(connectClient());
    expect(hello.protocolVersion).toBe(PROTOCOL_VERSION);
    expect(Number.isNaN(Date.parse(hello.serverTime))).toBe(false);
  });

  it('I2: each of two simultaneous clients gets its own server:hello', async () => {
    const a = connectClient();
    const b = connectClient();
    const [helloA, helloB] = await Promise.all([waitForHello(a), waitForHello(b)]);
    expect(helloA.protocolVersion).toBe(PROTOCOL_VERSION);
    expect(helloB.protocolVersion).toBe(PROTOCOL_VERSION);
    expect(a.id).not.toBe(b.id);
  });

  it('I3: server:hello is sent again after reconnect', async () => {
    const socket = connectClient();
    await waitForHello(socket);
    socket.disconnect();
    const second = waitForHello(socket);
    socket.connect();
    await expect(second).resolves.toMatchObject({ protocolVersion: PROTOCOL_VERSION });
  });

  it('I4: GET /health returns 200 {status:"ok"}', async () => {
    const res = await fetch(`${url()}/health`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('application/json');
    expect(await res.json()).toEqual({ status: 'ok' });
  });

  it('I5: unknown path returns 404', async () => {
    const res = await fetch(`${url()}/unknown`);
    expect(res.status).toBe(404);
    await res.body?.cancel();
  });

  it('I6: close() resolves and the port stops accepting connections', async () => {
    const port = server!.port;
    await expect(server!.close()).resolves.toBeUndefined();
    server = undefined;
    await expect(fetch(`http://localhost:${port}/health`)).rejects.toThrow();
  });
});
