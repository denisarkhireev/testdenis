import type {
  AckResult,
  RoomCreatePayload,
  RoomErrorCode,
  RoomInfoAck,
  RoomInfoPayload,
  RoomJoinedAck,
  RoomJoinPayload,
  RoomRejoinedAck,
  RoomRejoinPayload,
} from '@domino/shared';
import type { ClientSocket } from '../socket';

/** L11 */
export const ACK_TIMEOUT_MS = 5000;

export type JoinResult = AckResult<RoomJoinedAck, RoomErrorCode> | 'timeout';
export type InfoResult = AckResult<RoomInfoAck, RoomErrorCode> | 'timeout';
export type RejoinResult = AckResult<RoomRejoinedAck, RoomErrorCode> | 'timeout';

/** Ack приходит как есть; reject (таймаут/обрыв) превращается в `'timeout'`. */
async function orTimeout<T>(request: () => Promise<T>): Promise<T | 'timeout'> {
  try {
    return await request();
  } catch {
    return 'timeout';
  }
}

export function createRoom(socket: ClientSocket, payload: RoomCreatePayload): Promise<JoinResult> {
  return orTimeout(() => socket.timeout(ACK_TIMEOUT_MS).emitWithAck('room:create', payload));
}

export function joinRoom(socket: ClientSocket, payload: RoomJoinPayload): Promise<JoinResult> {
  return orTimeout(() => socket.timeout(ACK_TIMEOUT_MS).emitWithAck('room:join', payload));
}

export function rejoinRoom(
  socket: ClientSocket,
  payload: RoomRejoinPayload,
): Promise<RejoinResult> {
  return orTimeout(() => socket.timeout(ACK_TIMEOUT_MS).emitWithAck('room:rejoin', payload));
}

/** spec-14 S7: настройки комнаты до входа; без побочных эффектов на сервере. */
export function roomInfo(socket: ClientSocket, payload: RoomInfoPayload): Promise<InfoResult> {
  return orTimeout(() => socket.timeout(ACK_TIMEOUT_MS).emitWithAck('room:info', payload));
}
