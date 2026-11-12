import { sameTile, type End, type Move, type Tile } from '@domino/shared';

/**
 * Вся «логика» стола на клиенте — чистые функции поверх `legalMoves`, которые прислал сервер.
 * Правил домино здесь нет: что можно сыграть, решает только сервер.
 */

const END_ORDER: readonly End[] = ['left', 'right'];

function playsOf(legalMoves: readonly Move[], tile: Tile) {
  return legalMoves.filter(
    (move): move is Extract<Move, { type: 'play' }> =>
      move.type === 'play' && sameTile(move.tile, tile),
  );
}

/** G1: кость можно сыграть, если в `legalMoves` есть `play` с ней. */
export function isPlayable(legalMoves: readonly Move[], tile: Tile): boolean {
  return playsOf(legalMoves, tile).length > 0;
}

/** G3: уникальные концы для кости, в порядке `['left', 'right']`. */
export function playEnds(legalMoves: readonly Move[], tile: Tile): End[] {
  const ends = new Set(playsOf(legalMoves, tile).map((move) => move.end));
  return END_ORDER.filter((end) => ends.has(end));
}

/** G2 */
export function canDraw(legalMoves: readonly Move[]): boolean {
  return legalMoves.some((move) => move.type === 'draw');
}

/** G2 */
export function canPass(legalMoves: readonly Move[]): boolean {
  return legalMoves.some((move) => move.type === 'pass');
}

/** `hand-tile-<low>-<high>` */
export function tileTestId(tile: Tile): string {
  const [a, b] = tile;
  return `hand-tile-${Math.min(a, b)}-${Math.max(a, b)}`;
}
