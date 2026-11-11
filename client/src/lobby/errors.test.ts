import type { RoomErrorCode } from '@domino/shared';
import { describe, expect, it } from 'vitest';
import { ROOM_ERROR_TEXT } from './errors';

describe('error texts', () => {
  it('C4: ROOM_ERROR_TEXT covers every RoomErrorCode', () => {
    const codes = Object.keys(ROOM_ERROR_TEXT) as RoomErrorCode[];
    expect(codes).toHaveLength(6);
    expect(ROOM_ERROR_TEXT.ROOM_FULL).toBe('В этой игре уже два игрока');
    expect(ROOM_ERROR_TEXT.INVALID_NAME).toBe('Имя — от 1 до 20 символов');
    for (const code of codes) expect(ROOM_ERROR_TEXT[code]).not.toBe('');
  });
});
