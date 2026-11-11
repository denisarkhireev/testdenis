import { describe, expect, it } from 'vitest';
import { applyMove, getLegalMoves, startRound } from './round';
import { createRng } from './rng';
import { handPoints } from './scoring';
import { tileKey } from './tiles';
import type { RoundState } from './types';

const MAX_ACTIONS = 100;

function allTileKeys(s: RoundState): string[] {
  return [...s.hands[0], ...s.hands[1], ...s.boneyard, ...s.board.map((p) => p.tile)].map(tileKey);
}

/** Возвращает описание нарушения инварианта или null. Без expect на каждом шаге — ради скорости. */
function invariantViolation(s: RoundState): string | null {
  const keys = allTileKeys(s);
  if (keys.length !== 28 || new Set(keys).size !== 28) return `R15: tiles ${keys.join(' ')}`;
  for (let i = 0; i + 1 < s.board.length; i++) {
    if (s.board[i]?.right !== s.board[i + 1]?.left) return `board breaks at ${i}`;
  }
  for (const p of s.board) {
    if (tileKey([p.left, p.right]) !== tileKey(p.tile)) return `bad placed tile ${tileKey(p.tile)}`;
  }
  if ((s.result === null) !== (s.status === 'playing')) return 'status/result mismatch';
  if (JSON.stringify(JSON.parse(JSON.stringify(s))) !== JSON.stringify(s)) return 'JSON round-trip';
  return null;
}

function checkInvariants(s: RoundState): void {
  const violation = invariantViolation(s);
  if (violation) expect.fail(violation);
}

function checkResult(s: RoundState): void {
  const r = s.result;
  if (!r) throw new Error('round is not finished');
  const points: [number, number] = [handPoints(s.hands[0]), handPoints(s.hands[1])];
  expect(r.handPoints).toEqual(points);
  if (r.reason === 'domino') {
    expect(r.winner).not.toBeNull();
    expect(s.hands[r.winner ?? 0]).toHaveLength(0);
  } else {
    expect(s.boneyard).toHaveLength(0);
    const expected = points[0] === points[1] ? null : points[0] < points[1] ? 0 : 1;
    expect(r.winner).toBe(expected);
  }
  expect(r.points).toBe(r.winner === null ? 0 : points[r.winner === 0 ? 1 : 0]);
}

/** Играет раунд до конца, выбирая getLegalMoves()[floor(rng * len)]. */
function simulate(seed: number, onState?: (s: RoundState) => void): RoundState {
  const rng = createRng(seed + 10_000);
  let s = startRound({ seed });
  onState?.(s);
  for (let actions = 0; s.status === 'playing'; actions++) {
    if (actions >= MAX_ACTIONS) throw new Error(`seed ${seed}: round did not finish`);
    const moves = getLegalMoves(s);
    const move = moves[Math.floor(rng() * moves.length)];
    if (!move) throw new Error(`seed ${seed}: no legal moves while playing`);
    const r = applyMove(s, s.currentPlayer, move);
    if (!r.ok) throw new Error(`seed ${seed}: legal move rejected with ${r.error}`);
    s = r.state;
    onState?.(s);
  }
  return s;
}

describe('properties', () => {
  it('R15: 500 random rounds keep 28 unique tiles and a consistent result (P1)', () => {
    for (let seed = 1; seed <= 500; seed++) {
      const final = simulate(seed, checkInvariants);
      checkResult(final);
      expect(JSON.parse(JSON.stringify(final))).toEqual(final);
    }
  });

  it('R2: the same seeds replay to identical final states (P2)', () => {
    for (let seed = 1; seed <= 500; seed++) {
      expect(simulate(seed)).toEqual(simulate(seed));
    }
  });

  it('R6: every move from getLegalMoves is accepted by applyMove (M15)', () => {
    for (let seed = 1; seed <= 200; seed++) {
      simulate(seed, (s) => {
        for (const move of getLegalMoves(s)) {
          expect(applyMove(s, s.currentPlayer, move).ok).toBe(true);
        }
      });
    }
  });
});
