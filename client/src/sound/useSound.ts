import { createContext, useContext } from 'react';
import type { SoundName } from './sounds';

export interface SoundApi {
  enabled: boolean;
  toggle(): void;
  play(name: SoundName): void;
}

/** Без провайдера (изолированные тесты компонентов) — тихо и выключено. */
export const SoundContext = createContext<SoundApi>({
  enabled: false,
  toggle: () => {},
  play: () => {},
});

export function useSound(): SoundApi {
  return useContext(SoundContext);
}
