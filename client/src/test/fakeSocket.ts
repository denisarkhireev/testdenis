import { EventEmitter } from 'node:events';
import { act } from '@testing-library/react';
import { vi } from 'vitest';
import { PROTOCOL_VERSION } from '@domino/shared';
import type { ClientSocket } from '../socket';

/**
 * Fake Socket.IO-клиента для компонентных тестов.
 * - `serverEmit(event, payload)` — серверное событие внутри `act`;
 * - `timeout(ms).emitWithAck` — один общий `vi.fn` (`fake.emitWithAck`), ответ задаётся в тесте.
 */
export function createFakeSocket() {
  const emitter = new EventEmitter();
  const emitWithAck = vi.fn<(event: string, payload: unknown) => Promise<unknown>>();
  const fake = {
    on: vi.fn((event: string, fn: (...args: unknown[]) => void) => {
      emitter.on(event, fn);
      return fake;
    }),
    off: vi.fn((event: string, fn: (...args: unknown[]) => void) => {
      emitter.off(event, fn);
      return fake;
    }),
    timeout: vi.fn((ms: number) => ({ ms, emitWithAck })),
    active: false,
    connect: vi.fn(() => {
      fake.active = true;
      return fake;
    }),
    emitWithAck,
    serverEmit: (event: string, ...args: unknown[]) => {
      act(() => {
        emitter.emit(event, ...args);
      });
    },
    listenerCount: (event: string) => emitter.listenerCount(event),
    eventNames: () => emitter.eventNames(),
  };
  return { fake, socket: fake as unknown as ClientSocket };
}

export type FakeSocket = ReturnType<typeof createFakeSocket>['fake'];

export const hello = (protocolVersion: number = PROTOCOL_VERSION) => ({
  protocolVersion,
  serverTime: new Date().toISOString(),
});

/** Промис, которым тест управляет вручную (ack «в полёте»). */
export function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}
