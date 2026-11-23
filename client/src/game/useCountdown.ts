import { useEffect, useState } from 'react';

const TICK_MS = 250;

/** RC8: «mm:ss», секунды округляются вверх: 120000 → 02:00, 61001 → 01:02, ≤ 0 → 00:00. */
export function formatMmSs(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

/**
 * RC8: обратный отсчёт по остатку от сервера. Локальный дедлайн = момент получения + остаток
 * (не зависит от расхождения часов) и пересчитывается на каждое новое значение `remainingMs`
 * (т.е. на каждый room:state). Тик раз в 250 мс; null на входе → null.
 */
export function useCountdown(remainingMs: number | null): number | null {
  const [left, setLeft] = useState<number | null>(remainingMs);
  const [source, setSource] = useState<number | null>(remainingMs);

  // Новое значение с сервера — сразу показать его, без кадра со старым остатком.
  if (source !== remainingMs) {
    setSource(remainingMs);
    setLeft(remainingMs);
  }

  useEffect(() => {
    if (remainingMs === null) return;
    const deadline = Date.now() + remainingMs;
    const timer = setInterval(() => {
      const next = Math.max(0, deadline - Date.now());
      setLeft(next);
      if (next === 0) clearInterval(timer);
    }, TICK_MS);
    return () => clearInterval(timer);
  }, [remainingMs]);

  return left;
}
