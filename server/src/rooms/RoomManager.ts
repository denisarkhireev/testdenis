import {
  applyMove,
  createMatch,
  DEFAULT_HAND_SIZE,
  DEFAULT_TURN_SECONDS,
  MATCH_TARGET,
  MATCH_TARGET_OPTIONS,
  TURN_SECONDS_OPTIONS,
  forfeitMatch,
  isReactionId,
  nextRoundNumber,
  pickAutoMove,
  REACTION_COOLDOWN_MS,
  recordRound,
  startRound,
  type MatchState,
  type GameErrorCode,
  type Move,
  type MoveError,
  type PlayerIndex,
  type ReactionErrorCode,
  type RoomClosedReason,
  type RoomErrorCode,
  type RoomPhase,
  type RoomReactionPayload,
  type RoomSettings,
  type RoundState,
} from '@domino/shared';
import { generateRoomId, generateToken } from './ids';

export type Result<T, E extends string> = { ok: true; value: T } | { ok: false; error: E };

export interface SeatState {
  name: string;
  token: string;
  /** null — место отключено и ждёт room:rejoin (K8). */
  socketId: string | null;
  /** Таймер RECONNECT_TIMEOUT отключённого места (RC1). */
  reconnectTimer: NodeJS.Timeout | null;
  /** RC1, RC8: момент (по `now()`), когда истекает ожидание; null — место подключено. */
  reconnectDeadline: number | null;
  /** spec-12 RX4, RX9: когда (по `now()`) место последний раз отправило принятую реакцию. */
  lastReactionAt: number | null;
}

/** spec-11: таймер текущего хода (T2–T10). */
export interface TurnTimerState {
  seat: PlayerIndex;
  /** Монотонный номер хода (T8). */
  seq: number;
  /** Идёт: момент истечения по now(); на паузе — null. */
  deadline: number | null;
  /** На паузе: замороженный остаток, мс; идёт — null. */
  pausedRemainingMs: number | null;
  handle: NodeJS.Timeout | null;
}

export interface Room {
  id: string;
  seats: [SeatState, SeatState | null];
  /** null в фазе waiting. Хранится только на сервере (K5). */
  round: RoundState | null;
  /** null в фазе waiting; иначе текущий матч (spec-7 M1). */
  match: MatchState | null;
  /** Готовность мест к следующему раунду/реваншу (M4–M6). Хранится за местом, не за сокетом (M8). */
  ready: [boolean, boolean];
  /** spec-11 T1: время на ход, с; 0 — таймер выключен. Не меняется до закрытия комнаты. */
  turnSeconds: number;
  /** spec-14 S1, S6: цель матча комнаты. Не меняется до закрытия комнаты (раунды, реванш). */
  matchTarget: number;
  /** spec-14 S1, S4: размер руки комнаты. Не меняется до закрытия комнаты. */
  handSize: number;
  /** spec-11: null — таймер не идёт (T3). */
  turnTimer: TurnTimerState | null;
}

export interface RoomManagerOptions {
  roundSeed: () => number;
  /** RC2: сколько ждать возвращения отключившегося игрока, мс. */
  reconnectTimeoutMs: number;
  /** Часы для дедлайнов (RC8). По умолчанию Date.now; тесты подставляют фейковые. */
  now?: () => number;
  /** spec-14 S2, S3: цель матча комнаты по умолчанию (MATCH_TARGET из env), по умолчанию MATCH_TARGET. */
  matchTarget?: number;
  /**
   * Фабрика раунда — только для тестов (N11). По умолчанию
   * startRound({ seed: roundSeed(), handSize: room.handSize }).
   */
  startRound?: (room: Room) => RoundState;
  /** Вызывается, когда комната закрыта и уже удалена из менеджера. */
  onClose: (room: Room, reason: RoomClosedReason) => void;
  /** RC5: техническое поражение места `loser`; вызывается, когда комната уже удалена из менеджера. */
  onForfeit: (room: Room, loser: PlayerIndex) => void;
  /** spec-11: допустимые turnSeconds (по умолчанию [0, 30, 60]). */
  allowedTurnSeconds?: readonly number[];
  /** spec-11 T6: сделан авто-ход по таймеру (комната ещё в менеджере). */
  onAutoMove: (room: Room) => void;
}

export function roomPhase(room: Room): RoomPhase {
  if (room.round === null) return 'waiting';
  // RC7: техпоражение — матч окончен независимо от статуса раунда.
  if (room.match?.forfeit != null) return 'finished';
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
  /** spec-11 T8: сквозной счётчик ходов для таймера. */
  private turnSeq = 0;
  /** spec-12 RX7: сквозной счётчик реакций. */
  private reactionSeq = 0;

  constructor(private readonly opts: RoomManagerOptions) {}

  /** spec-11 T1: допустимые значения времени на ход, с, по возрастанию. */
  get allowedTurnSeconds(): readonly number[] {
    return this.opts.allowedTurnSeconds ?? TURN_SECONDS_OPTIONS;
  }

  /** spec-14 S3: цель матча для room:create без поля matchTarget. */
  get defaultMatchTarget(): number {
    return this.opts.matchTarget ?? MATCH_TARGET;
  }

  /** spec-14 S2: {51, 101, 151} ∪ {defaultMatchTarget}, по возрастанию. */
  get allowedMatchTargets(): readonly number[] {
    return [...new Set([...MATCH_TARGET_OPTIONS, this.defaultMatchTarget])].sort((a, b) => a - b);
  }

  get(roomId: string): Room | undefined {
    return this.rooms.get(roomId);
  }

  create(
    socketId: string,
    name: string,
    settings: Partial<RoomSettings> = {},
  ): Result<{ room: Room; seat: 0; token: string }, RoomErrorCode> {
    // Значения уже проверены обработчиком room:create (S3); здесь — только умолчания.
    const {
      matchTarget = this.defaultMatchTarget,
      handSize = DEFAULT_HAND_SIZE,
      turnSeconds = DEFAULT_TURN_SECONDS,
    } = settings;
    const id = generateRoomId((candidate) => this.rooms.has(candidate));
    const token = generateToken();
    const room: Room = {
      id,
      seats: [
        {
          name,
          token,
          socketId,
          reconnectTimer: null,
          reconnectDeadline: null,
          lastReactionAt: null,
        },
        null,
      ],
      round: null,
      match: null,
      ready: [false, false],
      turnSeconds,
      matchTarget,
      handSize,
      turnTimer: null,
    };
    this.rooms.set(id, room);
    return ok({ room, seat: 0, token });
  }

  /** spec-14 S7: настройки комнаты без входа в неё; чистое чтение. */
  info(roomId: string): Result<RoomSettings, 'ROOM_NOT_FOUND'> {
    const room = this.rooms.get(roomId);
    if (!room) return err('ROOM_NOT_FOUND');
    return ok({
      matchTarget: room.matchTarget,
      handSize: room.handSize,
      turnSeconds: room.turnSeconds,
    });
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
    room.seats[1] = {
      name,
      token,
      socketId,
      reconnectTimer: null,
      reconnectDeadline: null,
      lastReactionAt: null,
    };
    // K4: waiting → playing синхронно при успешном входе; M1: вместе с первым раундом — матч.
    room.match = createMatch(room.matchTarget); // S6
    room.ready = [false, false];
    room.round = this.newRound(room);
    this.syncTurnTimer(room);
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
    state.reconnectDeadline = null; // RC3
    const previous = state.socketId;
    state.socketId = socketId;
    this.syncTurnTimer(room); // T7: продолжение с замороженного остатка
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
    const result = this.apply(room, seat, move);
    if (!result.ok) return result;
    this.syncTurnTimer(room);
    return ok({ room });
  }

  /**
   * «Следующий раунд» / «Реванш» от места (M4–M7). `changed: false` — повтор, состояние то же (M6).
   * Когда готовы оба — синхронно стартует новый раунд (или новый матч, если этот окончен).
   */
  ready(
    roomId: string,
    seat: PlayerIndex,
  ): Result<{ room: Room; changed: boolean; started: 'round' | 'match' | null }, GameErrorCode> {
    const room = this.rooms.get(roomId);
    if (!room) return err('NOT_IN_ROOM');
    if (room.round === null || room.match === null) return err('GAME_NOT_STARTED');
    if (room.round.status === 'playing') return err('ROUND_NOT_FINISHED');
    if (room.ready[seat]) return ok({ room, changed: false, started: null });

    room.ready[seat] = true;
    if (!room.ready[0] || !room.ready[1]) return ok({ room, changed: true, started: null });

    const rematch = room.match.winner !== null;
    room.match = rematch ? createMatch(room.matchTarget) : nextRoundNumber(room.match);
    room.round = this.newRound(room);
    room.ready = [false, false];
    this.syncTurnTimer(room);
    return ok({ room, changed: true, started: rematch ? 'match' : 'round' });
  }

  /**
   * spec-12: реакция места (RX2–RX9). Порядок проверок — RX5. Состояние комнаты, кроме
   * `lastReactionAt` места, не меняется; таймеры не трогаются (RX8).
   */
  react(
    roomId: string,
    seat: PlayerIndex,
    reactionId: string,
  ): Result<{ room: Room; reaction: RoomReactionPayload }, ReactionErrorCode> {
    const room = this.rooms.get(roomId);
    const state = room?.seats[seat];
    if (!room || !state) return err('NOT_IN_ROOM');
    if (room.round === null) return err('GAME_NOT_STARTED');
    if (!isReactionId(reactionId)) return err('UNKNOWN_REACTION');
    const now = this.now();
    if (state.lastReactionAt !== null && now - state.lastReactionAt < REACTION_COOLDOWN_MS) {
      return err('TOO_FREQUENT');
    }
    state.lastReactionAt = now;
    return ok({ room, reaction: { seat, reactionId, seq: ++this.reactionSeq } });
  }

  /**
   * Сокет места отключился: место держится reconnectTimeoutMs (RC1), затем `expire` (RC4–RC6).
   * Возвращает null, если комнаты нет или socketId уже не текущий сокет места.
   */
  disconnect(roomId: string, seat: PlayerIndex, socketId: string): Room | null {
    const room = this.rooms.get(roomId);
    const state = room?.seats[seat];
    if (!room || !state || state.socketId !== socketId) return null;
    state.socketId = null;
    this.clearTimer(state);
    state.reconnectDeadline = this.now() + this.opts.reconnectTimeoutMs;
    state.reconnectTimer = setTimeout(() => {
      state.reconnectTimer = null;
      this.expire(room, seat);
    }, this.opts.reconnectTimeoutMs);
    this.syncTurnTimer(room); // T7: пауза
    return room;
  }

  /** Останавливает все таймеры и забывает комнаты (без onClose) — для остановки сервера. */
  closeAll(): void {
    for (const room of this.rooms.values()) this.clearTimers(room);
    this.rooms.clear();
  }

  /** spec-14 S4: раунд с размером руки комнаты. */
  private newRound(room: Room): RoundState {
    return this.opts.startRound
      ? this.opts.startRound(room)
      : startRound({ seed: this.opts.roundSeed(), handSize: room.handSize });
  }

  private now(): number {
    return (this.opts.now ?? Date.now)();
  }

  /** Ход по правилам + очки раунда (общая часть ручного хода и авто-хода, T6). */
  private apply(room: Room, seat: PlayerIndex, move: Move): Result<null, MoveError> {
    const previous = room.round!;
    const result = applyMove(previous, seat, move);
    if (!result.ok) return err(result.error);
    room.round = result.state;
    // M2, M3: очки раунда — ровно один раз, в момент перехода playing → finished.
    if (previous.status === 'playing' && result.state.status === 'finished' && room.match) {
      room.match = recordRound(room.match, result.state.result!);
    }
    return ok(null);
  }

  /**
   * spec-11: единственное место, которое решает судьбу таймера хода.
   * T3 — не идёт; T2 — новый ход с полным лимитом, тот же ход — с остатка; T7 — пауза.
   */
  private syncTurnTimer(room: Room): void {
    const previous = room.turnTimer;
    if (previous?.handle) clearTimeout(previous.handle);
    const round = room.round;
    const match = room.match;
    if (
      room.turnSeconds === 0 ||
      round === null ||
      round.status !== 'playing' ||
      match === null ||
      match.winner !== null ||
      match.forfeit != null
    ) {
      room.turnTimer = null;
      return;
    }

    const seat = round.currentPlayer;
    const now = this.now();
    let seq: number;
    let remaining: number;
    if (previous && previous.seat === seat) {
      seq = previous.seq;
      remaining =
        previous.deadline !== null
          ? Math.max(0, previous.deadline - now)
          : (previous.pausedRemainingMs ?? 0);
    } else {
      seq = ++this.turnSeq;
      remaining = room.turnSeconds * 1000;
    }

    const paused = room.seats.some((state) => state === null || state.socketId === null);
    room.turnTimer = paused
      ? { seat, seq, deadline: null, pausedRemainingMs: remaining, handle: null }
      : {
          seat,
          seq,
          deadline: now + remaining,
          pausedRemainingMs: null,
          handle: setTimeout(() => this.onTurnTimeout(room, seq), remaining),
        };
  }

  /** spec-11 T4, T6, T8: время вышло — доиграть ход за `currentPlayer` целиком. */
  private onTurnTimeout(room: Room, seq: number): void {
    const timer = room.turnTimer;
    if (
      this.rooms.get(room.id) !== room ||
      !timer ||
      timer.seq !== seq ||
      timer.deadline === null
    ) {
      return;
    }
    timer.handle = null;
    const seat = timer.seat;
    // spec-11 T4 / spec-14: весь базар доборов + ход (рука 7 → 15, рука 5 → 19) — больше не бывает.
    const maxMoves = (room.round?.boneyard.length ?? 0) + 1;
    let moves = 0;
    let failed = false;
    while (
      room.round?.status === 'playing' &&
      room.round.currentPlayer === seat &&
      moves < maxMoves
    ) {
      const move = pickAutoMove(room.round);
      const result = move ? this.apply(room, seat, move) : err('ROUND_FINISHED');
      if (!result.ok) {
        // §10 п.8: невозможно по построению; не роняем сервер и не зацикливаемся.
        console.error(`room ${room.id} auto-move failed (seat ${seat}): ${result.error}`);
        failed = true;
        break;
      }
      moves++;
    }
    console.info(`room ${room.id} auto-move (seat ${seat}, ${moves} moves)`);
    if (failed) room.turnTimer = null; // перезапуск с полным лимитом вместо мгновенного повтора
    this.syncTurnTimer(room);
    this.opts.onAutoMove(room);
  }

  /** Истёк таймаут места `loser`: RC4/RC6 — закрыть комнату, RC5 — техническое поражение. */
  private expire(room: Room, loser: PlayerIndex): void {
    if (this.rooms.get(room.id) !== room) return;
    const opponent = room.seats[loser === 0 ? 1 : 0];
    if (!opponent || !room.match || room.match.winner !== null || opponent.socketId === null) {
      this.close(room, 'player_left');
      return;
    }
    room.match = forfeitMatch(room.match, loser);
    room.ready = [false, false];
    this.clearTimers(room);
    this.rooms.delete(room.id);
    this.opts.onForfeit(room, loser);
  }

  private close(room: Room, reason: RoomClosedReason): void {
    if (this.rooms.get(room.id) !== room) return;
    this.clearTimers(room);
    this.rooms.delete(room.id);
    this.opts.onClose(room, reason);
  }

  private clearTimers(room: Room): void {
    for (const state of room.seats) if (state) this.clearTimer(state);
    if (room.turnTimer?.handle) clearTimeout(room.turnTimer.handle);
    room.turnTimer = null;
  }

  private clearTimer(state: SeatState): void {
    if (state.reconnectTimer) clearTimeout(state.reconnectTimer);
    state.reconnectTimer = null;
  }
}
