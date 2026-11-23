import { describe, expect, it } from 'vitest';
import {
  REACTION_COOLDOWN_MS,
  REACTION_IDS,
  REACTION_SHOW_MS,
  REACTIONS,
  isReactionId,
  reactionById,
} from './reactions';

describe('reactions (spec-12)', () => {
  it('RX1a: exactly 9 reactions with unique ids, texts from the card in order', () => {
    expect(REACTIONS).toHaveLength(9);
    expect(new Set(REACTION_IDS).size).toBe(9);
    expect(REACTIONS.map((r) => r.text)).toEqual([
      '👍',
      '😂',
      '😮',
      '😡',
      '🎉',
      'Ну ты даёшь',
      'Рыба!',
      'Ходи уже',
      'Хорошая игра',
    ]);
    expect(REACTIONS.slice(0, 5).every((r) => r.kind === 'emoji')).toBe(true);
    expect(REACTIONS.slice(5).every((r) => r.kind === 'phrase')).toBe(true);
    for (const r of REACTIONS) expect(r.label.length).toBeGreaterThan(0);
  });

  it('RX1b: constants and reactionById', () => {
    expect(REACTION_COOLDOWN_MS).toBe(2000);
    expect(REACTION_SHOW_MS).toBe(3000);
    expect(reactionById('fish').text).toBe('Рыба!');
  });

  it('RX3u: every id from the list is accepted', () => {
    for (const id of REACTION_IDS) expect(isReactionId(id)).toBe(true);
  });

  it('RX3v: anything else is rejected', () => {
    for (const value of [
      '👍',
      'Рыба!',
      '',
      'THUMBS_UP',
      ' fish',
      '__proto__',
      'toString',
      'constructor',
      1,
      null,
      undefined,
      {},
    ]) {
      expect(isReactionId(value)).toBe(false);
    }
  });
});
