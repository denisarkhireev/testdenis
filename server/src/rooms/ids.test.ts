import { describe, expect, it, vi } from 'vitest';
import { generateRoomId, generateToken, ROOM_ID_ALPHABET } from './ids';

describe('ids', () => {
  it('U1: generateRoomId returns 6 chars from the K2 alphabet', () => {
    const allowed = new Set(ROOM_ID_ALPHABET);
    for (let i = 0; i < 1000; i++) {
      const id = generateRoomId();
      expect(id).toHaveLength(6);
      for (const ch of id) expect(allowed.has(ch)).toBe(true);
    }
    expect(ROOM_ID_ALPHABET).not.toMatch(/[IO01]/);
  });

  it('U2: generateRoomId regenerates on collision and returns the 4th candidate', () => {
    const seen: string[] = [];
    const exists = vi.fn((id: string) => {
      seen.push(id);
      return seen.length <= 3;
    });
    const id = generateRoomId(exists);
    expect(exists).toHaveBeenCalledTimes(4);
    expect(id).toBe(seen[3]);
  });

  it('generateRoomId throws instead of looping forever when every id is taken', () => {
    expect(() => generateRoomId(() => true)).toThrow(/collisions/);
  });

  it('generateToken returns distinct UUIDs', () => {
    const a = generateToken();
    expect(a).toMatch(/^[0-9a-f-]{36}$/);
    expect(generateToken()).not.toBe(a);
  });
});
