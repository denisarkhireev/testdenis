import type { End, PlacedTile, PlayerView, Tile } from '@domino/shared';

export type Who = 'me' | 'opponent';

/** spec-10 §3.1: что произошло между двумя `room:state` глазами игрока. */
export type TableEvent =
  /** `boardIndex` — индекс новой кости в `next.board`. */
  | { type: 'play'; who: Who; tile: Tile; end: End; boardIndex: number }
  | { type: 'draw'; who: Who }
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

/** A3: ровно одна новая кость на одном из концов, и одна рука уменьшилась на 1. */
function playEvent(prev: PlayerView, next: PlayerView): TableEvent | null {
  if (next.board.length !== prev.board.length + 1) return null;
  if (next.boneyardCount !== prev.boneyardCount) return null;

  const meShrank =
    next.hand.length === prev.hand.length - 1 && next.opponentHandCount === prev.opponentHandCount;
  const oppShrank =
    next.opponentHandCount === prev.opponentHandCount - 1 && next.hand.length === prev.hand.length;
  if (!meShrank && !oppShrank) return null;

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
    who: meShrank ? 'me' : 'opponent',
    tile: [placed.left, placed.right],
    end,
    boardIndex,
  };
}

/** A4: доска та же, базар −1, ровно одна рука +1. */
function drawEvent(prev: PlayerView, next: PlayerView): TableEvent | null {
  if (next.board.length !== prev.board.length) return null;
  if (next.boneyardCount !== prev.boneyardCount - 1) return null;
  const meGrew =
    next.hand.length === prev.hand.length + 1 && next.opponentHandCount === prev.opponentHandCount;
  const oppGrew =
    next.opponentHandCount === prev.opponentHandCount + 1 && next.hand.length === prev.hand.length;
  if (meGrew) return { type: 'draw', who: 'me' };
  if (oppGrew) return { type: 'draw', who: 'opponent' };
  return null;
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
