import { describe, expect, it } from 'vitest';
import { handOf, nextSeat, otherTeam, partnerOf, playerCountOf, teamOf, teamSeats } from './seats';
import { makeState } from './test-utils';

describe('места и команды (spec-17 Q1)', () => {
  it('Q1-1: teamOf, partnerOf, nextSeat, teamSeats', () => {
    expect(([0, 1] as const).map((s) => teamOf(s, 2))).toEqual([0, 1]);
    expect(([0, 1, 2, 3] as const).map((s) => teamOf(s, 4))).toEqual([0, 1, 0, 1]);
    expect(partnerOf(1)).toBe(3);
    expect(partnerOf(2)).toBe(0);
    expect(nextSeat(3, 4)).toBe(0);
    expect(nextSeat(1, 4)).toBe(2);
    expect(nextSeat(1, 2)).toBe(0);
    expect(teamSeats(1, 4)).toEqual([1, 3]);
    expect(teamSeats(0, 4)).toEqual([0, 2]);
    expect(teamSeats(1, 2)).toEqual([1]);
    expect(otherTeam(0)).toBe(1);
  });

  it('Q1-1: playerCountOf и handOf по рукам состояния', () => {
    expect(playerCountOf(makeState())).toBe(2);
    const four = makeState({ hands: [[], [[0, 1]], [], []] });
    expect(playerCountOf(four)).toBe(4);
    expect(handOf(four, 1)).toEqual([[0, 1]]);
    expect(handOf(makeState(), 3)).toEqual([]);
  });
});
