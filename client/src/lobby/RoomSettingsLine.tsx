import type { RoomSettings } from '@domino/shared';

export interface RoomSettingsLineProps {
  settings: RoomSettings;
  /** Префикс testid: `<testId>`, `<testId>-target`, `<testId>-hand`, `<testId>-turn`. */
  testId: string;
}

/** spec-14 §4.3: «Матч до 101 · 7 костей в руке · ход 60 с» (turnSeconds = 0 → «без таймера»). */
export function RoomSettingsLine({ settings, testId }: RoomSettingsLineProps) {
  const { matchTarget, handSize, turnSeconds } = settings;
  return (
    <p className="room-settings" data-testid={testId}>
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
