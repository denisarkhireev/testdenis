import { EventEmitter } from 'node:events';
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PROTOCOL_VERSION } from '@domino/shared';
import { App } from './App';
import type { ClientSocket } from './socket';

function createFakeSocket() {
  const emitter = new EventEmitter();
  const fake = {
    on: vi.fn((event: string, fn: (...args: unknown[]) => void) => {
      emitter.on(event, fn);
      return fake;
    }),
    off: vi.fn((event: string, fn: (...args: unknown[]) => void) => {
      emitter.off(event, fn);
      return fake;
    }),
    emit: (event: string, ...args: unknown[]) => {
      act(() => {
        emitter.emit(event, ...args);
      });
    },
    listenerCount: (event: string) => emitter.listenerCount(event),
  };
  return { fake, socket: fake as unknown as ClientSocket };
}

const hello = (protocolVersion: number) => ({
  protocolVersion,
  serverTime: new Date().toISOString(),
});

const status = () => screen.getByTestId('connection-status');

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('App connection status', () => {
  it('U2: shows "connecting…" before any events', () => {
    const { socket } = createFakeSocket();
    render(<App socket={socket} />);
    expect(status()).toHaveTextContent(/^connecting…$/);
  });

  it('U3: shows "connected" after server:hello with matching protocol version', () => {
    const { fake, socket } = createFakeSocket();
    render(<App socket={socket} />);
    fake.emit('server:hello', hello(PROTOCOL_VERSION));
    expect(status()).toHaveTextContent(/^connected$/);
  });

  it('U4: shows "disconnected" and logs an error on protocol version mismatch', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { fake, socket } = createFakeSocket();
    render(<App socket={socket} />);
    fake.emit('server:hello', hello(PROTOCOL_VERSION + 1));
    expect(status()).toHaveTextContent(/^disconnected$/);
    expect(errorSpy).toHaveBeenCalledWith('Protocol version mismatch');
  });

  it('U5: goes connected → disconnected → connected on reconnect', () => {
    const { fake, socket } = createFakeSocket();
    render(<App socket={socket} />);
    fake.emit('server:hello', hello(PROTOCOL_VERSION));
    expect(status()).toHaveTextContent(/^connected$/);
    fake.emit('disconnect', 'transport close');
    expect(status()).toHaveTextContent(/^disconnected$/);
    fake.emit('server:hello', hello(PROTOCOL_VERSION));
    expect(status()).toHaveTextContent(/^connected$/);
  });

  it('U6: removes all handlers on unmount', () => {
    const { fake, socket } = createFakeSocket();
    const { unmount } = render(<App socket={socket} />);
    unmount();
    expect(fake.off).toHaveBeenCalledWith('server:hello', expect.any(Function));
    expect(fake.off).toHaveBeenCalledWith('disconnect', expect.any(Function));
    expect(fake.listenerCount('server:hello')).toBe(0);
    expect(fake.listenerCount('disconnect')).toBe(0);
  });
});
