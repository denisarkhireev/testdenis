import { expect, type Page } from '@playwright/test';
import { noHorizontalScroll, playRoundToEnd, readTable, startGame, test, TIMEOUT } from './helpers';

test.describe.configure({ timeout: 120_000 });

async function roundPoints(page: Page): Promise<number> {
  return Number(await page.getByTestId('round-points').textContent());
}

/** E12: доиграть раунд; итоги одинаковы на обеих вкладках. */
async function finishRound(a: Page, b: Page) {
  await playRoundToEnd(a, b);
  for (const page of [a, b]) {
    await expect(page.getByTestId('round-summary')).toBeVisible(TIMEOUT);
    await expect(page.getByTestId('round-finished')).toBeVisible();
    await expect(page.getByTestId('summary-hand-0')).toBeVisible();
    await expect(page.getByTestId('summary-hand-1')).toBeVisible();
    await expect(page.getByTestId('turn-indicator')).toHaveCount(0);
  }
  const points = await roundPoints(a);
  expect(await roundPoints(b)).toBe(points);
  const [ta, tb] = [await readTable(a), await readTable(b)];
  expect(ta.scores).toEqual(tb.scores);
  expect(ta.scores[0] + ta.scores[1]).toBe(points);
  for (const seat of [0, 1]) {
    expect(await a.getByTestId(`summary-hand-points-${seat}`).textContent()).toBe(
      await b.getByTestId(`summary-hand-points-${seat}`).textContent(),
    );
  }
  return { points, scores: ta.scores };
}

test('E12/E13: play a round to the end, see the summary, start the next round', async ({
  browser,
}) => {
  const { a, b } = await startGame(browser);
  for (const page of [a, b]) {
    await expect(page.getByTestId('match-score')).toContainText('Аня 0 : 0 Боб');
    await expect(page.getByTestId('match-round')).toHaveText('1');
  }

  const { scores } = await finishRound(a, b);
  const matchOver = (await a.getByTestId('match-finished').count()) > 0;

  await a.getByTestId('continue-button').click();
  await expect(a.getByTestId('ready-status')).toHaveText('Ждём соперника…', TIMEOUT);
  await expect(a.getByTestId('continue-button')).toBeDisabled();
  await expect(b.getByTestId('ready-status')).toHaveText('Соперник готов', TIMEOUT);
  await expect(b.getByTestId('continue-button')).toBeEnabled();
  await expect(b.getByTestId('continue-button')).toHaveText(
    matchOver ? 'Реванш' : 'Следующий раунд',
  );
  await b.getByTestId('continue-button').click();

  for (const page of [a, b]) {
    await expect(page.getByTestId('round-summary')).toHaveCount(0, TIMEOUT);
    await expect(page.getByTestId('turn-indicator')).toBeVisible();
    await expect(page.getByTestId('boneyard-count')).toHaveText('14');
    await expect(page.locator('[data-testid^="board-tile-"]')).toHaveCount(0);
    await expect(page.locator('[data-testid^="hand-tile-"]')).toHaveCount(7);
    await expect(page.getByTestId('opponent-tile')).toHaveCount(7);
    // редкая ветка: ≥ 101 за один раунд → реванш с 0 : 0
    await expect(page.getByTestId('match-round')).toHaveText(matchOver ? '1' : '2');
    expect((await readTable(page)).scores).toEqual(matchOver ? [0, 0] : scores);
  }
});

test('E14: round summary fits 360×640 without horizontal scroll', async ({ browser }) => {
  const { a, b } = await startGame(browser, { viewport: { width: 360, height: 640 } });
  await finishRound(a, b);
  for (const page of [a, b]) {
    expect(await noHorizontalScroll(page)).toBe(true);
    const button = page.getByTestId('continue-button');
    await button.scrollIntoViewIfNeeded();
    await expect(button).toBeVisible();
    expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  }
});

test('E15: reload on the summary restores the same summary and readiness', async ({ browser }) => {
  const { a, b } = await startGame(browser);
  const { points, scores } = await finishRound(a, b);
  await a.getByTestId('continue-button').click();
  await expect(b.getByTestId('ready-status')).toHaveText('Соперник готов', TIMEOUT);

  await b.reload();
  await expect(b.getByTestId('round-summary')).toBeVisible(TIMEOUT);
  expect(await roundPoints(b)).toBe(points);
  await expect.poll(async () => (await readTable(b)).scores, TIMEOUT).toEqual(scores);
  await expect(b.getByTestId('ready-status')).toHaveText('Соперник готов');

  await b.getByTestId('continue-button').click();
  for (const page of [a, b]) {
    await expect(page.getByTestId('turn-indicator')).toBeVisible(TIMEOUT);
  }
});
