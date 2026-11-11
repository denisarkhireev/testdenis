import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PROTOCOL_VERSION } from '@domino/shared';
import { App } from './App';
import { createFakeSocket, hello } from './test/fakeSocket';

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
    fake.serverEmit('server:hello', hello(PROTOCOL_VERSION));
    expect(status()).toHaveTextContent(/^connected$/);
  });

  it('U4: shows "disconnected" and logs an error on protocol version mismatch', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { fake, socket } = createFakeSocket();
    render(<App socket={socket} />);
    fake.serverEmit('server:hello', hello(PROTOCOL_VERSION + 1));
    expect(status()).toHaveTextContent(/^disconnected$/);
    expect(errorSpy).toHaveBeenCalledWith('Protocol version mismatch');
  });

  it('U5: goes connected → disconnected → connected on reconnect', () => {
    const { fake, socket } = createFakeSocket();
    render(<App socket={socket} />);
    fake.serverEmit('server:hello', hello(PROTOCOL_VERSION));
    expect(status()).toHaveTextContent(/^connected$/);
    fake.serverEmit('disconnect', 'transport close');
    expect(status()).toHaveTextContent(/^disconnected$/);
    fake.serverEmit('server:hello', hello(PROTOCOL_VERSION));
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
