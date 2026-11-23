import { existsSync, statSync } from 'node:fs';
import path from 'node:path';

/** Конфигурация сервера из переменных окружения (spec-8 §4.2). */
export interface ServerConfig {
  /** PORT, по умолчанию 3001. */
  port: number;
  /** HOST, по умолчанию '0.0.0.0'. */
  host: string;
  /** CORS_ORIGIN, по умолчанию 'http://localhost:5173' (dev: клиент на Vite). */
  corsOrigin: string;
  /** RECONNECT_TIMEOUT, мс (spec-9 RC2); не задана — 120 000 (по умолчанию в startServer). */
  reconnectTimeoutMs?: number;
  /** MATCH_TARGET (spec-7); не задана — 101. */
  matchTarget?: number;
  /** PUBLIC_URL (D8): origin для ссылок-приглашений. */
  publicUrl?: string;
  /** STATIC_DIR: абсолютный путь к собранному клиенту; не задан — статика выключена. */
  staticDir?: string;
  /** TURN_TIMER_TEST_SECONDS (spec-11, только e2e): доп. значение времени на ход, с. */
  turnTimerTestSeconds?: number;
  /** BOT_DELAY_MS (spec-15 B4, только тесты/e2e): фиксированная задержка действий бота, мс. */
  botDelayMs?: number;
}

export function loadConfig(env: NodeJS.ProcessEnv): ServerConfig {
  return {
    port: Number(env.PORT ?? 3001),
    host: env.HOST ?? '0.0.0.0',
    corsOrigin: env.CORS_ORIGIN ?? 'http://localhost:5173',
    reconnectTimeoutMs: parseReconnectTimeout(env.RECONNECT_TIMEOUT),
    matchTarget: parseMatchTarget(env.MATCH_TARGET),
    publicUrl: parsePublicUrl(env.PUBLIC_URL),
    staticDir: parseStaticDir(env.STATIC_DIR),
    turnTimerTestSeconds: parseTurnTimerTestSeconds(env.TURN_TIMER_TEST_SECONDS),
    botDelayMs: parseBotDelay(env.BOT_DELAY_MS),
  };
}

/** spec-7: MATCH_TARGET — целое > 0; не задана — 101 (по умолчанию в startServer). */
export function parseMatchTarget(raw: string | undefined): number | undefined {
  if (raw === undefined || raw.trim() === '') return undefined;
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`MATCH_TARGET must be a positive integer, got "${raw}"`);
  }
  return value;
}

/** spec-9 RC2: RECONNECT_TIMEOUT — целое число миллисекунд > 0; не задана — 120 000. */
export function parseReconnectTimeout(raw: string | undefined): number | undefined {
  if (raw === undefined || raw.trim() === '') return undefined;
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`RECONNECT_TIMEOUT must be a positive integer (milliseconds), got "${raw}"`);
  }
  return value;
}

/**
 * spec-11 §4.2: TURN_TIMER_TEST_SECONDS — целое 1…29 (короткий лимит хода для e2e, добавляется
 * к выбору 0/30/60). Не задана — undefined; в проде не задаётся.
 */
export function parseTurnTimerTestSeconds(raw: string | undefined): number | undefined {
  if (raw === undefined || raw.trim() === '') return undefined;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1 || value > 29) {
    throw new Error(
      `TURN_TIMER_TEST_SECONDS must be an integer from 1 to 29 (seconds), got "${raw}"`,
    );
  }
  return value;
}

/**
 * spec-15 B4: BOT_DELAY_MS — целое 0…5000 мс; заменяет обе задержки бота (только тесты/e2e).
 * Не задана — undefined (в проде: 800…1500 мс на ход, 400 мс на добор подряд).
 */
export function parseBotDelay(raw: string | undefined): number | undefined {
  if (raw === undefined || raw.trim() === '') return undefined;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 0 || value > 5000) {
    throw new Error(`BOT_DELAY_MS must be an integer from 0 to 5000 (milliseconds), got "${raw}"`);
  }
  return value;
}

/**
 * spec-8 D8: абсолютный http(s) URL без пути, query и hash (завершающий `/` допустим).
 * Возвращает `origin` (без `/` на конце); пусто/не задано — `undefined`.
 */
export function parsePublicUrl(raw: string | undefined): string | undefined {
  if (raw === undefined || raw.trim() === '') return undefined;
  const value = raw.trim();
  const fail = (why: string): never => {
    throw new Error(
      `PUBLIC_URL must be an absolute http(s) URL without a path, e.g. "https://domino-testdenis.fly.dev" (${why}), got "${raw}"`,
    );
  };
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return fail('not a URL');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') fail(`protocol ${url.protocol}`);
  if (url.username || url.password) fail('credentials are not allowed');
  if (url.pathname !== '/') fail(`path ${url.pathname}`);
  // `new URL('https://x/?')` даёт пустой search, поэтому проверяем исходную строку тоже.
  if (url.search || url.hash || /[?#]/.test(value)) fail('query or hash');
  return url.origin;
}

/** STATIC_DIR: каталог обязан существовать и содержать index.html. */
export function parseStaticDir(raw: string | undefined): string | undefined {
  if (raw === undefined || raw.trim() === '') return undefined;
  const dir = path.resolve(raw.trim());
  if (!existsSync(dir) || !statSync(dir).isDirectory()) {
    throw new Error(`STATIC_DIR must be an existing directory, got "${raw}" (${dir})`);
  }
  const index = path.join(dir, 'index.html');
  if (!existsSync(index) || !statSync(index).isFile()) {
    throw new Error(`STATIC_DIR must contain index.html, got "${raw}" (${dir})`);
  }
  return dir;
}
