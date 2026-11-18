import type { GameErrorCode } from '@domino/shared';
import { describe, expect, it } from 'vitest';
import { GAME_ERROR_TEXT } from './errors';

describe('game error texts', () => {
  it('T-4: GAME_ERROR_TEXT covers every GameErrorCode', () => {
    const codes = Object.keys(GAME_ERROR_TEXT) as GameErrorCode[];
    expect(codes).toHaveLength(11);
    expect(GAME_ERROR_TEXT.NOT_YOUR_TURN).toBe('Сейчас ход соперника');
    expect(GAME_ERROR_TEXT.TILE_DOES_NOT_FIT).toBe('Так сходить нельзя — обновляем стол');
    expect(GAME_ERROR_TEXT.ROUND_FINISHED).toBe('Раунд уже окончен');
    expect(GAME_ERROR_TEXT.INVALID_PAYLOAD).toBe('Что-то пошло не так, попробуйте ещё раз');
    for (const code of codes) expect(GAME_ERROR_TEXT[code]).not.toBe('');
  });
});
