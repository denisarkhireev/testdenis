import { expect, test } from '@playwright/test';
import { createGame, joinByLink, TIMEOUT } from './helpers';

test('E3: two tabs meet in one room via the invite link', async ({ context }) => {
  const a = await context.newPage();
  const b = await context.newPage();

  const link = await createGame(a, 'Аня');
  await joinByLink(b, link, 'Боб');

  await expect(a.getByTestId('game-screen')).toBeVisible(TIMEOUT);
  await expect(b.getByTestId('game-screen')).toBeVisible(TIMEOUT);
  await expect(a.getByTestId('player-name-1')).toHaveText('Боб');
  await expect(b.getByTestId('player-name-0')).toHaveText('Аня');
});

test('E4: "Copy" puts the invite link into the clipboard', async ({ page }) => {
  const link = await createGame(page, 'Аня');
  await page.getByTestId('copy-button').click();
  await expect(page.getByTestId('copy-status')).toHaveText('Ссылка скопирована', TIMEOUT);
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(link);
});

test('E5: reload on the waiting screen keeps the room and the link', async ({ context }) => {
  const a = await context.newPage();
  const link = await createGame(a, 'Аня');

  await a.reload();
  await expect(a.getByTestId('waiting-screen')).toBeVisible(TIMEOUT);
  await expect(a.getByTestId('invite-link')).toHaveValue(link, TIMEOUT);

  const b = await context.newPage();
  await joinByLink(b, link, 'Боб');
  await expect(a.getByTestId('game-screen')).toBeVisible(TIMEOUT);
  await expect(b.getByTestId('game-screen')).toBeVisible(TIMEOUT);
});

test('E6: a third tab cannot join a full room', async ({ context }) => {
  const a = await context.newPage();
  const b = await context.newPage();
  const c = await context.newPage();

  const link = await createGame(a, 'Аня');
  await joinByLink(b, link, 'Боб');
  await expect(b.getByTestId('game-screen')).toBeVisible(TIMEOUT);

  await joinByLink(c, link, 'Вика');
  await expect(c.getByTestId('form-error')).toHaveText('В этой игре уже два игрока', TIMEOUT);
  await expect(a.getByTestId('game-screen')).toBeVisible();
  await expect(b.getByTestId('game-screen')).toBeVisible();
});

test('E7: a link to a missing room shows the bad-link screen', async ({ page }) => {
  await joinByLink(page, '/?room=ZZZZZZ', 'Вика');
  await expect(page.getByTestId('bad-link-screen')).toBeVisible(TIMEOUT);
});
