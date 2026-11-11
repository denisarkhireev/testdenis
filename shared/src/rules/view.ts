import { getLegalMoves } from './round';
import type { Move, PlacedTile, PlayerIndex, RoundResult, RoundState, Tile } from './types';

/** Состояние раунда глазами одного игрока: без костей соперника и базара. */
export interface PlayerView {
  you: PlayerIndex;
  /** Своя рука полностью. */
  hand: Tile[];
  opponentHandCount: number;
  boneyardCount: number;
  board: PlacedTile[];
  currentPlayer: PlayerIndex;
  status: RoundState['status'];
  /** При 'finished' — полностью (руки соперника раскрываются только суммами handPoints). */
  result: RoundResult | null;
  /** getLegalMoves, если currentPlayer === you, иначе []. */
  legalMoves: Move[];
}

export function toPlayerView(state: RoundState, player: PlayerIndex): PlayerView {
  return {
    you: player,
    hand: state.hands[player],
    opponentHandCount: state.hands[player === 0 ? 1 : 0].length,
    boneyardCount: state.boneyard.length,
    board: state.board,
    currentPlayer: state.currentPlayer,
    status: state.status,
    result: state.result,
    legalMoves: state.currentPlayer === player ? getLegalMoves(state) : [],
  };
}
