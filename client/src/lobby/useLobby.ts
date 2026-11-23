import { useCallback, useEffect, useRef, useState } from 'react';
import {
  PROTOCOL_VERSION,
  type Opponent,
  type RoomClosedPayload,
  type RoomClosedReason,
  type RoomCreatePayload,
  type RoomSettings,
  type RoomStatePayload,
  type ServerHelloPayload,
} from '@domino/shared';
import type { ClientSocket } from '../socket';
import type { ConnectionStatus } from '../useConnectionStatus';
import { REJOIN_FAILED_TEXT, ROOM_ERROR_TEXT, TEAM_ROOM_FULL_TEXT, TIMEOUT_TEXT } from './errors';
import { parseRoomIdFromSearch } from './invite';
import { createRoom, joinRoom, rejoinRoom, roomInfo, type JoinResult } from './roomApi';
import {
  clearSession,
  dropLegacySession,
  loadSession,
  saveName,
  saveSession,
  type Session,
} from './storage';

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
  /** ROOM_NOT_FOUND на join или room:info. */
  badLink: boolean;
  /** spec-14 S7: настройки комнаты по ссылке (room:info) до входа; null — ответа нет. */
  roomInfo: RoomSettings | null;
  /** spec-17: свободных мест по room:info; null — ответа нет (или старый сервер). */
  freeSeats?: number | null;
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

/** spec-17: поля настроек для room:create — `mode` только для 2×2, тогда без `handSize`. */
function createSettings(settings: RoomSettings): Omit<RoomCreatePayload, 'name'> {
  const { mode, handSize, ...rest } = settings;
  return mode === '2x2' ? { ...rest, mode } : { ...rest, handSize };
}

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
  roomInfo: null,
};

/**
 * RC11: начальное состояние по URL и localStorage. Есть токен для `?room=X` этого браузера —
 * возвращаемся на своё место (restoring → rejoin на hello); нет — экран входа. Без `?room` — главная.
 */
function initLobbyState(): LobbyState {
  dropLegacySession();
  const urlRoom = parseRoomIdFromSearch(window.location.search);
  const session = urlRoom !== null && urlRoom !== 'invalid' ? loadSession(urlRoom) : null;
  return { ...HOME_STATE, urlRoom, session };
}

export interface Lobby {
  state: LobbyState;
  /** spec-11, spec-14: настройки комнаты — цель матча, костей в руке, время на ход. */
  /** spec-15: `opponent = 'bot'` — второе место сразу занимает бот, экран ожидания не нужен. */
  create(name: string, settings: RoomSettings, opponent?: Opponent): Promise<void>;
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
  // Актуальное состояние для goHome (обработчик клика).
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const dropSession = useCallback((roomId: string) => {
    clearSession(roomId);
    sessionRef.current = null;
  }, []);

  useEffect(() => {
    const onState = (payload: RoomStatePayload) => {
      // RC12: техпоражение — партия окончена навсегда, комнаты на сервере уже нет;
      // переподключение не должно делать rejoin. Экран — по этому последнему room:state.
      if (payload.match?.forfeit != null) dropSession(payload.roomId);
      setState((s) => ({ ...s, room: payload, closed: null }));
    };

    const onClosed = (payload: RoomClosedPayload) => {
      // RC12/RC13: при `replaced` токеном пользуется другая вкладка этого браузера — запись
      // в localStorage остаётся, эта вкладка только забывает сессию и больше не делает rejoin.
      if (payload.reason === 'replaced') sessionRef.current = null;
      else dropSession(payload.roomId);
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
      dropSession(session.roomId);
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
        setState((s) => ({
          ...s,
          session,
          urlRoom: result.roomId,
          pending: null,
          roomInfo: null,
        }));
      } else if (kind === 'join' && result.error === 'ROOM_NOT_FOUND') {
        setState((s) => ({ ...s, pending: null, badLink: true }));
      } else {
        // spec-17 §4.3: в комнате 2×2 — свой текст «нет мест».
        const teamFull = result.error === 'ROOM_FULL' && stateRef.current.roomInfo?.mode === '2x2';
        const error = teamFull ? TEAM_ROOM_FULL_TEXT : ROOM_ERROR_TEXT[result.error];
        setState((s) => ({ ...s, pending: null, error }));
      }
    },
    [status],
  );

  const create = useCallback(
    (name: string, settings: RoomSettings, opponent: Opponent = 'human') =>
      submit('create', name, (n) =>
        // spec-15 §4.3: поле opponent — только для бота (запрос «с человеком» не меняется).
        // spec-17: mode — только для 2×2 (запрос 1×1 прежний), в 2×2 без handSize.
        createRoom(socket, {
          name: n,
          ...createSettings(settings),
          ...(opponent === 'bot' ? { opponent } : {}),
        }),
      ),
    [submit, socket],
  );

  const urlRoom = state.urlRoom;

  // spec-14 S7: на экране входа по ссылке — настройки комнаты до нажатия «Войти».
  // Повторяется при каждом переходе в connected (новый hello после обрыва).
  const onJoinScreen =
    urlRoom !== null &&
    urlRoom !== 'invalid' &&
    state.session === null &&
    state.room === null &&
    state.closed === null &&
    !state.badLink;
  const infoSeqRef = useRef(0);
  useEffect(() => {
    if (!onJoinScreen || status !== 'connected' || urlRoom === null || urlRoom === 'invalid') {
      return;
    }
    const seq = ++infoSeqRef.current;
    void roomInfo(socket, { roomId: urlRoom }).then((result) => {
      if (!mountedRef.current || seq !== infoSeqRef.current || result === 'timeout') return;
      if (result.ok) {
        setState((s) =>
          s.urlRoom === urlRoom
            ? { ...s, roomInfo: result.settings, freeSeats: result.freeSeats ?? null }
            : s,
        );
      } else if (result.error === 'ROOM_NOT_FOUND') {
        // Мёртвая ссылка распознаётся до ввода имени.
        setState((s) =>
          s.urlRoom === urlRoom && s.session === null ? { ...s, badLink: true, roomInfo: null } : s,
        );
      }
    });
    return () => {
      infoSeqRef.current += 1;
    };
  }, [onJoinScreen, status, socket, urlRoom]);
  const join = useCallback(
    async (name: string) => {
      if (urlRoom === null || urlRoom === 'invalid') return;
      await submit('join', name, (n) => joinRoom(socket, { roomId: urlRoom, name: n }));
    },
    [submit, socket, urlRoom],
  );

  const goHome = useCallback(() => {
    const current = stateRef.current;
    const roomId = current.room?.roomId ?? current.session?.roomId ?? sessionRef.current?.roomId;
    if (roomId !== undefined && current.closed !== 'replaced') dropSession(roomId);
    sessionRef.current = null;
    rejoinSeqRef.current += 1;
    pendingRef.current = null;
    window.history.replaceState(null, '', '/');
    setState(HOME_STATE);
  }, [dropSession]);

  return { state, create, join, goHome };
}
