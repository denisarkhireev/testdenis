import { describe, expect, it } from 'vitest';
import type { RoomStatePayload } from '@domino/shared';
import {
  delay,
  emitAck,
  emitRawAck,
  nextState,
  recordStates,
  WAIT_MS,
  useTestServer,
  type TestServer,
  type TestSocket,
} from './test-helpers';

const SEED = 42;
const MAX_ACTIONS = 100;

/** Создаёт комнату с ботом; все room:state человека копятся в `states` с самого начала. */
async function createBotRoom(ctx: TestServer) {
  const socket = await ctx.connectClient();
  const states = recordStates(socket);
  const first = nextState(socket);
  const ack = await emitAck(socket, 'room:create', { name: 'Аня', opponent: 'bot' });
  if (!ack.ok) throw new Error(`create failed: ${ack.error}`);
  return { socket, ack, states, first: await first };
}

const myTurnOrFinished = (s: RoomStatePayload) =>
  s.phase === 'finished' || s.game?.currentPlayer === s.you;

/** Ждёт room:state с индексом ≥ `from`, где ход человека или раунд окончен (бот ходит без задержки). */
async function waitMine(states: RoomStatePayload[], from: number): Promise<number> {
  const deadline = Date.now() + WAIT_MS;
  for (;;) {
    const last = states.length - 1;
    if (last >= from && myTurnOrFinished(states[last]!)) return last;
    if (Date.now() > deadline) throw new Error('no room:state with my turn');
    await delay(5);
  }
}

/** Ходит первым допустимым ходом на каждом своём ходу, пока раунд не окончен. */
async function playRoundVsBot(socket: TestSocket, states: RoomStatePayload[]) {
  let index = await waitMine(states, 0);
  for (let i = 0; states[index]!.phase !== 'finished'; i++) {
    expect(i).toBeLessThan(MAX_ACTIONS);
    const move = states[index]!.game!.legalMoves[0]!;
    const from = states.length;
    expect(await emitAck(socket, 'game:move', { move })).toEqual({ ok: true });
    index = await waitMine(states, from);
  }
  return states[index]!;
}

describe('bot over sockets (spec-15)', () => {
  const ctx = useTestServer({ roundSeed: () => SEED, botDelayMs: 0 });

  it('I1: room:create with opponent bot → playing at once, bot in seat 1', async () => {
    const { ack, first } = await createBotRoom(ctx);
    expect(ack).toMatchObject({ ok: true, seat: 0 });
    expect(first.phase).toBe('playing');
    expect(first.players).toEqual([
      { seat: 0, name: 'Аня', connected: true, reconnectRemainingMs: null, bot: false },
      { seat: 1, name: 'Бот', connected: true, reconnectRemainingMs: null, bot: true },
    ]);
    expect(first.match).toMatchObject({ scores: [0, 0], roundNumber: 1, ready: [false, false] });
  });

  it('I2: an unknown opponent → INVALID_PAYLOAD, no room', async () => {
    const socket = await ctx.connectClient();
    for (const opponent of ['robot', 'Bot', 1, null]) {
      expect(await emitRawAck(socket, 'room:create', { name: 'Аня', opponent })).toEqual({
        ok: false,
        error: 'INVALID_PAYLOAD',
      });
    }
    // Сокет не привязан к комнате — можно создать обычную.
    expect(await emitAck(socket, 'room:create', { name: 'Аня' })).toMatchObject({ ok: true });
  });

  it('I3: room:join into a bot room → ROOM_FULL', async () => {
    const { ack } = await createBotRoom(ctx);
    if (!ack.ok) throw new Error();
    const other = await ctx.connectClient();
    expect(await emitAck(other, 'room:join', { roomId: ack.roomId, name: 'Боб' })).toEqual({
      ok: false,
      error: 'ROOM_FULL',
    });
  });

  it('I4: the human plays a round to the end; bot ready; game:ready starts round 2', async () => {
    const { socket, states } = await createBotRoom(ctx);
    const finished = await playRoundVsBot(socket, states);
    expect(finished.phase).toBe('finished');
    expect(finished.game!.result).not.toBeNull();
    expect(finished.match!.ready).toEqual([false, true]);
    expect(finished.match!.rounds).toHaveLength(1);

    const next = nextState(socket);
    expect(await emitAck(socket, 'game:ready', {})).toEqual({ ok: true });
    const round2 = await next;
    expect(round2.phase).toBe('playing');
    expect(round2.match).toMatchObject({ roundNumber: 2, ready: [false, false] });
  });

  it('I6: a room without opponent stays a two-human room', async () => {
    const socket = await ctx.connectClient();
    const first = nextState(socket);
    expect(await emitAck(socket, 'room:create', { name: 'Аня' })).toMatchObject({ ok: true });
    const state = await first;
    expect(state.phase).toBe('waiting');
    expect(state.players).toEqual([
      { seat: 0, name: 'Аня', connected: true, reconnectRemainingMs: null, bot: false },
    ]);
  });
});

describe('bot over sockets: slow bot (spec-15)', () => {
  const ctx = useTestServer({ roundSeed: () => SEED, botDelayMs: 5000 });

  it("I5: game:move on the bot's turn → NOT_YOUR_TURN", async () => {
    const { socket, first } = await createBotRoom(ctx);
    let state = first;
    // Если первым ходит человек — ходим, пока ход не перейдёт к боту.
    for (let i = 0; state.game!.currentPlayer === 0; i++) {
      expect(i).toBeLessThan(MAX_ACTIONS);
      const next = nextState(socket);
      await emitAck(socket, 'game:move', { move: state.game!.legalMoves[0]! });
      state = await next;
    }
    expect(state.game!.currentPlayer).toBe(1);
    expect(await emitAck(socket, 'game:move', { move: { type: 'draw' } })).toEqual({
      ok: false,
      error: 'NOT_YOUR_TURN',
    });
  });
});
