import type { End, PlacedTile, PlayerIndex, PlayerView, Tile } from '@domino/shared';

export type Who = 'me' | 'opponent';

/** spec-10 §3.1: что произошло между двумя `room:state` глазами игрока. */
export type TableEvent =
  /** `boardIndex` — индекс новой кости в `next.board`. */
  | { type: 'play'; who: Who; tile: Tile; end: End; boardIndex: number; seat?: PlayerIndex }
  | { type: 'draw'; who: Who; seat?: PlayerIndex }
  /** Ход перешёл ко мне. */
  | { type: 'turn' }
  | { type: 'roundEnd' };

function samePlaced(a: PlacedTile, b: PlacedTile): boolean {
  return a.left === b.left && a.right === b.right;
}

/** `board` совпадает с `prev` поэлементно начиная с `offset`. */
function matchesFrom(board: readonly PlacedTile[], prev: readonly PlacedTile[], offset: number) {
  return prev.every((placed, i) => samePlaced(placed, board[i + offset]!));
}

/**
 * spec-17: какое место изменило число костей ровно на `delta` (остальные — без изменений).
 * Только для видов 4 мест (`handCounts`); иначе / неоднозначно — null.
 */
function changedSeat(prev: PlayerView, next: PlayerView, delta: number): PlayerIndex | null {
  const before = prev.handCounts;
  const after = next.handCounts;
  if (!before || !after || before.length !== after.length) return null;
  let seat: PlayerIndex | null = null;
  for (let i = 0; i < after.length; i++) {
    const diff = after[i]! - before[i]!;
    if (diff === 0) continue;
    if (diff !== delta || seat !== null) return null;
    seat = i as PlayerIndex;
  }
  return seat;
}

/** Кто изменил руку на `delta`: 1×1 — по своей руке и руке соперника, 2×2 — по `handCounts`. */
function mover(
  prev: PlayerView,
  next: PlayerView,
  delta: number,
): { who: Who; seat?: PlayerIndex } | null {
  if (next.handCounts) {
    const seat = changedSeat(prev, next, delta);
    if (seat === null) return null;
    return seat === next.you ? { who: 'me' } : { who: 'opponent', seat };
  }
  const meChanged =
    next.hand.length === prev.hand.length + delta &&
    next.opponentHandCount === prev.opponentHandCount;
  const oppChanged =
    next.opponentHandCount === prev.opponentHandCount + delta &&
    next.hand.length === prev.hand.length;
  if (meChanged) return { who: 'me' };
  if (oppChanged) return { who: 'opponent' };
  return null;
}

/** A3: ровно одна новая кость на одном из концов, и одна рука уменьшилась на 1. */
function playEvent(prev: PlayerView, next: PlayerView): TableEvent | null {
  if (next.board.length !== prev.board.length + 1) return null;
  if (next.boneyardCount !== prev.boneyardCount) return null;

  const by = mover(prev, next, -1);
  if (!by) return null;

  let end: End;
  let boardIndex: number;
  if (prev.board.length > 0 && matchesFrom(next.board, prev.board, 1)) {
    end = 'left';
    boardIndex = 0;
  } else if (matchesFrom(next.board, prev.board, 0)) {
    end = 'right';
    boardIndex = next.board.length - 1;
  } else {
    return null;
  }

  const placed = next.board[boardIndex]!;
  return {
    type: 'play',
    who: by.who,
    tile: [placed.left, placed.right],
    end,
    boardIndex,
    ...(by.seat !== undefined ? { seat: by.seat } : {}),
  };
}

/** A4: доска та же, базар −1, ровно одна рука +1. */
function drawEvent(prev: PlayerView, next: PlayerView): TableEvent | null {
  if (next.board.length !== prev.board.length) return null;
  if (next.boneyardCount !== prev.boneyardCount - 1) return null;
  const by = mover(prev, next, 1);
  if (!by) return null;
  return { type: 'draw', who: by.who, ...(by.seat !== undefined ? { seat: by.seat } : {}) };
}

/**
 * spec-10 A1–A8. Чистая функция: события выводятся из разницы видов, протокол не меняется.
 * Неоднозначные/многошаговые изменения дают «тихую синхронизацию» без play/draw.
 */
export function diffTable(prev: PlayerView | null, next: PlayerView): TableEvent[] {
  // A1, F11
  if (prev === null || prev === next) return [];
  // A2: новый раунд
  if (prev.status === 'finished' && next.status === 'playing') return [];
  if (next.board.length < prev.board.length) return [];

  const events: TableEvent[] = [];
  // A3/A4/A7
  const step = playEvent(prev, next) ?? drawEvent(prev, next);
  if (step) events.push(step);
  // A6
  if (prev.status === 'playing' && next.status === 'finished') events.push({ type: 'roundEnd' });
  // A5
  if (
    prev.status === 'playing' &&
    next.status === 'playing' &&
    prev.currentPlayer !== prev.you &&
    next.currentPlayer === next.you
  ) {
    events.push({ type: 'turn' });
  }
  return events;
}
