import { useCallback, useEffect, useRef, useState } from 'react';
import {
  REACTION_COOLDOWN_MS,
  REACTION_SHOW_MS,
  type PlayerIndex,
  type ReactionId,
  type RoomReactionPayload,
} from '@domino/shared';
import { TIMEOUT_TEXT } from '../lobby/errors';
import type { ClientSocket } from '../socket';
import type { ConnectionStatus } from '../useConnectionStatus';
import { REACTION_ERROR_TEXT } from './errors';
import { sendReaction } from './reactionsApi';

/** Ошибка отправки гаснет сама через столько мс. */
export const REACTION_ERROR_MS = 3000;

export interface Bubble {
  reactionId: ReactionId;
  /** RX7: ключ — повтор той же реакции перезапускает облачко. */
  seq: number;
}

type Who = 'mine' | 'opponent';
export type Bubbles = Record<Who, Bubble | null>;

/** spec-17: облачка по местам (2×2) — каждое место рисует своё. */
export type SeatBubbles = Partial<Record<PlayerIndex, Bubble>>;

export interface Reactions {
  bubbles: Bubbles;
  bySeat: SeatBubbles;
  send(reactionId: ReactionId): void;
  canSend: boolean;
  error: string | null;
}

type Timer = ReturnType<typeof setTimeout>;

/**
 * spec-12: облачка обоих мест (RX10) и отправка реакции с локальным кулдауном (RX11).
 * Своё облачко появляется только по эху сервера `room:reaction`, не оптимистично (RX6).
 */
export function useReactions(
  socket: ClientSocket,
  you: PlayerIndex,
  status: ConnectionStatus,
): Reactions {
  const [bubbles, setBubbles] = useState<Bubbles>({ mine: null, opponent: null });
  const [bySeat, setBySeat] = useState<SeatBubbles>({});
  const [pending, setPending] = useState(false);
  const [cooldown, setCooldown] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pendingRef = useRef(false);
  const cooldownRef = useRef(false);
  const mountedRef = useRef(true);
  const timers = useRef<Record<string, Timer | null>>({
    mine: null,
    opponent: null,
    cooldown: null,
    error: null,
  });

  const restart = useCallback((name: string, ms: number, fn: () => void) => {
    const all = timers.current;
    const running = all[name];
    if (running != null) clearTimeout(running);
    all[name] = setTimeout(() => {
      all[name] = null;
      fn();
    }, ms);
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    const all = timers.current;
    return () => {
      mountedRef.current = false;
      for (const key of Object.keys(all)) {
        const running = all[key];
        if (running != null) clearTimeout(running);
        all[key] = null;
      }
    };
  }, []);

  useEffect(() => {
    const onReaction = ({ seat, reactionId, seq }: RoomReactionPayload) => {
      const who: Who = seat === you ? 'mine' : 'opponent';
      setBubbles((b) => ({ ...b, [who]: { reactionId, seq } }));
      restart(who, REACTION_SHOW_MS, () => setBubbles((b) => ({ ...b, [who]: null })));
      // spec-17: то же облачко — за местом (для стола на четверых).
      setBySeat((b) => ({ ...b, [seat]: { reactionId, seq } }));
      restart(`seat-${seat}`, REACTION_SHOW_MS, () =>
        setBySeat((b) => {
          const next = { ...b };
          delete next[seat];
          return next;
        }),
      );
    };
    socket.on('room:reaction', onReaction);
    return () => {
      socket.off('room:reaction', onReaction);
    };
  }, [socket, you, restart]);

  const send = useCallback(
    (reactionId: ReactionId) => {
      if (pendingRef.current || cooldownRef.current) return;
      pendingRef.current = true;
      setPending(true);
      void sendReaction(socket, reactionId).then((result) => {
        pendingRef.current = false;
        if (!mountedRef.current) return;
        setPending(false);
        if (result !== 'timeout' && result.ok) {
          cooldownRef.current = true;
          setCooldown(true);
          restart('cooldown', REACTION_COOLDOWN_MS, () => {
            cooldownRef.current = false;
            setCooldown(false);
          });
          const errorTimer = timers.current.error;
          if (errorTimer != null) clearTimeout(errorTimer);
          timers.current.error = null;
          setError(null);
          return;
        }
        setError(result === 'timeout' ? TIMEOUT_TEXT : REACTION_ERROR_TEXT[result.error]);
        restart('error', REACTION_ERROR_MS, () => setError(null));
      });
    },
    [socket, restart],
  );

  return {
    bubbles,
    bySeat,
    send,
    canSend: status === 'connected' && !pending && !cooldown,
    error,
  };
}
