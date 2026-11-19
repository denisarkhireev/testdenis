import { describe, expect, it } from 'vitest';
import {
  applyMove,
  createMatch,
  startRound,
  type PlayerIndex,
  type RoomStatePayload,
  type RoundState,
} from '@domino/shared';
import {
  createPlayingRoom,
  emitAck,
  emitRawAck,
  expectNoState,
  nextState,
  useTestServer,
  type Room2,
  type TestServer,
  type TestSocket,
} from './test-helpers';

const SEED = 42;
const MAX_MOVES = 100;

type Pair = [RoomStatePayload, RoomStatePayload];

/**
 * Доигрывает раунд по legalMoves из room:state, параллельно ведя локальную копию (как G7).
 * Возвращает последние room:state обоих мест и локальное итоговое состояние.
 */
async function playRound(room: Room2): Promise<{ states: Pair; truth: RoundState }> {
  const sockets: [TestSocket, TestSocket] = [room.a, room.b];
  let truth = startRound({ seed: SEED });
  let states: Pair = room.start;
  for (let moves = 0; states[0].phase !== 'finished'; moves++) {
    expect(moves).toBeLessThan(MAX_MOVES);
    const current: PlayerIndex = states[0].game!.currentPlayer;
    const move = states[current].game!.legalMoves[0]!;
    const local = applyMove(truth, current, move);
    if (!local.ok) throw new Error(`local simulation rejected move: ${local.error}`);
    truth = local.state;
    const next = Promise.all([nextState(room.a), nextState(room.b)]);
    expect(await emitAck(sockets[current], 'game:move', { move })).toEqual({ ok: true });
    states = await next;
  }
  return { states, truth };
}

async function finishedRoom(ctx: TestServer) {
  const room = await createPlayingRoom(ctx);
  const { states, truth } = await playRound(room);
  return { ...room, finished: states, truth };
}

describe('match over sockets', () => {
  const ctx = useTestServer({ roundSeed: () => SEED, reconnectGraceMs: 300 });

  it('N1: room:join starts a match 0:0; the creator has match null while waiting', async () => {
    const a = await ctx.connectClient();
    const waiting = nextState(a);
    await emitAck(a, 'room:create', { name: 'A' });
    expect((await waiting).match).toBeNull();

    const { start } = await createPlayingRoom(ctx);
    for (const s of start) {
      expect(s.match).toEqual({ ...createMatch(), ready: [false, false] });
      expect(s.game!.opponentHand).toBeNull();
    }
  });

  it('N2: a finished round is scored and both hands are revealed', async () => {
    const { finished, truth } = await finishedRoom(ctx);
    const result = truth.result!;
    expect(result.winner).not.toBeNull();
    for (const s of finished) {
      const opp = s.you === 0 ? 1 : 0;
      expect(s.phase).toBe('finished');
      expect(s.game!.result).toEqual(result);
      expect(s.game!.opponentHand).toEqual(truth.hands[opp]);
      expect(s.match!.scores[result.winner!]).toBe(result.points);
      expect(s.match!.scores[result.winner === 0 ? 1 : 0]).toBe(0);
      expect(s.match!.rounds).toEqual([result]);
      expect(s.match!.ready).toEqual([false, false]);
    }
  });

  it('N3: game:ready during the round → ROUND_NOT_FINISHED, no room:state', async () => {
    const { a, b } = await createPlayingRoom(ctx);
    const quiet = Promise.all([expectNoState(a), expectNoState(b)]);
    expect(await emitAck(a, 'game:ready', {})).toEqual({
      ok: false,
      error: 'ROUND_NOT_FINISHED',
    });
    await quiet;
  });

  it('N4: game:ready before start / outside a room / bad payload', async () => {
    const a = await ctx.connectClient();
    await emitAck(a, 'room:create', { name: 'A' });
    expect(await emitAck(a, 'game:ready', {})).toEqual({ ok: false, error: 'GAME_NOT_STARTED' });
    const c = await ctx.connectClient();
    expect(await emitAck(c, 'game:ready', {})).toEqual({ ok: false, error: 'NOT_IN_ROOM' });
    expect(await emitRawAck(a, 'game:ready', null)).toEqual({
      ok: false,
      error: 'INVALID_PAYLOAD',
    });
    expect(await emitRawAck(a, 'game:ready', 'x')).toEqual({
      ok: false,
      error: 'INVALID_PAYLOAD',
    });
  });

  it('N5–N7: ready one by one → next round with the score kept; a repeat is silent', async () => {
    const { a, b, finished } = await finishedRoom(ctx);
    const scores = finished[0].match!.scores;

    // N5
    let next = Promise.all([nextState(a), nextState(b)]);
    expect(await emitAck(a, 'game:ready', {})).toEqual({ ok: true });
    for (const s of await next) {
      expect(s.phase).toBe('finished');
      expect(s.match!.ready).toEqual([true, false]);
    }

    // N6
    const quiet = Promise.all([expectNoState(a), expectNoState(b)]);
    expect(await emitAck(a, 'game:ready', { extra: 1 } as never)).toEqual({ ok: true });
    await quiet;

    // N7
    next = Promise.all([nextState(a), nextState(b)]);
    expect(await emitAck(b, 'game:ready', {})).toEqual({ ok: true });
    for (const s of await next) {
      expect(s.phase).toBe('playing');
      expect(s.match).toMatchObject({
        roundNumber: 2,
        ready: [false, false],
        scores,
        winner: null,
      });
      expect(s.match!.rounds).toHaveLength(1);
      expect(s.game!.board).toEqual([]);
      expect(s.game!.hand).toHaveLength(7);
      expect(s.game!.opponentHandCount).toBe(7);
      expect(s.game!.boneyardCount).toBe(14);
      expect(s.game!.opponentHand).toBeNull();
      expect(s.game!.result).toBeNull();
    }
  });

  it('N9: readiness survives disconnect + room:rejoin', async () => {
    const room = await finishedRoom(ctx);
    const { b, roomId, tokens } = room;
    let next = Promise.all([nextState(room.a), nextState(b)]);
    await emitAck(room.a, 'game:ready', {});
    await next;

    const offline = nextState(b, (s) => !s.players[0]!.connected);
    room.a.disconnect();
    await offline;

    const a2 = await ctx.connectClient();
    const back = nextState(a2);
    expect(await emitAck(a2, 'room:rejoin', { roomId, playerToken: tokens[0] })).toMatchObject({
      ok: true,
      seat: 0,
    });
    const restored = await back;
    expect(restored.phase).toBe('finished');
    expect(restored.match!.ready).toEqual([true, false]);

    const playing = (s: RoomStatePayload) => s.phase === 'playing';
    next = Promise.all([nextState(a2, playing), nextState(b, playing)]);
    expect(await emitAck(b, 'game:ready', {})).toEqual({ ok: true });
    for (const s of await next) {
      expect(s.phase).toBe('playing');
      expect(s.match!.roundNumber).toBe(2);
    }
  });
});

describe('match to a low target', () => {
  const ctx = useTestServer({ roundSeed: () => SEED, reconnectGraceMs: 300, matchTarget: 1 });

  it('N8: reaching the target ends the match; both ready → rematch 0:0', async () => {
    const { a, b, finished, truth } = await finishedRoom(ctx);
    for (const s of finished) {
      expect(s.match!.target).toBe(1);
      expect(s.match!.winner).toBe(truth.result!.winner);
    }

    // ход после конца раунда по-прежнему ROUND_FINISHED
    expect(await emitAck(a, 'game:move', { move: { type: 'pass' } })).toEqual({
      ok: false,
      error: 'ROUND_FINISHED',
    });

    let next = Promise.all([nextState(a), nextState(b)]);
    await emitAck(b, 'game:ready', {});
    await next;
    next = Promise.all([nextState(a), nextState(b)]);
    await emitAck(a, 'game:ready', {});
    for (const s of await next) {
      expect(s.phase).toBe('playing');
      expect(s.roomId).toBe(finished[0].roomId);
      expect(s.match).toEqual({ ...createMatch(1), ready: [false, false] });
    }
  });
});
