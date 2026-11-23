import type { AckResult, ReactionErrorCode, ReactionId } from '@domino/shared';
import { ACK_TIMEOUT_MS } from '../lobby/roomApi';
import type { ClientSocket } from '../socket';

export type ReactionResult = AckResult<object, ReactionErrorCode> | 'timeout';

/** spec-12: `game:react { reactionId }`; reject (таймаут/обрыв) превращается в `'timeout'`. */
export async function sendReaction(
  socket: ClientSocket,
  reactionId: ReactionId,
): Promise<ReactionResult> {
  try {
    return await socket.timeout(ACK_TIMEOUT_MS).emitWithAck('game:react', { reactionId });
  } catch {
    return 'timeout';
  }
}
