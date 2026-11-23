// Хелпер теста Q-R1 (spec-17): отпечаток цепочки раунда 1×1. Не входит в публичный API.
import { createRng } from './rng';
import { applyMove, getLegalMoves, startRound } from './round';
import { toPlayerView } from './view';

/** FNV-1a (32 бит) с заданным началом — без зависимостей от node. */
function fnv1a(text: string, basis: number): string {
  let h = basis >>> 0;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

/** Отпечаток (2 × FNV-1a) JSON всех состояний, видов обоих мест и итогов раунда для (seed, handSize). */
export function twoSeatDigest(seed: number, handSize: number): string {
  const rng = createRng(seed + 1717);
  let s = startRound({ seed, handSize });
  const trace: unknown[] = [];
  for (let i = 0; ; i++) {
    trace.push(s, toPlayerView(s, 0), toPlayerView(s, 1));
    if (s.status !== 'playing') break;
    if (i > 200) throw new Error('round did not finish');
    const moves = getLegalMoves(s);
    const move = moves[Math.floor(rng() * moves.length)]!;
    const r = applyMove(s, s.currentPlayer, move);
    if (!r.ok) throw new Error(r.error);
    s = r.state;
  }
  const json = JSON.stringify(trace);
  return fnv1a(json, 0x811c9dc5) + fnv1a(json, 0x01234567);
}
