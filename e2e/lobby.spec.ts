import { expect } from '@playwright/test';
import { createGame, joinByLink, newPlayer, test, TIMEOUT } from './helpers';

// spec-9: игроки — разные контексты (вкладки одного браузера теперь один игрок).

test('E3: two players meet in one room via the invite link', async ({ browser }) => {
  const { page: a } = await newPlayer(browser);
  const { page: b } = await newPlayer(browser);

  const link = await createGame(a, 'Аня');
  await joinByLink(b, link, 'Боб');

  await expect(a.getByTestId('game-screen')).toBeVisible(TIMEOUT);
  await expect(b.getByTestId('game-screen')).toBeVisible(TIMEOUT);
  await expect(a.getByTestId('player-name-1')).toHaveText('Боб');
  await expect(b.getByTestId('player-name-0')).toHaveText('Аня');
});

test('E4: "Copy" puts the invite link into the clipboard', async ({ page, baseURL }) => {
  const link = await createGame(page, 'Аня');
  // spec-8: dev — origin страницы, контейнер — PUBLIC_URL (в CI совпадает с E2E_BASE_URL).
  expect(link.startsWith(`${new URL(baseURL!).origin}/`)).toBe(true);
  await page.getByTestId('copy-button').click();
  await expect(page.getByTestId('copy-status')).toHaveText('Ссылка скопирована', TIMEOUT);
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(link);
});

test('E5: reload on the waiting screen keeps the room and the link', async ({ browser }) => {
  const { page: a } = await newPlayer(browser);
  const link = await createGame(a, 'Аня');

  await a.reload();
  await expect(a.getByTestId('waiting-screen')).toBeVisible(TIMEOUT);
  await expect(a.getByTestId('invite-link')).toHaveValue(link, TIMEOUT);

  const { page: b } = await newPlayer(browser);
  await joinByLink(b, link, 'Боб');
  await expect(a.getByTestId('game-screen')).toBeVisible(TIMEOUT);
  await expect(b.getByTestId('game-screen')).toBeVisible(TIMEOUT);
});

test('E6: a third player cannot join a full room', async ({ browser }) => {
  const { page: a } = await newPlayer(browser);
  const { page: b } = await newPlayer(browser);
  const { page: c } = await newPlayer(browser);

  const link = await createGame(a, 'Аня');
  await joinByLink(b, link, 'Боб');
  await expect(b.getByTestId('game-screen')).toBeVisible(TIMEOUT);

  await joinByLink(c, link, 'Вика');
  await expect(c.getByTestId('form-error')).toHaveText('В этой игре уже два игрока', TIMEOUT);
  await expect(a.getByTestId('game-screen')).toBeVisible();
  await expect(b.getByTestId('game-screen')).toBeVisible();
});

test('E7: a link to a missing room shows the bad-link screen', async ({ page }) => {
  // spec-14 S7: room:info распознаёт мёртвую ссылку сразу, до ввода имени.
  await page.goto('/?room=ZZZZZZ');
  await expect(page.getByTestId('bad-link-screen')).toBeVisible(TIMEOUT);
});
