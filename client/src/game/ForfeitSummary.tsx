import type { MatchView, RoomStatePayload } from '@domino/shared';
import { MatchScore } from './MatchScore';
import './game.css';

export interface ForfeitSummaryProps {
  room: RoomStatePayload & { match: MatchView };
  onHome: () => void;
}

/** spec-9 §4.3: итог матча, оконченного техническим поражением (RC5). Комнаты уже нет. */
export function ForfeitSummary({ room, onHome }: ForfeitSummaryProps) {
  const won = room.match.forfeit !== room.you;
  return (
    <section
      className="round-summary forfeit-summary"
      data-testid="forfeit-summary"
      aria-label="Итоги матча"
    >
      <p className="forfeit-result" data-testid="forfeit-result" role="status">
        {won ? 'Победа! Соперник не вернулся в игру' : 'Поражение: время на возвращение истекло'}
      </p>
      <MatchScore match={room.match} players={room.players} />
      <div className="summary-actions">
        <button type="button" className="home-button" data-testid="home-button" onClick={onHome}>
          На главную
        </button>
      </div>
    </section>
  );
}
