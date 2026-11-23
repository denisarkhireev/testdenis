import {
  partnerOf,
  type MatchView,
  teamOf,
  teamSeats,
  type PlayerIndex,
  type RoomPlayer,
  type TeamIndex,
} from '@domino/shared';

/** spec-17 §4.3: зона стола для чужого места. */
export type SeatSide = 'top' | 'left' | 'right';

/**
 * spec-17 §4.3, допущение 10: напарник сверху, слева — следующий по ходу, справа — предыдущий
 * (ход по часовой стрелке при виде сверху).
 */
export function seatAt(you: PlayerIndex, side: SeatSide): PlayerIndex {
  switch (side) {
    case 'top':
      return partnerOf(you);
    case 'left':
      return ((you + 1) % 4) as PlayerIndex;
    case 'right':
      return ((you + 3) % 4) as PlayerIndex;
  }
}

/** Команда места за столом на четверых. */
export const teamOfSeat = (seat: PlayerIndex): TeamIndex => teamOf(seat, 4);

export function seatName(players: readonly RoomPlayer[], seat: PlayerIndex): string {
  return players.find((player) => player.seat === seat)?.name ?? '';
}

/** spec-17 §4.3: «Аня и Вера» — имена мест команды по возрастанию места. */
export function teamName(players: readonly RoomPlayer[], team: TeamIndex): string {
  return teamSeats(team, 4)
    .map((seat) => seatName(players, seat))
    .join(' и ');
}

/** spec-17 §4.3: «Ждём остальных: K/4» (вы нажали) / «Готовы: K/4» (вы нет, K > 0) / пусто. */
export function teamReadyText(match: MatchView, you: PlayerIndex): string {
  const count = match.ready.filter(Boolean).length;
  if (match.ready[you]) return `Ждём остальных: ${count}/4`;
  return count > 0 ? `Готовы: ${count}/4` : '';
}
