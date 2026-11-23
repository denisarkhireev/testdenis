import type { RoomSettings } from '@domino/shared';
import { RoomSettingsLine } from '../RoomSettingsLine';
import { NameForm } from './NameForm';

export interface JoinScreenProps {
  roomId: string;
  /** spec-14 S7: настройки из room:info; null — ответа нет (ещё или вовсе), строка не показывается. */
  settings: RoomSettings | null;
  canSubmit: boolean;
  error: string | null;
  onJoin(name: string): void;
}

export function JoinScreen({ roomId, settings, canSubmit, error, onJoin }: JoinScreenProps) {
  return (
    <section data-testid="join-screen">
      <h2>
        Вас пригласили в игру <code data-testid="join-room-code">{roomId}</code>
      </h2>
      {settings && <RoomSettingsLine settings={settings} testId="join-settings" />}
      <NameForm
        submitLabel="Войти"
        submitTestId="join-button"
        canSubmit={canSubmit}
        error={error}
        onSubmit={onJoin}
      />
    </section>
  );
}
