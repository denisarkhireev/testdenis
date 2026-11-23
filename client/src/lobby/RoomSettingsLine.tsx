import { DEFAULT_VARIANT, type RoomSettings } from '@domino/shared';
import { variantLabel } from './variant';

export interface RoomSettingsLineProps {
  /** spec-16/17: `variant` и `mode` могут отсутствовать (старый сервер) — тогда «Классика», 1×1. */
  settings: Omit<RoomSettings, 'variant' | 'mode'> &
    Partial<Pick<RoomSettings, 'variant' | 'mode'>>;
  /** Префикс testid: `<testId>`, `<testId>-variant`, `<testId>-target`, `<testId>-hand`, `<testId>-turn`. */
  testId: string;
}

/**
 * spec-14 §4.3, spec-16: «Козёл · Матч до 101 · 7 костей в руке · ход 60 с»
 * (turnSeconds = 0 → «без таймера»). spec-17: в 2×2 — префикс «2 на 2 · ».
 */
export function RoomSettingsLine({ settings, testId }: RoomSettingsLineProps) {
  const { matchTarget, handSize, turnSeconds, variant = DEFAULT_VARIANT, mode } = settings;
  return (
    <p className="room-settings" data-testid={testId}>
      {mode === '2x2' && (
        <>
          <strong data-testid={`${testId}-mode`}>2 на 2</strong>
          {' · '}
        </>
      )}
      <strong data-testid={`${testId}-variant`}>{variantLabel(variant)}</strong>
      {' · '}
      Матч до <strong data-testid={`${testId}-target`}>{matchTarget}</strong>
      {' · '}
      <strong data-testid={`${testId}-hand`}>{handSize}</strong> костей в руке
      {' · '}
      <span data-testid={`${testId}-turn`}>
        {turnSeconds > 0 ? `ход ${turnSeconds} с` : 'без таймера'}
      </span>
    </p>
  );
}
