import { defineConfig, devices } from '@playwright/test';

// spec-8: E2E_BASE_URL — прогон против уже запущенного сервера (например, Docker-контейнера
// на :8080). Не задан — Playwright сам поднимает `npm run dev`.
const externalBaseUrl = process.env.E2E_BASE_URL;

export default defineConfig({
  testDir: 'e2e',
  // spec-13: скриншоты — отдельной командой `npm run screens` (playwright.screens.config.ts).
  testIgnore: 'screens.spec.ts',
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: externalBaseUrl ?? 'http://localhost:5173',
    // E4 читает буфер обмена в Chromium.
    permissions: ['clipboard-read', 'clipboard-write'],
    // spec-10 §4.4: полёты костей выключены (newPlayer ставит то же сам).
    reducedMotion: 'reduce',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: externalBaseUrl
    ? undefined
    : {
        command: 'npm run dev',
        url: 'http://localhost:5173',
        reuseExistingServer: !process.env.CI,
        timeout: 60_000,
        // spec-9: укороченный таймаут возвращения для X17; spec-11: тестовое время хода 3 с
        // (E19–E22). Уже запущенный локально `npm run dev` (reuseExistingServer) должен быть
        // поднят с теми же значениями.
        env: { ...process.env, RECONNECT_TIMEOUT: '8000', TURN_TIMER_TEST_SECONDS: '3' },
      },
});
