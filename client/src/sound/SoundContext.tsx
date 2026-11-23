import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import drawUrl from './assets/draw.mp3';
import roundEndUrl from './assets/round-end.mp3';
import tileUrl from './assets/tile.mp3';
import turnUrl from './assets/turn.mp3';
import { createSoundPlayer, type SoundName, type SoundPlayer } from './sounds';
import { loadSoundEnabled, saveSoundEnabled } from './storage';
import { SoundContext, type SoundApi } from './useSound';

const SOUND_URLS = { tile: tileUrl, draw: drawUrl, turn: turnUrl, roundEnd: roundEndUrl };

export interface SoundProviderProps {
  children: ReactNode;
  /** Для тестов: готовый плеер вместо Web Audio. */
  player?: SoundPlayer;
}

/** spec-10 §3.3–3.4: общий плеер, состояние кнопки и разблокировка по первому жесту (S4). */
export function SoundProvider({ children, player: playerProp }: SoundProviderProps) {
  const [enabled, setEnabled] = useState(loadSoundEnabled);
  const [player] = useState<SoundPlayer>(
    () => playerProp ?? createSoundPlayer({ urls: SOUND_URLS, enabled }),
  );

  useEffect(() => player.setEnabled(enabled), [player, enabled]);

  // S4: контекст создаётся только в обработчике первого pointerdown/keydown.
  useEffect(() => {
    const options = { once: true, capture: true } as const;
    const unlock = () => {
      window.removeEventListener('pointerdown', unlock, options);
      window.removeEventListener('keydown', unlock, options);
      void player.unlock();
    };
    window.addEventListener('pointerdown', unlock, options);
    window.addEventListener('keydown', unlock, options);
    return () => {
      window.removeEventListener('pointerdown', unlock, options);
      window.removeEventListener('keydown', unlock, options);
    };
  }, [player]);

  // S5: запись при каждом переключении; B4: сам клик ничего не играет.
  const toggle = useCallback(() => {
    setEnabled(!enabled);
    saveSoundEnabled(!enabled);
  }, [enabled]);

  const play = useCallback((name: SoundName) => player.play(name), [player]);

  const api = useMemo<SoundApi>(() => ({ enabled, toggle, play }), [enabled, toggle, play]);
  return <SoundContext.Provider value={api}>{children}</SoundContext.Provider>;
}
