import { defineConfig, devices } from '@playwright/test';

// spec-8: E2E_BASE_URL — прогон против уже запущенного сервера (например, Docker-контейнера
// на :8080). Не задан — Playwright сам поднимает `npm run dev`.
const externalBaseUrl = process.env.E2E_BASE_URL;

export default defineConfig({
  testDir: 'e2e',
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: externalBaseUrl ?? 'http://localhost:5173',
    // E4 читает буфер обмена в Chromium.
    permissions: ['clipboard-read', 'clipboard-write'],
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: externalBaseUrl
    ? undefined
    : {
        command: 'npm run dev',
        url: 'http://localhost:5173',
        reuseExistingServer: !process.env.CI,
        timeout: 60_000,
      },
});
