import type { PlayerCount, PlayerIndex, RoundState, TeamIndex, Tile } from './types';

/** spec-17: число мест в раунде = число рук. */
export function playerCountOf(state: Pick<RoundState, 'hands'>): PlayerCount {
  return state.hands.length === 4 ? 4 : 2;
}

/** spec-17 Q4: следующее место по кругу. */
export function nextSeat(seat: PlayerIndex, count: PlayerCount): PlayerIndex {
  return ((seat + 1) % count) as PlayerIndex;
}

/** spec-17 Q1: команда места; в 1×1 команда = место, в 2×2 — места 0+2 и 1+3. */
export function teamOf(seat: PlayerIndex, count: PlayerCount): TeamIndex {
  return (count === 2 ? seat : seat % 2) as TeamIndex;
}

/** spec-17 Q1: места команды по возрастанию. */
export function teamSeats(team: TeamIndex, count: PlayerCount): PlayerIndex[] {
  return count === 2 ? [team] : [team, (team + 2) as PlayerIndex];
}

/** spec-17 Q1: напарник (только для 4 мест) — место напротив. */
export function partnerOf(seat: PlayerIndex): PlayerIndex {
  return ((seat + 2) % 4) as PlayerIndex;
}

/** Другая команда. */
export function otherTeam(team: TeamIndex): TeamIndex {
  return team === 0 ? 1 : 0;
}

/** Рука места (пустая, если такого места нет). */
export function handOf(state: Pick<RoundState, 'hands'>, seat: PlayerIndex): Tile[] {
  return (state.hands as readonly Tile[][])[seat] ?? [];
}
