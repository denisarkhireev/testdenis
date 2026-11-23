import { describe, expect, it } from 'vitest';
import type { PlayerIndex, RoomStatePayload } from '@domino/shared';
import {
  emitAck,
  emitRawAck,
  nextState,
  useTestServer,
  type TestServer,
  type TestSocket,
} from './test-helpers';

const SEED = 42;
const MAX_MOVES = 100;

type Pair = [RoomStatePayload, RoomStatePayload];

/** Комната на двоих с заданными полями room:create; возвращает первые playing-состояния. */
async function playingRoom(ctx: TestServer, extra: Record<string, unknown>) {
  const a = await ctx.connectClient();
  const b = await ctx.connectClient();
  const waiting = nextState(a);
  const created = await emitAck(a, 'room:create', { name: 'A', ...extra });
  if (!created.ok) throw new Error(`create failed: ${created.error}`);
  const waitingState = await waiting;
  const startA = nextState(a, (s) => s.phase !== 'waiting');
  const startB = nextState(b);
  const joined = await emitAck(b, 'room:join', { roomId: created.roomId, name: 'B' });
  if (!joined.ok) throw new Error(`join failed: ${joined.error}`);
  const start: Pair = [await startA, await startB];
  return { a, b, roomId: created.roomId, waitingState, start };
}

/** Доигрывает раунд первыми легальными ходами из room:state. */
async function playRound(a: TestSocket, b: TestSocket, start: Pair): Promise<Pair> {
  const sockets: [TestSocket, TestSocket] = [a, b];
  let states = start;
  for (let moves = 0; states[0].phase === 'playing'; moves++) {
    expect(moves).toBeLessThan(MAX_MOVES);
    const current: PlayerIndex = states[0].game!.currentPlayer;
    const move = states[current].game!.legalMoves[0]!;
    const next = Promise.all([nextState(a), nextState(b)]);
    expect(await emitAck(sockets[current], 'game:move', { move })).toEqual({ ok: true });
    states = await next;
  }
  return states;
}

describe('rules variant «Козёл» over sockets (spec-16)', () => {
  const ctx = useTestServer({ roundSeed: () => SEED });

  it("KI-1: room:create { variant: 'kozel' } → variant in waiting/playing room:state and room:info", async () => {
    const { waitingState, start, roomId } = await playingRoom(ctx, { variant: 'kozel' });
    expect(waitingState).toMatchObject({ phase: 'waiting', variant: 'kozel' });
    for (const s of start) expect(s).toMatchObject({ phase: 'playing', variant: 'kozel' });
    const c = await ctx.connectClient();
    expect(await emitAck(c, 'room:info', { roomId })).toEqual({
      ok: true,
      roomId,
      settings: { matchTarget: 101, handSize: 7, turnSeconds: 60, variant: 'kozel' },
    });
  });

  it('KI-2: invalid variant → INVALID_PAYLOAD, no room; a valid retry works', async () => {
    const a = await ctx.connectClient();
    for (const variant of ['goat', 'KOZEL', '', 1, null, {}]) {
      expect(await emitRawAck(a, 'room:create', { name: 'A', variant })).toEqual({
        ok: false,
        error: 'INVALID_PAYLOAD',
      });
    }
    const waiting = nextState(a);
    const created = await emitAck(a, 'room:create', { name: 'A', variant: 'kozel' });
    expect(created.ok).toBe(true);
    expect((await waiting).variant).toBe('kozel');
  });

  it('KI-3: a kozel round played via game:move → points to the scorer (round loser) for both', async () => {
    const { a, b, start } = await playingRoom(ctx, {
      variant: 'kozel',
      handSize: 5,
      turnSeconds: 0,
    });
    const finished = await playRound(a, b, start);
    const result = finished[0].game!.result!;
    expect(finished[1].game!.result).toEqual(result);
    expect(result).toHaveProperty('scorer');
    const expectedScorer = result.winner === null ? null : result.winner === 0 ? 1 : 0;
    expect(result.scorer).toBe(expectedScorer);
    for (const s of finished) {
      expect(s.variant).toBe('kozel');
      if (result.scorer == null) {
        expect(s.match!.scores).toEqual([0, 0]);
      } else {
        expect(result.points).toBe(result.handPoints[result.scorer]);
        expect(s.match!.scores[result.scorer]).toBe(result.points);
        expect(s.match!.scores[result.scorer === 0 ? 1 : 0]).toBe(0);
      }
    }

    // Следующий раунд — тот же вариант.
    const nextA = nextState(a, (s) => s.phase === 'playing');
    await emitAck(a, 'game:ready', {});
    await emitAck(b, 'game:ready', {});
    expect((await nextA).variant).toBe('kozel');
  });

  it("KI-4: room:create without variant → 'classic', result has no scorer (regression)", async () => {
    const { a, b, start, waitingState } = await playingRoom(ctx, { turnSeconds: 0 });
    expect(waitingState.variant).toBe('classic');
    const finished = await playRound(a, b, start);
    const result = finished[0].game!.result!;
    expect(finished[0].variant).toBe('classic');
    expect(result).not.toHaveProperty('scorer');
    if (result.winner !== null)
      expect(finished[0].match!.scores[result.winner]).toBe(result.points);
  });
});
