import { describe, expect, it } from 'vitest';
import { deal, HAND_SIZES, shuffle } from './deck';
import { createRng } from './rng';
import { createDoubleSix, tileKey } from './tiles';

describe('shuffle / deal', () => {
  it('R2: shuffle keeps the multiset, does not mutate input, depends on seed (T6)', () => {
    const input = Object.freeze(Array.from({ length: 28 }, (_, i) => i));
    const copy = [...input];
    const a = shuffle(input, createRng(1));
    const b = shuffle(input, createRng(2));
    expect(input).toEqual(copy);
    expect([...a].sort((x, y) => x - y)).toEqual(copy);
    expect([...b].sort((x, y) => x - y)).toEqual(copy);
    expect(a).not.toEqual(b);
    expect(shuffle(input, createRng(1))).toEqual(a);
  });

  it('R3: deal gives 7 / 7 / 14 in deck order', () => {
    const deck = createDoubleSix();
    const { hands, boneyard } = deal(deck);
    expect(hands[0].map(tileKey)).toEqual(deck.slice(0, 7).map(tileKey));
    expect(hands[1].map(tileKey)).toEqual(deck.slice(7, 14).map(tileKey));
    expect(boneyard.map(tileKey)).toEqual(deck.slice(14).map(tileKey));
  });

  it('S4-1: deal(deck, 5) gives 5 / 5 / 18 in deck order', () => {
    const deck = createDoubleSix();
    const { hands, boneyard } = deal(deck, 5);
    expect(hands[0].map(tileKey)).toEqual(deck.slice(0, 5).map(tileKey));
    expect(hands[1].map(tileKey)).toEqual(deck.slice(5, 10).map(tileKey));
    expect(boneyard.map(tileKey)).toEqual(deck.slice(10).map(tileKey));
    expect(boneyard).toHaveLength(18);
  });

  it('S4-2: deal(deck, 6) gives 6 / 6 / 16 in deck order', () => {
    const deck = createDoubleSix();
    const { hands, boneyard } = deal(deck, 6);
    expect(hands[0].map(tileKey)).toEqual(deck.slice(0, 6).map(tileKey));
    expect(hands[1].map(tileKey)).toEqual(deck.slice(6, 12).map(tileKey));
    expect(boneyard.map(tileKey)).toEqual(deck.slice(12).map(tileKey));
    expect(boneyard).toHaveLength(16);
  });

  it('S4-3: deal(deck) equals deal(deck, 7): 7 / 7 / 14', () => {
    const deck = shuffle(createDoubleSix(), createRng(7));
    expect(deal(deck)).toEqual(deal(deck, 7));
    expect(deal(deck).boneyard).toHaveLength(14);
  });

  it.each(HAND_SIZES.map((h) => [h]))(
    'S4-4: hand %i — 28 unique tiles in total, boneyard = 28 − 2h',
    (h) => {
      const deck = shuffle(createDoubleSix(), createRng(h));
      const { hands, boneyard } = deal(deck, h);
      expect(hands[0]).toHaveLength(h);
      expect(hands[1]).toHaveLength(h);
      expect(boneyard).toHaveLength(28 - 2 * h);
      const all = [...hands[0], ...hands[1], ...boneyard].map(tileKey);
      expect(new Set(all).size).toBe(28);
      expect(all).toEqual(deck.map(tileKey));
    },
  );

  it('S4-5: deal throws on a hand size outside 5 / 6 / 7', () => {
    const deck = createDoubleSix();
    expect(() => deal(deck, 4)).toThrow();
    expect(() => deal(deck, 8)).toThrow();
    expect(() => deal(deck, 6.5)).toThrow();
  });
});
