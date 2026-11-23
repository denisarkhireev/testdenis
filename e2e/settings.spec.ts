import { expect } from '@playwright/test';
import { createGame, joinByLink, newPlayer, readTable, startGame, test, TIMEOUT } from './helpers';

// spec-14: настройки комнаты — цель матча и размер руки.

test('E-S1: a room to 51 — the guest sees it before joining, both scoreboards say «до 51»', async ({
  browser,
}) => {
  const { page: a } = await newPlayer(browser);
  const { page: b } = await newPlayer(browser);
  const link = await createGame(a, 'Аня', { matchTarget: 51 });
  await expect(a.getByTestId('waiting-settings-target')).toHaveText('51');

  await b.goto(link);
  await expect(b.getByTestId('join-screen')).toBeVisible(TIMEOUT);
  await expect(b.getByTestId('join-settings-target')).toHaveText('51', TIMEOUT);
  await expect(b.getByTestId('join-settings-hand')).toHaveText('7');

  await joinByLink(b, link, 'Боб');
  for (const page of [a, b]) {
    await expect(page.getByTestId('game-screen')).toBeVisible(TIMEOUT);
    await expect(page.getByTestId('match-target')).toHaveText('51');
    await expect(page.getByTestId('match-score')).toContainText('до 51');
  }
});

test('E-S2: hand 5 — five tiles each, boneyard 18, «по 5 костей» on the scoreboard', async ({
  browser,
}) => {
  const { a, b } = await startGame(browser, { handSize: 5 });
  for (const page of [a, b]) {
    await expect(page.getByTestId('boneyard-count')).toHaveText('18');
    await expect(page.getByTestId('hand-size-label')).toHaveText('по 5 костей');
  }
  // Первый ход мог быть сделан до чтения — проверяем сумму и симметрию.
  const [ta, tb] = [await readTable(a), await readTable(b)];
  expect(ta.hand + ta.opp + ta.board).toBe(10);
  expect(ta.hand).toBe(tb.opp);
  expect(tb.hand).toBe(ta.opp);
  expect(ta.boneyard).toBe(18);
});

test('E-S3: defaults — «до 101», no hand label, 7 tiles, boneyard 14', async ({ browser }) => {
  const { a, b } = await startGame(browser);
  for (const page of [a, b]) {
    await expect(page.getByTestId('match-target')).toHaveText('101');
    await expect(page.getByTestId('hand-size-label')).toHaveCount(0);
    await expect(page.getByTestId('boneyard-count')).toHaveText('14');
    await expect(page.locator('[data-testid^="hand-tile-"]')).toHaveCount(7);
  }
});

test('E-S4: a link to an unknown room → bad-link screen right away', async ({ browser }) => {
  const { page } = await newPlayer(browser);
  await page.goto('/?room=ZZZZZZ');
  await expect(page.getByTestId('bad-link-screen')).toBeVisible(TIMEOUT);
  await expect(page.getByTestId('name-input')).toHaveCount(0);
});
