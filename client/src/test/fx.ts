import { vi } from 'vitest';
import type { SoundPlayer } from '../sound/sounds';

/**
 * spec-10 §4.3: моки браузерных API для тестов fx/sound. Глобально не ставятся — остальные
 * тесты идут на «голом» jsdom (нет animate / AudioContext / matchMedia: проверка AN6/S6).
 * Снимаются `vi.restoreAllMocks()` + `vi.unstubAllGlobals()`.
 */

export interface FakeAnimation {
  keyframes: Keyframe[];
  options: KeyframeAnimationOptions;
  target: Element;
  finish: ReturnType<typeof vi.fn>;
  cancel: ReturnType<typeof vi.fn>;
  onfinish: (() => void) | null;
  oncancel: (() => void) | null;
}

/** Шпион на `Element.prototype.animate` (в jsdom его нет — ставится и снимается целиком). */
export function mockAnimate() {
  const animations: FakeAnimation[] = [];
  const animate = vi.fn(function (
    this: Element,
    keyframes: Keyframe[],
    options: KeyframeAnimationOptions,
  ) {
    const animation: FakeAnimation = {
      keyframes,
      options,
      target: this,
      finish: vi.fn(() => animation.onfinish?.()),
      cancel: vi.fn(() => animation.oncancel?.()),
      onfinish: null,
      oncancel: null,
    };
    animations.push(animation);
    return animation as unknown as Animation;
  });
  Object.defineProperty(Element.prototype, 'animate', { value: animate, configurable: true });
  return {
    animate,
    animations,
    restore: () => {
      delete (Element.prototype as Partial<Element>).animate;
    },
  };
}

/** Ненулевые прямоугольники по `data-testid` (в jsdom все нулевые → полёт пропускается). */
export function mockRects() {
  return vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (
    this: Element,
  ) {
    const id = this.getAttribute('data-testid') ?? '';
    const [left, top, width, height] = id.startsWith('hand-tile-')
      ? [10, 400, 20, 40]
      : id.startsWith('board-tile-')
        ? [200, 200, 40, 20]
        : id === 'boneyard-count'
          ? [50, 300, 10, 16]
          : [100, 50, 20, 40];
    return {
      left,
      top,
      width,
      height,
      right: left + width,
      bottom: top + height,
      x: left,
      y: top,
      toJSON: () => ({}),
    } as DOMRect;
  });
}

/** `matchMedia` с управляемым `prefers-reduced-motion`. */
export function mockMatchMedia(reduced: boolean) {
  const listeners = new Set<() => void>();
  const mql = {
    get matches() {
      return reduced;
    },
    media: '(prefers-reduced-motion: reduce)',
    addEventListener: (_: string, fn: () => void) => listeners.add(fn),
    removeEventListener: (_: string, fn: () => void) => listeners.delete(fn),
  };
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => mql),
  );
  return {
    set(next: boolean) {
      reduced = next;
      listeners.forEach((fn) => fn());
    },
  };
}

/**
 * Фейковый Web Audio: `fetch(url)` → «байты» с url, `decodeAudioData` → буфер с этим именем,
 * `started` — журнал `start()` по имени буфера.
 */
export function mockAudio() {
  const started: string[] = [];
  const contexts: FakeAudioContext[] = [];
  class FakeAudioContext {
    state: 'suspended' | 'running' = 'suspended';
    destination = {};
    resume = vi.fn(async () => {
      this.state = 'running';
    });
    constructor() {
      contexts.push(this);
    }
    createGain() {
      return { gain: { value: 1 }, connect: vi.fn() };
    }
    async decodeAudioData(data: { url: string }) {
      return { name: data.url };
    }
    createBufferSource() {
      const source = {
        buffer: null as { name: string } | null,
        connect: vi.fn(),
        start: vi.fn(() => started.push(source.buffer!.name)),
      };
      return source;
    }
  }
  vi.stubGlobal('AudioContext', FakeAudioContext);
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => ({ ok: true, status: 200, arrayBuffer: async () => ({ url }) })),
  );
  return { started, contexts };
}

/** Плеер-шпион для компонентных тестов (`<App soundPlayer={...}>`). */
export function fakeSoundPlayer() {
  return {
    play: vi.fn<SoundPlayer['play']>(),
    setEnabled: vi.fn<SoundPlayer['setEnabled']>(),
    unlock: vi.fn<SoundPlayer['unlock']>(async () => {}),
  };
}
