import type { GameErrorCode } from '@domino/shared';

const DESYNC_TEXT = 'Так сходить нельзя — обновляем стол';
const GENERIC_TEXT = 'Что-то пошло не так, попробуйте ещё раз';

/** 3.4: исчерпывающий маппинг — новый код в протоколе ломает typecheck. */
export const GAME_ERROR_TEXT: Record<GameErrorCode, string> = {
  NOT_YOUR_TURN: 'Сейчас ход соперника',
  TILE_DOES_NOT_FIT: DESYNC_TEXT,
  MUST_PLAY_OPENING_TILE: DESYNC_TEXT,
  TILE_NOT_IN_HAND: DESYNC_TEXT,
  MUST_PLAY: DESYNC_TEXT,
  BONEYARD_EMPTY: DESYNC_TEXT,
  BONEYARD_NOT_EMPTY: DESYNC_TEXT,
  ROUND_FINISHED: 'Раунд уже окончен',
  GAME_NOT_STARTED: GENERIC_TEXT,
  NOT_IN_ROOM: GENERIC_TEXT,
  INVALID_PAYLOAD: GENERIC_TEXT,
};
