import { getLegalMoves } from './round';
import type { Move, PlacedTile, PlayerIndex, RoundResult, RoundState, Tile } from './types';

/** Состояние раунда глазами одного игрока: без костей базара; рука соперника — только после конца раунда. */
export interface PlayerView {
  you: PlayerIndex;
  /** Своя рука полностью. */
  hand: Tile[];
  opponentHandCount: number;
  boneyardCount: number;
  board: PlacedTile[];
  currentPlayer: PlayerIndex;
  status: RoundState['status'];
  /** При 'finished' — полностью; руку соперника см. `opponentHand`. */
  result: RoundResult | null;
  /** Рука соперника — только при status === 'finished' (M9), иначе null. */
  opponentHand: Tile[] | null;
  /** getLegalMoves, если currentPlayer === you, иначе []. */
  legalMoves: Move[];
}

export function toPlayerView(state: RoundState, player: PlayerIndex): PlayerView {
  const opponent: PlayerIndex = player === 0 ? 1 : 0;
  return {
    you: player,
    hand: state.hands[player],
    opponentHandCount: state.hands[opponent].length,
    boneyardCount: state.boneyard.length,
    board: state.board,
    currentPlayer: state.currentPlayer,
    status: state.status,
    result: state.result,
    opponentHand: state.status === 'finished' ? state.hands[opponent] : null,
    legalMoves: state.currentPlayer === player ? getLegalMoves(state) : [],
  };
}
