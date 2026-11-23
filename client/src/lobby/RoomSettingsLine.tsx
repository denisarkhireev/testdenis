import { DEFAULT_VARIANT, type RoomSettings } from '@domino/shared';
import { variantLabel } from './variant';

export interface RoomSettingsLineProps {
  /** spec-16: `variant` может отсутствовать (старый сервер) — тогда «Классика». */
  settings: Omit<RoomSettings, 'variant'> & Partial<Pick<RoomSettings, 'variant'>>;
  /** Префикс testid: `<testId>`, `<testId>-variant`, `<testId>-target`, `<testId>-hand`, `<testId>-turn`. */
  testId: string;
}

/**
 * spec-14 §4.3, spec-16: «Козёл · Матч до 101 · 7 костей в руке · ход 60 с»
 * (turnSeconds = 0 → «без таймера»).
 */
export function RoomSettingsLine({ settings, testId }: RoomSettingsLineProps) {
  const { matchTarget, handSize, turnSeconds, variant = DEFAULT_VARIANT } = settings;
  return (
    <p className="room-settings" data-testid={testId}>
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
