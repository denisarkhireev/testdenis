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

export interface Reactions {
  bubbles: Bubbles;
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
  const [pending, setPending] = useState(false);
  const [cooldown, setCooldown] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pendingRef = useRef(false);
  const cooldownRef = useRef(false);
  const mountedRef = useRef(true);
  const timers = useRef<Record<Who | 'cooldown' | 'error', Timer | null>>({
    mine: null,
    opponent: null,
    cooldown: null,
    error: null,
  });

  const restart = useCallback((name: keyof typeof timers.current, ms: number, fn: () => void) => {
    const all = timers.current;
    if (all[name] !== null) clearTimeout(all[name]);
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
      for (const key of Object.keys(all) as (keyof typeof all)[]) {
        if (all[key] !== null) clearTimeout(all[key]);
        all[key] = null;
      }
    };
  }, []);

  useEffect(() => {
    const onReaction = ({ seat, reactionId, seq }: RoomReactionPayload) => {
      const who: Who = seat === you ? 'mine' : 'opponent';
      setBubbles((b) => ({ ...b, [who]: { reactionId, seq } }));
      restart(who, REACTION_SHOW_MS, () => setBubbles((b) => ({ ...b, [who]: null })));
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
          if (timers.current.error !== null) clearTimeout(timers.current.error);
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
    send,
    canSend: status === 'connected' && !pending && !cooldown,
    error,
  };
}
