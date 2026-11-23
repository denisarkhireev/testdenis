import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { RoomStatePayload } from '@domino/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../App';
import { MatchScore } from '../game/MatchScore';
import { createFakeSocket, hello } from '../test/fakeSocket';
import { makeMatch } from '../test/fixtures';

const byId = (id: string) => screen.getByTestId(id);
const queryById = (id: string) => screen.queryByTestId(id);

const players: RoomStatePayload['players'] = [
  { seat: 0, name: 'Аня', connected: true, reconnectRemainingMs: null, bot: false },
  { seat: 1, name: 'Боб', connected: true, reconnectRemainingMs: null, bot: false },
];

function setup(helloPatch: object = {}) {
  const { fake, socket } = createFakeSocket();
  render(<App socket={socket} />);
  return {
    fake,
    connect: () => fake.serverEmit('server:hello', { ...hello(), ...helloPatch }),
  };
}

async function flush() {
  await act(async () => {});
}

function typeName(value: string) {
  fireEvent.change(byId('name-input'), { target: { value } });
}

beforeEach(() => {
  window.history.replaceState(null, '', '/');
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  localStorage.clear();
});

describe('HomeScreen: room settings (spec-14)', () => {
  it('SC-1: 101 / 7 by default; the choice of 51 and 5 is sent and remembered', () => {
    const { fake, connect } = setup();
    connect();
    fake.emitWithAck.mockReturnValue(new Promise(() => {}));
    expect(byId('match-target-choice')).toHaveAttribute('role', 'radiogroup');
    expect(byId('hand-size-choice')).toHaveAttribute('role', 'radiogroup');
    expect(byId('match-target-choice-101')).toBeChecked();
    expect(byId('hand-size-choice-7')).toBeChecked();
    expect(byId('turn-seconds-60')).toBeChecked();
    for (const id of ['match-target-choice-51', 'match-target-choice-151', 'hand-size-choice-5']) {
      expect(byId(id)).not.toBeChecked();
    }

    fireEvent.click(byId('match-target-choice-51'));
    fireEvent.click(byId('hand-size-choice-5'));
    typeName('Аня');
    fireEvent.click(byId('create-button'));
    expect(fake.emitWithAck).toHaveBeenCalledWith('room:create', {
      name: 'Аня',
      matchTarget: 51,
      handSize: 5,
      turnSeconds: 60,
      variant: 'classic',
    });
    expect(localStorage.getItem('domino:matchTarget')).toBe('51');
    expect(localStorage.getItem('domino:handSize')).toBe('5');
  });

  it('SC-1: the saved choice is restored after reload', () => {
    localStorage.setItem('domino:matchTarget', '151');
    localStorage.setItem('domino:handSize', '6');
    const { connect } = setup();
    connect();
    expect(byId('match-target-choice-151')).toBeChecked();
    expect(byId('hand-size-choice-6')).toBeChecked();
  });

  it('SC-2: the test target from hello is offered and selected by default, labelled «(тест)»', () => {
    const { connect } = setup({ matchTargetOptions: [30, 51, 101, 151], defaultMatchTarget: 30 });
    connect();
    expect(byId('match-target-choice-30')).toBeChecked();
    expect(screen.getByText('30 (тест)')).toBeInTheDocument();
  });

  it('SC-2: a saved value wins over the default; a value not in the list falls back', () => {
    localStorage.setItem('domino:matchTarget', '151');
    localStorage.setItem('domino:handSize', '9');
    const { connect } = setup({ matchTargetOptions: [30, 51, 101, 151], defaultMatchTarget: 30 });
    connect();
    expect(byId('match-target-choice-151')).toBeChecked();
    expect(byId('hand-size-choice-7')).toBeChecked();
    expect(queryById('hand-size-choice-9')).toBeNull();
  });
});

describe('JoinScreen: room settings before joining (spec-14 S7)', () => {
  it('SC-3: room:info ok → join-settings shows 51 and 5 before «Войти»', async () => {
    window.history.replaceState(null, '', '/?room=ABC234');
    const { fake, connect } = setup();
    fake.infoAck.mockResolvedValueOnce({
      ok: true,
      roomId: 'ABC234',
      settings: { matchTarget: 51, handSize: 5, turnSeconds: 0 },
    });
    expect(queryById('join-settings')).toBeNull(); // до hello запроса нет
    connect();
    await flush();
    expect(fake.infoAck).toHaveBeenCalledWith({ roomId: 'ABC234' });
    expect(byId('join-settings-target')).toHaveTextContent('51');
    expect(byId('join-settings-hand')).toHaveTextContent('5');
    expect(byId('join-settings-turn')).toHaveTextContent('без таймера');
    expect(byId('join-settings')).toHaveTextContent('Матч до 51 · 5 костей в руке · без таймера');
    expect(byId('join-button')).toBeInTheDocument();
  });

  it('SC-3: room:info ROOM_NOT_FOUND → bad-link screen right away', async () => {
    window.history.replaceState(null, '', '/?room=ZZZZZZ');
    const { fake, connect } = setup();
    fake.infoAck.mockResolvedValueOnce({ ok: false, error: 'ROOM_NOT_FOUND' });
    connect();
    await flush();
    expect(byId('bad-link-screen')).toBeInTheDocument();
    expect(queryById('name-input')).toBeNull();
  });

  it('SC-3: room:info timeout → join screen without settings, joining still works', async () => {
    window.history.replaceState(null, '', '/?room=ABC234');
    const { fake, connect } = setup();
    fake.infoAck.mockRejectedValueOnce(new Error('operation has timed out'));
    connect();
    await flush();
    expect(byId('join-screen')).toBeInTheDocument();
    expect(queryById('join-settings')).toBeNull();

    typeName('Боб');
    fake.emitWithAck.mockResolvedValueOnce({
      ok: true,
      roomId: 'ABC234',
      seat: 1,
      playerToken: 'tb',
    });
    fireEvent.click(byId('join-button'));
    await flush();
    expect(fake.emitWithAck).toHaveBeenCalledWith('room:join', { roomId: 'ABC234', name: 'Боб' });
  });
});

describe('room settings in the waiting room and on the scoreboard (spec-14 S8)', () => {
  it('SC-4: WaitingScreen shows waiting-settings from room:state', async () => {
    const { fake, connect } = setup();
    connect();
    typeName('Аня');
    fake.emitWithAck.mockResolvedValueOnce({
      ok: true,
      roomId: 'ABC234',
      seat: 0,
      playerToken: 't',
    });
    fireEvent.click(byId('create-button'));
    await flush();
    fake.serverEmit('room:state', {
      roomId: 'ABC234',
      you: 0,
      phase: 'waiting',
      players: [players[0]!],
      game: null,
      match: null,
      turnSeconds: 30,
      matchTarget: 151,
      handSize: 6,
      variant: 'classic',
      mode: '1x1',
      turnTimer: null,
    } satisfies RoomStatePayload);
    expect(byId('waiting-screen')).toBeInTheDocument();
    expect(byId('waiting-settings')).toHaveTextContent('Матч до 151 · 6 костей в руке · ход 30 с');
  });

  it('SC-5: MatchScore — «по 5 костей» for hand 5, nothing for hand 7; «до N» from match.target', () => {
    const { rerender } = render(
      <MatchScore match={makeMatch({ target: 51 })} players={players} handSize={5} />,
    );
    expect(byId('match-target')).toHaveTextContent('51');
    expect(byId('hand-size-label')).toHaveTextContent('по 5 костей');
    rerender(<MatchScore match={makeMatch({ target: 51 })} players={players} handSize={7} />);
    expect(queryById('hand-size-label')).toBeNull();
    rerender(<MatchScore match={makeMatch()} players={players} />);
    expect(queryById('hand-size-label')).toBeNull();
    expect(byId('match-target')).toHaveTextContent('101');
  });
});
