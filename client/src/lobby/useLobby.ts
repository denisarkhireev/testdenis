import { useCallback, useEffect, useRef, useState } from 'react';
import {
  PROTOCOL_VERSION,
  type RoomClosedPayload,
  type RoomClosedReason,
  type RoomStatePayload,
  type ServerHelloPayload,
} from '@domino/shared';
import type { ClientSocket } from '../socket';
import type { ConnectionStatus } from '../useConnectionStatus';
import { REJOIN_FAILED_TEXT, ROOM_ERROR_TEXT, TIMEOUT_TEXT } from './errors';
import { parseRoomIdFromSearch } from './invite';
import { createRoom, joinRoom, rejoinRoom, type JoinResult } from './roomApi';
import { clearSession, loadSession, saveName, saveSession, type Session } from './storage';

export type Pending = 'create' | 'join' | 'rejoin';

export interface LobbyState {
  /** L2: из URL при монтировании, после create и после goHome. */
  urlRoom: string | null | 'invalid';
  session: Session | null;
  /** Последний room:state (L12). */
  room: RoomStatePayload | null;
  closed: RoomClosedReason | null;
  pending: Pending | null;
  /** Текст form-error. */
  error: string | null;
  /** ROOM_NOT_FOUND на join. */
  badLink: boolean;
}

export type Screen = 'closed' | 'game' | 'waiting' | 'restoring' | 'bad-link' | 'join' | 'home';

export function selectScreen(s: LobbyState): Screen {
  if (s.closed) return 'closed';
  if (s.room) return s.room.phase === 'waiting' ? 'waiting' : 'game';
  if (s.pending === 'rejoin' || (s.session && !s.room)) return 'restoring';
  if (s.badLink || s.urlRoom === 'invalid') return 'bad-link';
  if (s.urlRoom) return 'join';
  return 'home';
}

export const NAME_MAX_LENGTH = 20;

export function isValidName(name: string): boolean {
  const length = name.trim().length;
  return length >= 1 && length <= NAME_MAX_LENGTH;
}

const HOME_STATE: LobbyState = {
  urlRoom: null,
  session: null,
  room: null,
  closed: null,
  pending: null,
  error: null,
  badLink: false,
};

/** Начальное состояние по URL и sessionStorage (L10: сессия важнее ?room, но только для того же кода). */
function initLobbyState(): LobbyState {
  const urlRoom = parseRoomIdFromSearch(window.location.search);
  let session = loadSession();
  if (session && urlRoom !== null && session.roomId !== urlRoom) {
    clearSession();
    session = null;
  }
  return { ...HOME_STATE, urlRoom, session };
}

export interface Lobby {
  state: LobbyState;
  create(name: string): Promise<void>;
  join(name: string): Promise<void>;
  goHome(): void;
}

export function useLobby(socket: ClientSocket, status: ConnectionStatus): Lobby {
  const [state, setState] = useState<LobbyState>(initLobbyState);
  // Рефы — для обработчиков событий и защиты от двойного клика до перерисовки.
  const sessionRef = useRef<Session | null>(state.session);
  const pendingRef = useRef<Pending | null>(null);
  const rejoinSeqRef = useRef(0);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const dropSession = useCallback(() => {
    clearSession();
    sessionRef.current = null;
  }, []);

  useEffect(() => {
    const onState = (payload: RoomStatePayload) => {
      setState((s) => ({ ...s, room: payload, closed: null }));
    };

    const onClosed = (payload: RoomClosedPayload) => {
      dropSession();
      rejoinSeqRef.current += 1;
      pendingRef.current = null;
      setState((s) => ({ ...s, session: null, room: null, closed: payload.reason, pending: null }));
    };

    // L9: каждый hello (F5, переподключение) — попытка вернуться на своё место.
    const onHello = async (payload: ServerHelloPayload) => {
      const session = sessionRef.current;
      if (payload.protocolVersion !== PROTOCOL_VERSION || !session) return;
      const seq = ++rejoinSeqRef.current;
      pendingRef.current = 'rejoin';
      setState((s) => ({ ...s, pending: 'rejoin', error: null }));

      const result = await rejoinRoom(socket, session);
      if (!mountedRef.current || seq !== rejoinSeqRef.current) return;
      pendingRef.current = null;
      if (result !== 'timeout' && result.ok) {
        setState((s) => ({ ...s, pending: null }));
        return;
      }
      dropSession();
      setState((s) => ({
        ...s,
        session: null,
        room: null,
        pending: null,
        error: result === 'timeout' ? TIMEOUT_TEXT : REJOIN_FAILED_TEXT,
      }));
    };

    socket.on('room:state', onState);
    socket.on('room:closed', onClosed);
    socket.on('server:hello', onHello);
    return () => {
      socket.off('room:state', onState);
      socket.off('room:closed', onClosed);
      socket.off('server:hello', onHello);
    };
  }, [socket, dropSession]);

  const submit = useCallback(
    async (
      kind: 'create' | 'join',
      name: string,
      request: (name: string) => Promise<JoinResult>,
    ): Promise<void> => {
      if (pendingRef.current || status !== 'connected' || !isValidName(name)) return;
      const trimmed = name.trim();
      pendingRef.current = kind;
      setState((s) => ({ ...s, pending: kind, error: null }));
      saveName(trimmed);

      const result = await request(trimmed);
      if (!mountedRef.current) return;
      pendingRef.current = null;

      if (result === 'timeout') {
        setState((s) => ({ ...s, pending: null, error: TIMEOUT_TEXT }));
      } else if (result.ok) {
        const session = { roomId: result.roomId, playerToken: result.playerToken };
        saveSession(session);
        sessionRef.current = session;
        if (kind === 'create') {
          // L3: URL создателя превращается в ссылку-приглашение.
          window.history.replaceState(null, '', `/?room=${result.roomId}`);
        }
        setState((s) => ({ ...s, session, urlRoom: result.roomId, pending: null }));
      } else if (kind === 'join' && result.error === 'ROOM_NOT_FOUND') {
        setState((s) => ({ ...s, pending: null, badLink: true }));
      } else {
        setState((s) => ({ ...s, pending: null, error: ROOM_ERROR_TEXT[result.error] }));
      }
    },
    [status],
  );

  const create = useCallback(
    (name: string) => submit('create', name, (n) => createRoom(socket, { name: n })),
    [submit, socket],
  );

  const urlRoom = state.urlRoom;
  const join = useCallback(
    async (name: string) => {
      if (urlRoom === null || urlRoom === 'invalid') return;
      await submit('join', name, (n) => joinRoom(socket, { roomId: urlRoom, name: n }));
    },
    [submit, socket, urlRoom],
  );

  const goHome = useCallback(() => {
    dropSession();
    rejoinSeqRef.current += 1;
    pendingRef.current = null;
    window.history.replaceState(null, '', '/');
    setState(HOME_STATE);
  }, [dropSession]);

  return { state, create, join, goHome };
}
