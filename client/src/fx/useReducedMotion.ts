import { useSyncExternalStore } from 'react';

const QUERY = '(prefers-reduced-motion: reduce)';

let fxOff: boolean | null = null;

/** spec-10 §4.4: `?fx=off` — анимации выключены независимо от ОС (читается один раз). */
export function motionDisabled(): boolean {
  if (fxOff === null) {
    try {
      fxOff = new URLSearchParams(window.location.search).get('fx') === 'off';
    } catch {
      fxOff = false;
    }
  }
  return fxOff;
}

function mediaQuery(): MediaQueryList | null {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return null;
  return window.matchMedia(QUERY);
}

function subscribe(onChange: () => void): () => void {
  const mql = mediaQuery();
  if (!mql) return () => {};
  mql.addEventListener('change', onChange);
  return () => mql.removeEventListener('change', onChange);
}

function getSnapshot(): boolean {
  return motionDisabled() || (mediaQuery()?.matches ?? false);
}

/** AN7: `prefers-reduced-motion: reduce` (с подпиской на смену в ОС) или `?fx=off`. */
export function useReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}
