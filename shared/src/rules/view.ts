import { getLegalMoves } from './round';
import { handOf } from './seats';
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
  /** spec-17: только при 4 местах — число костей по местам (включая своё). */
  handCounts?: number[];
  /** spec-17: только при 4 местах — все руки по местам при 'finished', иначе null. */
  hands?: Tile[][] | null;
}

export function toPlayerView(state: RoundState, player: PlayerIndex): PlayerView {
  const legalMoves = state.currentPlayer === player ? getLegalMoves(state) : [];
  if (state.hands.length === 4) {
    return {
      you: player,
      hand: handOf(state, player),
      opponentHandCount: 0,
      boneyardCount: state.boneyard.length,
      board: state.board,
      currentPlayer: state.currentPlayer,
      status: state.status,
      result: state.result,
      opponentHand: null,
      legalMoves,
      handCounts: state.hands.map((h) => h.length),
      hands: state.status === 'finished' ? state.hands : null,
    };
  }
  const opponent = player === 0 ? 1 : 0;
  return {
    you: player,
    hand: handOf(state, player),
    opponentHandCount: handOf(state, opponent).length,
    boneyardCount: state.boneyard.length,
    board: state.board,
    currentPlayer: state.currentPlayer,
    status: state.status,
    result: state.result,
    opponentHand: state.status === 'finished' ? handOf(state, opponent) : null,
    legalMoves,
  };
}
