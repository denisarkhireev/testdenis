import { describe, expect, it } from 'vitest';
import { applyMove, getLegalMoves, startRound } from './round';
import { sameTile, tileKey } from './tiles';
import type { RoundState, Tile } from './types';
import { toPlayerView } from './view';

function midRound(): RoundState {
  let s = startRound({ seed: 42 });
  for (let i = 0; i < 3; i++) {
    const move = getLegalMoves(s)[0];
    if (!move) break;
    const r = applyMove(s, s.currentPlayer, move);
    if (!r.ok) throw new Error(r.error);
    s = r.state;
  }
  return s;
}

describe('toPlayerView', () => {
  it('hides opponent and boneyard tiles mid-round (V1)', () => {
    const s = midRound();
    expect(s.status).toBe('playing');
    for (const you of [0, 1] as const) {
      const opp = you === 0 ? 1 : 0;
      const view = toPlayerView(s, you);
      expect(view.you).toBe(you);
      expect(view.hand).toEqual(s.hands[you]);
      expect(view.opponentHandCount).toBe(s.hands[opp].length);
      expect(view.boneyardCount).toBe(s.boneyard.length);
      expect(view.board).toEqual(s.board);
      const json = JSON.stringify(view);
      const hidden: Tile[] = [...s.hands[opp], ...s.boneyard].filter(
        (t) => !s.board.some((p) => sameTile(p.tile, t)),
      );
      expect(hidden.length).toBeGreaterThan(0);
      for (const t of hidden) {
        expect(json).not.toContain(tileKey(t));
        expect(json).not.toContain(JSON.stringify(t));
      }
      expect(Object.keys(view).sort()).toEqual(
        [
          'board',
          'boneyardCount',
          'currentPlayer',
          'hand',
          'legalMoves',
          'opponentHandCount',
          'result',
          'status',
          'you',
        ].sort(),
      );
    }
  });

  it('legal moves only for the current player (V2)', () => {
    const s = midRound();
    const other = s.currentPlayer === 0 ? 1 : 0;
    expect(toPlayerView(s, s.currentPlayer).legalMoves).toEqual(getLegalMoves(s));
    expect(toPlayerView(s, other).legalMoves).toEqual([]);
  });
});
