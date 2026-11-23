import {
  DEFAULT_VARIANT,
  OPPONENTS,
  VARIANT_OPTIONS,
  type Move,
  type Opponent,
  type Pip,
  type Tile,
  type VariantId,
} from '@domino/shared';

/** Результат runtime-валидации payload. */
export type Parsed<T> = { ok: true; value: T } | { ok: false };

const NAME_MAX_LENGTH = 20;

const fail = { ok: false } as const;
const ok = <T>(value: T): Parsed<T> => ({ ok: true, value });

export function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** K7: trim, 1–20 символов. */
export function parseName(value: unknown): Parsed<string> {
  if (typeof value !== 'string') return fail;
  const name = value.trim();
  // Длина в символах (code points), а не в UTF-16 code units.
  const length = [...name].length;
  if (length < 1 || length > NAME_MAX_LENGTH) return fail;
  return ok(name);
}

/** K2: нормализация trim().toUpperCase(); формат не проверяется — неизвестный код даст ROOM_NOT_FOUND. */
export function parseRoomId(value: unknown): Parsed<string> {
  if (typeof value !== 'string') return fail;
  const id = value.trim().toUpperCase();
  if (id.length === 0) return fail;
  return ok(id);
}

export function parseToken(value: unknown): Parsed<string> {
  if (typeof value !== 'string' || value.length === 0) return fail;
  return ok(value);
}

function isPip(value: unknown): value is Pip {
  return Number.isInteger(value) && (value as number) >= 0 && (value as number) <= 6;
}

function parseTile(value: unknown): Parsed<Tile> {
  if (!Array.isArray(value) || value.length !== 2) return fail;
  const [a, b] = value as unknown[];
  if (!isPip(a) || !isPip(b)) return fail;
  // Порядок половин любой: applyMove сравнивает кости без учёта порядка.
  return ok([a, b] as const);
}

/** Новый объект Move только с известными полями. */
export function parseMove(value: unknown): Parsed<Move> {
  if (!isObject(value)) return fail;
  switch (value.type) {
    case 'draw':
      return ok({ type: 'draw' });
    case 'pass':
      return ok({ type: 'pass' });
    case 'play': {
      const tile = parseTile(value.tile);
      if (!tile.ok) return fail;
      if (value.end !== 'left' && value.end !== 'right') return fail;
      return ok({ type: 'play', tile: tile.value, end: value.end });
    }
    default:
      return fail;
  }
}

/** spec-14 S3 (по образцу spec-11 T1): нет поля — `fallback`; иначе целое из `allowed`, иначе fail. */
export function parseOption(
  value: unknown,
  allowed: readonly number[],
  fallback: number,
): Parsed<number> {
  if (value === undefined) return ok(fallback);
  if (typeof value !== 'number' || !Number.isInteger(value) || !allowed.includes(value)) {
    return fail;
  }
  return ok(value);
}

/** spec-11 T1: целое из списка допустимых; нет поля — `fallback`. */
export const parseTurnSeconds = parseOption;

/** spec-12 RX3: только «строка ли»; членство в REACTION_IDS проверяет RoomManager.react. */
export function parseReactionId(value: unknown): Parsed<string> {
  return typeof value === 'string' ? ok(value) : fail;
}

/** spec-15 B2: нет поля — 'human'; иначе 'human' | 'bot', прочее — fail. */
export function parseOpponent(value: unknown): Parsed<Opponent> {
  if (value === undefined) return ok('human');
  return OPPONENTS.includes(value as Opponent) ? ok(value as Opponent) : fail;
}

/** spec-16 K8: нет поля — 'classic'; иначе один из VARIANT_OPTIONS, прочее — fail. */
export function parseVariant(value: unknown): Parsed<VariantId> {
  if (value === undefined) return ok(DEFAULT_VARIANT);
  return typeof value === 'string' && VARIANT_OPTIONS.includes(value as VariantId)
    ? ok(value as VariantId)
    : fail;
}
