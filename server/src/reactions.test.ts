import { beforeEach, describe, expect, it } from 'vitest';
import type { RoomReactionPayload, RoomStatePayload } from '@domino/shared';
import {
  createPlayingRoom,
  delay,
  emitAck,
  emitRaw,
  emitRawAck,
  expectNoState,
  nextState,
  recordStates,
  useTestServer,
  WAIT_MS,
  type Room2,
  type TestSocket,
} from './test-helpers';

const SEED = 42; // первый ход у места 1
const MAX_MOVES = 100;

/**
 * Часы сервера: реальное время, пока тест их не «заморозит» (`freeze`), затем — ручные.
 * Так кулдаун (2 с) проверяется точно и без ожидания.
 */
let frozen: number | null = null;
const now = () => frozen ?? Date.now();
function freeze(): void {
  frozen = Date.now();
}
function tick(ms: number): void {
  frozen! += ms;
}

function nextReaction(socket: TestSocket): Promise<RoomReactionPayload> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off('room:reaction', listener);
      reject(new Error('room:reaction timeout'));
    }, WAIT_MS);
    const listener = (payload: RoomReactionPayload) => {
      clearTimeout(timer);
      socket.off('room:reaction', listener);
      resolve(payload);
    };
    socket.on('room:reaction', listener);
  });
}

function recordReactions(socket: TestSocket): RoomReactionPayload[] {
  const received: RoomReactionPayload[] = [];
  socket.on('room:reaction', (r) => received.push(r));
  return received;
}

async function expectNoReaction(socket: TestSocket, ms = 200): Promise<void> {
  const received = recordReactions(socket);
  await delay(ms);
  socket.off('room:reaction');
  expect(received).toEqual([]);
}

/** Доигрывает раунд первым допустимым ходом; возвращает последние room:state. */
async function playRound(room: Room2): Promise<[RoomStatePayload, RoomStatePayload]> {
  const sockets: [TestSocket, TestSocket] = [room.a, room.b];
  let states = room.start;
  for (let moves = 0; states[0].phase !== 'finished'; moves++) {
    expect(moves).toBeLessThan(MAX_MOVES);
    const current = states[0].game!.currentPlayer as 0 | 1;
    const move = states[current].game!.legalMoves[0]!;
    const next = Promise.all([nextState(room.a), nextState(room.b)]);
    expect(await emitAck(sockets[current], 'game:move', { move })).toEqual({ ok: true });
    states = await next;
  }
  return states;
}

beforeEach(() => {
  frozen = null;
});

describe('reactions over sockets (spec-12)', () => {
  const ctx = useTestServer({ roundSeed: () => SEED, reconnectTimeoutMs: 2000, now });

  it('RX6a: accepted reaction reaches both players; ack comes before the echo', async () => {
    const { a, b } = await createPlayingRoom(ctx);
    const log: string[] = [];
    a.on('room:reaction', () => log.push('event'));
    const atA = nextReaction(a);
    const atB = nextReaction(b);
    const noState = Promise.all([expectNoState(a), expectNoState(b)]); // RX8
    a.emit('game:react', { reactionId: 'good_game' }, (res) => {
      expect(res).toEqual({ ok: true });
      log.push('ack');
    });
    const expected = { seat: 0, reactionId: 'good_game', seq: expect.any(Number) };
    expect(await atA).toEqual(expected);
    expect(await atB).toEqual(expected);
    expect(log).toEqual(['ack', 'event']);
    await noState;
  });

  it('RX3a: an arbitrary string is rejected and not delivered; cooldown untouched', async () => {
    const { a, b } = await createPlayingRoom(ctx);
    const received = recordReactions(b);
    for (const reactionId of ['привет', '👍', 'a'.repeat(10_000)]) {
      expect(await emitRawAck(a, 'game:react', { reactionId })).toEqual({
        ok: false,
        error: 'UNKNOWN_REACTION',
      });
    }
    await delay(200);
    expect(received).toEqual([]);
    expect(await emitAck(a, 'game:react', { reactionId: 'fish' })).toEqual({ ok: true });
  });

  it('RX3b: non-string reactionId → UNKNOWN_REACTION', async () => {
    const { a } = await createPlayingRoom(ctx);
    for (const payload of [{ reactionId: 42 }, { reactionId: null }, {}]) {
      expect(await emitRawAck(a, 'game:react', payload)).toEqual({
        ok: false,
        error: 'UNKNOWN_REACTION',
      });
    }
  });

  it('RX3c: payload is not an object → INVALID_PAYLOAD', async () => {
    const { a } = await createPlayingRoom(ctx);
    for (const payload of ['fish', null, []]) {
      expect(await emitRawAck(a, 'game:react', payload)).toEqual({
        ok: false,
        error: 'INVALID_PAYLOAD',
      });
    }
  });

  it('RX3d: extra fields are dropped — only { seat, reactionId, seq } is relayed', async () => {
    const { a, b } = await createPlayingRoom(ctx);
    const atB = nextReaction(b);
    expect(await emitRawAck(a, 'game:react', { reactionId: 'fish', text: 'мат' })).toEqual({
      ok: true,
    });
    const payload = await atB;
    expect(Object.keys(payload).sort()).toEqual(['reactionId', 'seat', 'seq']);
    expect(payload).toMatchObject({ seat: 0, reactionId: 'fish' });
  });

  it('RX3e: game:react without ack is ignored', async () => {
    const { a, b } = await createPlayingRoom(ctx);
    emitRaw(a, 'game:react', { reactionId: 'fish' });
    await expectNoReaction(b);
    expect(await emitAck(a, 'game:react', { reactionId: 'fish' })).toEqual({ ok: true });
  });

  it('RX2a/RX2b: waiting → GAME_NOT_STARTED, no room → NOT_IN_ROOM', async () => {
    const a = await ctx.connectClient();
    expect(await emitAck(a, 'game:react', { reactionId: 'thumbs_up' })).toEqual({
      ok: false,
      error: 'NOT_IN_ROOM',
    });
    await emitAck(a, 'room:create', { name: 'A' });
    expect(await emitAck(a, 'game:react', { reactionId: 'thumbs_up' })).toEqual({
      ok: false,
      error: 'GAME_NOT_STARTED',
    });
  });

  it('RX2d: allowed when it is not your turn', async () => {
    const room = await createPlayingRoom(ctx);
    expect(room.start[0].game!.currentPlayer).toBe(1);
    const atB = nextReaction(room.b);
    expect(await emitAck(room.a, 'game:react', { reactionId: 'hurry' })).toEqual({ ok: true });
    expect(await atB).toMatchObject({ seat: 0, reactionId: 'hurry' });
  });

  it('RX4a/RX4b/RX5a: 1999 ms → TOO_FREQUENT (unknown id still UNKNOWN_REACTION), 2000 ms → ok', async () => {
    const { a, b } = await createPlayingRoom(ctx);
    const received = recordReactions(b);
    freeze();
    expect(await emitAck(a, 'game:react', { reactionId: 'wow' })).toEqual({ ok: true });
    tick(1999);
    expect(await emitAck(a, 'game:react', { reactionId: 'wow' })).toEqual({
      ok: false,
      error: 'TOO_FREQUENT',
    });
    expect(await emitRawAck(a, 'game:react', { reactionId: 'привет' })).toEqual({
      ok: false,
      error: 'UNKNOWN_REACTION',
    });
    await delay(100);
    expect(received.map((r) => r.reactionId)).toEqual(['wow']);
    tick(2000);
    expect(await emitAck(a, 'game:react', { reactionId: 'laugh' })).toEqual({ ok: true });
    await delay(100);
    expect(received.map((r) => r.reactionId)).toEqual(['wow', 'laugh']);
    expect(received[1]!.seq).toBeGreaterThan(received[0]!.seq); // RX7a
  });

  it('RX4c: cooldown is per player', async () => {
    const { a, b } = await createPlayingRoom(ctx);
    freeze();
    expect(await emitAck(a, 'game:react', { reactionId: 'party' })).toEqual({ ok: true });
    tick(100);
    expect(await emitAck(b, 'game:react', { reactionId: 'party' })).toEqual({ ok: true });
  });

  it('RX9a: disconnect + room:rejoin does not reset the cooldown', async () => {
    const room = await createPlayingRoom(ctx);
    freeze();
    expect(await emitAck(room.a, 'game:react', { reactionId: 'angry' })).toEqual({ ok: true });
    const paused = nextState(room.b);
    room.a.disconnect();
    await paused;
    tick(500);
    const a2 = await ctx.connectClient();
    expect(
      await emitAck(a2, 'room:rejoin', { roomId: room.roomId, playerToken: room.tokens[0] }),
    ).toMatchObject({ ok: true });
    tick(100);
    expect(await emitAck(a2, 'game:react', { reactionId: 'angry' })).toEqual({
      ok: false,
      error: 'TOO_FREQUENT',
    });
  });

  it('RX6b: a disconnected player does not get the reaction, not even after rejoin', async () => {
    const room = await createPlayingRoom(ctx);
    const paused = nextState(room.a);
    room.b.disconnect();
    await paused;
    const atA = nextReaction(room.a);
    expect(await emitAck(room.a, 'game:react', { reactionId: 'thumbs_up' })).toEqual({
      ok: true,
    });
    expect(await atA).toMatchObject({ seat: 0, reactionId: 'thumbs_up' });

    const b2 = await ctx.connectClient();
    const received = recordReactions(b2);
    expect(
      await emitAck(b2, 'room:rejoin', { roomId: room.roomId, playerToken: room.tokens[1] }),
    ).toMatchObject({ ok: true });
    await delay(200);
    expect(received).toEqual([]);
  });

  it('RX8a: a reaction during a timed turn sends no room:state and does not reset the timer', async () => {
    const room = await createPlayingRoom(ctx);
    const full = room.start[1].turnTimer!.remainingMs;
    expect(room.start[1].turnTimer!.seat).toBe(1);
    await delay(150);
    const states = recordStates(room.a);
    expect(await emitAck(room.b, 'game:react', { reactionId: 'hurry' })).toEqual({ ok: true });
    await delay(100);
    expect(states).toEqual([]);
    // Следующий room:state (по отключению B) — таймер на паузе с остатком, а не с полным лимитом.
    const next = nextState(room.a);
    room.b.disconnect();
    const state = await next;
    expect(state.turnTimer!.paused).toBe(true);
    expect(state.turnTimer!.remainingMs).toBeLessThanOrEqual(full - 150);
    expect(state.match!.ready).toEqual([false, false]);
  });
});

describe('reactions on the summary screen (spec-12 RX2c)', () => {
  const ctx = useTestServer({ roundSeed: () => SEED, matchTarget: 1, now });

  it('RX2c: reactions work after the round and the match are over', async () => {
    const room = await createPlayingRoom(ctx);
    const [finished] = await playRound(room);
    expect(finished.phase).toBe('finished');
    expect(finished.match!.winner).not.toBeNull();
    const atA = nextReaction(room.a);
    expect(await emitAck(room.b, 'game:react', { reactionId: 'good_game' })).toEqual({
      ok: true,
    });
    expect(await atA).toMatchObject({ seat: 1, reactionId: 'good_game' });
  });
});
