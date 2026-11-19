import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  applyMove,
  createMatch,
  getLegalMoves,
  startRound,
  type RoomClosedReason,
  type RoundState,
} from '@domino/shared';
import { RoomManager, roomPhase, type Room } from './RoomManager';

const SEED = 42;
const GRACE = 1000;

let onClose: ReturnType<typeof vi.fn<(room: Room, reason: RoomClosedReason) => void>>;
let rooms: RoomManager;

function setup(): { room: Room; tokens: [string, string] } {
  const created = rooms.create('s0', 'A');
  if (!created.ok) throw new Error('create failed');
  const joined = rooms.join('s1', created.value.room.id, 'B');
  if (!joined.ok) throw new Error('join failed');
  return { room: joined.value.room, tokens: [created.value.token, joined.value.token] };
}

beforeEach(() => {
  vi.useFakeTimers();
  onClose = vi.fn<(room: Room, reason: RoomClosedReason) => void>();
  rooms = new RoomManager({ roundSeed: () => SEED, reconnectGraceMs: GRACE, onClose });
});

afterEach(() => {
  rooms.closeAll();
  vi.useRealTimers();
});

describe('RoomManager', () => {
  it('create → waiting, join → playing with startRound(seed)', () => {
    const created = rooms.create('s0', 'A');
    expect(created.ok && roomPhase(created.value.room)).toBe('waiting');
    const { room } = setup();
    expect(roomPhase(room)).toBe('playing');
    expect(room.round).toEqual(startRound({ seed: SEED }));
  });

  it('join: ROOM_NOT_FOUND and ROOM_FULL', () => {
    const { room } = setup();
    expect(rooms.join('s2', 'NOPE22', 'C')).toEqual({ ok: false, error: 'ROOM_NOT_FOUND' });
    expect(rooms.join('s2', room.id, 'C')).toEqual({ ok: false, error: 'ROOM_FULL' });
  });

  it('U6: move before join → GAME_NOT_STARTED', () => {
    const created = rooms.create('s0', 'A');
    if (!created.ok) throw new Error();
    expect(rooms.move(created.value.room.id, 0, { type: 'draw' })).toEqual({
      ok: false,
      error: 'GAME_NOT_STARTED',
    });
  });

  it('U7: move by the wrong seat → NOT_YOUR_TURN from applyMove', () => {
    const { room } = setup();
    const other = room.round!.currentPlayer === 0 ? 1 : 0;
    const [move] = getLegalMoves(room.round!);
    expect(rooms.move(room.id, other, move!)).toEqual({ ok: false, error: 'NOT_YOUR_TURN' });
    expect(rooms.move(room.id, room.round!.currentPlayer, move!).ok).toBe(true);
    expect(room.round!.board).toHaveLength(1);
  });

  it('U8: rejoin within grace cancels the timer', () => {
    const { room, tokens } = setup();
    expect(rooms.disconnect(room.id, 1, 's1')).toBe(room);
    expect(room.seats[1]!.socketId).toBeNull();
    vi.advanceTimersByTime(GRACE - 1);
    const res = rooms.rejoin('s1b', room.id, tokens[1]);
    expect(res).toMatchObject({ ok: true, value: { seat: 1, replacedSocketId: null } });
    vi.advanceTimersByTime(GRACE * 10);
    expect(onClose).not.toHaveBeenCalled();
    expect(rooms.get(room.id)).toBe(room);
  });

  it('U9: grace expiry closes the room with player_left', () => {
    const { room } = setup();
    rooms.disconnect(room.id, 1, 's1');
    vi.advanceTimersByTime(GRACE);
    expect(onClose).toHaveBeenCalledExactlyOnceWith(room, 'player_left');
    expect(rooms.get(room.id)).toBeUndefined();
  });

  it('U10: disconnect of a replaced socket is ignored', () => {
    const { room, tokens } = setup();
    const res = rooms.rejoin('s1b', room.id, tokens[1]);
    expect(res).toMatchObject({ ok: true, value: { seat: 1, replacedSocketId: 's1' } });
    expect(rooms.disconnect(room.id, 1, 's1')).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
    expect(room.seats[1]!.socketId).toBe('s1b');
  });

  it('rejoin: ROOM_NOT_FOUND and INVALID_TOKEN', () => {
    const { room } = setup();
    expect(rooms.rejoin('x', 'NOPE22', 't')).toEqual({ ok: false, error: 'ROOM_NOT_FOUND' });
    expect(rooms.rejoin('x', room.id, 'wrong')).toEqual({ ok: false, error: 'INVALID_TOKEN' });
  });

  it('U11: closeAll clears active timers', () => {
    const { room } = setup();
    rooms.disconnect(room.id, 0, 's0');
    rooms.disconnect(room.id, 1, 's1');
    expect(vi.getTimerCount()).toBe(2);
    rooms.closeAll();
    expect(vi.getTimerCount()).toBe(0);
    expect(rooms.get(room.id)).toBeUndefined();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('both seats disconnected → room closes once', () => {
    const { room } = setup();
    rooms.disconnect(room.id, 0, 's0');
    vi.advanceTimersByTime(GRACE / 2);
    rooms.disconnect(room.id, 1, 's1');
    vi.advanceTimersByTime(GRACE * 2);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });
});

/** Доигрывает раунд комнаты первым допустимым ходом. */
function playToEnd(room: Room): void {
  for (let i = 0; room.round!.status === 'playing'; i++) {
    if (i > 200) throw new Error('round did not finish');
    const seat = room.round!.currentPlayer;
    const res = rooms.move(room.id, seat, getLegalMoves(room.round!)[0]!);
    if (!res.ok) throw new Error(res.error);
  }
}

/** Конец раунда «рыбой» с равными руками после хода [3,6] местом 0 (как E3 в shared). */
function fishDrawRound(): RoundState {
  return {
    hands: [
      [
        [3, 6],
        [3, 4],
      ],
      [[2, 5]],
    ],
    boneyard: [],
    board: [{ tile: [3, 6], left: 6, right: 3 }],
    openingTile: [6, 6],
    currentPlayer: 0,
    status: 'playing',
    result: null,
  };
}

describe('RoomManager: match (spec-7)', () => {
  it('N1: join starts a match 0:0 with nobody ready; waiting has no match', () => {
    const created = rooms.create('s0', 'A');
    expect(created.ok && created.value.room.match).toBeNull();
    const { room } = setup();
    expect(room.match).toEqual(createMatch());
    expect(room.ready).toEqual([false, false]);
  });

  it('N2: the finishing move records the round result exactly once', () => {
    const { room } = setup();
    playToEnd(room);
    const result = room.round!.result!;
    expect(result.winner).not.toBeNull();
    expect(room.match!.scores[result.winner!]).toBe(result.points);
    expect(room.match!.rounds).toEqual([result]);
    // R14: ход после конца раунда отклоняется и очков не добавляет
    expect(rooms.move(room.id, 0, { type: 'pass' })).toEqual({
      ok: false,
      error: 'ROUND_FINISHED',
    });
    expect(room.match!.rounds).toHaveLength(1);
  });

  it('M7: ready errors — NOT_IN_ROOM, GAME_NOT_STARTED, ROUND_NOT_FINISHED', () => {
    expect(rooms.ready('NOPE22', 0)).toEqual({ ok: false, error: 'NOT_IN_ROOM' });
    const created = rooms.create('s0', 'A');
    if (!created.ok) throw new Error();
    expect(rooms.ready(created.value.room.id, 0)).toEqual({
      ok: false,
      error: 'GAME_NOT_STARTED',
    });
    const { room } = setup();
    expect(rooms.ready(room.id, 0)).toEqual({ ok: false, error: 'ROUND_NOT_FINISHED' });
    expect(room.ready).toEqual([false, false]);
  });

  it('M4/M6: both ready → next round with the score kept; repeat is a no-op', () => {
    const { room } = setup();
    playToEnd(room);
    const scores = [...room.match!.scores];
    expect(rooms.ready(room.id, 1)).toMatchObject({
      ok: true,
      value: { changed: true, started: null },
    });
    expect(rooms.ready(room.id, 1)).toMatchObject({
      ok: true,
      value: { changed: false, started: null },
    });
    expect(room.ready).toEqual([false, true]);
    expect(room.round!.status).toBe('finished');

    expect(rooms.ready(room.id, 0)).toMatchObject({
      ok: true,
      value: { changed: true, started: 'round' },
    });
    expect(room.ready).toEqual([false, false]);
    expect(room.round).toEqual(startRound({ seed: SEED }));
    expect(room.match).toMatchObject({ roundNumber: 2, scores, winner: null });
    expect(room.match!.rounds).toHaveLength(1);
  });

  it('M5: a finished match + both ready → rematch 0:0 in the same room', () => {
    rooms = new RoomManager({
      roundSeed: () => SEED,
      reconnectGraceMs: GRACE,
      onClose,
      matchTarget: 1,
    });
    const { room } = setup();
    playToEnd(room);
    expect(room.match!.winner).toBe(room.round!.result!.winner);
    rooms.ready(room.id, 0);
    expect(rooms.ready(room.id, 1)).toMatchObject({ ok: true, value: { started: 'match' } });
    expect(room.match).toEqual(createMatch(1));
    expect(room.round!.status).toBe('playing');
    expect(rooms.get(room.id)).toBe(room);
  });

  it('M8: readiness survives disconnect and rejoin', () => {
    const { room, tokens } = setup();
    playToEnd(room);
    rooms.ready(room.id, 0);
    rooms.disconnect(room.id, 0, 's0');
    rooms.rejoin('s0b', room.id, tokens[0]);
    expect(room.ready).toEqual([true, false]);
  });

  it('N11: a drawn fish keeps the score and is added to the history', () => {
    rooms = new RoomManager({
      roundSeed: () => SEED,
      reconnectGraceMs: GRACE,
      onClose,
      startRound: fishDrawRound,
    });
    const { room } = setup();
    // контроль: та же позиция в shared действительно даёт ничью
    const local = applyMove(fishDrawRound(), 0, { type: 'play', tile: [3, 6], end: 'right' });
    expect(local.ok && local.state.result?.winner).toBeNull();

    expect(rooms.move(room.id, 0, { type: 'play', tile: [3, 6], end: 'right' }).ok).toBe(true);
    expect(room.round!.result).toEqual({
      reason: 'fish',
      winner: null,
      points: 0,
      handPoints: [7, 7],
    });
    expect(room.match!.scores).toEqual([0, 0]);
    expect(room.match!.rounds).toHaveLength(1);
    expect(room.match!.winner).toBeNull();
  });
});
