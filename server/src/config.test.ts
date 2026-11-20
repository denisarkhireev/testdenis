import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { loadConfig, parsePublicUrl, parseReconnectTimeout } from './config';

let tmp: string | undefined;

afterEach(async () => {
  if (tmp) await rm(tmp, { recursive: true, force: true });
  tmp = undefined;
});

describe('loadConfig / parsePublicUrl', () => {
  it('P1: defaults for an empty env', () => {
    const config = loadConfig({});
    expect(config).toMatchObject({ port: 3001, host: '0.0.0.0' });
    expect(config.publicUrl).toBeUndefined();
    expect(config.staticDir).toBeUndefined();
    expect(config.matchTarget).toBeUndefined();
  });

  it('P2: PORT and MATCH_TARGET are parsed', () => {
    expect(loadConfig({ PORT: '8080', MATCH_TARGET: '20' })).toMatchObject({
      port: 8080,
      matchTarget: 20,
    });
  });

  it('P3: trailing slash is dropped', () => {
    expect(parsePublicUrl('https://a.fly.dev/')).toBe('https://a.fly.dev');
  });

  it('P4: http with a port is accepted', () => {
    expect(parsePublicUrl('http://localhost:8080')).toBe('http://localhost:8080');
  });

  it.each(['a.fly.dev', 'ftp://x', 'https://x/path', 'https://x/?q=1', 'https://x/#h'])(
    'P5: invalid PUBLIC_URL %s throws',
    (raw) => {
      expect(() => parsePublicUrl(raw)).toThrow(/PUBLIC_URL/);
      expect(() => loadConfig({ PUBLIC_URL: raw })).toThrow(/PUBLIC_URL/);
    },
  );

  it.each<string | undefined>(['', '  ', undefined])(
    'P6: empty PUBLIC_URL %j → undefined',
    (raw) => {
      expect(parsePublicUrl(raw)).toBeUndefined();
    },
  );

  it('P7: STATIC_DIR must exist and contain index.html', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'domino-static-'));
    tmp = dir;
    expect(() => loadConfig({ STATIC_DIR: path.join(dir, 'missing') })).toThrow(/STATIC_DIR/);
    expect(() => loadConfig({ STATIC_DIR: dir })).toThrow(/STATIC_DIR/);
    await writeFile(path.join(dir, 'index.html'), '<!doctype html>');
    expect(loadConfig({ STATIC_DIR: dir }).staticDir).toBe(path.resolve(dir));
  });

  it('P8: MATCH_TARGET=0 still throws (spec-7)', () => {
    expect(() => loadConfig({ MATCH_TARGET: '0' })).toThrow(/MATCH_TARGET/);
  });

  it('X11: RECONNECT_TIMEOUT is a positive integer of milliseconds', () => {
    expect(loadConfig({ RECONNECT_TIMEOUT: '5000' }).reconnectTimeoutMs).toBe(5000);
    expect(loadConfig({}).reconnectTimeoutMs).toBeUndefined();
    expect(parseReconnectTimeout('  ')).toBeUndefined();
    for (const raw of ['abc', '0', '-5', '1.5']) {
      expect(() => loadConfig({ RECONNECT_TIMEOUT: raw })).toThrow(
        /RECONNECT_TIMEOUT must be a positive integer \(milliseconds\)/,
      );
    }
  });

  it('X11: RECONNECT_GRACE_MS is no longer read', () => {
    expect(loadConfig({ RECONNECT_GRACE_MS: '5000' }).reconnectTimeoutMs).toBeUndefined();
  });
});
