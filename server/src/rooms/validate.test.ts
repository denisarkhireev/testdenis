import { describe, expect, it } from 'vitest';
import { parseMove, parseName, parseRoomId } from './validate';

describe('validate', () => {
  it('U3: parseName trims and limits length to 1–20', () => {
    expect(parseName('  Аня ')).toEqual({ ok: true, value: 'Аня' });
    for (const bad of ['', '   ', 'x'.repeat(21), 42]) {
      expect(parseName(bad)).toEqual({ ok: false });
    }
    expect(parseName('x'.repeat(20))).toEqual({ ok: true, value: 'x'.repeat(20) });
  });

  it('U4: parseRoomId normalizes with trim().toUpperCase()', () => {
    expect(parseRoomId(' abc234 ')).toEqual({ ok: true, value: 'ABC234' });
    expect(parseRoomId(123)).toEqual({ ok: false });
    expect(parseRoomId(null)).toEqual({ ok: false });
  });

  it('U5: parseMove accepts play/draw/pass and rejects garbage', () => {
    expect(parseMove({ type: 'play', tile: [6, 3], end: 'right', extra: 1 })).toEqual({
      ok: true,
      value: { type: 'play', tile: [6, 3], end: 'right' },
    });
    expect(parseMove({ type: 'draw', tile: [1, 1] })).toEqual({
      ok: true,
      value: { type: 'draw' },
    });
    expect(parseMove({ type: 'pass' })).toEqual({ ok: true, value: { type: 'pass' } });

    const bad: unknown[] = [
      { type: 'play', tile: [7, 1], end: 'left' },
      { type: 'play', tile: [1.5, 2], end: 'left' },
      { type: 'play', tile: [1], end: 'left' },
      { type: 'play', tile: [1, 2], end: 'top' },
      { type: 'play', tile: '1-2', end: 'left' },
      { type: 'x' },
      null,
      'draw',
      [],
    ];
    for (const value of bad) expect(parseMove(value)).toEqual({ ok: false });
  });

  it('U5: parseMove returns a new object, not the input', () => {
    const tile = [2, 5];
    const input = { type: 'play', tile, end: 'left' };
    const parsed = parseMove(input);
    expect(parsed.ok && parsed.value).not.toBe(input);
    expect(parsed.ok && parsed.value.type === 'play' && parsed.value.tile).not.toBe(tile);
  });
});
