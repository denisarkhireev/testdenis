import type { PlacedTile } from '@domino/shared';
import { describe, expect, it } from 'vitest';
import { makeView } from '../test/fixtures';
import { diffTable } from './diffTable';

const pt = (left: number, right: number): PlacedTile =>
  ({ tile: [left, right], left, right }) as PlacedTile;

/** Середина раунда, ход соперника (you = 0, currentPlayer = 1). */
const midRound = makeView({
  hand: [
    [0, 1],
    [1, 2],
    [2, 4],
  ],
  opponentHandCount: 4,
  boneyardCount: 12,
  board: [pt(3, 6), pt(6, 6), pt(6, 5)],
  currentPlayer: 1,
  legalMoves: [],
});

describe('diffTable (spec-10 §3.1)', () => {
  it('F1: prev = null → []', () => {
    expect(diffTable(null, makeView())).toEqual([]);
  });

  it('F2: my first move [6,6] on an empty board', () => {
    const prev = makeView();
    const next = makeView({
      hand: prev.hand.slice(1),
      board: [pt(6, 6)],
      currentPlayer: 1,
      legalMoves: [],
    });
    expect(diffTable(prev, next)).toEqual([
      { type: 'play', who: 'me', tile: [6, 6], end: 'right', boardIndex: 0 },
    ]);
  });

  it('F3: opponent plays on the left end', () => {
    const next = makeView({
      ...midRound,
      opponentHandCount: 3,
      board: [pt(1, 3), ...midRound.board],
    });
    expect(diffTable(midRound, next)).toEqual([
      { type: 'play', who: 'opponent', tile: [1, 3], end: 'left', boardIndex: 0 },
    ]);
  });

  it('F4: opponent plays on the right end, now my turn — play, then turn (A8)', () => {
    const next = makeView({
      ...midRound,
      opponentHandCount: 3,
      board: [...midRound.board, pt(5, 2)],
      currentPlayer: 0,
    });
    expect(diffTable(midRound, next)).toEqual([
      { type: 'play', who: 'opponent', tile: [5, 2], end: 'right', boardIndex: 3 },
      { type: 'turn' },
    ]);
  });

  it('F5: my draw (still my turn) → [draw me], no turn', () => {
    const prev = makeView({ ...midRound, currentPlayer: 0 });
    const next = makeView({ ...prev, hand: [...prev.hand, [4, 4]], boneyardCount: 11 });
    expect(diffTable(prev, next)).toEqual([{ type: 'draw', who: 'me' }]);
  });

  it('F6: opponent draw', () => {
    const next = makeView({ ...midRound, opponentHandCount: 5, boneyardCount: 11 });
    expect(diffTable(midRound, next)).toEqual([{ type: 'draw', who: 'opponent' }]);
  });

  it('F7: opponent passed, my turn → [turn]', () => {
    const prev = makeView({ ...midRound, boneyardCount: 0 });
    const next = makeView({ ...prev, currentPlayer: 0 });
    expect(diffTable(prev, next)).toEqual([{ type: 'turn' }]);
  });

  it('F8: my last tile → [play me, roundEnd], no turn', () => {
    const prev = makeView({ ...midRound, hand: [[5, 1]], currentPlayer: 0 });
    const next = makeView({
      ...prev,
      hand: [],
      board: [...prev.board, pt(5, 1)],
      currentPlayer: 1,
      status: 'finished',
    });
    expect(diffTable(prev, next)).toEqual([
      { type: 'play', who: 'me', tile: [5, 1], end: 'right', boardIndex: 3 },
      { type: 'roundEnd' },
    ]);
  });

  it('F9: finished → playing (new round), my first move → []', () => {
    const prev = makeView({ ...midRound, status: 'finished' });
    expect(diffTable(prev, makeView())).toEqual([]);
  });

  it('F10: board +2 at once (missed state) → no play; turn by A5', () => {
    const next = makeView({
      ...midRound,
      hand: midRound.hand.slice(1),
      opponentHandCount: 3,
      board: [...midRound.board, pt(5, 0), pt(0, 1)],
      currentPlayer: 0,
    });
    expect(diffTable(midRound, next)).toEqual([{ type: 'turn' }]);
  });

  it('F10: board +1 and boneyard −1 at once (ambiguous) → no play/draw', () => {
    const next = makeView({
      ...midRound,
      opponentHandCount: 4,
      boneyardCount: 11,
      board: [...midRound.board, pt(5, 0)],
    });
    expect(diffTable(midRound, next)).toEqual([]);
  });

  it('F11: same object / identical state → []', () => {
    expect(diffTable(midRound, midRound)).toEqual([]);
    expect(diffTable(midRound, makeView({ ...midRound }))).toEqual([]);
  });
});
