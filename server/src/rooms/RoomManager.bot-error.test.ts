import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RoundState } from '@domino/shared';

// spec-15 B10a: applyMove из shared подменяется, чтобы смоделировать «невозможный» отказ.
const control = vi.hoisted(() => ({ reject: false }));
vi.mock('@domino/shared', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@domino/shared')>();
  return {
    ...actual,
    applyMove: (...args: Parameters<typeof actual.applyMove>) =>
      control.reject ? { ok: false, error: 'ILLEGAL_MOVE' } : actual.applyMove(...args),
  };
});

const { RoomManager } = await import('./RoomManager');

const BOT_DELAY = 1000;

function botOpens(): RoundState {
  return {
    hands: [[[1, 2]], [[6, 6]]],
    boneyard: [],
    board: [],
    openingTile: [6, 6],
    currentPlayer: 1,
    status: 'playing',
    result: null,
  };
}

describe('RoomManager: bot move rejected (spec-15 B10)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    control.reject = false;
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('B10a: !ok → console.error, no reschedule, no exception', () => {
    const onBotMove = vi.fn();
    const rooms = new RoomManager({
      roundSeed: () => 1,
      reconnectTimeoutMs: 60_000,
      startRound: botOpens,
      onClose: vi.fn(),
      onForfeit: vi.fn(),
      onAutoMove: vi.fn(),
      onBotMove,
      botDelayMs: () => BOT_DELAY,
    });
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const created = rooms.createWithBot('s0', 'A', { turnSeconds: 0 });
    if (!created.ok) throw new Error('createWithBot failed');
    const { room } = created.value;

    control.reject = true;
    expect(() => vi.advanceTimersByTime(BOT_DELAY)).not.toThrow();
    expect(error).toHaveBeenCalledExactlyOnceWith(expect.stringContaining('bot move failed'));
    expect(room.botTimer).toBeNull();
    expect(room.round!.board).toHaveLength(0);
    expect(onBotMove).not.toHaveBeenCalled();
    vi.advanceTimersByTime(BOT_DELAY * 10);
    expect(error).toHaveBeenCalledTimes(1);
    rooms.closeAll();
  });
});
