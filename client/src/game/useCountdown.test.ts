import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { formatMmSs, useCountdown } from './useCountdown';

afterEach(() => {
  vi.useRealTimers();
});

describe('useCountdown', () => {
  it.each([
    [120_000, '02:00'],
    [61_001, '01:02'],
    [999, '00:01'],
    [0, '00:00'],
    [-5, '00:00'],
  ])('C-X9: formatMmSs(%i) → %s', (ms, text) => {
    expect(formatMmSs(ms)).toBe(text);
  });

  it('counts down from the received value and stops at 0', () => {
    vi.useFakeTimers();
    const { result } = renderHook(({ ms }) => useCountdown(ms), { initialProps: { ms: 1000 } });
    expect(result.current).toBe(1000);
    act(() => vi.advanceTimersByTime(500));
    expect(result.current).toBe(500);
    act(() => vi.advanceTimersByTime(2000));
    expect(result.current).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('a new value restarts the deadline; null → null without timers', () => {
    vi.useFakeTimers();
    const { result, rerender } = renderHook(({ ms }) => useCountdown(ms), {
      initialProps: { ms: 10_000 as number | null },
    });
    act(() => vi.advanceTimersByTime(3000));
    expect(result.current).toBe(7000);
    rerender({ ms: 9000 });
    expect(result.current).toBe(9000);
    rerender({ ms: null });
    expect(result.current).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });
});
