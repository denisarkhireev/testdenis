import { useCallback, useEffect, useRef, useState } from 'react';
import { sameTile, type End, type Move, type PlayerView, type Tile } from '@domino/shared';
import { TIMEOUT_TEXT } from '../lobby/errors';
import type { ClientSocket } from '../socket';
import type { ConnectionStatus } from '../useConnectionStatus';
import { GAME_ERROR_TEXT } from './errors';
import { sendMove } from './gameApi';
import { canDraw, canPass, isPlayable, playEnds } from './moves';

/**
 * Выбор кости и ошибка привязаны к `room.game`, при котором появились: новый `room:state`
 * (новая ссылка на `game`) сбрасывает их сам, без эффектов и сравнения содержимого (G7).
 */
interface Bound<T> {
  game: PlayerView;
  value: T;
}

export interface GameTable {
  selected: Tile | null;
  pending: boolean;
  error: string | null;
  interactive: boolean;
  clickTile(tile: Tile): void;
  chooseEnd(end: End): void;
  draw(): void;
  pass(): void;
  cancel(): void;
}

export function useGameTable(
  socket: ClientSocket,
  game: PlayerView,
  status: ConnectionStatus,
): GameTable {
  const [selection, setSelection] = useState<Bound<Tile> | null>(null);
  const [failure, setFailure] = useState<Bound<string> | null>(null);
  const [pending, setPending] = useState(false);
  /** G5: синхронная защита от второго запроса, пока первый в полёте. */
  const pendingRef = useRef(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const selected = selection?.game === game ? selection.value : null;
  const error = failure?.game === game ? failure.value : null;
  const interactive =
    status === 'connected' &&
    game.status === 'playing' &&
    game.currentPlayer === game.you &&
    !pending;

  const send = useCallback(
    (move: Move) => {
      if (pendingRef.current) return;
      pendingRef.current = true;
      setPending(true);
      setSelection(null);
      setFailure(null);
      void sendMove(socket, move).then((result) => {
        pendingRef.current = false;
        if (!mountedRef.current) return;
        setPending(false);
        if (result === 'timeout') setFailure({ game, value: TIMEOUT_TEXT });
        else if (!result.ok) setFailure({ game, value: GAME_ERROR_TEXT[result.error] });
      });
    },
    [socket, game],
  );

  const clickTile = useCallback(
    (tile: Tile) => {
      if (!interactive || !isPlayable(game.legalMoves, tile)) return;
      if (selected && sameTile(selected, tile)) {
        setSelection(null);
        return;
      }
      const ends = playEnds(game.legalMoves, tile);
      if (ends.length === 1) send({ type: 'play', tile, end: ends[0]! });
      else setSelection({ game, value: tile });
    },
    [interactive, game, selected, send],
  );

  const chooseEnd = useCallback(
    (end: End) => {
      if (!interactive || !selected) return;
      if (!playEnds(game.legalMoves, selected).includes(end)) return;
      send({ type: 'play', tile: selected, end });
    },
    [interactive, game, selected, send],
  );

  const draw = useCallback(() => {
    if (interactive && canDraw(game.legalMoves)) send({ type: 'draw' });
  }, [interactive, game, send]);

  const pass = useCallback(() => {
    if (interactive && canPass(game.legalMoves)) send({ type: 'pass' });
  }, [interactive, game, send]);

  const cancel = useCallback(() => setSelection(null), []);

  return { selected, pending, error, interactive, clickTile, chooseEnd, draw, pass, cancel };
}
