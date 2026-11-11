/** Код комнаты (spec-4 K2): 6 символов без I, O, 0, 1. */
const ROOM_ID_RE = /^[A-HJ-NP-Z2-9]{6}$/;

/** L1: ссылка-приглашение — всегда путь `/`, код в query-параметре `room`. */
export function buildInviteUrl(origin: string, roomId: string): string {
  return `${origin}/?room=${roomId}`;
}

/**
 * L2: код комнаты из `location.search`.
 * `null` — параметра нет; `'invalid'` — параметр есть, но код не по формату.
 */
export function parseRoomIdFromSearch(search: string): string | null | 'invalid' {
  const raw = new URLSearchParams(search).get('room');
  if (raw === null) return null;
  const roomId = raw.trim().toUpperCase();
  return ROOM_ID_RE.test(roomId) ? roomId : 'invalid';
}
