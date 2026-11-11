import { NameForm } from './NameForm';

export interface JoinScreenProps {
  roomId: string;
  canSubmit: boolean;
  error: string | null;
  onJoin(name: string): void;
}

export function JoinScreen({ roomId, canSubmit, error, onJoin }: JoinScreenProps) {
  return (
    <section data-testid="join-screen">
      <h2>
        Вас пригласили в игру <code data-testid="join-room-code">{roomId}</code>
      </h2>
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
