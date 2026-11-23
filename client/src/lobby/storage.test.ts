import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  MAX_SESSIONS,
  clearSession,
  dropLegacySession,
  loadName,
  loadSession,
  saveName,
  saveSession,
} from './storage';

const KEY = 'domino:sessions';

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  sessionStorage.clear();
  localStorage.clear();
});

describe('storage', () => {
  it('C-X1: sessions are kept per room in localStorage', () => {
    saveSession({ roomId: 'AAAAAA', playerToken: 't1' });
    saveSession({ roomId: 'BBBBBB', playerToken: 't2' });
    expect(loadSession('AAAAAA')).toEqual({ roomId: 'AAAAAA', playerToken: 't1' });
    expect(loadSession('BBBBBB')).toEqual({ roomId: 'BBBBBB', playerToken: 't2' });
    expect(loadSession('CCCCCC')).toBeNull();
    expect(Object.keys(JSON.parse(localStorage.getItem(KEY)!) as object)).toEqual([
      'AAAAAA',
      'BBBBBB',
    ]);
    clearSession('AAAAAA');
    expect(loadSession('AAAAAA')).toBeNull();
    expect(loadSession('BBBBBB')).toEqual({ roomId: 'BBBBBB', playerToken: 't2' });
    expect(sessionStorage.length).toBe(0);
  });

  it('C-X1: the 11th session evicts the oldest one', () => {
    vi.useFakeTimers();
    for (let i = 0; i <= MAX_SESSIONS; i++) {
      vi.setSystemTime(1000 + i);
      saveSession({ roomId: `ROOM${i}`, playerToken: `t${i}` });
    }
    const stored = JSON.parse(localStorage.getItem(KEY)!) as object;
    expect(Object.keys(stored)).toHaveLength(MAX_SESSIONS);
    expect(loadSession('ROOM0')).toBeNull();
    expect(loadSession('ROOM1')).not.toBeNull();
    expect(loadSession(`ROOM${MAX_SESSIONS}`)).not.toBeNull();
  });

  it('C-X1: re-saving refreshes savedAt so the room is not evicted', () => {
    vi.useFakeTimers();
    vi.setSystemTime(1);
    saveSession({ roomId: 'OLDEST', playerToken: 't' });
    for (let i = 1; i < MAX_SESSIONS; i++) {
      vi.setSystemTime(10 + i);
      saveSession({ roomId: `ROOM${i}`, playerToken: `t${i}` });
    }
    vi.setSystemTime(100);
    saveSession({ roomId: 'OLDEST', playerToken: 't' });
    vi.setSystemTime(101);
    saveSession({ roomId: 'NEWEST', playerToken: 't' });
    expect(loadSession('OLDEST')).not.toBeNull();
    expect(loadSession('ROOM1')).toBeNull();
  });

  it('C-X1: broken JSON or a wrong shape → null, the next save overwrites it', () => {
    localStorage.setItem(KEY, '{not json');
    expect(loadSession('AAAAAA')).toBeNull();
    localStorage.setItem(KEY, JSON.stringify(['AAAAAA']));
    expect(loadSession('AAAAAA')).toBeNull();
    localStorage.setItem(
      KEY,
      JSON.stringify({ AAAAAA: { playerToken: 1, savedAt: 1 }, BBBBBB: { playerToken: 't' } }),
    );
    expect(loadSession('AAAAAA')).toBeNull();
    expect(loadSession('BBBBBB')).toBeNull();
    saveSession({ roomId: 'CCCCCC', playerToken: 't' });
    expect(Object.keys(JSON.parse(localStorage.getItem(KEY)!) as object)).toEqual(['CCCCCC']);
  });

  it('C-X1: throwing storage → null without exceptions', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('denied');
    });
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new Error('denied');
    });
    expect(loadSession('AAAAAA')).toBeNull();
    expect(() => saveSession({ roomId: 'ABC234', playerToken: 't' })).not.toThrow();
    expect(() => clearSession('ABC234')).not.toThrow();
    expect(() => dropLegacySession()).not.toThrow();
    expect(loadName()).toBe('');
    expect(() => saveName('Аня')).not.toThrow();
  });

  it('C-X2: dropLegacySession removes the old sessionStorage key only', () => {
    sessionStorage.setItem(
      'domino:session',
      JSON.stringify({ roomId: 'ABC234', playerToken: 't' }),
    );
    saveSession({ roomId: 'ABC234', playerToken: 'new' });
    dropLegacySession();
    expect(sessionStorage.getItem('domino:session')).toBeNull();
    expect(loadSession('ABC234')).toEqual({ roomId: 'ABC234', playerToken: 'new' });
  });

  it('name is kept in localStorage', () => {
    expect(loadName()).toBe('');
    saveName('Аня');
    expect(localStorage.getItem('domino:name')).toBe('Аня');
    expect(loadName()).toBe('Аня');
  });
});
