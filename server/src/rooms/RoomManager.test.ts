import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  applyMove,
  createMatch,
  getLegalMoves,
  startRound,
  type PlayerIndex,
  type RoomClosedReason,
  type RoundState,
} from '@domino/shared';
import { toRoomState } from './handlers';
import { RoomManager, roomPhase, type Room, type RoomManagerOptions } from './RoomManager';

const SEED = 42;
const GRACE = 1000;

let onClose: ReturnType<typeof vi.fn<(room: Room, reason: RoomClosedReason) => void>>;
let onForfeit: ReturnType<typeof vi.fn<(room: Room, loser: PlayerIndex) => void>>;
let onAutoMove: ReturnType<typeof vi.fn<(room: Room) => void>>;
let rooms: RoomManager;

function makeRooms(extra: Partial<RoomManagerOptions> = {}): RoomManager {
  return new RoomManager({
    roundSeed: () => SEED,
    reconnectTimeoutMs: GRACE,
    now: () => Date.now(),
    onClose,
    onForfeit,
    onAutoMove,
    ...extra,
  });
}

function setup(turnSeconds?: number): { room: Room; tokens: [string, string] } {
  const created = rooms.create('s0', 'A', turnSeconds);
  if (!created.ok) throw new Error('create failed');
  const joined = rooms.join('s1', created.value.room.id, 'B');
  if (!joined.ok) throw new Error('join failed');
  return { room: joined.value.room, tokens: [created.value.token, joined.value.token] };
}

beforeEach(() => {
  vi.useFakeTimers();
  onClose = vi.fn<(room: Room, reason: RoomClosedReason) => void>();
  onForfeit = vi.fn<(room: Room, loser: PlayerIndex) => void>();
  onAutoMove = vi.fn<(room: Room) => void>();
  rooms = makeRooms();
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

  it('U9 (RC4): timeout in a waiting room closes it with player_left', () => {
    const created = rooms.create('s0', 'A');
    if (!created.ok) throw new Error();
    const { room } = created.value;
    rooms.disconnect(room.id, 0, 's0');
    vi.advanceTimersByTime(GRACE);
    expect(onClose).toHaveBeenCalledExactlyOnceWith(room, 'player_left');
    expect(onForfeit).not.toHaveBeenCalled();
    expect(rooms.get(room.id)).toBeUndefined();
  });

  it('U10: disconnect of a replaced socket is ignored', () => {
    const { room, tokens } = setup(0); // без таймера хода — проверяем только таймеры мест
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
    expect(onForfeit).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('RoomManager: reconnect timeout (spec-9)', () => {
  it('X3: a disconnected seat reports the remaining time, a connected one null', () => {
    const { room } = setup();
    rooms.disconnect(room.id, 1, 's1');
    let view = toRoomState(room, 0, Date.now());
    expect(view.players[1]).toEqual({
      seat: 1,
      name: 'B',
      connected: false,
      reconnectRemainingMs: GRACE,
    });
    expect(view.players[0]!.reconnectRemainingMs).toBeNull();
    vi.advanceTimersByTime(100);
    view = toRoomState(room, 0, Date.now());
    expect(view.players[1]!.reconnectRemainingMs).toBe(GRACE - 100);
  });

  it('X4: rejoin before the deadline clears it; nothing fires later', () => {
    const { room, tokens } = setup();
    rooms.disconnect(room.id, 1, 's1');
    vi.advanceTimersByTime(GRACE - 300);
    expect(rooms.rejoin('s1b', room.id, tokens[1]).ok).toBe(true);
    expect(toRoomState(room, 0).players[1]).toMatchObject({
      connected: true,
      reconnectRemainingMs: null,
    });
    expect(room.seats[1]!.reconnectDeadline).toBeNull();
    vi.advanceTimersByTime(GRACE * 3);
    expect(onClose).not.toHaveBeenCalled();
    expect(onForfeit).not.toHaveBeenCalled();
  });

  it('RC5: timeout while the opponent is online → forfeit, room removed, score kept', () => {
    const { room, tokens } = setup();
    const scores = [...room.match!.scores];
    rooms.disconnect(room.id, 1, 's1');
    vi.advanceTimersByTime(GRACE);
    expect(onForfeit).toHaveBeenCalledExactlyOnceWith(room, 1);
    expect(onClose).not.toHaveBeenCalled();
    expect(room.match).toMatchObject({ winner: 0, forfeit: 1, scores });
    expect(room.ready).toEqual([false, false]);
    expect(roomPhase(room)).toBe('finished');
    expect(rooms.get(room.id)).toBeUndefined();
    expect(rooms.rejoin('s1c', room.id, tokens[1])).toEqual({
      ok: false,
      error: 'ROOM_NOT_FOUND',
    });
    expect(vi.getTimerCount()).toBe(0);
  });

  it('RC5/X6: a finished round of an unfinished match also ends with a forfeit', () => {
    const { room } = setup();
    playToEnd(room);
    rooms.ready(room.id, 1);
    rooms.disconnect(room.id, 1, 's1');
    vi.advanceTimersByTime(GRACE);
    expect(onForfeit).toHaveBeenCalledExactlyOnceWith(room, 1);
    expect(room.match!.forfeit).toBe(1);
    expect(room.ready).toEqual([false, false]);
  });

  it('X7 (RC6): match already won → player_left, no forfeit', () => {
    rooms = makeRooms({ matchTarget: 1 });
    const { room } = setup();
    playToEnd(room);
    expect(room.match!.winner).not.toBeNull();
    rooms.disconnect(room.id, 1, 's1');
    vi.advanceTimersByTime(GRACE);
    expect(onClose).toHaveBeenCalledExactlyOnceWith(room, 'player_left');
    expect(onForfeit).not.toHaveBeenCalled();
  });

  it('X7 (RC6): the opponent is offline too → player_left once, no forfeit', () => {
    const { room } = setup();
    rooms.disconnect(room.id, 1, 's1');
    vi.advanceTimersByTime(GRACE / 2);
    rooms.disconnect(room.id, 0, 's0');
    vi.advanceTimersByTime(GRACE * 2);
    expect(onClose).toHaveBeenCalledExactlyOnceWith(room, 'player_left');
    expect(onForfeit).not.toHaveBeenCalled();
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
    rooms = makeRooms({ matchTarget: 1 });
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
    rooms = makeRooms({ startRound: fishDrawRound });
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

// ---------------------------------------------------------------------------
// spec-11: таймер хода
// ---------------------------------------------------------------------------

const LIMIT = 60_000;

/** Раунд из фикстуры: стол, руки, базар; ход места 0. */
function fixture(
  hand0: RoundState['hands'][0],
  hand1: RoundState['hands'][1],
  boneyard: RoundState['boneyard'],
  board: RoundState['board'] = [{ tile: [5, 6], left: 5, right: 6 }],
): () => RoundState {
  return () => ({
    hands: [hand0.map((t) => t), hand1.map((t) => t)],
    boneyard: boneyard.map((t) => t),
    board: board.map((p) => p),
    openingTile: [6, 6],
    currentPlayer: 0,
    status: 'playing',
    result: null,
  });
}

/** T4a: у места 0 подходят [1,5] (6) и [3,4] (7) к концам 4|1. */
const hasMove = fixture(
  [
    [1, 5],
    [3, 4],
    [0, 0],
  ],
  [
    [6, 6],
    [2, 2],
  ],
  [[5, 5]],
  [{ tile: [1, 4], left: 4, right: 1 }],
);

/** T4b: хода нет; в базаре [2,3] не подходит, [3,5] подходит к 5. */
const mustDraw = fixture(
  [
    [0, 0],
    [1, 1],
  ],
  [[6, 6]],
  [
    [2, 3],
    [3, 5],
    [4, 4],
  ],
);

/** T4b′: хода нет, весь базар не подходит. */
const drawAllThenPass = fixture(
  [[0, 0]],
  [
    [6, 6],
    [1, 2],
  ],
  [
    [1, 1],
    [2, 2],
  ],
);

/** T4c: хода нет, базар пуст. */
const mustPass = fixture([[0, 0]], [[6, 6]], []);

/** T6a: последняя кость места 0 подходит — авто-ход заканчивает раунд «домино». */
const lastTile = fixture(
  [[4, 4]],
  [
    [6, 6],
    [2, 2],
  ],
  [[5, 5]],
  [{ tile: [1, 4], left: 4, right: 1 }],
);

function timerView(room: Room) {
  return toRoomState(room, 0, Date.now()).turnTimer;
}

describe('RoomManager: turn timer (spec-11)', () => {
  it('T1: create keeps turnSeconds, 60 by default', () => {
    const a = rooms.create('s0', 'A');
    const b = rooms.create('s1', 'B', 30);
    expect(a.ok && a.value.room.turnSeconds).toBe(60);
    expect(b.ok && b.value.room.turnSeconds).toBe(30);
    expect(a.ok && a.value.room.turnTimer).toBeNull(); // waiting
  });

  it('T2a: the round start runs the timer of currentPlayer with the full limit', () => {
    const { room } = setup();
    expect(timerView(room)).toEqual({
      seat: room.round!.currentPlayer,
      remainingMs: LIMIT,
      paused: false,
    });
    expect(toRoomState(room, 1).turnSeconds).toBe(60);
  });

  it('T4a: has a move → the heaviest tile is played, turn goes to the opponent', () => {
    rooms = makeRooms({ startRound: hasMove });
    const { room } = setup();
    const boneyard = [...room.round!.boneyard];
    vi.advanceTimersByTime(LIMIT - 1);
    expect(onAutoMove).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onAutoMove).toHaveBeenCalledExactlyOnceWith(room);
    expect(room.round!.board.map((p) => p.tile)).toEqual([
      [3, 4],
      [1, 4],
    ]);
    expect(room.round!.hands[0]).toEqual([
      [1, 5],
      [0, 0],
    ]);
    expect(room.round!.boneyard).toEqual(boneyard);
    expect(room.round!.currentPlayer).toBe(1);
    expect(toRoomState(room, 1, Date.now()).turnTimer).toEqual({
      seat: 1,
      remainingMs: LIMIT,
      paused: false,
    });
  });

  it('T4b: must draw → draws until a tile fits and plays it', () => {
    rooms = makeRooms({ startRound: mustDraw });
    const { room } = setup();
    vi.advanceTimersByTime(LIMIT);
    expect(onAutoMove).toHaveBeenCalledTimes(1);
    const round = room.round!;
    expect(round.boneyard).toEqual([[4, 4]]); // добрано 2 кости
    expect(round.board.map((p) => p.tile)).toEqual([
      [3, 5],
      [5, 6],
    ]);
    expect(round.hands[0]).toEqual([
      [0, 0],
      [1, 1],
      [2, 3],
    ]); // +1 относительно начала хода
    expect(round.currentPlayer).toBe(1);
    expect(timerView(room)).toEqual({ seat: 1, remainingMs: LIMIT, paused: false });
  });

  it('T4b′: must draw and nothing fits → draws the whole boneyard, then passes', () => {
    rooms = makeRooms({ startRound: drawAllThenPass });
    const { room } = setup();
    vi.advanceTimersByTime(LIMIT);
    expect(onAutoMove).toHaveBeenCalledTimes(1);
    const round = room.round!;
    expect(round.boneyard).toEqual([]);
    expect(round.hands[0]).toEqual([
      [0, 0],
      [1, 1],
      [2, 2],
    ]);
    expect(round.board).toHaveLength(1);
    expect(round.status).toBe('playing');
    expect(round.currentPlayer).toBe(1);
  });

  it('T4c: boneyard empty and nothing fits → pass', () => {
    rooms = makeRooms({ startRound: mustPass });
    const { room } = setup();
    const before = structuredClone(room.round!);
    vi.advanceTimersByTime(LIMIT);
    expect(onAutoMove).toHaveBeenCalledTimes(1);
    expect(room.round).toEqual({ ...before, currentPlayer: 1 });
    expect(timerView(room)).toEqual({ seat: 1, remainingMs: LIMIT, paused: false });
  });

  it('T2b: a manual draw does not extend the time', () => {
    rooms = makeRooms({ startRound: mustDraw });
    const { room } = setup();
    vi.advanceTimersByTime(20_000);
    expect(rooms.move(room.id, 0, { type: 'draw' }).ok).toBe(true);
    expect(timerView(room)).toEqual({ seat: 0, remainingMs: 40_000, paused: false });
    vi.advanceTimersByTime(40_000);
    expect(onAutoMove).toHaveBeenCalledTimes(1);
    expect(room.round!.currentPlayer).toBe(1);
  });

  it('T2c: a manual play starts the opponent timer with the full limit', () => {
    rooms = makeRooms({ startRound: hasMove });
    const { room } = setup();
    vi.advanceTimersByTime(30_000);
    expect(rooms.move(room.id, 0, { type: 'play', tile: [1, 5], end: 'right' }).ok).toBe(true);
    expect(timerView(room)).toEqual({ seat: 1, remainingMs: LIMIT, paused: false });
    vi.advanceTimersByTime(LIMIT - 1);
    expect(onAutoMove).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onAutoMove).toHaveBeenCalledTimes(1);
    expect(room.round!.currentPlayer).toBe(0);
  });

  it('T3a: turnSeconds 0 → no timer, nothing happens', () => {
    rooms = makeRooms({ startRound: hasMove });
    const { room } = setup(0);
    expect(room.turnTimer).toBeNull();
    expect(toRoomState(room, 0)).toMatchObject({ turnSeconds: 0, turnTimer: null });
    const before = structuredClone(room.round);
    expect(vi.getTimerCount()).toBe(0);
    vi.advanceTimersByTime(10 * 60_000);
    expect(room.round).toEqual(before);
    expect(onAutoMove).not.toHaveBeenCalled();
  });

  it('T6a/T3b: an auto-move with the last tile ends the round once; next round restarts the timer', () => {
    rooms = makeRooms({ startRound: lastTile });
    const { room } = setup();
    vi.advanceTimersByTime(LIMIT);
    expect(onAutoMove).toHaveBeenCalledTimes(1);
    expect(room.round!.status).toBe('finished');
    expect(room.round!.result).toMatchObject({ reason: 'domino', winner: 0, points: 16 });
    expect(room.match!.scores).toEqual([16, 0]);
    expect(room.match!.rounds).toHaveLength(1);
    expect(room.turnTimer).toBeNull();
    expect(vi.getTimerCount()).toBe(0);

    rooms.ready(room.id, 0);
    expect(room.turnTimer).toBeNull();
    rooms.ready(room.id, 1);
    expect(room.match!.roundNumber).toBe(2);
    expect(timerView(room)).toEqual({ seat: 0, remainingMs: LIMIT, paused: false });
  });

  it('T6b: an auto-move reaching the target wins the match', () => {
    rooms = makeRooms({ startRound: lastTile, matchTarget: 10 });
    const { room } = setup();
    vi.advanceTimersByTime(LIMIT);
    expect(room.match!.winner).toBe(0);
    expect(roomPhase(room)).toBe('finished');
    expect(room.turnTimer).toBeNull();
    expect(room.turnSeconds).toBe(60);
  });

  it('T7a/T7c: opponent offline pauses the timer; rejoin resumes from the frozen rest', () => {
    rooms = makeRooms({ startRound: hasMove, reconnectTimeoutMs: 10 * 60_000 });
    const { room, tokens } = setup();
    vi.advanceTimersByTime(20_000);
    rooms.disconnect(room.id, 1, 's1');
    expect(timerView(room)).toEqual({ seat: 0, remainingMs: 40_000, paused: true });
    vi.advanceTimersByTime(5 * 60_000);
    expect(onAutoMove).not.toHaveBeenCalled();
    expect(timerView(room)).toEqual({ seat: 0, remainingMs: 40_000, paused: true });

    rooms.rejoin('s1b', room.id, tokens[1]);
    expect(timerView(room)).toEqual({ seat: 0, remainingMs: 40_000, paused: false });
    vi.advanceTimersByTime(40_000 - 1);
    expect(onAutoMove).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onAutoMove).toHaveBeenCalledTimes(1);
  });

  it('T7b: the player on turn offline pauses the timer too', () => {
    rooms = makeRooms({ startRound: hasMove, reconnectTimeoutMs: 10 * 60_000 });
    const { room } = setup();
    vi.advanceTimersByTime(10_000);
    rooms.disconnect(room.id, 0, 's0');
    expect(timerView(room)).toEqual({ seat: 0, remainingMs: 50_000, paused: true });
    vi.advanceTimersByTime(5 * 60_000);
    expect(onAutoMove).not.toHaveBeenCalled();
  });

  it('T7d: both offline, one returns → still paused', () => {
    rooms = makeRooms({ reconnectTimeoutMs: 10 * 60_000 });
    const { room, tokens } = setup();
    vi.advanceTimersByTime(5_000);
    rooms.disconnect(room.id, 0, 's0');
    vi.advanceTimersByTime(5_000);
    rooms.disconnect(room.id, 1, 's1'); // при стоящей паузе остаток не меняется
    rooms.rejoin('s0b', room.id, tokens[0]);
    expect(timerView(room)).toMatchObject({ remainingMs: LIMIT - 5_000, paused: true });
    rooms.rejoin('s1b', room.id, tokens[1]);
    expect(timerView(room)).toMatchObject({ remainingMs: LIMIT - 5_000, paused: false });
  });

  it('T7e: the offline player does not return → forfeit, no auto-move, no timers left', () => {
    const { room } = setup();
    rooms.disconnect(room.id, 1, 's1');
    vi.advanceTimersByTime(GRACE);
    expect(onForfeit).toHaveBeenCalledTimes(1);
    expect(room.turnTimer).toBeNull();
    expect(toRoomState(room, 0).turnTimer).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
    vi.advanceTimersByTime(10 * LIMIT);
    expect(onAutoMove).not.toHaveBeenCalled();
  });

  it('T8a: a manual move just before the deadline cancels the old timer', () => {
    rooms = makeRooms({ startRound: hasMove });
    const { room } = setup();
    vi.advanceTimersByTime(LIMIT - 1);
    expect(rooms.move(room.id, 0, { type: 'play', tile: [3, 4], end: 'left' }).ok).toBe(true);
    vi.advanceTimersByTime(1);
    expect(onAutoMove).not.toHaveBeenCalled();
    expect(room.round!.board).toHaveLength(2);
    expect(timerView(room)).toEqual({ seat: 1, remainingMs: LIMIT - 1, paused: false });
  });

  it('T8b: a manual move after the auto-move gets NOT_YOUR_TURN', () => {
    rooms = makeRooms({ startRound: hasMove });
    const { room } = setup();
    vi.advanceTimersByTime(LIMIT);
    expect(rooms.move(room.id, 0, { type: 'play', tile: [1, 5], end: 'right' })).toEqual({
      ok: false,
      error: 'NOT_YOUR_TURN',
    });
  });

  it('T9: closeAll with a running turn timer leaves no timers', () => {
    const { room } = setup();
    expect(room.turnTimer?.handle).not.toBeNull();
    expect(vi.getTimerCount()).toBe(1);
    rooms.closeAll();
    expect(vi.getTimerCount()).toBe(0);
    vi.advanceTimersByTime(LIMIT);
    expect(onAutoMove).not.toHaveBeenCalled();
  });
});

describe('RoomManager: reactions (spec-12)', () => {
  it('RX2a: waiting → GAME_NOT_STARTED; unknown room / empty seat → NOT_IN_ROOM', () => {
    const created = rooms.create('s0', 'A');
    if (!created.ok) throw new Error('create failed');
    const id = created.value.room.id;
    expect(rooms.react(id, 0, 'thumbs_up')).toEqual({ ok: false, error: 'GAME_NOT_STARTED' });
    expect(rooms.react(id, 1, 'thumbs_up')).toEqual({ ok: false, error: 'NOT_IN_ROOM' });
    expect(rooms.react('NOPE22', 0, 'thumbs_up')).toEqual({ ok: false, error: 'NOT_IN_ROOM' });
  });

  it('RX2c/RX2d: allowed when not your turn and on a finished round', () => {
    const { room } = setup();
    const other = room.round!.currentPlayer === 0 ? 1 : 0;
    expect(rooms.react(room.id, other, 'hurry').ok).toBe(true);
    room.round = { ...room.round!, status: 'finished' };
    expect(roomPhase(room)).toBe('finished');
    expect(rooms.react(room.id, room.round.currentPlayer, 'good_game').ok).toBe(true);
  });

  it('RX3/RX5a: a string outside the list → UNKNOWN_REACTION, even during cooldown', () => {
    const { room } = setup();
    for (const id of ['привет', '👍', '', '__proto__', 'a'.repeat(10_000)]) {
      expect(rooms.react(room.id, 0, id)).toEqual({ ok: false, error: 'UNKNOWN_REACTION' });
    }
    expect(room.seats[0].lastReactionAt).toBeNull();
    expect(rooms.react(room.id, 0, 'fish').ok).toBe(true);
    expect(rooms.react(room.id, 0, 'привет')).toEqual({ ok: false, error: 'UNKNOWN_REACTION' });
  });

  it('RX4a/RX4b: 1999 ms → TOO_FREQUENT, exactly 2000 ms → ok', () => {
    const { room } = setup();
    expect(rooms.react(room.id, 0, 'wow').ok).toBe(true);
    vi.advanceTimersByTime(1999);
    expect(rooms.react(room.id, 0, 'wow')).toEqual({ ok: false, error: 'TOO_FREQUENT' });
    vi.advanceTimersByTime(1);
    expect(rooms.react(room.id, 0, 'wow').ok).toBe(true);
  });

  it('RX4c: cooldown is per seat', () => {
    const { room } = setup();
    expect(rooms.react(room.id, 0, 'wow').ok).toBe(true);
    vi.advanceTimersByTime(100);
    expect(rooms.react(room.id, 1, 'wow').ok).toBe(true);
  });

  it('RX4d: a rejected attempt does not extend the cooldown', () => {
    const { room } = setup();
    expect(rooms.react(room.id, 0, 'angry').ok).toBe(true);
    vi.advanceTimersByTime(500);
    expect(rooms.react(room.id, 0, 'angry')).toEqual({ ok: false, error: 'TOO_FREQUENT' });
    vi.advanceTimersByTime(1500);
    expect(rooms.react(room.id, 0, 'angry').ok).toBe(true);
  });

  it('RX6/RX7: payload is { seat, reactionId, seq } with a growing seq', () => {
    const { room } = setup();
    const first = rooms.react(room.id, 0, 'good_game');
    const second = rooms.react(room.id, 1, 'laugh');
    if (!first.ok || !second.ok) throw new Error('react failed');
    expect(first.value.reaction).toEqual({
      seat: 0,
      reactionId: 'good_game',
      seq: expect.any(Number),
    });
    expect(second.value.reaction.seat).toBe(1);
    expect(second.value.reaction.seq).toBeGreaterThan(first.value.reaction.seq);
  });

  it('RX8: a reaction does not touch the round, readiness or the turn timer', () => {
    const { room } = setup();
    const round = room.round;
    const timer = room.turnTimer;
    const ready = [...room.ready];
    const timers = vi.getTimerCount();
    expect(rooms.react(room.id, room.round!.currentPlayer, 'hurry').ok).toBe(true);
    expect(room.round).toBe(round);
    expect(room.turnTimer).toBe(timer);
    expect(room.ready).toEqual(ready);
    expect(vi.getTimerCount()).toBe(timers);
  });

  it('RX9: rejoin does not reset the cooldown', () => {
    const { room, tokens } = setup();
    expect(rooms.react(room.id, 0, 'party').ok).toBe(true);
    rooms.disconnect(room.id, 0, 's0');
    vi.advanceTimersByTime(500);
    expect(rooms.rejoin('s0b', room.id, tokens[0]).ok).toBe(true);
    vi.advanceTimersByTime(100);
    expect(rooms.react(room.id, 0, 'party')).toEqual({ ok: false, error: 'TOO_FREQUENT' });
  });
});
