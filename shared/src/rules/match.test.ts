import { describe, expect, it } from 'vitest';
import { MATCH_TARGET, createMatch, nextRoundNumber, recordRound, type MatchState } from './match';
import type { RoundResult } from './types';

const domino = (winner: 0 | 1, points: number): RoundResult => ({
  reason: 'domino',
  winner,
  points,
  handPoints: winner === 0 ? [0, points] : [points, 0],
});

const withScores = (scores: [number, number]): MatchState => ({ ...createMatch(), scores });

describe('match', () => {
  it('M1: createMatch() starts 0:0 to 101; invalid target throws', () => {
    expect(MATCH_TARGET).toBe(101);
    expect(createMatch()).toEqual({
      target: 101,
      scores: [0, 0],
      roundNumber: 1,
      rounds: [],
      winner: null,
    });
    expect(createMatch(5).target).toBe(5);
    expect(() => createMatch(0)).toThrow();
    expect(() => createMatch(1.5)).toThrow();
    expect(() => createMatch(-3)).toThrow();
  });

  it('M2a: recordRound adds points to the round winner, input untouched', () => {
    const match = createMatch();
    const snapshot = structuredClone(match);
    const result = domino(1, 19);
    const next = recordRound(match, result);
    expect(next.scores).toEqual([0, 19]);
    expect(next.rounds).toEqual([result]);
    expect(next.winner).toBeNull();
    expect(match).toEqual(snapshot);
  });

  it('M2b: a draw keeps the score and is kept in history', () => {
    const draw: RoundResult = { reason: 'fish', winner: null, points: 0, handPoints: [12, 12] };
    const next = recordRound(withScores([10, 20]), draw);
    expect(next.scores).toEqual([10, 20]);
    expect(next.rounds).toEqual([draw]);
    expect(next.winner).toBeNull();
  });

  it('M3a: reaching exactly the target wins the match', () => {
    const next = recordRound(withScores([95, 0]), domino(0, 6));
    expect(next.scores).toEqual([101, 0]);
    expect(next.winner).toBe(0);
  });

  it('M3b: below the target the match goes on', () => {
    const next = recordRound(withScores([95, 0]), domino(0, 5));
    expect(next.scores).toEqual([100, 0]);
    expect(next.winner).toBeNull();
  });

  it('M3c: recordRound on a finished match throws', () => {
    const finished = recordRound(withScores([95, 0]), domino(0, 30));
    expect(finished.winner).toBe(0);
    expect(() => recordRound(finished, domino(1, 3))).toThrow();
  });

  it('M4: nextRoundNumber increments only the round number', () => {
    const match = recordRound(createMatch(), domino(0, 7));
    const next = nextRoundNumber(match);
    expect(next).toEqual({ ...match, roundNumber: 2 });
    expect(match.roundNumber).toBe(1);
  });
});
