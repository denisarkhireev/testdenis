import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { RoomPlayer, RoomStatePayload } from '@domino/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../App';
import { createFakeSocket, deferred, hello, type FakeSocket } from '../test/fakeSocket';
import { makeMatch } from '../test/fixtures';

const SESSIONS_KEY = 'domino:sessions';

const byId = (id: string) => screen.getByTestId(id);
const queryById = (id: string) => screen.queryByTestId(id);

function roomState(patch: Partial<RoomStatePayload> = {}): RoomStatePayload {
  return {
    roomId: 'ABC234',
    you: 0,
    phase: 'waiting',
    players: [{ seat: 0, name: 'Аня', connected: true, reconnectRemainingMs: null, bot: false }],
    game: null,
    match: null,
    turnSeconds: 60,
    matchTarget: 101,
    handSize: 7,
    turnTimer: null,
    ...patch,
  };
}

function players(opponentConnected = true, remainingMs: number | null = null): RoomPlayer[] {
  return [
    { seat: 0, name: 'Аня', connected: true, reconnectRemainingMs: null, bot: false },
    {
      seat: 1,
      name: 'Боб',
      connected: opponentConnected,
      reconnectRemainingMs: opponentConnected ? null : remainingMs,
      bot: false,
    },
  ];
}

function setUrl(url: string) {
  window.history.replaceState(null, '', url);
}

/** Запись `localStorage['domino:sessions'][roomId]` в виде `{ roomId, playerToken }` или null. */
function storedSession(roomId = 'ABC234') {
  const raw = localStorage.getItem(SESSIONS_KEY);
  if (raw === null) return null;
  const entry = (JSON.parse(raw) as Record<string, { playerToken: string } | undefined>)[roomId];
  return entry ? { roomId, playerToken: entry.playerToken } : null;
}

function storeSession(roomId: string, playerToken: string) {
  const raw = localStorage.getItem(SESSIONS_KEY);
  const sessions = raw === null ? {} : (JSON.parse(raw) as object);
  localStorage.setItem(
    SESSIONS_KEY,
    JSON.stringify({ ...sessions, [roomId]: { playerToken, savedAt: Date.now() } }),
  );
}

function setup() {
  const { fake, socket } = createFakeSocket();
  const utils = render(<App socket={socket} />);
  return { fake, ...utils };
}

function typeName(value: string) {
  fireEvent.change(byId('name-input'), { target: { value } });
}

/** Отрабатывает микрозадачи после resolve/reject ack. */
async function flush() {
  await act(async () => {});
}

function connect(fake: FakeSocket) {
  fake.serverEmit('server:hello', hello());
}

let clipboardDescriptor: PropertyDescriptor | undefined;

beforeEach(() => {
  setUrl('/');
  clipboardDescriptor = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  sessionStorage.clear();
  localStorage.clear();
  if (clipboardDescriptor) Object.defineProperty(navigator, 'clipboard', clipboardDescriptor);
  else delete (navigator as { clipboard?: unknown }).clipboard;
});

function mockClipboard(value: unknown) {
  Object.defineProperty(navigator, 'clipboard', { value, configurable: true });
}

/** home → «Создать игру» → ack ok → room:state waiting. */
async function createGame(fake: FakeSocket) {
  connect(fake);
  typeName('Аня');
  fake.emitWithAck.mockResolvedValueOnce({
    ok: true,
    roomId: 'ABC234',
    seat: 0,
    playerToken: 't',
  });
  fireEvent.click(byId('create-button'));
  await flush();
  fake.serverEmit('room:state', roomState());
}

describe('Lobby', () => {
  it('L-1: without ?room and while connecting shows home with a disabled button', () => {
    setup();
    expect(byId('home-screen')).toBeInTheDocument();
    expect(byId('create-button')).toBeDisabled();
  });

  it('L-2: button follows the name length once connected', () => {
    const { fake } = setup();
    connect(fake);
    typeName('  ');
    expect(byId('create-button')).toBeDisabled();
    typeName('Аня');
    expect(byId('create-button')).toBeEnabled();
    typeName('a'.repeat(21));
    expect(byId('create-button')).toBeDisabled();
  });

  it('L-3: create sends one request, stores the session, rewrites the URL and shows the invite', async () => {
    const { fake } = setup();
    connect(fake);
    typeName('  Аня ');
    const ack = deferred<unknown>();
    fake.emitWithAck.mockReturnValueOnce(ack.promise);

    fireEvent.click(byId('create-button'));
    fireEvent.click(byId('create-button'));
    expect(byId('create-button')).toBeDisabled();
    expect(fake.emitWithAck).toHaveBeenCalledTimes(1);
    expect(fake.emitWithAck).toHaveBeenCalledWith('room:create', {
      name: 'Аня',
      turnSeconds: 60,
      matchTarget: 101,
      handSize: 7,
    });

    await act(async () => ack.resolve({ ok: true, roomId: 'ABC234', seat: 0, playerToken: 't' }));
    fake.serverEmit('room:state', roomState());

    expect(storedSession()).toEqual({ roomId: 'ABC234', playerToken: 't' });
    expect(window.location.search).toBe('?room=ABC234');
    expect(byId('waiting-screen')).toBeInTheDocument();
    expect(byId('invite-link')).toHaveValue(`${window.location.origin}/?room=ABC234`);
    expect(byId('invite-link')).toHaveAttribute('readonly');
    expect(localStorage.getItem('domino:name')).toBe('Аня');
    expect(fake.emitWithAck).toHaveBeenCalledTimes(1);
  });

  it('L-3: room:state before the ack works too', async () => {
    const { fake } = setup();
    connect(fake);
    typeName('Аня');
    const ack = deferred<unknown>();
    fake.emitWithAck.mockReturnValueOnce(ack.promise);
    fireEvent.click(byId('create-button'));
    fake.serverEmit('room:state', roomState());
    await act(async () => ack.resolve({ ok: true, roomId: 'ABC234', seat: 0, playerToken: 't' }));
    expect(byId('waiting-screen')).toBeInTheDocument();
    expect(storedSession()).toEqual({ roomId: 'ABC234', playerToken: 't' });
  });

  it('L-4: copy puts the link into the clipboard and the status disappears after 2 s', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    mockClipboard({ writeText });
    const { fake } = setup();
    await createGame(fake);

    vi.useFakeTimers();
    fireEvent.click(byId('copy-button'));
    await flush();
    expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/?room=ABC234`);
    expect(byId('copy-status')).toHaveTextContent('Ссылка скопирована');

    act(() => vi.advanceTimersByTime(2000));
    expect(byId('copy-status')).toBeEmptyDOMElement();
  });

  it.each([
    ['writeText rejects', () => ({ writeText: vi.fn().mockRejectedValue(new Error('denied')) })],
    ['clipboard is undefined', () => undefined],
  ])('L-5: %s → manual copy hint, input selected', async (_name, clipboard) => {
    mockClipboard(clipboard());
    const { fake } = setup();
    await createGame(fake);
    const input = byId('invite-link') as HTMLInputElement;
    const select = vi.spyOn(input, 'select');

    fireEvent.click(byId('copy-button'));
    await flush();
    expect(byId('copy-status')).toHaveTextContent('Скопируйте ссылку вручную');
    expect(select).toHaveBeenCalled();
  });

  it('L-6: join by link, then game screen with both names', async () => {
    setUrl('/?room=abc234');
    const { fake } = setup();
    expect(byId('join-screen')).toBeInTheDocument();
    expect(byId('join-room-code')).toHaveTextContent('ABC234');

    connect(fake);
    typeName('Боб');
    fake.emitWithAck.mockResolvedValueOnce({
      ok: true,
      roomId: 'ABC234',
      seat: 1,
      playerToken: 'tb',
    });
    fireEvent.submit(byId('name-input'));
    await flush();
    expect(fake.emitWithAck).toHaveBeenCalledWith('room:join', { roomId: 'ABC234', name: 'Боб' });
    expect(storedSession()).toEqual({ roomId: 'ABC234', playerToken: 'tb' });

    fake.serverEmit('room:state', roomState({ you: 1, phase: 'playing', players: players() }));
    expect(byId('game-screen')).toBeInTheDocument();
    expect(byId('player-name-0')).toHaveTextContent(/^Аня$/);
    expect(byId('player-name-1')).toHaveTextContent(/^Боб \(вы\)$/);
  });

  it.each([
    ['ROOM_FULL', 'В этой игре уже два игрока'],
    ['INVALID_NAME', 'Имя — от 1 до 20 символов'],
  ])('L-7: join → %s shows form-error', async (error, text) => {
    setUrl('/?room=ABC234');
    const { fake } = setup();
    connect(fake);
    typeName('Вика');
    fake.emitWithAck.mockResolvedValueOnce({ ok: false, error });
    fireEvent.click(byId('join-button'));
    await flush();
    expect(byId('form-error')).toHaveTextContent(text);
    expect(byId('join-button')).toBeEnabled();
    expect(storedSession()).toBeNull();
  });

  it('L-7: join → ROOM_NOT_FOUND shows bad-link screen', async () => {
    setUrl('/?room=ZZZZZZ');
    const { fake } = setup();
    connect(fake);
    typeName('Вика');
    fake.emitWithAck.mockResolvedValueOnce({ ok: false, error: 'ROOM_NOT_FOUND' });
    fireEvent.click(byId('join-button'));
    await flush();
    expect(byId('bad-link-screen')).toBeInTheDocument();
    expect(storedSession()).toBeNull();
  });

  it('L-8: malformed code → bad-link; home button → home with a clean URL', () => {
    setUrl('/?room=BAD');
    setup();
    expect(byId('bad-link-screen')).toBeInTheDocument();
    fireEvent.click(byId('home-button'));
    expect(byId('home-screen')).toBeInTheDocument();
    expect(window.location.search).toBe('');
  });

  it('L-9/C-X3: stored token for ?room → restoring, rejoin on hello, no join screen', async () => {
    storeSession('ABC234', 't');
    setUrl('/?room=ABC234');
    const { fake } = setup();
    expect(byId('restoring-screen')).toBeInTheDocument();
    expect(queryById('join-screen')).toBeNull();

    fake.emitWithAck.mockResolvedValueOnce({ ok: true, roomId: 'ABC234', seat: 0 });
    connect(fake);
    expect(fake.emitWithAck).toHaveBeenCalledWith('room:rejoin', {
      roomId: 'ABC234',
      playerToken: 't',
    });
    expect(byId('restoring-screen')).toBeInTheDocument();
    await flush();
    fake.serverEmit('room:state', roomState());
    expect(byId('waiting-screen')).toBeInTheDocument();
    expect(storedSession()).toEqual({ roomId: 'ABC234', playerToken: 't' });
  });

  it('L-10/C-X6: rejoin → INVALID_TOKEN drops the session and shows join with an error', async () => {
    storeSession('ABC234', 't');
    setUrl('/?room=ABC234');
    const { fake } = setup();
    fake.emitWithAck.mockResolvedValueOnce({ ok: false, error: 'INVALID_TOKEN' });
    connect(fake);
    await flush();
    expect(storedSession()).toBeNull();
    expect(byId('join-screen')).toBeInTheDocument();
    expect(byId('form-error')).toHaveTextContent('Не удалось вернуться в игру');
  });

  it('L-11: reconnect during the game re-sends rejoin without the restoring screen', async () => {
    setUrl('/?room=ABC234');
    const { fake } = setup();
    connect(fake);
    typeName('Боб');
    fake.emitWithAck.mockResolvedValueOnce({
      ok: true,
      roomId: 'ABC234',
      seat: 1,
      playerToken: 'tb',
    });
    fireEvent.click(byId('join-button'));
    await flush();
    fake.serverEmit('room:state', roomState({ you: 1, phase: 'playing', players: players() }));
    expect(byId('game-screen')).toBeInTheDocument();

    const ack = deferred<unknown>();
    fake.emitWithAck.mockReturnValueOnce(ack.promise);
    fake.serverEmit('disconnect', 'transport close');
    connect(fake);
    expect(fake.emitWithAck).toHaveBeenLastCalledWith('room:rejoin', {
      roomId: 'ABC234',
      playerToken: 'tb',
    });
    expect(byId('game-screen')).toBeInTheDocument();
    expect(queryById('restoring-screen')).toBeNull();
    await act(async () => ack.resolve({ ok: true, roomId: 'ABC234', seat: 1 }));
    expect(byId('game-screen')).toBeInTheDocument();
  });

  it('C-X4: a token only for another room → join screen, no rejoin, that token is kept', () => {
    storeSession('ZZZ222', 't');
    setUrl('/?room=ABC234');
    const { fake } = setup();
    connect(fake);
    expect(fake.emitWithAck).not.toHaveBeenCalled();
    expect(byId('join-screen')).toBeInTheDocument();
    expect(storedSession('ZZZ222')).toEqual({ roomId: 'ZZZ222', playerToken: 't' });
  });

  it('RC11: without ?room the home screen is shown and stored tokens are untouched', () => {
    storeSession('ABC234', 't');
    const { fake } = setup();
    connect(fake);
    expect(byId('home-screen')).toBeInTheDocument();
    expect(fake.emitWithAck).not.toHaveBeenCalled();
    expect(storedSession()).toEqual({ roomId: 'ABC234', playerToken: 't' });
  });

  it('C-X2: the legacy sessionStorage session is removed and never read', () => {
    sessionStorage.setItem(
      'domino:session',
      JSON.stringify({ roomId: 'ABC234', playerToken: 't' }),
    );
    setUrl('/?room=ABC234');
    setup();
    expect(sessionStorage.getItem('domino:session')).toBeNull();
    expect(byId('join-screen')).toBeInTheDocument();
  });

  it('L-13: opponent-offline follows players[].connected', async () => {
    const { fake } = setup();
    await createGame(fake);
    fake.serverEmit('room:state', roomState({ phase: 'playing', players: players(false) }));
    expect(byId('opponent-offline')).toBeInTheDocument();
    fake.serverEmit('room:state', roomState({ phase: 'playing', players: players(true) }));
    expect(queryById('opponent-offline')).toBeNull();
  });

  it('L-14/C-X6: room:closed player_left → closed screen, session dropped, home', async () => {
    const { fake } = setup();
    await createGame(fake);
    fake.serverEmit('room:state', roomState({ phase: 'playing', players: players() }));
    fake.serverEmit('room:closed', { roomId: 'ABC234', reason: 'player_left' });
    expect(byId('closed-screen')).toHaveTextContent('Соперник покинул игру');
    expect(storedSession()).toBeNull();
    fireEvent.click(byId('home-button'));
    expect(byId('home-screen')).toBeInTheDocument();
    expect(window.location.search).toBe('');
  });

  it('L-14/C-X5: room:closed replaced → closed screen, the token stays for the other tab', async () => {
    const { fake } = setup();
    await createGame(fake);
    fake.serverEmit('room:state', roomState({ phase: 'playing', players: players() }));
    fake.serverEmit('room:closed', { roomId: 'ABC234', reason: 'replaced' });
    expect(byId('closed-screen')).toHaveTextContent('Игра открыта в другой вкладке');
    expect(storedSession()).toEqual({ roomId: 'ABC234', playerToken: 't' });

    // RC13: переподключение этой вкладки не делает rejoin (нет пинг-понга)
    fake.emitWithAck.mockClear();
    connect(fake);
    expect(fake.emitWithAck).not.toHaveBeenCalled();

    fireEvent.click(byId('home-button'));
    expect(byId('home-screen')).toBeInTheDocument();
    expect(storedSession()).toEqual({ roomId: 'ABC234', playerToken: 't' });
  });

  it('goHome from the game drops the token of that room', async () => {
    const { fake } = setup();
    await createGame(fake);
    storeSession('ZZZ222', 'other');
    fake.serverEmit(
      'room:state',
      roomState({
        phase: 'playing',
        players: players(),
        match: makeMatch({ forfeit: 1, winner: 0 }),
      }),
    );
    fireEvent.click(byId('home-button'));
    expect(storedSession()).toBeNull();
    expect(storedSession('ZZZ222')).toEqual({ roomId: 'ZZZ222', playerToken: 'other' });
  });

  it('C-X7: room:state with a forfeit → victory summary, token dropped, no rejoin, home', async () => {
    const { fake } = setup();
    await createGame(fake);
    fake.serverEmit(
      'room:state',
      roomState({
        phase: 'finished',
        players: players(false, 0),
        match: makeMatch({ scores: [12, 30], winner: 0, forfeit: 1 }),
      }),
    );
    expect(byId('forfeit-summary')).toBeInTheDocument();
    expect(byId('forfeit-result')).toHaveTextContent('Победа! Соперник не вернулся в игру');
    expect(byId('match-score-0')).toHaveTextContent('12');
    expect(byId('match-score-1')).toHaveTextContent('30');
    expect(queryById('opponent-offline')).toBeNull();
    expect(queryById('continue-button')).toBeNull();
    expect(storedSession()).toBeNull();

    fake.emitWithAck.mockClear();
    connect(fake);
    expect(fake.emitWithAck).not.toHaveBeenCalled();

    fireEvent.click(byId('home-button'));
    expect(byId('home-screen')).toBeInTheDocument();
    expect(window.location.search).toBe('');
  });

  it('forfeit of your own seat shows the defeat text', async () => {
    const { fake } = setup();
    await createGame(fake);
    fake.serverEmit(
      'room:state',
      roomState({
        phase: 'finished',
        players: players(),
        match: makeMatch({ winner: 1, forfeit: 0 }),
      }),
    );
    expect(byId('forfeit-result')).toHaveTextContent('Поражение: время на возвращение истекло');
  });

  it('C-X8: opponent countdown ticks down and disappears when the opponent is back', async () => {
    const { fake } = setup();
    await createGame(fake);
    vi.useFakeTimers();
    fake.serverEmit('room:state', roomState({ phase: 'playing', players: players(false, 65_000) }));
    expect(byId('opponent-offline')).toHaveTextContent('Соперник отключился, ждём… 01:05');
    expect(byId('opponent-countdown')).toHaveTextContent('01:05');
    act(() => vi.advanceTimersByTime(2000));
    expect(byId('opponent-countdown')).toHaveTextContent('01:03');

    // новый room:state пересчитывает дедлайн от присланного остатка
    fake.serverEmit('room:state', roomState({ phase: 'playing', players: players(false, 30_000) }));
    expect(byId('opponent-countdown')).toHaveTextContent('00:30');

    fake.serverEmit('room:state', roomState({ phase: 'playing', players: players(true) }));
    expect(queryById('opponent-offline')).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('L-15: ack timeout on create → form-error and the button is enabled again', async () => {
    const { fake } = setup();
    connect(fake);
    typeName('Аня');
    fake.emitWithAck.mockRejectedValueOnce(new Error('operation has timed out'));
    fireEvent.click(byId('create-button'));
    await flush();
    expect(byId('form-error')).toHaveTextContent('Сервер не отвечает, попробуйте ещё раз');
    expect(byId('create-button')).toBeEnabled();
    expect(storedSession()).toBeNull();
  });

  it('L-16: unmount removes every listener and timer', async () => {
    mockClipboard({ writeText: vi.fn().mockResolvedValue(undefined) });
    const { fake, unmount } = setup();
    await createGame(fake);
    vi.useFakeTimers();
    fireEvent.click(byId('copy-button'));
    await flush();
    expect(vi.getTimerCount()).toBe(1);

    unmount();
    for (const event of ['server:hello', 'disconnect', 'room:state', 'room:closed']) {
      expect(fake.listenerCount(event)).toBe(0);
    }
    expect(fake.eventNames()).toEqual([]);
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('Lobby invite link base (spec-8)', () => {
  async function createRoomAfterHello(fake: FakeSocket) {
    typeName('Аня');
    fake.emitWithAck.mockResolvedValueOnce({
      ok: true,
      roomId: 'ABC234',
      seat: 0,
      playerToken: 't',
    });
    fireEvent.click(byId('create-button'));
    await flush();
    fake.serverEmit('room:state', roomState());
  }

  it('C9: invite link is built from publicUrl sent in server:hello', async () => {
    const { fake } = setup();
    fake.serverEmit('server:hello', { ...hello(), publicUrl: 'https://a.fly.dev' });
    await createRoomAfterHello(fake);
    expect(byId('invite-link')).toHaveValue('https://a.fly.dev/?room=ABC234');
  });

  it('C10: without publicUrl the invite link uses window.location.origin', async () => {
    const { fake } = setup();
    fake.serverEmit('server:hello', hello());
    await createRoomAfterHello(fake);
    expect(window.location.origin).toBe('http://localhost:3000');
    expect(byId('invite-link')).toHaveValue('http://localhost:3000/?room=ABC234');
  });
});
