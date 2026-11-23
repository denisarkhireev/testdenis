/** spec-10 S5: вкл/выкл звука в localStorage, по образцу `lobby/storage.ts`. */
const SOUND_KEY = 'domino:sound';

/** Нет ключа / мусор / storage недоступен → звук включён. */
export function loadSoundEnabled(): boolean {
  try {
    return localStorage.getItem(SOUND_KEY) !== 'off';
  } catch {
    return true;
  }
}

export function saveSoundEnabled(on: boolean): void {
  try {
    localStorage.setItem(SOUND_KEY, on ? 'on' : 'off');
  } catch {
    // не запомнится после перезагрузки, текущая вкладка работает
  }
}
