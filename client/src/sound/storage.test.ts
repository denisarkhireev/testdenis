import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadSoundEnabled, saveSoundEnabled } from './storage';

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

describe('sound storage (spec-10 S5)', () => {
  it('SN5: no key → on', () => {
    expect(loadSoundEnabled()).toBe(true);
  });

  it("SN5: 'off' → off, 'on' → on", () => {
    localStorage.setItem('domino:sound', 'off');
    expect(loadSoundEnabled()).toBe(false);
    localStorage.setItem('domino:sound', 'on');
    expect(loadSoundEnabled()).toBe(true);
  });

  it('SN5: garbage → on', () => {
    localStorage.setItem('domino:sound', '{"x":1}');
    expect(loadSoundEnabled()).toBe(true);
  });

  it('SN5: getItem throws → on; setItem throws → swallowed', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('denied');
    });
    expect(loadSoundEnabled()).toBe(true);
    expect(() => saveSoundEnabled(false)).not.toThrow();
  });

  it('saveSoundEnabled writes on/off', () => {
    saveSoundEnabled(false);
    expect(localStorage.getItem('domino:sound')).toBe('off');
    saveSoundEnabled(true);
    expect(localStorage.getItem('domino:sound')).toBe('on');
  });
});
