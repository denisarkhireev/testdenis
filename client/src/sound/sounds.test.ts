import { afterEach, describe, expect, it, vi } from 'vitest';
import { mockAudio } from '../test/fx';
import { createSoundPlayer, PENDING_PLAY_MAX_MS } from './sounds';

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

describe('createSoundPlayer pending play (spec-13 UI10)', () => {
  /** Декодирование буферов ждёт `release()`; часы `now` двигает тест. */
  function slowDecode() {
    const audio = mockAudio();
    let clock = 0;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const proto = (globalThis as unknown as { AudioContext: { prototype: AudioContext } })
      .AudioContext.prototype;
    const decode = proto.decodeAudioData;
    vi.spyOn(proto, 'decodeAudioData').mockImplementation(async function (
      this: AudioContext,
      ...args: Parameters<AudioContext['decodeAudioData']>
    ) {
      await gate;
      return decode.apply(this, args);
    });
    return {
      ...audio,
      now: () => clock,
      tick: (ms: number) => (clock += ms),
      release,
    };
  }

  it('UI10: play before the buffer is ready, ready in 100 ms → plays once', async () => {
    const fx = slowDecode();
    const player = createSoundPlayer({ urls, enabled: true, now: fx.now });
    const loading = player.unlock();
    player.play('tile');
    expect(fx.started).toEqual([]);
    fx.tick(100);
    fx.release();
    await loading;
    expect(fx.started).toEqual(['tile']);
  });

  it('UI10: buffer ready after 200 ms → dropped; the wait is cleared', async () => {
    const fx = slowDecode();
    const player = createSoundPlayer({ urls, enabled: true, now: fx.now });
    const loading = player.unlock();
    player.play('tile');
    fx.tick(PENDING_PLAY_MAX_MS + 50);
    fx.release();
    await loading;
    expect(fx.started).toEqual([]);
    player.play('tile');
    expect(fx.started).toEqual(['tile']);
  });

  it('UI10: two calls before ready → one sound; disabled sound → nothing is queued', async () => {
    const fx = slowDecode();
    const player = createSoundPlayer({ urls, enabled: true, now: fx.now });
    const loading = player.unlock();
    player.play('tile');
    fx.tick(100);
    player.play('tile');
    fx.tick(100);
    fx.release();
    await loading;
    expect(fx.started).toEqual(['tile']);

    const off = slowDecode();
    const muted = createSoundPlayer({ urls, enabled: false, now: off.now });
    const mutedLoading = muted.unlock();
    muted.play('tile');
    muted.setEnabled(true);
    off.release();
    await mutedLoading;
    expect(off.started).toEqual([]);
  });
});
