import { describe, expect, it } from 'vitest';
import type { PlayerIndex, RoomClosedPayload, RoomStatePayload } from '@domino/shared';
import {
  createPlayingRoom,
  delay,
  emitAck,
  expectNoState,
  nextClosed,
  nextState,
  recordStates,
  useTestServer,
  type Room2,
  type TestSocket,
} from './test-helpers';

const SEED = 42;
const TIMEOUT = 300;
const MAX_MOVES = 100;

type Pair = [RoomStatePayload, RoomStatePayload];

/** Доигрывает раунд первым допустимым ходом из room:state; возвращает последние состояния. */
async function playRound(room: Room2): Promise<Pair> {
  const sockets: [TestSocket, TestSocket] = [room.a, room.b];
  let states: Pair = room.start;
  for (let moves = 0; states[0].phase !== 'finished'; moves++) {
    expect(moves).toBeLessThan(MAX_MOVES);
    const current: PlayerIndex = states[0].game!.currentPlayer;
    const move = states[current].game!.legalMoves[0]!;
    const next = Promise.all([nextState(room.a), nextState(room.b)]);
    expect(await emitAck(sockets[current], 'game:move', { move })).toEqual({ ok: true });
    states = await next;
  }
  return states;
}

/** Все room:closed, полученные сокетом с момента вызова. */
function recordClosed(socket: TestSocket): RoomClosedPayload[] {
  const received: RoomClosedPayload[] = [];
  socket.on('room:closed', (c) => received.push(c));
  return received;
}

/** X5/X6: после техпоражения комнаты нет ни для кого. */
async function expectRoomGone(room: Room2, c: TestSocket): Promise<void> {
  const { a, roomId, tokens } = room;
  expect(await emitAck(a, 'game:move', { move: { type: 'pass' } })).toEqual({
    ok: false,
    error: 'NOT_IN_ROOM',
  });
  expect(await emitAck(a, 'game:ready', {})).toEqual({ ok: false, error: 'NOT_IN_ROOM' });
  expect(await emitAck(c, 'room:rejoin', { roomId, playerToken: tokens[1] })).toEqual({
    ok: false,
    error: 'ROOM_NOT_FOUND',
  });
  // rejoin не привязал сокет к комнате — им же можно пробовать войти
  expect(await emitAck(c, 'room:join', { roomId, name: 'C' })).toEqual({
    ok: false,
    error: 'ROOM_NOT_FOUND',
  });
}

describe('reconnect timeout (spec-9)', () => {
  const ctx = useTestServer({ roundSeed: () => SEED, reconnectTimeoutMs: TIMEOUT });

  it('X5: B does not return while playing → A wins by forfeit, no room:closed', async () => {
    const room = await createPlayingRoom(ctx);
    const { a, b, start } = room;
    const closed = recordClosed(a);
    const offline = nextState(a);
    b.disconnect();
    const s1 = await offline;
    expect(s1.players[1]).toMatchObject({ connected: false });
    expect(s1.players[1]!.reconnectRemainingMs).toBeGreaterThan(0);
    expect(s1.players[1]!.reconnectRemainingMs).toBeLessThanOrEqual(TIMEOUT);

    const forfeit = await nextState(a, (s) => s.match?.forfeit != null);
    expect(forfeit.phase).toBe('finished');
    expect(forfeit.match).toMatchObject({
      winner: 0,
      forfeit: 1,
      scores: start[0].match!.scores,
      ready: [false, false],
    });
    expect(forfeit.players[1]).toMatchObject({ connected: false, reconnectRemainingMs: 0 });

    await delay(100);
    expect(closed).toEqual([]);
    await expectRoomGone(room, await ctx.connectClient());
    // A свободен и может создать новую игру.
    expect(await emitAck(a, 'room:create', { name: 'A' })).toMatchObject({ ok: true });
  });

  it('X6: B leaves on the round summary (match not over) → forfeit as well', async () => {
    const room = await createPlayingRoom(ctx);
    const finished = await playRound(room);
    expect(finished[0].match!.winner).toBeNull();
    const { a, b } = room;
    const closed = recordClosed(a);
    b.disconnect();
    const forfeit = await nextState(a, (s) => s.match?.forfeit != null);
    expect(forfeit.phase).toBe('finished');
    expect(forfeit.match).toMatchObject({
      winner: 0,
      forfeit: 1,
      scores: finished[0].match!.scores,
    });
    await delay(100);
    expect(closed).toEqual([]);
    await expectRoomGone(room, await ctx.connectClient());
  });

  it('X8: a token from another room → INVALID_TOKEN, no room:state, not bound', async () => {
    const r1 = await createPlayingRoom(ctx);
    const r2 = await createPlayingRoom(ctx);
    const c = await ctx.connectClient();
    const quiet = expectNoState(c, 200);
    expect(
      await emitAck(c, 'room:rejoin', { roomId: r1.roomId, playerToken: r2.tokens[0] }),
    ).toEqual({ ok: false, error: 'INVALID_TOKEN' });
    expect(
      await emitAck(c, 'room:rejoin', {
        roomId: r1.roomId,
        playerToken: '00000000-0000-4000-8000-000000000000',
      }),
    ).toEqual({ ok: false, error: 'INVALID_TOKEN' });
    await quiet;
    expect(await emitAck(c, 'game:move', { move: { type: 'draw' } })).toEqual({
      ok: false,
      error: 'NOT_IN_ROOM',
    });
  });

  it('X9: the seat-0 token gives only the seat-0 view', async () => {
    const { roomId, tokens, start } = await createPlayingRoom(ctx);
    const c = await ctx.connectClient();
    const state = nextState(c);
    expect(await emitAck(c, 'room:rejoin', { roomId, playerToken: tokens[0] })).toEqual({
      ok: true,
      roomId,
      seat: 0,
    });
    const s = await state;
    expect(s.you).toBe(0);
    expect(s.game!.hand).toEqual(start[0].game!.hand);
    expect(s.game!.hand).not.toEqual(start[1].game!.hand);
    expect(s.game!.opponentHandCount).toBe(start[1].game!.hand.length);
    expect(s.game!.opponentHand).toBeNull();
  });

  it('X10: tokens never appear in room:state / room:closed', async () => {
    const room = await createPlayingRoom(ctx);
    const payloads: unknown[] = [...room.start];
    const track = (s: TestSocket) => {
      s.on('room:state', (p) => payloads.push(p));
      s.on('room:closed', (p) => payloads.push(p));
    };
    track(room.a);
    track(room.b);
    await playRound(room);

    // отключение и возврат
    const offline = nextState(room.a);
    room.b.disconnect();
    await offline;
    const b2 = await ctx.connectClient();
    track(b2);
    const back = nextState(room.a);
    await emitAck(b2, 'room:rejoin', { roomId: room.roomId, playerToken: room.tokens[1] });
    await back;

    // вторая «вкладка» того же игрока: старая получает room:closed replaced
    const b3 = await ctx.connectClient();
    track(b3);
    const replaced = nextClosed(b2);
    await emitAck(b3, 'room:rejoin', { roomId: room.roomId, playerToken: room.tokens[1] });
    await replaced;

    expect(payloads.length).toBeGreaterThan(10);
    expect(payloads.some((p) => (p as { reason?: string }).reason === 'replaced')).toBe(true);
    for (const p of payloads) {
      const json = JSON.stringify(p);
      expect(json).not.toContain(room.tokens[0]);
      expect(json).not.toContain(room.tokens[1]);
    }
  });
});

describe('reconnect timeout after the match is over (spec-9 RC6)', () => {
  const ctx = useTestServer({ roundSeed: () => SEED, reconnectTimeoutMs: TIMEOUT, matchTarget: 1 });

  it('X7: match already won → A gets room:closed player_left, not a forfeit', async () => {
    const room = await createPlayingRoom(ctx);
    const finished = await playRound(room);
    expect(finished[0].match!.winner).not.toBeNull();
    const states = recordStates(room.a);
    const closed = nextClosed(room.a);
    room.b.disconnect();
    expect(await closed).toEqual({ roomId: room.roomId, reason: 'player_left' });
    expect(states.every((s) => s.match?.forfeit == null)).toBe(true);
  });
});
