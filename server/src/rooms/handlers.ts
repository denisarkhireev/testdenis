import {
  toPlayerView,
  type ClientToServerEvents,
  type InterServerEvents,
  type PlayerIndex,
  type RoomClosedReason,
  type RoomStatePayload,
  type ServerToClientEvents,
  type SocketData,
} from '@domino/shared';
import type { Server, Socket } from 'socket.io';
import { roomPhase, type Room, type RoomManager } from './RoomManager';
import { isObject, parseMove, parseName, parseRoomId, parseToken } from './validate';

export type GameServer = Server<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData
>;
type GameSocket = Socket<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;
type EventName = keyof ClientToServerEvents;
type AckOf<E extends EventName> = Parameters<ClientToServerEvents[E]>[1];

/** Вид комнаты для игрока `you` (K11): своя рука, у соперника — только количество. */
export function toRoomState(room: Room, you: PlayerIndex): RoomStatePayload {
  return {
    roomId: room.id,
    you,
    phase: roomPhase(room),
    players: ([0, 1] as const).flatMap((seat) => {
      const state = room.seats[seat];
      return state ? [{ seat, name: state.name, connected: state.socketId !== null }] : [];
    }),
    game: room.round ? toPlayerView(room.round, you) : null,
  };
}

function socketById(io: GameServer, id: string | null): GameSocket | undefined {
  return id === null ? undefined : io.sockets.sockets.get(id);
}

/** Каждому подключённому игроку — свой room:state (широковещательный emit запрещён). */
export function broadcastState(io: GameServer, room: Room): void {
  for (const seat of [0, 1] as const) {
    const socket = socketById(io, room.seats[seat]?.socketId ?? null);
    socket?.emit('room:state', toRoomState(room, seat));
  }
}

function detach(socket: GameSocket): void {
  delete socket.data.roomId;
  delete socket.data.seat;
}

/** Обработчик onClose для RoomManager: уведомляет и отвязывает оставшиеся сокеты (K9). */
export function notifyRoomClosed(io: GameServer, room: Room, reason: RoomClosedReason): void {
  console.info(`room ${room.id} closed (${reason})`);
  for (const state of room.seats) {
    const socket = socketById(io, state?.socketId ?? null);
    if (!socket) continue;
    socket.emit('room:closed', { roomId: room.id, reason });
    detach(socket);
  }
}

/**
 * Обёртка: ack — обязательный последний аргумент; без него событие игнорируется.
 * Исключения обработчика не роняют сервер.
 */
function withAck<E extends EventName>(
  event: E,
  handler: (payload: unknown, ack: AckOf<E>) => void,
): (payload: unknown, ack?: unknown) => void {
  return (payload, ack) => {
    if (typeof ack !== 'function') {
      console.warn(`${event}: ignored, no ack callback`);
      return;
    }
    try {
      handler(payload, ack as AckOf<E>);
    } catch (error) {
      console.error(`${event}: handler failed`, error);
    }
  };
}

export function registerRoomHandlers(io: GameServer, rooms: RoomManager): void {
  io.on('connection', (socket) => {
    socket.on(
      'room:create',
      withAck('room:create', (payload, ack) => {
        if (socket.data.roomId !== undefined) return ack({ ok: false, error: 'ALREADY_IN_ROOM' });
        if (!isObject(payload)) return ack({ ok: false, error: 'INVALID_PAYLOAD' });
        const name = parseName(payload.name);
        if (!name.ok) return ack({ ok: false, error: 'INVALID_NAME' });

        const result = rooms.create(socket.id, name.value);
        if (!result.ok) return ack({ ok: false, error: result.error });
        const { room, seat, token } = result.value;
        socket.data.roomId = room.id;
        socket.data.seat = seat;
        console.info(`room ${room.id} created`);
        ack({ ok: true, roomId: room.id, seat, playerToken: token });
        broadcastState(io, room);
      }),
    );

    socket.on(
      'room:join',
      withAck('room:join', (payload, ack) => {
        if (socket.data.roomId !== undefined) return ack({ ok: false, error: 'ALREADY_IN_ROOM' });
        if (!isObject(payload)) return ack({ ok: false, error: 'INVALID_PAYLOAD' });
        const roomId = parseRoomId(payload.roomId);
        if (!roomId.ok) return ack({ ok: false, error: 'INVALID_PAYLOAD' });
        const name = parseName(payload.name);
        if (!name.ok) return ack({ ok: false, error: 'INVALID_NAME' });

        const result = rooms.join(socket.id, roomId.value, name.value);
        if (!result.ok) return ack({ ok: false, error: result.error });
        const { room, seat, token } = result.value;
        socket.data.roomId = room.id;
        socket.data.seat = seat;
        console.info(`room ${room.id} joined, round started`);
        ack({ ok: true, roomId: room.id, seat, playerToken: token });
        broadcastState(io, room);
      }),
    );

    socket.on(
      'room:rejoin',
      withAck('room:rejoin', (payload, ack) => {
        if (socket.data.roomId !== undefined) return ack({ ok: false, error: 'ALREADY_IN_ROOM' });
        if (!isObject(payload)) return ack({ ok: false, error: 'INVALID_PAYLOAD' });
        const roomId = parseRoomId(payload.roomId);
        const token = parseToken(payload.playerToken);
        if (!roomId.ok || !token.ok) return ack({ ok: false, error: 'INVALID_PAYLOAD' });

        const result = rooms.rejoin(socket.id, roomId.value, token.value);
        if (!result.ok) return ack({ ok: false, error: result.error });
        const { room, seat, replacedSocketId } = result.value;
        socket.data.roomId = room.id;
        socket.data.seat = seat;
        console.info(`room ${room.id} rejoined (seat ${seat})`);
        ack({ ok: true, roomId: room.id, seat });

        const replaced = socketById(io, replacedSocketId);
        if (replaced) {
          replaced.emit('room:closed', { roomId: room.id, reason: 'replaced' });
          detach(replaced);
        }
        broadcastState(io, room);
      }),
    );

    socket.on(
      'game:move',
      withAck('game:move', (payload, ack) => {
        const move = isObject(payload) ? parseMove(payload.move) : null;
        if (!move?.ok) return ack({ ok: false, error: 'INVALID_PAYLOAD' });
        const { roomId, seat } = socket.data;
        if (roomId === undefined || seat === undefined) {
          return ack({ ok: false, error: 'NOT_IN_ROOM' });
        }

        const result = rooms.move(roomId, seat, move.value);
        if (!result.ok) return ack({ ok: false, error: result.error });
        ack({ ok: true });
        broadcastState(io, result.value.room);
      }),
    );

    socket.on('disconnect', () => {
      const { roomId, seat } = socket.data;
      if (roomId === undefined || seat === undefined) return;
      detach(socket);
      const room = rooms.disconnect(roomId, seat, socket.id);
      if (room) broadcastState(io, room);
    });
  });
}
