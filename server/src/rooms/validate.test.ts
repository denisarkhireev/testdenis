import { describe, expect, it } from 'vitest';
import {
  parseMove,
  parseName,
  parseOpponent,
  parseOption,
  parseReactionId,
  parseRoomId,
  parseTurnSeconds,
  parseVariant,
} from './validate';

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

  it('T1b: parseTurnSeconds accepts only listed integers, missing → fallback', () => {
    const allowed = [0, 30, 60];
    expect(parseTurnSeconds(undefined, allowed, 60)).toEqual({ ok: true, value: 60 });
    for (const good of allowed) {
      expect(parseTurnSeconds(good, allowed, 60)).toEqual({ ok: true, value: good });
    }
    for (const bad of [45, '60', -1, 3, 30.5, null, NaN]) {
      expect(parseTurnSeconds(bad, allowed, 60)).toEqual({ ok: false });
    }
    expect(parseTurnSeconds(3, [0, 3, 30, 60], 60)).toEqual({ ok: true, value: 3 });
  });

  it('RX3: parseReactionId accepts any string as is, rejects non-strings', () => {
    expect(parseReactionId(' fish')).toEqual({ ok: true, value: ' fish' });
    expect(parseReactionId('')).toEqual({ ok: true, value: '' });
    for (const bad of [42, null, undefined, {}, ['fish']]) {
      expect(parseReactionId(bad)).toEqual({ ok: false });
    }
  });

  it('S3-1: parseOption — missing → fallback, only listed integers', () => {
    const allowed = [51, 101, 151];
    expect(parseOption(undefined, allowed, 101)).toEqual({ ok: true, value: 101 });
    expect(parseOption(151, allowed, 101)).toEqual({ ok: true, value: 151 });
    for (const bad of [100, '101', null, 101.5, NaN, [101], {}]) {
      expect(parseOption(bad, allowed, 101)).toEqual({ ok: false });
    }
    for (const bad of [4, 8, 6.5, '5']) {
      expect(parseOption(bad, [5, 6, 7], 7)).toEqual({ ok: false });
    }
  });

  it('V1: parseOpponent — undefined → human; human/bot ok; anything else fails (spec-15)', () => {
    expect(parseOpponent(undefined)).toEqual({ ok: true, value: 'human' });
    expect(parseOpponent('human')).toEqual({ ok: true, value: 'human' });
    expect(parseOpponent('bot')).toEqual({ ok: true, value: 'bot' });
    for (const bad of ['Bot', 'robot', '', 1, null, {}, ['bot']]) {
      expect(parseOpponent(bad)).toEqual({ ok: false });
    }
  });

  it('K8-1: parseVariant — undefined → classic; classic/kozel ok; anything else fails (spec-16)', () => {
    expect(parseVariant(undefined)).toEqual({ ok: true, value: 'classic' });
    expect(parseVariant('classic')).toEqual({ ok: true, value: 'classic' });
    expect(parseVariant('kozel')).toEqual({ ok: true, value: 'kozel' });
    for (const bad of ['KOZEL', 'goat', '', null, 1, {}, ['kozel'], 'toString']) {
      expect(parseVariant(bad)).toEqual({ ok: false });
    }
  });
});
