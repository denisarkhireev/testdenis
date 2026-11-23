export type SoundName = 'tile' | 'draw' | 'turn' | 'roundEnd';

export type SoundUrls = Record<SoundName, string>;

export interface SoundPlayer {
  /**
   * S2/S5: no-op, если звук выключен или не разблокирован. spec-13 UI10: буфер ещё
   * декодируется — звук ждёт его не дольше `PENDING_PLAY_MAX_MS`.
   */
  play(name: SoundName): void;
  setEnabled(on: boolean): void;
  /**
   * S4: вызывать только из обработчика жеста пользователя. Создаёт/возобновляет `AudioContext`
   * и лениво загружает буферы; промис — когда буферы готовы (или загрузка не удалась).
   */
  unlock(): Promise<void>;
}

export interface SoundPlayerOptions {
  urls: SoundUrls;
  enabled: boolean;
  /** Часы для очереди UI10 (мс); по умолчанию `performance.now`. Инъекция — для тестов. */
  now?: () => number;
}

export const GAIN = 0.6;

/**
 * spec-13 UI10: `play()` до готовности буфера (сразу после разблокировки) не теряется —
 * звук проигрывается, когда буфер готов, если с вызова прошло не больше этого.
 */
export const PENDING_PLAY_MAX_MS = 150;

type AudioContextCtor = new () => AudioContext;

function audioContextCtor(): AudioContextCtor | null {
  if (typeof window === 'undefined') return null;
  const w = window as { AudioContext?: AudioContextCtor; webkitAudioContext?: AudioContextCtor };
  return w.AudioContext ?? w.webkitAudioContext ?? null;
}

/** spec-10 S3–S6: Web Audio, один контекст, общий GainNode, наложение звуков разрешено. */
export function createSoundPlayer({
  urls,
  enabled: initial,
  now = () => performance.now(),
}: SoundPlayerOptions): SoundPlayer {
  let enabled = initial;
  let context: AudioContext | null = null;
  let output: GainNode | null = null;
  let loading: Promise<void> | null = null;
  /** Загрузка завершена (часть буферов могла не загрузиться) — ждать больше нечего. */
  let loaded = false;
  let warned = false;
  const buffers = new Map<SoundName, AudioBuffer>();
  /** UI10: не более одного ожидающего звука на имя — время последнего вызова `play`. */
  const pendingPlays = new Map<SoundName, number>();

  /** S6: одна запись в консоль на плеер, без UI-ошибок. */
  const warn = (message: string, error?: unknown) => {
    if (warned) return;
    warned = true;
    console.warn(`[sound] ${message}`, ...(error === undefined ? [] : [error]));
  };

  async function load(ctx: AudioContext): Promise<void> {
    await Promise.all(
      (Object.entries(urls) as [SoundName, string][]).map(async ([name, url]) => {
        try {
          const response = await fetch(url);
          if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
          buffers.set(name, await ctx.decodeAudioData(await response.arrayBuffer()));
          const requestedAt = pendingPlays.get(name);
          pendingPlays.delete(name);
          if (requestedAt !== undefined && now() - requestedAt <= PENDING_PLAY_MAX_MS) {
            start(name);
          }
        } catch (error) {
          pendingPlays.delete(name);
          warn(`cannot load "${name}"`, error);
        }
      }),
    );
    loaded = true;
  }

  function start(name: SoundName): void {
    const buffer = buffers.get(name);
    if (!enabled || !context || !output || !buffer) return;
    try {
      const source = context.createBufferSource();
      source.buffer = buffer;
      source.connect(output);
      source.start();
    } catch (error) {
      warn(`cannot play "${name}"`, error);
    }
  }

  return {
    play(name) {
      if (!enabled || !context || !output) return;
      if (buffers.has(name)) start(name);
      // UI10: контекст разблокирован, буфер ещё декодируется — ждём его не дольше 150 мс.
      else if (loading && !loaded) pendingPlays.set(name, now());
    },

    setEnabled(on) {
      enabled = on;
    },

    unlock() {
      if (!context) {
        const Ctor = audioContextCtor();
        if (!Ctor) {
          warn('Web Audio API is not available');
          return Promise.resolve();
        }
        try {
          context = new Ctor();
          output = context.createGain();
          output.gain.value = GAIN;
          output.connect(context.destination);
        } catch (error) {
          context = null;
          output = null;
          warn('cannot create AudioContext', error);
          return Promise.resolve();
        }
      }
      if (context.state === 'suspended') {
        context.resume().catch((error: unknown) => warn('cannot resume AudioContext', error));
      }
      loading ??= load(context);
      return loading;
    },
  };
}
