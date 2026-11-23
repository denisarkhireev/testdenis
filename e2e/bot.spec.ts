import { expect } from '@playwright/test';
import {
  createBotGame,
  expectTotal,
  makeMove,
  newPlayer,
  playRoundVsBot,
  readHand,
  readTable,
  test,
  TIMEOUT,
} from './helpers';

// spec-15 §7.5: BOT_DELAY_MS=300 (playwright.config.ts), timeout теста 120 с.
test.describe.configure({ timeout: 120_000 });

test('E-B1: «Играть с ботом» opens the table at once, opponent is the bot', async ({ browser }) => {
  const { page } = await newPlayer(browser);
  await createBotGame(page, 'Аня');
  await expect(page.getByTestId('invite-link')).toHaveCount(0);
  await expect(page.getByTestId('waiting-screen')).toHaveCount(0);
  await expect(page.getByTestId('match-score')).toContainText('Аня 0 : 0 🤖 Бот');
  await expect(page.getByTestId('reaction-toggle')).toHaveCount(0);
  await expect(page.getByTestId('turn-indicator')).toBeVisible();
});

test('E-B2/E-B3: a round against the bot is played to the end; next round in one click', async ({
  browser,
}) => {
  const { page } = await newPlayer(browser);
  await createBotGame(page, 'Аня');

  const { botPlays } = await playRoundVsBot(page);
  expect(botPlays).toBeGreaterThanOrEqual(1);
  await expect(page.getByTestId('round-summary')).toBeVisible(TIMEOUT);
  await expect(page.getByTestId('summary-hand-0')).toBeVisible();
  await expect(page.getByTestId('summary-hand-1')).toBeVisible();
  const points = Number(await page.getByTestId('round-points').textContent());
  const { scores } = await readTable(page);
  expect(scores[0] + scores[1]).toBe(points);

  // E-B3: бот уже готов — «Следующий раунд»/«Реванш» стартует по одному нажатию.
  await expect(page.getByTestId('ready-status')).toHaveText('Соперник готов', TIMEOUT);
  const matchOver = (await page.getByTestId('match-finished').count()) > 0;
  await expect(page.getByTestId('continue-button')).toHaveText(
    matchOver ? 'Реванш' : 'Следующий раунд',
  );
  await page.getByTestId('continue-button').click();
  await expect(page.getByTestId('round-summary')).toHaveCount(0, TIMEOUT);
  await expect(page.getByTestId('match-round')).toHaveText(matchOver ? '1' : '2', TIMEOUT);
  await expect(page.getByTestId('turn-indicator')).toBeVisible();
  expectTotal(await readTable(page));
});

test('E-B4: F5 in the middle of a round keeps the table; the bot keeps playing', async ({
  browser,
}) => {
  const { page } = await newPlayer(browser);
  await createBotGame(page, 'Аня');

  // Пара своих ходов, затем — снимок стола на своём ходу (бот в это время не ходит).
  const myTurnOrSummary = async () => {
    const table = await readTable(page);
    return table.myTurn || table.summary;
  };
  for (let i = 0; i < 2; i++) {
    await expect.poll(myTurnOrSummary, TIMEOUT).toBe(true);
    if ((await readTable(page)).summary) break;
    const before = JSON.stringify(await readTable(page));
    await makeMove(page);
    await expect
      .poll(async () => JSON.stringify(await readTable(page)) !== before, TIMEOUT)
      .toBe(true);
  }
  await expect.poll(myTurnOrSummary, TIMEOUT).toBe(true);
  test.skip((await readTable(page)).summary, 'round ended before reload — nothing to restore');

  const table = await readTable(page);
  const hand = await readHand(page);
  const url = page.url();

  await page.reload();
  await expect(page.getByTestId('game-screen')).toBeVisible(TIMEOUT);
  expect(page.url()).toBe(url);
  await expect(page.getByTestId('opponent-bot')).toBeVisible(TIMEOUT);
  await expect.poll(async () => readHand(page), TIMEOUT).toEqual(hand);
  const restored = await readTable(page);
  expect(restored).toEqual(table);

  // Бот продолжает ходить — раунд доигрывается до конца.
  await playRoundVsBot(page);
  await expect(page.getByTestId('round-summary')).toBeVisible(TIMEOUT);
});
