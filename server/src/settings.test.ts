import { describe, expect, it } from 'vitest';
import { io as ioc } from 'socket.io-client';
import type { ServerHelloPayload } from '@domino/shared';
import {
  emitAck,
  emitRawAck,
  expectNoState,
  nextState,
  useTestServer,
  WAIT_MS,
  type TestServer,
} from './test-helpers';

const SEED = 42;

function helloOf(ctx: TestServer): Promise<ServerHelloPayload> {
  const socket = ioc(`http://127.0.0.1:${ctx.server.port}`, {
    transports: ['websocket'],
    forceNew: true,
    reconnection: false,
  });
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('hello timeout')), WAIT_MS);
    socket.once('server:hello', (payload: ServerHelloPayload) => {
      clearTimeout(timer);
      socket.disconnect();
      resolve(payload);
    });
  });
}

describe('room settings over sockets (spec-14), default MATCH_TARGET', () => {
  const ctx = useTestServer({ roundSeed: () => SEED });

  it('SI-1: server:hello offers [51, 101, 151], default 101, hands [5, 6, 7]', async () => {
    const hello = await helloOf(ctx);
    expect(hello.matchTargetOptions).toEqual([51, 101, 151]);
    expect(hello.defaultMatchTarget).toBe(101);
    expect(hello.handSizeOptions).toEqual([5, 6, 7]);
  });

  it('SI-2: room:create with target 51 and hand 6 → both see the settings and hands of 6', async () => {
    const a = await ctx.connectClient();
    const b = await ctx.connectClient();
    const waiting = nextState(a);
    const created = await emitAck(a, 'room:create', { name: 'A', matchTarget: 51, handSize: 6 });
    if (!created.ok) throw new Error(created.error);
    expect(await waiting).toMatchObject({
      phase: 'waiting',
      match: null,
      matchTarget: 51,
      handSize: 6,
    });

    const startA = nextState(a, (s) => s.phase === 'playing');
    const startB = nextState(b);
    expect((await emitAck(b, 'room:join', { roomId: created.roomId, name: 'B' })).ok).toBe(true);
    for (const state of [await startA, await startB]) {
      expect(state).toMatchObject({ matchTarget: 51, handSize: 6, match: { target: 51 } });
      expect(state.game!.hand).toHaveLength(6);
      expect(state.game!.opponentHandCount).toBe(6);
      expect(state.game!.boneyardCount).toBe(16);
    }
  });

  it('SI-3: invalid matchTarget / handSize → INVALID_PAYLOAD, no room; a valid retry works', async () => {
    const a = await ctx.connectClient();
    const bad = [
      { name: 'A', matchTarget: 100 },
      { name: 'A', matchTarget: '101' },
      { name: 'A', matchTarget: null },
      { name: 'A', handSize: 8 },
      { name: 'A', handSize: 4 },
      { name: 'A', handSize: '5' },
      { name: 'A', handSize: 6.5 },
    ];
    for (const payload of bad) {
      expect(await emitRawAck(a, 'room:create', payload)).toEqual({
        ok: false,
        error: 'INVALID_PAYLOAD',
      });
    }
    const created = await emitAck(a, 'room:create', { name: 'A', matchTarget: 151, handSize: 5 });
    expect(created.ok).toBe(true);
  });

  it('SI-4: room:info returns settings without side effects; then the socket can join', async () => {
    const a = await ctx.connectClient();
    const b = await ctx.connectClient();
    const created = await emitAck(a, 'room:create', {
      name: 'A',
      matchTarget: 51,
      handSize: 5,
      turnSeconds: 30,
    });
    if (!created.ok) throw new Error(created.error);

    const noState = expectNoState(b);
    const info = await emitAck(b, 'room:info', { roomId: created.roomId.toLowerCase() });
    expect(info).toEqual({
      ok: true,
      roomId: created.roomId,
      settings: { matchTarget: 51, handSize: 5, turnSeconds: 30, variant: 'classic' },
    });
    await noState;
    expect(await emitAck(b, 'room:info', { roomId: 'ZZZZZZ' })).toEqual({
      ok: false,
      error: 'ROOM_NOT_FOUND',
    });
    expect(await emitRawAck(b, 'room:info', {})).toEqual({ ok: false, error: 'INVALID_PAYLOAD' });
    expect(await emitRawAck(b, 'room:info', null)).toEqual({ ok: false, error: 'INVALID_PAYLOAD' });

    const start = nextState(b);
    expect((await emitAck(b, 'room:join', { roomId: created.roomId, name: 'B' })).ok).toBe(true);
    expect((await start).game!.hand).toHaveLength(5);

    // Полная комната: настройки по-прежнему читаются.
    const c = await ctx.connectClient();
    expect(await emitAck(c, 'room:info', { roomId: created.roomId })).toMatchObject({
      ok: true,
      settings: { matchTarget: 51 },
    });
  });
});

describe('room settings over sockets (spec-14), MATCH_TARGET from env', () => {
  const ctx = useTestServer({ roundSeed: () => SEED, matchTarget: 30 });

  it('SI-1: the env target is added to the options and is the default', async () => {
    const hello = await helloOf(ctx);
    expect(hello.matchTargetOptions).toEqual([30, 51, 101, 151]);
    expect(hello.defaultMatchTarget).toBe(30);
  });
});

describe('room settings over sockets (spec-14), MATCH_TARGET = 20', () => {
  const ctx = useTestServer({ roundSeed: () => SEED, matchTarget: 20 });

  it('SI-5: room:create without settings → target 20, hand 7', async () => {
    const a = await ctx.connectClient();
    const b = await ctx.connectClient();
    const created = await emitAck(a, 'room:create', { name: 'A' });
    if (!created.ok) throw new Error(created.error);
    const start = nextState(b);
    await emitAck(b, 'room:join', { roomId: created.roomId, name: 'B' });
    const state = await start;
    expect(state).toMatchObject({ matchTarget: 20, handSize: 7, match: { target: 20 } });
    expect(state.game!.hand).toHaveLength(7);
    expect(state.game!.boneyardCount).toBe(14);
    expect(await emitAck(a, 'room:info', { roomId: created.roomId })).toMatchObject({
      settings: { matchTarget: 20, handSize: 7, turnSeconds: 60 },
    });
  });
});
