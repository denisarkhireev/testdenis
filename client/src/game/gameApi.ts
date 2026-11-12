import type { AckResult, GameErrorCode, Move } from '@domino/shared';
import { ACK_TIMEOUT_MS } from '../lobby/roomApi';
import type { ClientSocket } from '../socket';

export type MoveResult = AckResult<object, GameErrorCode> | 'timeout';

/** G5: ack приходит как есть; reject (таймаут/обрыв) превращается в `'timeout'`. */
export async function sendMove(socket: ClientSocket, move: Move): Promise<MoveResult> {
  try {
    return await socket.timeout(ACK_TIMEOUT_MS).emitWithAck('game:move', { move });
  } catch {
    return 'timeout';
  }
}
