import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getLegalMoves, startRound } from '@domino/shared';
import { RoomManager, roomPhase, type Room } from './RoomManager';

const SEED = 42;
const GRACE = 1000;

let onClose: ReturnType<typeof vi.fn>;
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
  onClose = vi.fn();
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
