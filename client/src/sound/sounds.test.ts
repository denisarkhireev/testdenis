import { afterEach, describe, expect, it, vi } from 'vitest';
import { mockAudio } from '../test/fx';
import { createSoundPlayer } from './sounds';

const urls = { tile: 'tile', draw: 'draw', turn: 'turn', roundEnd: 'round-end' };

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('createSoundPlayer (spec-10 §3.3)', () => {
  it('SN1: play before unlock() is dropped, not queued', async () => {
    const { started, contexts } = mockAudio();
    const player = createSoundPlayer({ urls, enabled: true });
    player.play('tile');
    expect(contexts).toHaveLength(0);
    await player.unlock();
    expect(started).toEqual([]);
  });

  it('SN2: after unlock() play("tile") starts one source with the tile buffer', async () => {
    const { started, contexts } = mockAudio();
    const player = createSoundPlayer({ urls, enabled: true });
    await player.unlock();
    expect(contexts).toHaveLength(1);
    expect(contexts[0]!.resume).toHaveBeenCalled();
    player.play('tile');
    expect(started).toEqual(['tile']);
    player.play('roundEnd');
    player.play('tile');
    expect(started).toEqual(['tile', 'round-end', 'tile']);
  });

  it('SN3: setEnabled(false) → play is a no-op', async () => {
    const { started } = mockAudio();
    const player = createSoundPlayer({ urls, enabled: true });
    await player.unlock();
    player.setEnabled(false);
    player.play('turn');
    expect(started).toEqual([]);
    player.setEnabled(true);
    player.play('turn');
    expect(started).toEqual(['turn']);
  });

  it('SN4: no AudioContext — play/unlock do not throw, console.warn at most once', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const player = createSoundPlayer({ urls, enabled: true });
    player.play('tile');
    await expect(player.unlock()).resolves.toBeUndefined();
    await player.unlock();
    player.play('tile');
    expect(warn.mock.calls.length).toBeLessThanOrEqual(1);
  });

  it('SN4: failed load/decode — silent no-op, one warning', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { started } = mockAudio();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, status: 404 })),
    );
    const player = createSoundPlayer({ urls, enabled: true });
    await player.unlock();
    player.play('tile');
    expect(started).toEqual([]);
    expect(warn).toHaveBeenCalledTimes(1);
  });
});
