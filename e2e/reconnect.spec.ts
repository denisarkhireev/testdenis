import { expect, type Page } from '@playwright/test';
import { newPlayer, playStep, readHand, readTable, startGame, test, TIMEOUT } from './helpers';

// spec-9 §7.4. Сервер e2e запускается с RECONNECT_TIMEOUT=8000 (playwright.config.ts).
test.describe.configure({ timeout: 60_000 });

const OFFLINE_RE = /Соперник отключился, ждём… \d{2}:\d{2}/;

/** Секунды из таймера «mm:ss» на плашке соперника. */
async function countdownSeconds(page: Page): Promise<number> {
  const text = (await page.getByTestId('opponent-countdown').textContent()) ?? '';
  const [mm, ss] = text.split(':').map(Number);
  return mm! * 60 + ss!;
}

test('X16: B closes the browser mid-round and comes back via the link to the same state', async ({
  browser,
}) => {
  const { a, b, ctxB, link } = await startGame(browser);
  await playStep(a, b);
  await playStep(a, b);
  const table = await readTable(b);
  const hand = await readHand(b);
  const state = await ctxB.storageState();
  await ctxB.close();

  const offline = a.getByTestId('opponent-offline');
  await expect(offline).toHaveText(OFFLINE_RE, TIMEOUT);
  const first = await countdownSeconds(a);
  await expect.poll(() => countdownSeconds(a), TIMEOUT).toBeLessThan(first);

  const { page: b2 } = await newPlayer(browser, { storageState: state });
  await b2.goto(link);
  await expect(b2.getByTestId('game-screen')).toBeVisible(TIMEOUT);
  await expect(b2.getByTestId('turn-indicator')).toBeVisible(TIMEOUT);
  expect(await readTable(b2)).toEqual(table);
  expect(await readHand(b2)).toEqual(hand);
  await expect(offline).toBeHidden(TIMEOUT);

  await playStep(a, b2);
});

test('X17: B does not come back → after RECONNECT_TIMEOUT A sees the victory', async ({
  browser,
}) => {
  test.skip(!!process.env.E2E_BASE_URL, 'нужен короткий RECONNECT_TIMEOUT');
  const { a, ctxB } = await startGame(browser);
  await ctxB.close();
  await expect(a.getByTestId('opponent-offline')).toBeVisible(TIMEOUT);

  await expect(a.getByTestId('forfeit-summary')).toBeVisible({ timeout: 20_000 });
  await expect(a.getByTestId('forfeit-result')).toHaveText('Победа! Соперник не вернулся в игру');
  await expect(a.getByTestId('opponent-offline')).toBeHidden();
  await a.getByTestId('home-button').click();
  await expect(a.getByTestId('home-screen')).toBeVisible(TIMEOUT);
});

test('X18: reopening the link in the same browser returns to the own seat, not a third player', async ({
  browser,
}) => {
  const { a, b, ctxB, link } = await startGame(browser);
  const hand = await readHand(b);
  await b.close();

  const b2 = await ctxB.newPage();
  await b2.goto(link);
  await expect(b2.getByTestId('game-screen')).toBeVisible(TIMEOUT);
  await expect(b2.getByTestId('join-screen')).toHaveCount(0);
  await expect(b2.getByTestId('player-name-1')).toHaveText('Боб (вы)', TIMEOUT);
  expect(await readHand(b2)).toEqual(hand);

  // ещё одна вкладка того же браузера забирает место, предыдущая — «в другой вкладке»
  const b3 = await ctxB.newPage();
  await b3.goto(link);
  await expect(b3.getByTestId('game-screen')).toBeVisible(TIMEOUT);
  expect(await readHand(b3)).toEqual(hand);
  await expect(b2.getByTestId('closed-screen')).toHaveText(
    /Игра открыта в другой вкладке/,
    TIMEOUT,
  );

  await expect(a.getByTestId('players').locator('li')).toHaveCount(2);
  await expect(a.getByTestId('opponent-offline')).toBeHidden(TIMEOUT);
  await playStep(a, b3);
});

test('X19: network loss → "Reconnecting…", then the same table without a reload', async ({
  browser,
}) => {
  const { a, b, ctxB } = await startGame(browser);
  const table = await readTable(b);
  await b.evaluate(() => {
    (window as unknown as { __marker: number }).__marker = 1;
  });

  await ctxB.setOffline(true);
  await expect(b.getByTestId('reconnecting-banner')).toHaveText('Переподключение…', TIMEOUT);
  await expect(b.getByTestId('connection-status')).toHaveText('reconnecting…');
  await expect(a.getByTestId('opponent-offline')).toBeVisible({ timeout: 5_000 });

  await ctxB.setOffline(false);
  await expect(b.getByTestId('reconnecting-banner')).toBeHidden({ timeout: 15_000 });
  await expect(b.getByTestId('connection-status')).toHaveText('connected');
  await expect(a.getByTestId('opponent-offline')).toBeHidden(TIMEOUT);
  expect(await readTable(b)).toEqual(table);
  // страница не перезагружалась
  expect(await b.evaluate(() => (window as unknown as { __marker?: number }).__marker)).toBe(1);
  await playStep(a, b);
});
