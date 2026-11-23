import type { MatchView, RoomStatePayload } from '@domino/shared';
import { MatchScore } from './MatchScore';
import { teamOfSeat } from './team';
import './game.css';

export interface ForfeitSummaryProps {
  room: RoomStatePayload & { match: MatchView };
  onHome: () => void;
}

/** spec-9 §4.3: итог матча, оконченного техническим поражением (RC5). Комнаты уже нет. */
/** spec-17 §4.3: тексты техпоражения в 2×2 — по команде игрока. */
function teamForfeitText(room: ForfeitSummaryProps['room']): string {
  if (room.match.forfeit !== teamOfSeat(room.you)) {
    return 'Победа! Игрок команды соперников не вернулся в игру';
  }
  return room.match.forfeitSeat === room.you
    ? 'Поражение: время на возвращение истекло'
    : 'Поражение: напарник не вернулся в игру';
}

export function ForfeitSummary({ room, onHome }: ForfeitSummaryProps) {
  const team = room.mode === '2x2';
  const won = room.match.forfeit !== room.you;
  return (
    <section
      className="round-summary forfeit-summary"
      data-testid="forfeit-summary"
      aria-label="Итоги матча"
    >
      <p className="forfeit-result" data-testid="forfeit-result" role="status">
        {team
          ? teamForfeitText(room)
          : won
            ? 'Победа! Соперник не вернулся в игру'
            : 'Поражение: время на возвращение истекло'}
      </p>
      <MatchScore match={room.match} players={room.players} mode={room.mode} />
      <div className="summary-actions">
        <button type="button" className="home-button" data-testid="home-button" onClick={onHome}>
          На главную
        </button>
      </div>
    </section>
  );
}
