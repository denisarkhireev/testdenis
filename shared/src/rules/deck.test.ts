import { describe, expect, it } from 'vitest';
import { deal, shuffle } from './deck';
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
});
