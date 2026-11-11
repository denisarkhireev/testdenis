import { describe, expect, it } from 'vitest';
import {
  applyMove,
  getLegalMoves,
  sameTile,
  startRound,
  tileKey,
  toPlayerView,
  type PlayerIndex,
  type RoomStatePayload,
  type RoundState,
  type Tile,
} from '@domino/shared';
import {
  createPlayingRoom,
  emitAck,
  emitRawAck,
  expectNoState,
  nextState,
  useTestServer,
  type TestSocket,
} from './test-helpers';

const SEED = 42;
const MAX_MOVES = 100;

const isPip = (v: unknown) => Number.isInteger(v) && (v as number) >= 0 && (v as number) <= 6;

/** Все массивы-кости [a, b] в payload (кроме handPoints — это суммы очков, не кость). */
function collectTiles(value: unknown, out: Tile[] = [], key = ''): Tile[] {
  if (Array.isArray(value)) {
    if (key !== 'handPoints' && value.length === 2 && isPip(value[0]) && isPip(value[1])) {
      out.push(value as unknown as Tile);
    }
    for (const item of value) collectTiles(item, out);
  } else if (typeof value === 'object' && value !== null) {
    for (const [k, v] of Object.entries(value)) collectTiles(v, out, k);
  }
  return out;
}

/** Раздел 5 spec-4: в payload игрока нет костей соперника/базара, seed, токенов, RoundState. */
function expectConfidential(payload: RoomStatePayload, truth: RoundState, tokens: string[]): void {
  const you = payload.you;
  const hidden = new Set(
    [...truth.hands[you === 0 ? 1 : 0], ...truth.boneyard].map((t) => tileKey(t)),
  );
  for (const tile of collectTiles(payload)) {
    expect(hidden.has(tileKey(tile)), `leaked tile ${tileKey(tile)}`).toBe(false);
  }
  const json = JSON.stringify(payload);
  for (const forbidden of ['"seed"', '"hands"', '"boneyard"', '"openingTile"', ...tokens]) {
    expect(json).not.toContain(forbidden);
  }
}

describe('game loop', () => {
  const ctx = useTestServer({ roundSeed: () => SEED, reconnectGraceMs: 300 });

  it('G1: initial hands and turn match a local startRound with the same seed', async () => {
    const { start } = await createPlayingRoom(ctx);
    const round = startRound({ seed: SEED });
    for (const s of start) {
      expect(s.game).toEqual(toPlayerView(round, s.you));
      expect(s.game!.hand).toEqual(round.hands[s.you]);
      expect(s.game!.currentPlayer).toBe(round.currentPlayer);
    }
    const mover = start[round.currentPlayer];
    const waiter = start[round.currentPlayer === 0 ? 1 : 0];
    expect(mover.game!.legalMoves).toEqual(getLegalMoves(round));
    expect(mover.game!.legalMoves).toHaveLength(1);
    expect(mover.game!.legalMoves[0]).toMatchObject({ type: 'play' });
    expect(waiter.game!.legalMoves).toEqual([]);
  });

  it('G2: a legal move is applied and the turn passes', async () => {
    const { a, b, start } = await createPlayingRoom(ctx);
    const current = start[0].game!.currentPlayer;
    const mover = current === 0 ? a : b;
    const updatedA = nextState(a);
    const updatedB = nextState(b);
    const ack = await emitAck(mover, 'game:move', { move: start[current].game!.legalMoves[0]! });
    expect(ack).toEqual({ ok: true });
    for (const s of await Promise.all([updatedA, updatedB])) {
      expect(s.game!.board).toHaveLength(1);
      expect(s.game!.currentPlayer).toBe(current === 0 ? 1 : 0);
    }
  });

  it('G3: move out of turn → NOT_YOUR_TURN and no room:state', async () => {
    const { a, b, start } = await createPlayingRoom(ctx);
    const current = start[0].game!.currentPlayer;
    const waiter = current === 0 ? b : a;
    const quiet = Promise.all([expectNoState(a), expectNoState(b)]);
    const move = start[current].game!.legalMoves[0]!;
    expect(await emitAck(waiter, 'game:move', { move })).toEqual({
      ok: false,
      error: 'NOT_YOUR_TURN',
    });
    await quiet;
  });

  it('G4: first move with a non-opening tile → MUST_PLAY_OPENING_TILE', async () => {
    const { a, b, start } = await createPlayingRoom(ctx);
    const current = start[0].game!.currentPlayer;
    const opening = start[current].game!.legalMoves[0]!;
    if (opening.type !== 'play') throw new Error('opening move must be a play');
    const other = start[current].game!.hand.find((t) => !sameTile(t, opening.tile))!;
    const ack = await emitAck(current === 0 ? a : b, 'game:move', {
      move: { type: 'play', tile: other, end: 'left' },
    });
    expect(ack).toEqual({ ok: false, error: 'MUST_PLAY_OPENING_TILE' });
  });

  it('G5: move before start → GAME_NOT_STARTED, outside a room → NOT_IN_ROOM', async () => {
    const a = await ctx.connectClient();
    await emitAck(a, 'room:create', { name: 'A' });
    expect(await emitAck(a, 'game:move', { move: { type: 'draw' } })).toEqual({
      ok: false,
      error: 'GAME_NOT_STARTED',
    });
    const c = await ctx.connectClient();
    expect(await emitAck(c, 'game:move', { move: { type: 'draw' } })).toEqual({
      ok: false,
      error: 'NOT_IN_ROOM',
    });
  });

  it('G6: malformed moves → INVALID_PAYLOAD, state unchanged', async () => {
    const { a, b, start } = await createPlayingRoom(ctx);
    const current = start[0].game!.currentPlayer;
    const mover: TestSocket = current === 0 ? a : b;
    const quiet = Promise.all([expectNoState(a), expectNoState(b)]);
    const invalid = { ok: false, error: 'INVALID_PAYLOAD' };
    expect(
      await emitRawAck(mover, 'game:move', { move: { type: 'play', tile: [9, 9], end: 'right' } }),
    ).toEqual(invalid);
    expect(await emitRawAck(mover, 'game:move', { move: 'x' })).toEqual(invalid);
    expect(await emitRawAck(mover, 'game:move', null)).toEqual(invalid);
    await quiet;
    // Состояние не изменилось: исходный ход всё ещё допустим.
    const move = start[current].game!.legalMoves[0]!;
    expect(await emitAck(mover, 'game:move', { move })).toEqual({ ok: true });
  });

  it('G7/G8: full round over sockets matches local simulation, no hidden info leaks', async () => {
    const { a, b, start, tokens } = await createPlayingRoom(ctx);
    const sockets: [TestSocket, TestSocket] = [a, b];
    let truth = startRound({ seed: SEED });
    let states: [RoomStatePayload, RoomStatePayload] = start;
    let moves = 0;

    const check = (pair: [RoomStatePayload, RoomStatePayload]) => {
      for (const p of [0, 1] as const) {
        expect(pair[p].you).toBe(p);
        expect(pair[p].game).toEqual(toPlayerView(truth, p));
        // Токен соперника не попадает в payload (свой, впрочем, тоже не нужен).
        expectConfidential(pair[p], truth, tokens);
      }
    };
    check(states);

    while (states[0].phase !== 'finished') {
      expect(moves).toBeLessThan(MAX_MOVES);
      const current: PlayerIndex = states[0].game!.currentPlayer;
      const move = states[current].game!.legalMoves[0]!;
      const local = applyMove(truth, current, move);
      if (!local.ok) throw new Error(`local simulation rejected move: ${local.error}`);
      truth = local.state;

      const next = Promise.all([nextState(a), nextState(b)]);
      expect(await emitAck(sockets[current], 'game:move', { move })).toEqual({ ok: true });
      states = await next;
      moves++;
      check(states);
    }

    expect(states[1].phase).toBe('finished');
    expect(states[0].game!.result).not.toBeNull();
    expect(states[0].game!.result).toEqual(states[1].game!.result);
    expect(states[0].game!.result).toEqual(truth.result);

    // G8: после конца раунда ходы отклоняются правилами.
    const quiet = Promise.all([expectNoState(a), expectNoState(b)]);
    for (const s of sockets) {
      expect(await emitAck(s, 'game:move', { move: { type: 'pass' } })).toEqual({
        ok: false,
        error: 'ROUND_FINISHED',
      });
    }
    await quiet;
  });
});
