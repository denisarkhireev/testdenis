/**
 * spec-9 RC10: токены мест живут в localStorage браузера, по одному на комнату, — так место
 * держится за браузером, а не за вкладкой. Имя — тоже в localStorage, для удобства.
 */
const SESSIONS_KEY = 'domino:sessions';
const LEGACY_SESSION_KEY = 'domino:session';
const NAME_KEY = 'domino:name';
const TURN_SECONDS_KEY = 'domino:turnSeconds';
const MATCH_TARGET_KEY = 'domino:matchTarget';
const HAND_SIZE_KEY = 'domino:handSize';
export const MAX_SESSIONS = 10;

export interface Session {
  roomId: string;
  playerToken: string;
}

interface StoredSession {
  playerToken: string;
  savedAt: number;
}

type Sessions = Record<string, StoredSession>;

function isStoredSession(value: unknown): value is StoredSession {
  if (typeof value !== 'object' || value === null) return false;
  const { playerToken, savedAt } = value as Record<string, unknown>;
  return typeof playerToken === 'string' && playerToken !== '' && typeof savedAt === 'number';
}

/** Все валидные записи; битый JSON / не тот формат / неверные записи игнорируются. Может бросить. */
function readSessions(): Sessions {
  const raw = localStorage.getItem(SESSIONS_KEY);
  if (raw === null) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {};
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {};
  const sessions: Sessions = {};
  for (const [roomId, entry] of Object.entries(parsed)) {
    if (isStoredSession(entry)) {
      sessions[roomId] = { playerToken: entry.playerToken, savedAt: entry.savedAt };
    }
  }
  return sessions;
}

function writeSessions(sessions: Sessions): void {
  localStorage.setItem(SESSIONS_KEY, JSON.stringify(sessions));
}

/** Токен для комнаты `roomId` или null. */
export function loadSession(roomId: string): Session | null {
  try {
    const entry = readSessions()[roomId];
    return entry ? { roomId, playerToken: entry.playerToken } : null;
  } catch {
    return null;
  }
}

/** Upsert записи с `savedAt = Date.now()`; хранится не больше MAX_SESSIONS самых свежих. */
export function saveSession(session: Session): void {
  try {
    const sessions = readSessions();
    sessions[session.roomId] = { playerToken: session.playerToken, savedAt: Date.now() };
    const ids = Object.keys(sessions).sort((a, b) => sessions[a]!.savedAt - sessions[b]!.savedAt);
    for (const id of ids.slice(0, Math.max(0, ids.length - MAX_SESSIONS))) delete sessions[id];
    writeSessions(sessions);
  } catch {
    // storage недоступен — вернуться в игру после закрытия вкладки не выйдет, но текущая работает
  }
}

export function clearSession(roomId: string): void {
  try {
    const sessions = readSessions();
    if (!(roomId in sessions)) return;
    delete sessions[roomId];
    writeSessions(sessions);
  } catch {
    // нечего очищать
  }
}

/** RC10: сессия из sessionStorage (spec-5) больше не читается — только удаляется. */
export function dropLegacySession(): void {
  try {
    sessionStorage.removeItem(LEGACY_SESSION_KEY);
  } catch {
    // нечего очищать
  }
}

export function loadName(): string {
  try {
    return localStorage.getItem(NAME_KEY) ?? '';
  } catch {
    return '';
  }
}

export function saveName(name: string): void {
  try {
    localStorage.setItem(NAME_KEY, name);
  } catch {
    // имя — только подсказка
  }
}

/** Сохранённое целое число; null — нет, не число или storage недоступен. */
function loadInteger(key: string): number | null {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return null;
    const value = Number(raw);
    return Number.isInteger(value) ? value : null;
  } catch {
    return null;
  }
}

function saveInteger(key: string, value: number): void {
  try {
    localStorage.setItem(key, String(value));
  } catch {
    // выбор — только подсказка на следующий раз
  }
}

/** spec-11: последнее выбранное время на ход, с; null — нет или не число. */
export const loadTurnSeconds = (): number | null => loadInteger(TURN_SECONDS_KEY);
export const saveTurnSeconds = (turnSeconds: number): void =>
  saveInteger(TURN_SECONDS_KEY, turnSeconds);

/** spec-14: последняя выбранная цель матча; null — нет или не число. */
export const loadMatchTarget = (): number | null => loadInteger(MATCH_TARGET_KEY);
export const saveMatchTarget = (matchTarget: number): void =>
  saveInteger(MATCH_TARGET_KEY, matchTarget);

/** spec-14: последний выбранный размер руки; null — нет или не число. */
export const loadHandSize = (): number | null => loadInteger(HAND_SIZE_KEY);
export const saveHandSize = (handSize: number): void => saveInteger(HAND_SIZE_KEY, handSize);
