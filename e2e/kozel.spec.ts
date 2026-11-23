import { expect, type Page } from '@playwright/test';
import {
  checkLayout,
  createBotGame,
  createGame,
  joinByLink,
  KEY_IDS,
  newPlayer,
  playRoundToEnd,
  playRoundVsBot,
  readTable,
  startGame,
  test,
  TIMEOUT,
  viewportFor,
} from './helpers';

// spec-16 §7.5: раунд доигрывается целиком.
test.describe.configure({ timeout: 120_000 });

const DRAW_TEXT = 'Рыба — ничья, очков никому';

async function num(page: Page, testId: string): Promise<number> {
  return Number(await page.getByTestId(testId).textContent());
}

/**
 * «Козёл»: очки раунда записаны тому, у кого на руке осталась бо́льшая сумма (проигравшему раунда),
 * у другого — 0; при равных суммах — 0 : 0. Возвращает место, которому записаны очки.
 */
async function expectKozelScoring(page: Page): Promise<0 | 1 | null> {
  const hands = [
    await num(page, 'summary-hand-points-0'),
    await num(page, 'summary-hand-points-1'),
  ] as const;
  const points = await num(page, 'round-points');
  const { scores } = await readTable(page);
  if (hands[0] === hands[1]) {
    expect(scores).toEqual([0, 0]);
    if ((await page.getByTestId('round-finished').textContent()) === DRAW_TEXT) return null;
    expect(points).toBe(0);
    return null;
  }
  const scorer: 0 | 1 = hands[0] > hands[1] ? 0 : 1;
  expect(points).toBe(hands[scorer]);
  expect(scores[scorer]).toBe(points);
  expect(scores[scorer === 0 ? 1 : 0]).toBe(0);
  return scorer;
}

test('E-K1: a «Козёл» round is played to the summary; points go to the round loser', async ({
  browser,
}) => {
  const { a, b } = await startGame(browser, { variant: 'kozel' });
  for (const page of [a, b]) {
    await expect(page.getByTestId('variant-label')).toHaveText('Козёл');
    await expect(page.getByTestId('match-score')).toContainText('Аня 0 : 0 Боб');
  }

  await playRoundToEnd(a, b);
  for (const page of [a, b]) {
    await expect(page.getByTestId('round-summary')).toBeVisible(TIMEOUT);
    await expect(page.getByTestId('round-finished')).toBeVisible();
  }

  const scorerA = await expectKozelScoring(a);
  const scorerB = await expectKozelScoring(b);
  expect(scorerB).toBe(scorerA);
  expect((await readTable(b)).scores).toEqual((await readTable(a)).scores);
  expect(await num(b, 'round-points')).toBe(await num(a, 'round-points'));

  if (scorerA !== null) {
    // A — место 0: «вам» у того, кому записаны очки, «Очки записаны: <имя>» — у соперника.
    const [mine, theirs] = scorerA === 0 ? [a, b] : [b, a];
    await expect(mine.getByTestId('round-finished')).toContainText('Очки записаны вам: +');
    await expect(theirs.getByTestId('round-finished')).toContainText(
      `Очки записаны: ${scorerA === 0 ? 'Аня' : 'Боб'} +`,
    );
  }
});

test('E-K2: the invitee sees «Козёл» before joining; the creator — on the waiting screen', async ({
  browser,
}) => {
  const { page: a } = await newPlayer(browser);
  const { page: b } = await newPlayer(browser);
  const link = await createGame(a, 'Аня', { variant: 'kozel' });
  await expect(a.getByTestId('waiting-settings-variant')).toHaveText('Козёл');
  await expect(a.getByTestId('waiting-settings')).toContainText('Козёл · Матч до 101');

  await b.goto(link);
  await expect(b.getByTestId('join-settings-variant')).toHaveText('Козёл', TIMEOUT);
  await joinByLink(b, link, 'Боб');
  await expect(b.getByTestId('variant-label')).toHaveText('Козёл', TIMEOUT);
});

test('E-K3: «Козёл» against the bot — the summary is shown, the loser is scored', async ({
  browser,
}) => {
  const { page } = await newPlayer(browser);
  await createBotGame(page, 'Аня', { variant: 'kozel' });
  await expect(page.getByTestId('variant-label')).toHaveText('Козёл');
  await playRoundVsBot(page);
  await expect(page.getByTestId('round-summary')).toBeVisible(TIMEOUT);
  await expectKozelScoring(page);
});

test('E-K4: without a choice the game is «Классика», the round winner is scored', async ({
  browser,
}) => {
  const { a, b } = await startGame(browser);
  await expect(a.getByTestId('variant-label')).toHaveText('Классика');
  await playRoundToEnd(a, b);
  await expect(a.getByTestId('round-summary')).toBeVisible(TIMEOUT);
  const hands = [
    await num(a, 'summary-hand-points-0'),
    await num(a, 'summary-hand-points-1'),
  ] as const;
  const { scores } = await readTable(a);
  if (hands[0] !== hands[1]) {
    const winner = hands[0] < hands[1] ? 0 : 1;
    expect(scores[winner]).toBe(await num(a, 'round-points'));
    expect(scores[winner === 0 ? 1 : 0]).toBe(0);
  }
});

for (const width of [360, 1280] as const) {
  test(`L-K: home with the «Правила» group and the «Козёл» scoreboard fit @${width}`, async ({
    browser,
  }) => {
    const viewport = viewportFor(width);
    const { page } = await newPlayer(browser, { viewport });
    await page.goto('/');
    await expect(page.getByTestId('variant-choice')).toBeVisible(TIMEOUT);
    expect(await checkLayout(page, [...KEY_IDS.home, 'variant-hint'])).toEqual([]);

    const { a } = await startGame(browser, { viewport, variant: 'kozel' });
    await expect(a.getByTestId('variant-label')).toHaveText('Козёл');
    expect(await checkLayout(a, [...KEY_IDS.table, 'variant-label'])).toEqual([]);
  });
}
