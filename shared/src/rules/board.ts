import { canonicalTile } from './tiles';
import type { End, Pip, PlacedTile, Tile } from './types';

/** Значения концов цепочки; null — пустой стол. */
export function boardEnds(board: readonly PlacedTile[]): { left: Pip; right: Pip } | null {
  const first = board[0];
  const last = board[board.length - 1];
  if (!first || !last) return null;
  return { left: first.left, right: last.right };
}

/** Можно ли положить кость на конец (R5). Пустой стол → true. */
export function canPlace(board: readonly PlacedTile[], tile: Tile, end: End): boolean {
  const ends = boardEnds(board);
  if (!ends) return true;
  const value = ends[end];
  return tile[0] === value || tile[1] === value;
}

/** Новый массив с повёрнутой костью. Предусловие canPlace === true, иначе throw. */
export function placeTile(board: readonly PlacedTile[], tile: Tile, end: End): PlacedTile[] {
  const canonical = canonicalTile(tile);
  const ends = boardEnds(board);
  if (!ends) {
    return [{ tile: canonical, left: canonical[0], right: canonical[1] }];
  }
  if (!canPlace(board, tile, end)) {
    throw new Error(`placeTile: tile ${tile[0]}-${tile[1]} does not fit the ${end} end`);
  }
  const value = ends[end];
  const other = tile[0] === value ? tile[1] : tile[0];
  return end === 'right'
    ? [...board, { tile: canonical, left: value, right: other }]
    : [{ tile: canonical, left: other, right: value }, ...board];
}
