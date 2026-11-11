/** Значение половины кости (набор 0–6). */
export type Pip = 0 | 1 | 2 | 3 | 4 | 5 | 6;

/** Каноническая форма: [low, high], low <= high. */
export type Tile = readonly [Pip, Pip];

export type PlayerIndex = 0 | 1;

export type End = 'left' | 'right';

/** Кость на столе в ориентации цепочки: left касается предыдущей, right — следующей. */
export interface PlacedTile {
  tile: Tile;
  left: Pip;
  right: Pip;
}

export type Move = { type: 'play'; tile: Tile; end: End } | { type: 'draw' } | { type: 'pass' };

export type RoundEndReason = 'domino' | 'fish';

export interface RoundResult {
  reason: RoundEndReason;
  /** null — ничья (только при 'fish'). */
  winner: PlayerIndex | null;
  /** Очки победителю; 0 при ничьей. */
  points: number;
  /** Очки рук игроков 0 и 1 на момент конца раунда. */
  handPoints: [number, number];
}

export interface RoundState {
  hands: [Tile[], Tile[]];
  /** boneyard[0] — следующая к добору. */
  boneyard: Tile[];
  /** board[0] — левый край, board[at(-1)] — правый. */
  board: PlacedTile[];
  /** Обязательная первая кость (R4). */
  openingTile: Tile;
  currentPlayer: PlayerIndex;
  status: 'playing' | 'finished';
  /** != null ⇔ status === 'finished'. */
  result: RoundResult | null;
}

export type MoveError =
  | 'ROUND_FINISHED' // R14
  | 'NOT_YOUR_TURN'
  | 'TILE_NOT_IN_HAND'
  | 'MUST_PLAY_OPENING_TILE' // R4: первый ход не той костью
  | 'TILE_DOES_NOT_FIT' // R5
  | 'MUST_PLAY' // R9: draw/pass при наличии допустимого play
  | 'BONEYARD_EMPTY' // R7: draw при пустом базаре
  | 'BONEYARD_NOT_EMPTY'; // R8: pass при непустом базаре

export type ApplyResult = { ok: true; state: RoundState } | { ok: false; error: MoveError };
