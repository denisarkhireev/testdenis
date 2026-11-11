import { describe, expect, it } from 'vitest';
import { startRound } from '@domino/shared';
import {
  createPlayingRoom,
  delay,
  emitAck,
  emitRaw,
  emitRawAck,
  expectNoState,
  nextClosed,
  nextState,
  useTestServer,
} from './test-helpers';

const SEED = 42;
const ROOM_ID = /^[A-HJ-NP-Z2-9]{6}$/;

describe('rooms', () => {
  const ctx = useTestServer({ roundSeed: () => SEED, reconnectGraceMs: 300 });

  it('R1: room:create → ack with seat 0 and token, then waiting room:state', async () => {
    const a = await ctx.connectClient();
    const state = nextState(a);
    const ack = await emitAck(a, 'room:create', { name: 'A' });
    expect(ack).toMatchObject({ ok: true, seat: 0 });
    if (!ack.ok) throw new Error();
    expect(ack.roomId).toMatch(ROOM_ID);
    expect(ack.playerToken).toEqual(expect.any(String));
    expect(await state).toEqual({
      roomId: ack.roomId,
      you: 0,
      phase: 'waiting',
      players: [{ seat: 0, name: 'A', connected: true }],
      game: null,
    });
  });

  it('R2: room:join by lowercase code → both get their own playing room:state', async () => {
    const a = await ctx.connectClient();
    const b = await ctx.connectClient();
    const created = await emitAck(a, 'room:create', { name: 'A' });
    if (!created.ok) throw new Error();
    const stateA = nextState(a, (s) => s.phase === 'playing');
    const stateB = nextState(b);
    const joined = await emitAck(b, 'room:join', {
      roomId: ` ${created.roomId.toLowerCase()} `,
      name: ' B ',
    });
    expect(joined).toMatchObject({ ok: true, seat: 1, roomId: created.roomId });
    if (!joined.ok) throw new Error();
    expect(joined.playerToken).not.toBe(created.playerToken);

    const players = [
      { seat: 0, name: 'A', connected: true },
      { seat: 1, name: 'B', connected: true },
    ];
    const [sa, sb] = await Promise.all([stateA, stateB]);
    expect(sa).toMatchObject({ roomId: created.roomId, you: 0, phase: 'playing', players });
    expect(sb).toMatchObject({ roomId: created.roomId, you: 1, phase: 'playing', players });

    // Критерий 3: 7/7/14, первым ходит владелец старшего дубля.
    const round = startRound({ seed: SEED });
    for (const s of [sa, sb]) {
      expect(s.game!.hand).toHaveLength(7);
      expect(s.game!.opponentHandCount).toBe(7);
      expect(s.game!.boneyardCount).toBe(14);
      expect(s.game!.currentPlayer).toBe(round.currentPlayer);
    }
  });

  it('R3: room:join into an unknown room → ROOM_NOT_FOUND', async () => {
    const b = await ctx.connectClient();
    expect(await emitAck(b, 'room:join', { roomId: 'ZZZZZZ', name: 'B' })).toEqual({
      ok: false,
      error: 'ROOM_NOT_FOUND',
    });
  });

  it('R4: third client → ROOM_FULL, players get no new room:state', async () => {
    const { a, b, roomId } = await createPlayingRoom(ctx);
    const c = await ctx.connectClient();
    const quietA = expectNoState(a);
    const quietB = expectNoState(b);
    expect(await emitAck(c, 'room:join', { roomId, name: 'C' })).toEqual({
      ok: false,
      error: 'ROOM_FULL',
    });
    await Promise.all([quietA, quietB]);
  });

  it('R5: a socket already in a room → ALREADY_IN_ROOM', async () => {
    const { a, b, roomId, tokens } = await createPlayingRoom(ctx);
    const already = { ok: false, error: 'ALREADY_IN_ROOM' };
    expect(await emitAck(a, 'room:create', { name: 'A' })).toEqual(already);
    expect(await emitAck(a, 'room:join', { roomId, name: 'A' })).toEqual(already);
    expect(await emitAck(b, 'room:rejoin', { roomId, playerToken: tokens[1] })).toEqual(already);
  });

  it('R6: invalid name / payload', async () => {
    const a = await ctx.connectClient();
    expect(await emitAck(a, 'room:create', { name: '' })).toEqual({
      ok: false,
      error: 'INVALID_NAME',
    });
    expect(await emitRawAck(a, 'room:create', null)).toEqual({
      ok: false,
      error: 'INVALID_PAYLOAD',
    });
    expect(await emitRawAck(a, 'room:join', { roomId: 1, name: 'A' })).toEqual({
      ok: false,
      error: 'INVALID_PAYLOAD',
    });
    expect(await emitRawAck(a, 'room:join', 'ABCDEF')).toEqual({
      ok: false,
      error: 'INVALID_PAYLOAD',
    });
    expect(await emitRawAck(a, 'room:rejoin', { roomId: 'ABCDEF' })).toEqual({
      ok: false,
      error: 'INVALID_PAYLOAD',
    });
    // Мусор не привязал сокет к комнате: создать комнату всё ещё можно.
    expect(await emitAck(a, 'room:create', { name: 'A' })).toMatchObject({ ok: true });
  });

  it('R7: two parallel rooms are isolated', async () => {
    const first = await createPlayingRoom(ctx);
    const second = await createPlayingRoom(ctx);
    expect(first.roomId).not.toBe(second.roomId);

    const mover = first.start[0].game!.currentPlayer === 0 ? first.a : first.b;
    const move = first.start[first.start[0].game!.currentPlayer]!.game!.legalMoves[0]!;
    const quiet = Promise.all([expectNoState(second.a), expectNoState(second.b)]);
    const updated = nextState(first.a);
    expect(await emitAck(mover, 'game:move', { move })).toEqual({ ok: true });
    expect((await updated).game!.board).toHaveLength(1);
    await quiet;
  });

  it('R8: an event without ack is ignored and the server keeps working', async () => {
    const a = await ctx.connectClient();
    emitRaw(a, 'room:create', { name: 'A' });
    emitRaw(a, 'game:move', null);
    const b = await ctx.connectClient();
    expect(await emitAck(b, 'room:create', { name: 'B' })).toMatchObject({ ok: true });
    // Сокет A не был привязан к комнате.
    expect(await emitAck(a, 'room:create', { name: 'A' })).toMatchObject({ ok: true });
  });
});

describe('disconnect and rejoin', () => {
  const GRACE = 300;
  const ctx = useTestServer({ roundSeed: () => SEED, reconnectGraceMs: GRACE });

  it('D1: opponent sees connected:false after disconnect', async () => {
    const { a, b } = await createPlayingRoom(ctx);
    const state = nextState(a);
    b.disconnect();
    const s = await state;
    expect(s.players[1]).toEqual({ seat: 1, name: 'B', connected: false });
    expect(s.phase).toBe('playing');
  });

  it('D2/D3: rejoin within grace restores the seat and shows moves made meanwhile', async () => {
    const room = await createPlayingRoom(ctx);
    const { a, b, roomId, tokens, start } = room;
    const handBefore = start[1].game!.hand;

    const disconnected = nextState(a);
    b.disconnect();
    await disconnected;

    // D3: при отключённом B ходит A, если его очередь; иначе ход B «ждёт».
    let boardAfter = 0;
    if (start[0].game!.currentPlayer === 0) {
      const move = start[0].game!.legalMoves[0]!;
      expect(await emitAck(a, 'game:move', { move })).toEqual({ ok: true });
      boardAfter = 1;
    }

    const b2 = await ctx.connectClient();
    const stateB = nextState(b2);
    const stateA = nextState(a);
    expect(await emitAck(b2, 'room:rejoin', { roomId, playerToken: tokens[1] })).toEqual({
      ok: true,
      roomId,
      seat: 1,
    });
    const [sa, sb] = await Promise.all([stateA, stateB]);
    expect(sa.players[1]!.connected).toBe(true);
    expect(sb.you).toBe(1);
    expect(sb.game!.hand).toEqual(handBefore);
    expect(sb.game!.board).toHaveLength(boardAfter);

    // Место снова принадлежит B: grace-таймер отменён.
    await delay(GRACE + 100);
    expect(await emitAck(a, 'room:create', { name: 'A' })).toEqual({
      ok: false,
      error: 'ALREADY_IN_ROOM',
    });
  });

  it('D3: rejoin works when it is the disconnected player who must move', async () => {
    const { a, b, roomId, tokens, start } = await createPlayingRoom(ctx);
    const disconnected = nextState(a);
    b.disconnect();
    await disconnected;
    const b2 = await ctx.connectClient();
    const stateB = nextState(b2);
    await emitAck(b2, 'room:rejoin', { roomId, playerToken: tokens[1] });
    const sb = await stateB;
    expect(sb.game!.legalMoves).toEqual(start[1].game!.legalMoves);
  });

  it('D4: rejoin with a wrong token or unknown room', async () => {
    const { roomId, tokens } = await createPlayingRoom(ctx);
    const c = await ctx.connectClient();
    expect(await emitAck(c, 'room:rejoin', { roomId, playerToken: 'nope' })).toEqual({
      ok: false,
      error: 'INVALID_TOKEN',
    });
    expect(await emitAck(c, 'room:rejoin', { roomId: 'ZZZZZZ', playerToken: tokens[0] })).toEqual({
      ok: false,
      error: 'ROOM_NOT_FOUND',
    });
  });

  it('D5: grace expiry closes the room for the remaining player', async () => {
    const { a, b, roomId, start } = await createPlayingRoom(ctx);
    const closed = nextClosed(a);
    b.disconnect();
    expect(await closed).toEqual({ roomId, reason: 'player_left' });

    const move = start[0].game!.legalMoves[0] ?? { type: 'pass' as const };
    expect(await emitAck(a, 'game:move', { move })).toEqual({ ok: false, error: 'NOT_IN_ROOM' });
    const c = await ctx.connectClient();
    expect(await emitAck(c, 'room:join', { roomId, name: 'C' })).toEqual({
      ok: false,
      error: 'ROOM_NOT_FOUND',
    });
  });

  it('D6: rejoin from a second tab replaces the first socket', async () => {
    const { a, b, roomId, tokens, start } = await createPlayingRoom(ctx);
    const b2 = await ctx.connectClient();
    const closed = nextClosed(b);
    const stateB2 = nextState(b2);
    expect(await emitAck(b2, 'room:rejoin', { roomId, playerToken: tokens[1] })).toMatchObject({
      ok: true,
      seat: 1,
    });
    expect(await closed).toEqual({ roomId, reason: 'replaced' });
    expect((await stateB2).game!.hand).toEqual(start[1].game!.hand);
    expect(b.connected).toBe(true);

    expect(await emitAck(b, 'game:move', { move: { type: 'pass' } })).toEqual({
      ok: false,
      error: 'NOT_IN_ROOM',
    });

    // Отключение старого сокета не трогает место.
    const quietA = expectNoState(a, GRACE + 100);
    b.disconnect();
    await quietA;

    // Второй сокет играет.
    const mover = start[0].game!.currentPlayer === 0 ? a : b2;
    const move = start[start[0].game!.currentPlayer]!.game!.legalMoves[0]!;
    expect(await emitAck(mover, 'game:move', { move })).toEqual({ ok: true });
  });

  it('D7: creator leaves a waiting room → room is removed after grace', async () => {
    const a = await ctx.connectClient();
    const created = await emitAck(a, 'room:create', { name: 'A' });
    if (!created.ok) throw new Error();
    a.disconnect();
    await delay(GRACE + 100);
    const b = await ctx.connectClient();
    expect(await emitAck(b, 'room:join', { roomId: created.roomId, name: 'B' })).toEqual({
      ok: false,
      error: 'ROOM_NOT_FOUND',
    });
  });
});

describe('server close', () => {
  const ctx = useTestServer({ roundSeed: () => SEED, reconnectGraceMs: 60_000 });

  it('D8: close() resolves at once with a disconnected player (grace 60 s)', async () => {
    const { a, b } = await createPlayingRoom(ctx);
    const disconnected = nextState(a);
    b.disconnect();
    await disconnected;
    const startedAt = Date.now();
    await ctx.stop();
    expect(Date.now() - startedAt).toBeLessThan(1000);
  });
});
