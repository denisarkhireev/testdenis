import { expect, type Page } from '@playwright/test';
import { createGame, joinByLink, newPlayer, playStep, readTable, test, TIMEOUT } from './helpers';

test.describe.configure({ timeout: 60_000 });

const MOBILE = { width: 360, height: 640 };

test('E16: sound toggle at 360×640 — visible, ≥ 44×44, no scroll, persists after reload', async ({
  browser,
}) => {
  const { page } = await newPlayer(browser, { viewport: MOBILE });
  await page.goto('/');
  await expect(page.getByTestId('connection-status')).toHaveText('connected', TIMEOUT);

  const toggle = page.getByTestId('sound-toggle');
  await expect(toggle).toBeVisible();
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  const box = (await toggle.boundingBox())!;
  expect(box.width).toBeGreaterThanOrEqual(44);
  expect(box.height).toBeGreaterThanOrEqual(44);
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(MOBILE.width);
  expect(box.y + box.height).toBeLessThanOrEqual(MOBILE.height);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
    ),
  ).toBe(true);

  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  expect(await page.evaluate(() => localStorage.getItem('domino:sound'))).toBe('off');

  await page.reload();
  await expect(page.getByTestId('connection-status')).toHaveText('connected', TIMEOUT);
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
});

/** E18: ошибки консоли/страницы про автоплей и Web Audio. */
function collectAudioErrors(page: Page): string[] {
  const errors: string[] = [];
  const check = (text: string) => {
    if (/NotAllowedError|AudioContext/.test(text)) errors.push(text);
  };
  page.on('console', (message) => {
    if (message.type() === 'error' || message.type() === 'warning') check(message.text());
  });
  page.on('pageerror', (error) => check(`${error.name}: ${error.message}`));
  return errors;
}

test('E17/E18: with animations on, moves work and no autoplay errors', async ({ browser }) => {
  const { page: a } = await newPlayer(browser, { reducedMotion: 'no-preference' });
  const { page: b } = await newPlayer(browser, { reducedMotion: 'no-preference' });
  const errors = [a, b].map(collectAudioErrors);

  // Анимации действительно включены.
  expect(await a.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches)).toBe(
    false,
  );

  const link = await createGame(a, 'Аня');
  await joinByLink(b, link, 'Боб');
  for (const page of [a, b]) {
    await expect(page.getByTestId('game-screen')).toBeVisible(TIMEOUT);
    await expect(page.getByTestId('turn-indicator')).toBeVisible(TIMEOUT);
  }

  for (let step = 0; step < 3; step++) {
    await playStep(a, b);
    const [ta, tb] = [await readTable(a), await readTable(b)];
    if (ta.summary || tb.summary) break;
    for (const table of [ta, tb]) {
      expect(table.hand + table.opp + table.boneyard + table.board).toBe(28);
    }
  }

  expect(errors.flat()).toEqual([]);
});
