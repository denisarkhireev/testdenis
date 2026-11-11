import { afterEach, describe, expect, it, vi } from 'vitest';
import { clearSession, loadName, loadSession, saveName, saveSession } from './storage';

afterEach(() => {
  vi.restoreAllMocks();
  sessionStorage.clear();
  localStorage.clear();
});

describe('storage', () => {
  it('C3: saveSession → loadSession round-trips, clearSession removes it', () => {
    saveSession({ roomId: 'ABC234', playerToken: 't' });
    expect(loadSession()).toEqual({ roomId: 'ABC234', playerToken: 't' });
    clearSession();
    expect(loadSession()).toBeNull();
  });

  it('C3: broken JSON → null and the key is removed', () => {
    sessionStorage.setItem('domino:session', '{not json');
    expect(loadSession()).toBeNull();
    expect(sessionStorage.getItem('domino:session')).toBeNull();
  });

  it('C3: JSON of a wrong shape → null and the key is removed', () => {
    sessionStorage.setItem('domino:session', JSON.stringify({ roomId: 1 }));
    expect(loadSession()).toBeNull();
    expect(sessionStorage.getItem('domino:session')).toBeNull();
  });

  it('C3: throwing storage → null without exceptions', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('denied');
    });
    expect(loadSession()).toBeNull();
    expect(() => saveSession({ roomId: 'ABC234', playerToken: 't' })).not.toThrow();
    expect(loadName()).toBe('');
    expect(() => saveName('Аня')).not.toThrow();
  });

  it('name is kept in localStorage', () => {
    expect(loadName()).toBe('');
    saveName('Аня');
    expect(localStorage.getItem('domino:name')).toBe('Аня');
    expect(loadName()).toBe('Аня');
  });
});
