/** Значение половины кости (набор 0–6). */
export type Pip = 0 | 1 | 2 | 3 | 4 | 5 | 6;

/** Каноническая форма: [low, high], low <= high. */
export type Tile = readonly [Pip, Pip];

/** Место за столом: 0..1 в 1×1, 0..3 в 2×2 (spec-17). */
export type PlayerIndex = 0 | 1 | 2 | 3;
/** spec-17: команда; в 1×1 команда = место. */
export type TeamIndex = 0 | 1;
/** spec-17: число мест за столом. */
export type PlayerCount = 2 | 4;

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
  /**
   * Команда-победитель раунда (в 1×1 команда = место). null — ничья (только при 'fish').
   * В «Козле» — тоже тот, кто вышел / у кого меньше (spec-16 K2, K3).
   */
  winner: TeamIndex | null;
  /** Очки раунда: классика — победителю, «Козёл» — scorer'у. 0 при ничьей. */
  points: number;
  /** Очки рук по местам на момент конца раунда; длина = число мест. */
  handPoints: number[];
  /** spec-16: команда, которой записаны points. Нет поля ⇒ winner (классика). «Козёл» заполняет всегда (null при K4). */
  scorer?: TeamIndex | null;
  /** spec-17: только при 4 местах — суммы рук команд. */
  teamPoints?: [number, number];
  /** spec-17: только при 4 местах и reason 'domino' — место, выложившее последнюю кость. */
  dominoSeat?: PlayerIndex;
}

/** spec-17: руки по местам — 2 (1×1) или 4 (2×2). */
export type Hands = [Tile[], Tile[]] | [Tile[], Tile[], Tile[], Tile[]];

export interface RoundState {
  /** Руки по местам; длина 2 или 4 = число мест (spec-17). */
  hands: Hands;
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
