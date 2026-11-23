import { EventEmitter } from 'node:events';
import { act } from '@testing-library/react';
import { vi } from 'vitest';
import { PROTOCOL_VERSION } from '@domino/shared';
import type { ClientSocket } from '../socket';

/**
 * Fake Socket.IO-клиента для компонентных тестов.
 * - `serverEmit(event, payload)` — серверное событие внутри `act`;
 * - `timeout(ms).emitWithAck` — один общий `vi.fn` (`fake.emitWithAck`), ответ задаётся в тесте;
 *   `room:info` — отдельно, `fake.infoAck(payload)`.
 */
export function createFakeSocket() {
  const emitter = new EventEmitter();
  const emitWithAck = vi.fn<(event: string, payload: unknown) => Promise<unknown>>();
  /**
   * spec-14: `room:info` идёт отдельным mock-ом, чтобы не съедать ответы, заданные тестом для
   * `emitWithAck`. По умолчанию ответа нет (промис не завершается) — строка настроек не видна.
   */
  const infoAck = vi.fn<(payload: unknown) => Promise<unknown>>(() => new Promise(() => {}));
  const ackFor = (event: string, payload: unknown) =>
    event === 'room:info' ? infoAck(payload) : emitWithAck(event, payload);
  const fake = {
    on: vi.fn((event: string, fn: (...args: unknown[]) => void) => {
      emitter.on(event, fn);
      return fake;
    }),
    off: vi.fn((event: string, fn: (...args: unknown[]) => void) => {
      emitter.off(event, fn);
      return fake;
    }),
    timeout: vi.fn((ms: number) => ({ ms, emitWithAck: ackFor })),
    active: false,
    /** Менеджер socket.io: `engine.close()` рвёт транспорт (RC15). */
    io: { engine: { close: vi.fn() } },
    connect: vi.fn(() => {
      fake.active = true;
      return fake;
    }),
    emitWithAck,
    infoAck,
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
  turnSecondsOptions: [0, 30, 60],
  matchTargetOptions: [51, 101, 151],
  defaultMatchTarget: 101,
  handSizeOptions: [5, 6, 7],
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
