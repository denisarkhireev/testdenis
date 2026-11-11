import type { RoomErrorCode } from '@domino/shared';

/** 3.4: исчерпывающий маппинг — новый код в протоколе ломает typecheck. */
export const ROOM_ERROR_TEXT: Record<RoomErrorCode, string> = {
  INVALID_PAYLOAD: 'Что-то пошло не так, попробуйте ещё раз',
  INVALID_NAME: 'Имя — от 1 до 20 символов',
  ROOM_NOT_FOUND: 'Комната не найдена или ссылка устарела',
  ROOM_FULL: 'В этой игре уже два игрока',
  ALREADY_IN_ROOM: 'Вы уже в игре — обновите страницу',
  INVALID_TOKEN: 'Не удалось вернуться в игру',
};

export const TIMEOUT_TEXT = 'Сервер не отвечает, попробуйте ещё раз';

/** L9: любая неудача авто-возврата. */
export const REJOIN_FAILED_TEXT = 'Не удалось вернуться в игру';
