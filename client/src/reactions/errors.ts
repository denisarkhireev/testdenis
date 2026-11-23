import type { ReactionErrorCode } from '@domino/shared';
import { DESYNC_TEXT } from '../game/errors';

/** spec-12 RX11g: исчерпывающий маппинг — новый код в протоколе ломает typecheck. */
export const REACTION_ERROR_TEXT: Record<ReactionErrorCode, string> = {
  TOO_FREQUENT: 'Не так часто',
  INVALID_PAYLOAD: DESYNC_TEXT,
  UNKNOWN_REACTION: DESYNC_TEXT,
  NOT_IN_ROOM: DESYNC_TEXT,
  GAME_NOT_STARTED: DESYNC_TEXT,
};
