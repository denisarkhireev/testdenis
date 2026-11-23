import { describe, expect, it } from 'vitest';
import { tileKey, type RoomStatePayload } from '@domino/shared';
import {
  delay,
  emitAck,
  nextState,
  recordStates,
  useTestServer,
  type TestServer,
  type TestSocket,
} from './test-helpers';

const SEED = 42;
const TIMEOUT = 300;
const MAX_MOVES = 200;

interface TeamRoom {
  sockets: TestSocket[];
  roomId: string;
  tokens: string[];
  /** room:state каждого места сразу после старта раунда. */
  start: RoomStatePayload[];
}

/** A создаёт комнату 2×2, B, C, D входят по очереди; ждёт стартовые состояния всех четырёх. */
async function createTeamRoom(ctx: TestServer): Promise<TeamRoom> {
  const sockets = await Promise.all([0, 1, 2, 3].map(() => ctx.connectClient()));
  const [a] = sockets as [TestSocket];
  const created = await emitAck(a, 'room:create', { name: 'A', mode: '2x2' });
  if (!created.ok) throw new Error(`create failed: ${created.error}`);
  const tokens = [created.playerToken];
  const starts = sockets.map((s) => nextState(s, (st) => st.phase === 'playing'));
  for (const [i, name] of ['B', 'C', 'D'].entries()) {
    const joined = await emitAck(sockets[i + 1]!, 'room:join', { roomId: created.roomId, name });
    if (!joined.ok) throw new Error(`join failed: ${joined.error}`);
    tokens.push(joined.playerToken);
  }
  return { sockets, roomId: created.roomId, tokens, start: await Promise.all(starts) };
}

/** Один ход текущего места первым допустимым ходом; возвращает новые состояния всех 4. */
async function step(room: TeamRoom, states: RoomStatePayload[]): Promise<RoomStatePayload[]> {
  const current = states[0]!.game!.currentPlayer;
  const move = states[current]!.game!.legalMoves[0]!;
  const next = Promise.all(room.sockets.map((s) => nextState(s)));
  expect(await emitAck(room.sockets[current]!, 'game:move', { move })).toEqual({ ok: true });
  return next;
}

describe('2×2 over sockets (spec-17)', () => {
  const ctx = useTestServer({ roundSeed: () => SEED, reconnectTimeoutMs: TIMEOUT });

  it('I-Q1: валидация mode при room:create', async () => {
    const a = await ctx.connectClient();
    for (const bad of [
      { name: 'A', mode: '2x2', handSize: 6 },
      { name: 'A', mode: '2x2', opponent: 'bot' },
      { name: 'A', mode: '3x3' },
    ]) {
      expect(await emitAck(a, 'room:create', bad as never)).toEqual({
        ok: false,
        error: 'INVALID_PAYLOAD',
      });
    }
    const state = nextState(a);
    const created = await emitAck(a, 'room:create', { name: 'A', mode: '2x2', handSize: 7 });
    expect(created.ok).toBe(true);
    expect(await state).toMatchObject({ mode: '2x2', handSize: 7, phase: 'waiting' });
  });

  it('I-Q2: после каждого join все видят players 2, 3, 4; после 4-го — игра, только своя рука', async () => {
    const sockets = await Promise.all([0, 1, 2, 3].map(() => ctx.connectClient()));
    const created = await emitAck(sockets[0]!, 'room:create', { name: 'A', mode: '2x2' });
    if (!created.ok) throw new Error();
    const logs = sockets.map((s) => recordStates(s));
    for (const [i, name] of ['B', 'C', 'D'].entries()) {
      const joiner = sockets[i + 1]!;
      const waits = sockets.slice(0, i + 2).map((s) => nextState(s));
      const joined = await emitAck(joiner, 'room:join', { roomId: created.roomId, name });
      expect(joined.ok && joined.seat).toBe(i + 1);
      for (const s of await Promise.all(waits)) {
        expect(s.players).toHaveLength(i + 2);
        expect(s.phase).toBe(i < 2 ? 'waiting' : 'playing');
      }
    }
    const finals = logs.map((log) => log.at(-1)!);
    const hands = finals.map((s) => s.game!.hand);
    for (const [seat, s] of finals.entries()) {
      expect(s.you).toBe(seat);
      expect(s.mode).toBe('2x2');
      expect(s.game!.hand).toHaveLength(7);
      expect(s.game!.handCounts).toEqual([7, 7, 7, 7]);
      expect(s.game!.boneyardCount).toBe(0);
      expect(s.game!.hands).toBeNull();
      expect(s.match!.ready).toEqual([false, false, false, false]);
      const json = JSON.stringify({ ...s.game, hand: null, legalMoves: null });
      for (const [other, hand] of hands.entries()) {
        if (other === seat) continue;
        for (const t of hand) expect(json).not.toContain(JSON.stringify(t));
      }
    }
    expect(new Set(hands.flat().map(tileKey)).size).toBe(28);
  });

  it('I-Q3: 5-й сокет → ROOM_FULL; room:info → freeSeats 0', async () => {
    const room = await createTeamRoom(ctx);
    const e = await ctx.connectClient();
    expect(await emitAck(e, 'room:join', { roomId: room.roomId, name: 'E' })).toEqual({
      ok: false,
      error: 'ROOM_FULL',
    });
    expect(await emitAck(e, 'room:info', { roomId: room.roomId })).toMatchObject({
      ok: true,
      settings: { mode: '2x2', handSize: 7 },
      freeSeats: 0,
    });
  });

  it('I-Q4/I-Q5: ход по кругу, раунд до конца, командный итог; ready ждёт всех 4', async () => {
    const room = await createTeamRoom(ctx);
    let states = room.start;
    const current = states[0]!.game!.currentPlayer;
    const notMine = room.sockets[(current + 1) % 4]!;
    expect(await emitAck(notMine, 'game:move', { move: { type: 'pass' } })).toEqual({
      ok: false,
      error: 'NOT_YOUR_TURN',
    });
    for (let moves = 0; states[0]!.phase === 'playing'; moves++) {
      expect(moves).toBeLessThan(MAX_MOVES);
      const before = states[0]!.game!.currentPlayer;
      states = await step(room, states);
      if (states[0]!.phase === 'playing') {
        expect(states[0]!.game!.currentPlayer).toBe((before + 1) % 4);
      }
    }
    const result = states[0]!.game!.result!;
    expect(result.teamPoints).toBeDefined();
    for (const s of states) {
      expect(s.game!.result).toEqual(result);
      expect(s.game!.hands).toHaveLength(4);
      expect(s.match!.scores).toEqual(states[0]!.match!.scores);
    }
    if (result.winner !== null) expect(states[0]!.match!.scores[result.winner]).toBe(result.points);

    // I-Q5
    for (const seat of [0, 1, 2]) {
      const waits = room.sockets.map((s) => nextState(s));
      expect(await emitAck(room.sockets[seat]!, 'game:ready', {})).toEqual({ ok: true });
      states = await Promise.all(waits);
    }
    expect(states[0]!.match!.ready).toEqual([true, true, true, false]);
    expect(states[0]!.phase).toBe('finished');
    const waits = room.sockets.map((s) => nextState(s));
    expect(await emitAck(room.sockets[3]!, 'game:ready', {})).toEqual({ ok: true });
    states = await Promise.all(waits);
    const rematch = result.winner !== null && states[0]!.match!.rounds.length === 0;
    expect(states[0]!.match!.roundNumber).toBe(rematch ? 1 : 2);
    expect(states[0]!.phase).toBe('playing');
    for (const s of states) expect(s.game!.handCounts).toEqual([7, 7, 7, 7]);
  });

  it('I-Q6: реакция места 2 приходит всем четверым', async () => {
    const room = await createTeamRoom(ctx);
    const got = room.sockets.map(
      (s) => new Promise((resolve) => s.once('room:reaction', (r) => resolve(r))),
    );
    expect(await emitAck(room.sockets[2]!, 'game:react', { reactionId: 'thumbs_up' })).toEqual({
      ok: true,
    });
    for (const r of await Promise.all(got)) {
      expect(r).toMatchObject({ seat: 2, reactionId: 'thumbs_up' });
    }
  });

  it('I-Q7: отключение места 1 видят трое; rejoin по токену — то же место и рука', async () => {
    const room = await createTeamRoom(ctx);
    const others = [0, 2, 3].map((i) => room.sockets[i]!);
    const offline = others.map((s) => nextState(s, (st) => st.players[1]!.connected === false));
    room.sockets[1]!.disconnect();
    for (const s of await Promise.all(offline)) {
      expect(s.players[1]).toMatchObject({ connected: false });
      expect(s.players[1]!.reconnectRemainingMs).toBeGreaterThan(0);
    }
    const back = await ctx.connectClient();
    const own = nextState(back);
    const online = others.map((s) => nextState(s, (st) => st.players[1]!.connected));
    expect(
      await emitAck(back, 'room:rejoin', { roomId: room.roomId, playerToken: room.tokens[1]! }),
    ).toEqual({ ok: true, roomId: room.roomId, seat: 1 });
    const state = await own;
    expect(state.you).toBe(1);
    expect(state.game!.hand).toEqual(room.start[1]!.game!.hand);
    await Promise.all(online);
  });

  it('I-Q8: техпоражение — трое получают finished с forfeit/forfeitSeat, затем NOT_IN_ROOM', async () => {
    const room = await createTeamRoom(ctx);
    const others = [0, 1, 2].map((i) => room.sockets[i]!);
    const finals = others.map((s) => nextState(s, (st) => st.phase === 'finished'));
    room.sockets[3]!.disconnect();
    for (const s of await Promise.all(finals)) {
      expect(s.match).toMatchObject({ forfeit: 1, forfeitSeat: 3, winner: 0 });
    }
    await delay(20);
    expect(await emitAck(room.sockets[0]!, 'game:move', { move: { type: 'pass' } })).toEqual({
      ok: false,
      error: 'NOT_IN_ROOM',
    });
  });
});
