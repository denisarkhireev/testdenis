import { defineConfig } from '@playwright/test';
import base from './playwright.config';

/**
 * spec-13 §4.4: `npm run screens` — PNG ключевых экранов на 360 и 1280 px в `docs/screens/`.
 * Свой сервер с `MATCH_TARGET=30` (чтобы за несколько раундов дойти до конца матча), поэтому
 * уже запущенный `npm run dev` нужно остановить.
 */
export default defineConfig({
  ...base,
  testIgnore: [],
  testMatch: 'screens.spec.ts',
  workers: 1,
  retries: 0,
  webServer: base.webServer && {
    ...base.webServer,
    reuseExistingServer: false,
    env: { ...(base.webServer as { env?: Record<string, string> }).env, MATCH_TARGET: '30' },
  },
});
