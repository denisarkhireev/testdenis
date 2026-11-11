/** L8: токен живёт только в sessionStorage этой вкладки; имя — в localStorage для удобства. */
const SESSION_KEY = 'domino:session';
const NAME_KEY = 'domino:name';

export interface Session {
  roomId: string;
  playerToken: string;
}

function isSession(value: unknown): value is Session {
  if (typeof value !== 'object' || value === null) return false;
  const { roomId, playerToken } = value as Record<string, unknown>;
  return typeof roomId === 'string' && typeof playerToken === 'string';
}

export function loadSession(): Session | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (raw === null) return null;
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = null;
    }
    if (isSession(parsed)) return { roomId: parsed.roomId, playerToken: parsed.playerToken };
    sessionStorage.removeItem(SESSION_KEY);
    return null;
  } catch {
    return null;
  }
}

export function saveSession(session: Session): void {
  try {
    sessionStorage.setItem(
      SESSION_KEY,
      JSON.stringify({ roomId: session.roomId, playerToken: session.playerToken }),
    );
  } catch {
    // storage недоступен — F5 не вернёт в игру, но текущая вкладка работает
  }
}

export function clearSession(): void {
  try {
    sessionStorage.removeItem(SESSION_KEY);
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
