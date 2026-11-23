import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PlayerIndex, RoomClosedReason } from '@domino/shared';
import { toRoomState } from './handlers';
import { RoomManager, roomPhase, type Room, type RoomManagerOptions } from './RoomManager';

const SEED = 42;
const GRACE = 1000;
const LIMIT = 30_000;

let onClose: ReturnType<typeof vi.fn<(room: Room, reason: RoomClosedReason) => void>>;
let onForfeit: ReturnType<typeof vi.fn<(room: Room, loser: PlayerIndex) => void>>;
let onAutoMove: ReturnType<typeof vi.fn<(room: Room) => void>>;
let onSeatFreed: ReturnType<typeof vi.fn<(room: Room) => void>>;
let rooms: RoomManager;

function makeRooms(extra: Partial<RoomManagerOptions> = {}): RoomManager {
  return new RoomManager({
    roundSeed: () => SEED,
    reconnectTimeoutMs: GRACE,
    now: () => Date.now(),
    onClose,
    onForfeit,
    onAutoMove,
    onSeatFreed,
    ...extra,
  });
}

/** 2×2: A создаёт, входят B, C, D (если `players` = 4). */
function setupTeam(
  players = 4,
  turnSeconds = 0,
): { room: Room; tokens: string[]; sockets: string[] } {
  const created = rooms.create('s0', 'A', { mode: '2x2', turnSeconds });
  if (!created.ok) throw new Error('create failed');
  const room = created.value.room;
  const tokens = [created.value.token];
  const sockets = ['s0'];
  for (let i = 1; i < players; i++) {
    const joined = rooms.join(`s${i}`, room.id, 'BCD'[i - 1]!);
    if (!joined.ok) throw new Error('join failed');
    tokens.push(joined.value.token);
    sockets.push(`s${i}`);
  }
  return { room, tokens, sockets };
}

/** Доиграть раунд первыми легальными ходами. */
function finishRound(room: Room): void {
  for (let i = 0; room.round!.status === 'playing'; i++) {
    if (i > 200) throw new Error('round did not finish');
    const seat = room.round!.currentPlayer;
    const view = toRoomState(room, seat).game!;
    const result = rooms.move(room.id, seat, view.legalMoves[0]!);
    if (!result.ok) throw new Error(result.error);
  }
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(console, 'info').mockImplementation(() => {});
  onClose = vi.fn<(room: Room, reason: RoomClosedReason) => void>();
  onForfeit = vi.fn<(room: Room, loser: PlayerIndex) => void>();
  onAutoMove = vi.fn<(room: Room) => void>();
  onSeatFreed = vi.fn<(room: Room) => void>();
  rooms = makeRooms();
});

afterEach(() => {
  rooms.closeAll();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('RoomManager: 2×2 (spec-17)', () => {
  it('S-Q2: create 2x2 → 4 места и 4 флага готовности; info — mode и freeSeats', () => {
    const created = rooms.create('s0', 'A', { mode: '2x2' });
    if (!created.ok) throw new Error('create failed');
    const { room } = created.value;
    expect(room.mode).toBe('2x2');
    expect(room.seats).toHaveLength(4);
    expect(room.ready).toEqual([false, false, false, false]);
    expect(rooms.info(room.id)).toMatchObject({ ok: true, value: { mode: '2x2', freeSeats: 3 } });
    const classic = rooms.create('s9', 'Z');
    expect(classic.ok && classic.value.room.mode).toBe('1x1');
    expect(classic.ok && classic.value.room.seats).toHaveLength(2);
  });

  it('S-Q3: join ×3 → места 1, 2, 3; раунд стартует только при 4-м; 5-й — ROOM_FULL', () => {
    const created = rooms.create('s0', 'A', { mode: '2x2' });
    if (!created.ok) throw new Error('create failed');
    const { room } = created.value;
    const seats: PlayerIndex[] = [];
    for (const [i, name] of ['B', 'C', 'D'].entries()) {
      const joined = rooms.join(`s${i + 1}`, room.id, name);
      if (!joined.ok) throw new Error('join failed');
      seats.push(joined.value.seat);
      if (i < 2) {
        expect(room.round).toBeNull();
        expect(roomPhase(room)).toBe('waiting');
      }
    }
    expect(seats).toEqual([1, 2, 3]);
    expect(roomPhase(room)).toBe('playing');
    expect(room.round!.hands.map((h) => h.length)).toEqual([7, 7, 7, 7]);
    expect(room.round!.boneyard).toEqual([]);
    expect(room.match).toMatchObject({ scores: [0, 0], winner: null });
    expect(rooms.join('s5', room.id, 'E')).toEqual({ ok: false, error: 'ROOM_FULL' });
    expect(rooms.info(room.id)).toMatchObject({ ok: true, value: { freeSeats: 0 } });
  });

  it('S-Q3: room:state — players по местам, handCounts, своя рука', () => {
    const { room } = setupTeam();
    const view = toRoomState(room, 2);
    expect(view.mode).toBe('2x2');
    expect(view.players.map((p) => [p.seat, p.name])).toEqual([
      [0, 'A'],
      [1, 'B'],
      [2, 'C'],
      [3, 'D'],
    ]);
    expect(view.game!.hand).toEqual(room.round!.hands[2]);
    expect(view.game!.handCounts).toEqual([7, 7, 7, 7]);
    expect(view.match!.ready).toEqual([false, false, false, false]);
  });

  it('S-Q4: ready от 3 мест — раунд не стартует; от 4-го — новый раунд, ready сброшен', () => {
    const { room } = setupTeam();
    finishRound(room);
    expect(roomPhase(room)).toBe('finished');
    for (const seat of [0, 1, 2] as const) {
      const r = rooms.ready(room.id, seat);
      expect(r.ok && r.value.started).toBeNull();
    }
    expect(room.ready).toEqual([true, true, true, false]);
    expect(room.match!.roundNumber).toBe(1);
    const last = rooms.ready(room.id, 3);
    expect(last.ok && last.value.started).toBe(room.match!.winner === null ? 'round' : 'match');
    expect(room.ready).toEqual([false, false, false, false]);
    expect(room.round!.status).toBe('playing');
    expect(room.round!.hands.map((h) => h.length)).toEqual([7, 7, 7, 7]);
  });

  it('S-Q5: waiting — таймаут места 2 освобождает место, следующий join получает его', () => {
    const { room } = setupTeam(3);
    rooms.disconnect(room.id, 2, 's2');
    vi.advanceTimersByTime(GRACE);
    expect(room.seats[2]).toBeNull();
    expect(onSeatFreed).toHaveBeenCalledExactlyOnceWith(room);
    expect(onClose).not.toHaveBeenCalled();
    expect(toRoomState(room, 0).players.map((p) => p.seat)).toEqual([0, 1]);
    const joined = rooms.join('s7', room.id, 'E');
    expect(joined.ok && joined.value.seat).toBe(2);
    expect(room.round).toBeNull();
  });

  it('S-Q5: waiting — таймаут места 0 (создатель) закрывает комнату', () => {
    const { room } = setupTeam(2);
    rooms.disconnect(room.id, 0, 's0');
    vi.advanceTimersByTime(GRACE);
    expect(onClose).toHaveBeenCalledExactlyOnceWith(room, 'player_left');
    expect(rooms.get(room.id)).toBeUndefined();
    expect(onSeatFreed).not.toHaveBeenCalled();
  });

  it('S-Q6: игра — место 3 не вернулось, место 0 онлайн → техпоражение команды 1', () => {
    const { room } = setupTeam();
    rooms.disconnect(room.id, 3, 's3');
    vi.advanceTimersByTime(GRACE);
    expect(onForfeit).toHaveBeenCalledExactlyOnceWith(room, 3);
    expect(onClose).not.toHaveBeenCalled();
    expect(room.match).toMatchObject({ winner: 0, forfeit: 1, forfeitSeat: 3 });
    expect(roomPhase(room)).toBe('finished');
    expect(rooms.get(room.id)).toBeUndefined();
  });

  it('S-Q6: игра — оба соперника (0 и 2) отключены → комната закрыта player_left', () => {
    const { room } = setupTeam();
    rooms.disconnect(room.id, 3, 's3');
    vi.advanceTimersByTime(10);
    rooms.disconnect(room.id, 0, 's0');
    rooms.disconnect(room.id, 2, 's2');
    vi.advanceTimersByTime(GRACE - 10);
    expect(onClose).toHaveBeenCalledExactlyOnceWith(room, 'player_left');
    expect(onForfeit).not.toHaveBeenCalled();
  });

  it('S-Q6: игра — напарник отключён, соперник онлайн → техпоражение команды ушедшего', () => {
    const { room } = setupTeam();
    rooms.disconnect(room.id, 2, 's2');
    vi.advanceTimersByTime(GRACE);
    expect(onForfeit).toHaveBeenCalledExactlyOnceWith(room, 2);
    expect(room.match).toMatchObject({ winner: 1, forfeit: 0, forfeitSeat: 2 });
  });

  it('S-Q7: таймер — пауза при отключении любого места, продолжение с остатка, один авто-ход', () => {
    const { room, tokens } = setupTeam(4, 30);
    const first = room.round!.currentPlayer;
    expect(room.turnTimer).toMatchObject({ seat: first, pausedRemainingMs: null });
    vi.advanceTimersByTime(10_000);
    const other = ((first + 2) % 4) as PlayerIndex;
    rooms.disconnect(room.id, other, `s${other}`);
    expect(toRoomState(room, first, Date.now()).turnTimer).toEqual({
      seat: first,
      remainingMs: LIMIT - 10_000,
      paused: true,
    });
    vi.advanceTimersByTime(GRACE - 1);
    expect(onAutoMove).not.toHaveBeenCalled();
    expect(rooms.rejoin(`s${other}b`, room.id, tokens[other]!).ok).toBe(true);
    expect(toRoomState(room, first, Date.now()).turnTimer).toEqual({
      seat: first,
      remainingMs: LIMIT - 10_000,
      paused: false,
    });
    vi.advanceTimersByTime(LIMIT - 10_000);
    expect(onAutoMove).toHaveBeenCalledTimes(1);
    expect(room.round!.board).toHaveLength(1);
    expect(room.round!.board[0]!.tile).toEqual([6, 6]);
    expect(room.round!.currentPlayer).toBe((first + 1) % 4);
    expect(room.turnTimer).toMatchObject({ seat: (first + 1) % 4 });
  });

  it('Q16: реакции — кулдаун на место, другие места не ограничены', () => {
    const { room } = setupTeam();
    const r2 = rooms.react(room.id, 2, 'thumbs_up');
    expect(r2.ok && r2.value.reaction.seat).toBe(2);
    expect(rooms.react(room.id, 2, 'thumbs_up')).toEqual({ ok: false, error: 'TOO_FREQUENT' });
    expect(rooms.react(room.id, 3, 'thumbs_up').ok).toBe(true);
  });
});
