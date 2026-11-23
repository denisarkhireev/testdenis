import type { TurnTimerView } from '@domino/shared';
import { formatMmSs, useCountdown } from './useCountdown';

/** spec-11 §4.3: последние 10 с выделены. */
export const URGENT_MS = 10_000;

export interface TurnTimerProps {
  /** null — таймер не идёт (выкл / раунд окончен): ничего не рендерится. */
  timer: TurnTimerView | null;
}

/**
 * Обратный отсчёт хода (spec-11). Клиент ничего не решает (T9): по нулю ход не делает —
 * сервер пришлёт новое состояние. На паузе — «пауза mm:ss» статично (spec-13 UI8).
 */
export function TurnTimer({ timer }: TurnTimerProps) {
  const counted = useCountdown(timer && !timer.paused ? timer.remainingMs : null);
  if (!timer) return null;
  const left = timer.paused ? timer.remainingMs : (counted ?? timer.remainingMs);
  const urgent = !timer.paused && left <= URGENT_MS;
  const text = formatMmSs(left);
  return (
    <span
      className={`turn-timer${urgent ? ' turn-timer--urgent' : ''}${timer.paused ? ' turn-timer--paused' : ''}`}
      data-testid="turn-timer"
      data-seat={timer.seat}
      data-urgent={urgent ? 'true' : 'false'}
      data-paused={timer.paused ? 'true' : 'false'}
      role="timer"
      aria-live="off"
      aria-label={timer.paused ? `Таймер на паузе: ${text}` : `Осталось на ход: ${text}`}
    >
      {timer.paused ? `пауза ${text}` : text}
    </span>
  );
}
