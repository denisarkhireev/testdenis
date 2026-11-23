import { describe, expect, it } from 'vitest';
import { io as ioc } from 'socket.io-client';
import type { RoomStatePayload, ServerHelloPayload } from '@domino/shared';
import {
  emitAck,
  emitRawAck,
  expectNoState,
  nextState,
  useTestServer,
  type TestServer,
  type TestSocket,
} from './test-helpers';

const SEED = 42; // G1: первый ход [5,5] у места 1

interface Pair {
  a: TestSocket;
  b: TestSocket;
  roomId: string;
  start: [RoomStatePayload, RoomStatePayload];
}

async function playingRoom(ctx: TestServer, turnSeconds?: number): Promise<Pair> {
  const a = await ctx.connectClient();
  const b = await ctx.connectClient();
  const created = await emitAck(a, 'room:create', {
    name: 'A',
    ...(turnSeconds === undefined ? {} : { turnSeconds }),
  });
  if (!created.ok) throw new Error(`create failed: ${created.error}`);
  const startA = nextState(a, (s) => s.phase !== 'waiting');
  const startB = nextState(b);
  const joined = await emitAck(b, 'room:join', { roomId: created.roomId, name: 'B' });
  if (!joined.ok) throw new Error(`join failed: ${joined.error}`);
  return { a, b, roomId: created.roomId, start: [await startA, await startB] };
}

function helloOf(ctx: TestServer): Promise<ServerHelloPayload> {
  const socket = ioc(`http://127.0.0.1:${ctx.server.port}`, {
    transports: ['websocket'],
    forceNew: true,
    reconnection: false,
  });
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('hello timeout')), 2000);
    socket.once('server:hello', (payload: ServerHelloPayload) => {
      clearTimeout(timer);
      socket.disconnect();
      resolve(payload);
    });
  });
}

describe('turn timer over sockets (spec-11), default options', () => {
  const ctx = useTestServer({ roundSeed: () => SEED });

  it('T1a/T2a: no turnSeconds → 60 for both, timer of currentPlayer runs', async () => {
    const { start } = await playingRoom(ctx);
    for (const state of start) {
      expect(state.turnSeconds).toBe(60);
      expect(state.turnTimer).toMatchObject({ seat: 1, paused: false });
      expect(state.turnTimer!.remainingMs).toBeGreaterThan(59_000);
      expect(state.turnTimer!.remainingMs).toBeLessThanOrEqual(60_000);
    }
  });

  it('T1b: 0/30/60 accepted; 45, "60", -1, 3 → INVALID_PAYLOAD', async () => {
    for (const turnSeconds of [0, 30, 60]) {
      const socket = await ctx.connectClient();
      expect(await emitAck(socket, 'room:create', { name: 'A', turnSeconds })).toMatchObject({
        ok: true,
      });
    }
    const socket = await ctx.connectClient();
    for (const turnSeconds of [45, '60', -1, 3, 2.5]) {
      expect(await emitRawAck(socket, 'room:create', { name: 'A', turnSeconds })).toEqual({
        ok: false,
        error: 'INVALID_PAYLOAD',
      });
    }
  });

  it('T3a: turnSeconds 0 → turnTimer null for both', async () => {
    const { start } = await playingRoom(ctx, 0);
    for (const state of start) expect(state).toMatchObject({ turnSeconds: 0, turnTimer: null });
  });

  it('T7a: a disconnect pauses the timer for the other player', async () => {
    const { a, b } = await playingRoom(ctx);
    const paused = nextState(a);
    b.disconnect();
    expect((await paused).turnTimer).toMatchObject({ seat: 1, paused: true });
  });
});

describe('turn timer over sockets (spec-11), TURN_TIMER_TEST_SECONDS = 1', () => {
  const ctx = useTestServer({ roundSeed: () => SEED, turnTimerTestSeconds: 1 });

  it('T1c: the test value is offered in server:hello and accepted', async () => {
    expect((await helloOf(ctx)).turnSecondsOptions).toEqual([0, 1, 30, 60]);
    const { start } = await playingRoom(ctx, 1);
    expect(start[0].turnSeconds).toBe(1);
  });

  it('T4/T6/T8b: idle players → the server moves for them; a late manual move is NOT_YOUR_TURN', async () => {
    const { a, b, start } = await playingRoom(ctx, 1);
    expect(start[1].game!.currentPlayer).toBe(1);

    // Авто-ход за B: обязательный первый ход [5,5], один room:state каждому.
    const [firstA, firstB] = await Promise.all([nextState(a), nextState(b)]);
    expect(firstA.game!.board.map((p) => p.tile)).toEqual([[5, 5]]);
    expect(firstB.game!.currentPlayer).toBe(0);
    expect(firstA.turnTimer).toMatchObject({ seat: 0, paused: false });
    expect(firstA.turnTimer!.remainingMs).toBeGreaterThan(900);

    expect(await emitAck(b, 'game:move', { move: { type: 'draw' } })).toEqual({
      ok: false,
      error: 'NOT_YOUR_TURN',
    });

    // Авто-ход за A: самая тяжёлая из подходящих к 5 — [3,5].
    const secondA = await nextState(a);
    expect(secondA.game!.board.map((p) => p.tile)).toContainEqual([3, 5]);
    expect(secondA.game!.hand).not.toContainEqual([3, 5]);
    expect(secondA.game!.currentPlayer).toBe(1);
  });

  it('T3a: turnSeconds 0 with a short test option → nothing happens on its own', async () => {
    const { a } = await playingRoom(ctx, 0);
    await expectNoState(a, 1500);
  });
});
