import type { Pip, Tile } from './types';

export const MAX_PIP = 6;
export const TILE_COUNT = 28;

/** 28 костей в каноническом порядке: 0-0, 0-1, …, 0-6, 1-1, …, 6-6 (R1). */
export function createDoubleSix(): Tile[] {
  const tiles: Tile[] = [];
  for (let a = 0; a <= MAX_PIP; a++) {
    for (let b = a; b <= MAX_PIP; b++) {
      tiles.push([a as Pip, b as Pip]);
    }
  }
  return tiles;
}

/** Каноническая форма [low, high]. */
export function canonicalTile(t: Tile): Tile {
  return t[0] <= t[1] ? [t[0], t[1]] : [t[1], t[0]];
}

/** "3-5" (low-high) для любого порядка половин. */
export function tileKey(t: Tile): string {
  const [low, high] = canonicalTile(t);
  return `${low}-${high}`;
}

/** [5,3] и [3,5] — одна кость. */
export function sameTile(a: Tile, b: Tile): boolean {
  return (a[0] === b[0] && a[1] === b[1]) || (a[0] === b[1] && a[1] === b[0]);
}

export function isDouble(t: Tile): boolean {
  return t[0] === t[1];
}

/** Сумма очков кости: a + b. */
export function tilePips(t: Tile): number {
  return t[0] + t[1];
}

/**
 * Сравнение по старшинству для первого хода (R4).
 * > 0 — `a` старше `b`, < 0 — младше, 0 — та же кость.
 * Любой дубль старше любого недубля; дубли — по значению;
 * недубли — по сумме, при равенстве — по старшей половине.
 */
export function compareOpening(a: Tile, b: Tile): number {
  const da = isDouble(a);
  const db = isDouble(b);
  if (da !== db) return da ? 1 : -1;
  const bySum = tilePips(a) - tilePips(b);
  if (bySum !== 0) return bySum;
  return Math.max(a[0], a[1]) - Math.max(b[0], b[1]);
}
