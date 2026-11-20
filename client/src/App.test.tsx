import { act, cleanup, render, screen } from '@testing-library/react';
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

  it('U5/C-X10: connected → reconnecting (banner) → connected on the next hello', () => {
    const { fake, socket } = createFakeSocket();
    render(<App socket={socket} />);
    fake.serverEmit('server:hello', hello(PROTOCOL_VERSION));
    expect(status()).toHaveTextContent(/^connected$/);
    expect(screen.queryByTestId('reconnecting-banner')).toBeNull();
    fake.active = true; // socket.io переподключается сам
    fake.serverEmit('disconnect', 'transport close');
    expect(status()).toHaveTextContent(/^reconnecting…$/);
    expect(screen.getByTestId('reconnecting-banner')).toHaveTextContent('Переподключение…');
    fake.serverEmit('server:hello', hello(PROTOCOL_VERSION));
    expect(status()).toHaveTextContent(/^connected$/);
    expect(screen.queryByTestId('reconnecting-banner')).toBeNull();
  });

  it('C-X11: disconnect of an inactive socket → disconnected, no banner', () => {
    const { fake, socket } = createFakeSocket();
    render(<App socket={socket} />);
    fake.serverEmit('server:hello', hello(PROTOCOL_VERSION));
    fake.active = false; // ручной disconnect(): переподключения не будет
    fake.serverEmit('disconnect', 'io client disconnect');
    expect(status()).toHaveTextContent(/^disconnected$/);
    expect(screen.queryByTestId('reconnecting-banner')).toBeNull();
  });

  it('C-X12: the window offline event closes the transport at once', () => {
    const { fake, socket } = createFakeSocket();
    const { unmount } = render(<App socket={socket} />);
    act(() => {
      window.dispatchEvent(new Event('offline'));
    });
    expect(fake.io.engine.close).toHaveBeenCalledTimes(1);
    unmount();
    window.dispatchEvent(new Event('offline'));
    expect(fake.io.engine.close).toHaveBeenCalledTimes(1);
  });

  it('opens the connection only after subscribing to server:hello', () => {
    const { fake, socket } = createFakeSocket();
    fake.connect.mockImplementation(() => {
      expect(fake.listenerCount('server:hello')).toBeGreaterThan(0);
      fake.active = true;
      return fake;
    });
    render(<App socket={socket} />);
    expect(fake.connect).toHaveBeenCalledTimes(1);
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
