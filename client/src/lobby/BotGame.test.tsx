import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../App';
import { createFakeSocket, hello } from '../test/fakeSocket';
import { makeBotRoom, makeMatch, makeRoom, makeView } from '../test/fixtures';

const byId = (id: string) => screen.getByTestId(id);
const queryById = (id: string) => screen.queryByTestId(id);

function setup() {
  const { fake, socket } = createFakeSocket();
  render(<App socket={socket} />);
  return { fake, connect: () => fake.serverEmit('server:hello', hello()) };
}

function typeName(value: string) {
  fireEvent.change(byId('name-input'), { target: { value } });
}

async function flush() {
  await act(async () => {});
}

beforeEach(() => {
  window.history.replaceState(null, '', '/');
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  localStorage.clear();
});

describe('play against the bot (spec-15)', () => {
  it('UC1: bot-button follows the name like create-button', () => {
    const { connect } = setup();
    connect();
    expect(byId('bot-button')).toHaveTextContent('Играть с ботом');
    typeName('');
    expect(byId('bot-button')).toBeDisabled();
    typeName('   ');
    expect(byId('bot-button')).toBeDisabled();
    typeName('Аня');
    expect(byId('bot-button')).toBeEnabled();
  });

  it('UC1: disabled while not connected', () => {
    setup();
    typeName('Аня');
    expect(byId('bot-button')).toBeDisabled();
  });

  it('UC2: bot-button sends room:create with the settings and opponent bot', () => {
    const { fake, connect } = setup();
    connect();
    fake.emitWithAck.mockReturnValue(new Promise(() => {}));
    fireEvent.click(byId('match-target-choice-51'));
    fireEvent.click(byId('hand-size-choice-5'));
    fireEvent.click(byId('turn-seconds-30'));
    typeName('Аня');
    fireEvent.click(byId('bot-button'));
    expect(fake.emitWithAck).toHaveBeenCalledExactlyOnceWith('room:create', {
      name: 'Аня',
      matchTarget: 51,
      handSize: 5,
      turnSeconds: 30,
      opponent: 'bot',
      variant: 'classic',
    });
    expect(localStorage.getItem('domino:matchTarget')).toBe('51');
  });

  it('UC2: Enter in the name field still means create-button (no opponent)', () => {
    const { fake, connect } = setup();
    connect();
    fake.emitWithAck.mockReturnValue(new Promise(() => {}));
    typeName('Аня');
    fireEvent.submit(byId('name-input'));
    expect(fake.emitWithAck).toHaveBeenCalledExactlyOnceWith('room:create', {
      name: 'Аня',
      matchTarget: 101,
      handSize: 7,
      turnSeconds: 60,
      variant: 'classic',
    });
  });

  it('UC3: the first room:state is playing → game screen, no waiting screen', async () => {
    const { fake, connect } = setup();
    connect();
    fake.emitWithAck.mockResolvedValue({
      ok: true,
      roomId: 'ABC234',
      seat: 0,
      playerToken: 'tok',
    });
    typeName('Аня');
    fireEvent.click(byId('bot-button'));
    await flush();
    fake.serverEmit('room:state', makeBotRoom());
    expect(queryById('waiting-screen')).toBeNull();
    expect(byId('game-screen')).toBeInTheDocument();
    expect(window.location.search).toBe('?room=ABC234');
  });

  it('UC4: bot opponent → 🤖 badge and no reactions; human opponent → reactions, no badge', () => {
    const { fake, connect } = setup();
    connect();
    fake.serverEmit('room:state', makeBotRoom());
    expect(byId('opponent-bot')).toHaveAttribute('aria-label', 'бот');
    expect(byId('match-score')).toHaveTextContent('🤖 Бот');
    expect(queryById('reaction-toggle')).toBeNull();
    expect(byId('turn-indicator')).toHaveTextContent('Ваш ход');

    fake.serverEmit('room:state', makeRoom());
    expect(queryById('opponent-bot')).toBeNull();
    expect(byId('reaction-toggle')).toBeInTheDocument();
  });

  it('UC5: round summary with ready [false, true] → «Соперник готов», button enabled', () => {
    const { fake, connect } = setup();
    connect();
    const finished = makeView({
      status: 'finished',
      result: { reason: 'domino', winner: 1, points: 12, handPoints: [12, 0] },
      opponentHand: [],
      legalMoves: [],
    });
    fake.serverEmit(
      'room:state',
      makeBotRoom(finished, { match: makeMatch({ ready: [false, true] }) }),
    );
    expect(byId('round-summary')).toBeInTheDocument();
    expect(byId('ready-status')).toHaveTextContent(/^Соперник готов$/);
    expect(byId('continue-button')).toBeEnabled();
    expect(queryById('reaction-toggle')).toBeNull();
  });
});
