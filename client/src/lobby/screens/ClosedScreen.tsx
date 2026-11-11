import type { RoomClosedReason } from '@domino/shared';

const CLOSED_TEXT: Record<RoomClosedReason, string> = {
  player_left: 'Соперник покинул игру',
  replaced: 'Игра открыта в другой вкладке',
};

export interface ClosedScreenProps {
  reason: RoomClosedReason;
  onHome(): void;
}

export function ClosedScreen({ reason, onHome }: ClosedScreenProps) {
  return (
    <section data-testid="closed-screen">
      <h2>{CLOSED_TEXT[reason]}</h2>
      <button type="button" data-testid="home-button" onClick={onHome}>
        На главную
      </button>
    </section>
  );
}
