import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../App';
import { createFakeSocket, hello } from '../test/fakeSocket';

const KEY = 'domino:turnSeconds';
const byId = (id: string) => screen.getByTestId(id);

function setup(options?: number[]) {
  const { fake, socket } = createFakeSocket();
  render(<App socket={socket} />);
  fake.serverEmit('server:hello', options ? { ...hello(), turnSecondsOptions: options } : hello());
  fake.emitWithAck.mockReturnValue(new Promise(() => {}));
  return fake;
}

function create() {
  fireEvent.change(byId('name-input'), { target: { value: 'Аня' } });
  fireEvent.click(byId('create-button'));
}

beforeEach(() => {
  window.history.replaceState(null, '', '/');
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  localStorage.clear();
});

describe('HomeScreen: turn time choice (spec-11)', () => {
  it('TC1: options come from server:hello, 60 by default; the choice is sent and remembered', () => {
    const fake = setup();
    expect(byId('turn-seconds')).toHaveAttribute('role', 'radiogroup');
    expect(byId('turn-seconds-0')).toBeInTheDocument();
    expect(byId('turn-seconds-30')).toBeInTheDocument();
    expect(byId('turn-seconds-60')).toBeChecked();
    expect(screen.getByText('Выкл')).toBeInTheDocument();

    fireEvent.click(byId('turn-seconds-30'));
    expect(byId('turn-seconds-30')).toBeChecked();
    create();
    expect(fake.emitWithAck).toHaveBeenCalledWith('room:create', {
      name: 'Аня',
      turnSeconds: 30,
      matchTarget: 101,
      handSize: 7,
    });
    expect(localStorage.getItem(KEY)).toBe('30');
  });

  it('TC1: the test value from hello is offered and the saved choice is restored', () => {
    localStorage.setItem(KEY, '3');
    const fake = setup([0, 3, 30, 60]);
    expect(byId('turn-seconds-3')).toBeChecked();
    expect(screen.getByText('3 с (тест)')).toBeInTheDocument();
    create();
    expect(fake.emitWithAck).toHaveBeenCalledWith('room:create', {
      name: 'Аня',
      turnSeconds: 3,
      matchTarget: 101,
      handSize: 7,
    });
  });

  it('TC2: a saved value not in the list → 60', () => {
    localStorage.setItem(KEY, '3');
    setup();
    expect(byId('turn-seconds-60')).toBeChecked();
    expect(screen.queryByTestId('turn-seconds-3')).toBeNull();
  });

  it('TC2: throwing localStorage → 60, no errors', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('denied');
    });
    const fake = setup();
    expect(byId('turn-seconds-60')).toBeChecked();
    create();
    expect(fake.emitWithAck).toHaveBeenCalledWith('room:create', {
      name: 'Аня',
      turnSeconds: 60,
      matchTarget: 101,
      handSize: 7,
    });
  });
});
