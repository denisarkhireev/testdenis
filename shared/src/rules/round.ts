import { canPlace, boardEnds, placeTile } from './board';
import { deal, shuffle } from './deck';
import { resolveRound } from './scoring';
import { compareOpening, createDoubleSix, MAX_PIP, sameTile, tileKey, TILE_COUNT } from './tiles';
import { createRng } from './rng';
import type {
  ApplyResult,
  End,
  Move,
  MoveError,
  Pip,
  PlacedTile,
  PlayerIndex,
  RoundState,
  Tile,
} from './types';

export interface StartRoundOptions {
  /** Используется, если deck не задан; по умолчанию 0. */
  seed?: number;
  /** Готовый порядок 28 костей (для тестов); валидируется по R1, иначе throw. */
  deck?: readonly Tile[];
}

const ENDS: readonly End[] = ['left', 'right'];

function opponent(player: PlayerIndex): PlayerIndex {
  return player === 0 ? 1 : 0;
}

function assertValidDeck(deck: readonly Tile[]): void {
  if (!Array.isArray(deck) || deck.length !== TILE_COUNT) {
    throw new Error(`startRound: deck must contain exactly ${TILE_COUNT} tiles`);
  }
  const seen = new Set<string>();
  for (const t of deck as readonly unknown[]) {
    if (!isCanonicalTile(t)) {
      throw new Error(`startRound: invalid tile ${JSON.stringify(t)}`);
    }
    const key = tileKey(t);
    if (seen.has(key)) {
      throw new Error(`startRound: duplicate tile ${key}`);
    }
    seen.add(key);
  }
}

function isPip(value: unknown): value is Pip {
  return Number.isInteger(value) && (value as number) >= 0 && (value as number) <= MAX_PIP;
}

function isCanonicalTile(value: unknown): value is Tile {
  return (
    Array.isArray(value) &&
    value.length === 2 &&
    isPip(value[0]) &&
    isPip(value[1]) &&
    value[0] <= value[1]
  );
}

/** Старшая кость для первого хода и её владелец (R4). */
function findOpening(hands: readonly [readonly Tile[], readonly Tile[]]): {
  tile: Tile;
  player: PlayerIndex;
} {
  let best: { tile: Tile; player: PlayerIndex } | null = null;
  for (const player of [0, 1] as const) {
    for (const tile of hands[player]) {
      if (!best || compareOpening(tile, best.tile) > 0) {
        best = { tile, player };
      }
    }
  }
  if (!best) throw new Error('startRound: hands are empty');
  return best;
}

/** Раздаёт новый раунд: перемешивание по seed (или готовая колода), раздача, первый ход. */
export function startRound(opts: StartRoundOptions = {}): RoundState {
  const deck = opts.deck ?? shuffle(createDoubleSix(), createRng(opts.seed ?? 0));
  assertValidDeck(deck);
  const { hands, boneyard } = deal(deck.map((t): Tile => [t[0], t[1]]));
  const opening = findOpening(hands);
  return {
    hands,
    boneyard,
    board: [],
    openingTile: opening.tile,
    currentPlayer: opening.player,
    status: 'playing',
    result: null,
  };
}

function playMovesFor(board: readonly PlacedTile[], hand: readonly Tile[]): Move[] {
  const ends = boardEnds(board);
  if (!ends) return [];
  const moves: Move[] = [];
  for (const tile of hand) {
    if (ends.left === ends.right) {
      if (canPlace(board, tile, 'right')) moves.push({ type: 'play', tile, end: 'right' });
      continue;
    }
    for (const end of ENDS) {
      if (canPlace(board, tile, end)) moves.push({ type: 'play', tile, end });
    }
  }
  return moves;
}

function hasPlay(board: readonly PlacedTile[], hand: readonly Tile[]): boolean {
  const ends = boardEnds(board);
  if (!ends) return hand.length > 0;
  return hand.some((t) => ENDS.some((end) => canPlace(board, t, end)));
}

/** «Рыба» (R12): базар пуст и ни у одного игрока нет допустимого play. */
function isFish(state: RoundState): boolean {
  return (
    state.boneyard.length === 0 &&
    !hasPlay(state.board, state.hands[0]) &&
    !hasPlay(state.board, state.hands[1])
  );
}

function finishIfFish(state: RoundState): RoundState {
  if (!isFish(state)) return state;
  return { ...state, status: 'finished', result: resolveRound('fish', state.hands) };
}

/** Все допустимые ходы текущего игрока; [] если раунд окончен. */
export function getLegalMoves(state: RoundState): Move[] {
  if (state.status === 'finished') return [];
  if (state.board.length === 0) {
    return [{ type: 'play', tile: state.openingTile, end: 'right' }];
  }
  const plays = playMovesFor(state.board, state.hands[state.currentPlayer]);
  if (plays.length > 0) return plays;
  return state.boneyard.length > 0 ? [{ type: 'draw' }] : [{ type: 'pass' }];
}

function fail(error: MoveError): ApplyResult {
  return { ok: false, error };
}

function applyPlay(state: RoundState, player: PlayerIndex, tile: Tile, end: End): ApplyResult {
  const hand = state.hands[player];
  const index = hand.findIndex((t) => sameTile(t, tile));
  if (index === -1) return fail('TILE_NOT_IN_HAND');
  if (state.board.length === 0 && !sameTile(tile, state.openingTile)) {
    return fail('MUST_PLAY_OPENING_TILE');
  }
  if (!canPlace(state.board, tile, end)) return fail('TILE_DOES_NOT_FIT');

  const newHand = hand.filter((_, i) => i !== index);
  const hands: [Tile[], Tile[]] =
    player === 0 ? [newHand, state.hands[1]] : [state.hands[0], newHand];
  const next: RoundState = { ...state, hands, board: placeTile(state.board, tile, end) };

  if (newHand.length === 0) {
    return {
      ok: true,
      state: { ...next, status: 'finished', result: resolveRound('domino', hands, player) },
    };
  }
  const afterFish = finishIfFish(next);
  if (afterFish.status === 'finished') return { ok: true, state: afterFish };
  return { ok: true, state: { ...next, currentPlayer: opponent(player) } };
}

function applyDraw(state: RoundState, player: PlayerIndex): ApplyResult {
  if (hasPlay(state.board, state.hands[player])) return fail('MUST_PLAY');
  const [drawn, ...boneyard] = state.boneyard;
  if (!drawn) return fail('BONEYARD_EMPTY');
  const newHand = [...state.hands[player], drawn];
  const hands: [Tile[], Tile[]] =
    player === 0 ? [newHand, state.hands[1]] : [state.hands[0], newHand];
  return { ok: true, state: finishIfFish({ ...state, hands, boneyard }) };
}

function applyPass(state: RoundState, player: PlayerIndex): ApplyResult {
  if (hasPlay(state.board, state.hands[player])) return fail('MUST_PLAY');
  if (state.boneyard.length > 0) return fail('BONEYARD_NOT_EMPTY');
  return { ok: true, state: finishIfFish({ ...state, currentPlayer: opponent(player) }) };
}

/**
 * Проверяет и применяет ход (R4–R14). Не бросает исключений на игровых ошибках —
 * возвращает `{ ok: false, error }`. Входное состояние не мутируется.
 */
export function applyMove(state: RoundState, player: PlayerIndex, move: Move): ApplyResult {
  if (state.status === 'finished') return fail('ROUND_FINISHED');
  if (player !== state.currentPlayer) return fail('NOT_YOUR_TURN');
  switch (move.type) {
    case 'play':
      return applyPlay(state, player, move.tile, move.end);
    case 'draw':
      return applyDraw(state, player);
    case 'pass':
      return applyPass(state, player);
  }
}
