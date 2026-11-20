/**
 * spec-9 RC10: токены мест живут в localStorage браузера, по одному на комнату, — так место
 * держится за браузером, а не за вкладкой. Имя — тоже в localStorage, для удобства.
 */
const SESSIONS_KEY = 'domino:sessions';
const LEGACY_SESSION_KEY = 'domino:session';
const NAME_KEY = 'domino:name';
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
