import {
  applyMove,
  startRound,
  type GameErrorCode,
  type Move,
  type PlayerIndex,
  type RoomClosedReason,
  type RoomErrorCode,
  type RoomPhase,
  type RoundState,
} from '@domino/shared';
import { generateRoomId, generateToken } from './ids';

export type Result<T, E extends string> = { ok: true; value: T } | { ok: false; error: E };

export interface SeatState {
  name: string;
  token: string;
  /** null — место отключено и ждёт room:rejoin (K8). */
  socketId: string | null;
  graceTimer: NodeJS.Timeout | null;
}

export interface Room {
  id: string;
  seats: [SeatState, SeatState | null];
  /** null в фазе waiting. Хранится только на сервере (K5). */
  round: RoundState | null;
}

export interface RoomManagerOptions {
  roundSeed: () => number;
  reconnectGraceMs: number;
  /** Вызывается, когда комната закрыта и уже удалена из менеджера. */
  onClose: (room: Room, reason: RoomClosedReason) => void;
}

export function roomPhase(room: Room): RoomPhase {
  if (room.round === null) return 'waiting';
  return room.round.status === 'finished' ? 'finished' : 'playing';
}

const ok = <T>(value: T): { ok: true; value: T } => ({ ok: true, value });
const err = <E extends string>(error: E): { ok: false; error: E } => ({ ok: false, error });

/**
 * Доменная логика комнат на двоих (spec-4 §3). Без socket.io: сокеты — только строковые id.
 * Правила игры не реализует — делегирует `startRound`/`applyMove` из shared.
 */
export class RoomManager {
  private readonly rooms = new Map<string, Room>();

  constructor(private readonly opts: RoomManagerOptions) {}

  get(roomId: string): Room | undefined {
    return this.rooms.get(roomId);
  }

  create(
    socketId: string,
    name: string,
  ): Result<{ room: Room; seat: 0; token: string }, RoomErrorCode> {
    const id = generateRoomId((candidate) => this.rooms.has(candidate));
    const token = generateToken();
    const room: Room = {
      id,
      seats: [{ name, token, socketId, graceTimer: null }, null],
      round: null,
    };
    this.rooms.set(id, room);
    return ok({ room, seat: 0, token });
  }

  join(
    socketId: string,
    roomId: string,
    name: string,
  ): Result<{ room: Room; seat: 1; token: string }, RoomErrorCode> {
    const room = this.rooms.get(roomId);
    if (!room) return err('ROOM_NOT_FOUND');
    if (room.seats[1] !== null) return err('ROOM_FULL');
    const token = generateToken();
    room.seats[1] = { name, token, socketId, graceTimer: null };
    // K4: waiting → playing синхронно при успешном входе.
    room.round = startRound({ seed: this.opts.roundSeed() });
    return ok({ room, seat: 1, token });
  }

  rejoin(
    socketId: string,
    roomId: string,
    token: string,
  ): Result<{ room: Room; seat: PlayerIndex; replacedSocketId: string | null }, RoomErrorCode> {
    const room = this.rooms.get(roomId);
    if (!room) return err('ROOM_NOT_FOUND');
    const seat = ([0, 1] as const).find((s) => room.seats[s]?.token === token);
    if (seat === undefined) return err('INVALID_TOKEN');
    const state = room.seats[seat]!;
    this.clearTimer(state);
    const previous = state.socketId;
    state.socketId = socketId;
    return ok({
      room,
      seat,
      replacedSocketId: previous !== null && previous !== socketId ? previous : null,
    });
  }

  move(roomId: string, seat: PlayerIndex, move: Move): Result<{ room: Room }, GameErrorCode> {
    const room = this.rooms.get(roomId);
    if (!room) return err('NOT_IN_ROOM');
    if (room.round === null) return err('GAME_NOT_STARTED');
    const result = applyMove(room.round, seat, move);
    if (!result.ok) return err(result.error);
    room.round = result.state;
    return ok({ room });
  }

  /**
   * Сокет места отключился: место держится reconnectGraceMs (K8), затем комната закрывается (K9).
   * Возвращает null, если комнаты нет или socketId уже не текущий сокет места.
   */
  disconnect(roomId: string, seat: PlayerIndex, socketId: string): Room | null {
    const room = this.rooms.get(roomId);
    const state = room?.seats[seat];
    if (!room || !state || state.socketId !== socketId) return null;
    state.socketId = null;
    this.clearTimer(state);
    state.graceTimer = setTimeout(() => {
      state.graceTimer = null;
      this.close(room, 'player_left');
    }, this.opts.reconnectGraceMs);
    return room;
  }

  /** Останавливает все таймеры и забывает комнаты (без onClose) — для остановки сервера. */
  closeAll(): void {
    for (const room of this.rooms.values()) this.clearTimers(room);
    this.rooms.clear();
  }

  private close(room: Room, reason: RoomClosedReason): void {
    if (this.rooms.get(room.id) !== room) return;
    this.clearTimers(room);
    this.rooms.delete(room.id);
    this.opts.onClose(room, reason);
  }

  private clearTimers(room: Room): void {
    for (const state of room.seats) if (state) this.clearTimer(state);
  }

  private clearTimer(state: SeatState): void {
    if (state.graceTimer) clearTimeout(state.graceTimer);
    state.graceTimer = null;
  }
}
