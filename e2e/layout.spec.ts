import { expect, type Locator, type Page } from '@playwright/test';
import {
  checkLayout,
  KEY_IDS,
  LONG_A,
  LONG_B,
  currentMover,
  newPlayer,
  playRoundToEnd,
  playStep,
  sendReaction,
  startGame,
  test,
  TIMEOUT,
  viewportFor,
  WIDTHS,
} from './helpers';

// spec-13: E30 доигрывает раунд до конца.
test.describe.configure({ timeout: 120_000 });

async function expectLayout(page: Page, ids: string[]): Promise<void> {
  expect(await checkLayout(page, ids)).toEqual([]);
}

/** UI5: цепочка не шире своего контейнера и не прокручивается внутри. */
async function expectBoardFits(page: Page): Promise<void> {
  const board = await page
    .getByTestId('board')
    .evaluate((el) => ({
      sw: el.scrollWidth,
      cw: el.clientWidth,
      sh: el.scrollHeight,
      ch: el.clientHeight,
    }));
  expect(board.sw).toBeLessThanOrEqual(board.cw);
  expect(board.sh).toBeLessThanOrEqual(board.ch);
}

async function box(locator: Locator) {
  const rect = await locator.boundingBox();
  expect(rect).not.toBeNull();
  return rect!;
}

/** bbox облачка не пересекается с bbox каждого из `targets` (видимых). */
async function expectNoOverlap(bubble: Locator, targets: Locator[]): Promise<void> {
  const b = await box(bubble);
  for (const target of targets) {
    if (!(await target.isVisible())) continue;
    const t = await box(target);
    const overlap =
      b.x < t.x + t.width && t.x < b.x + b.width && b.y < t.y + t.height && t.y < b.y + b.height;
    expect(overlap, `bubble ${JSON.stringify(b)} overlaps ${JSON.stringify(t)}`).toBe(false);
  }
}

for (const width of WIDTHS) {
  const viewport = viewportFor(width);

  test(`E27 UI3/UI4: home & bad link @${width}`, async ({ browser }) => {
    const { page } = await newPlayer(browser, { viewport });
    await page.goto('/');
    await expect(page.getByTestId('connection-status')).toHaveText('connected', TIMEOUT);
    await page.getByTestId('name-input').fill(LONG_A);
    await expect(page.getByTestId('create-button')).toBeEnabled();
    await expectLayout(page, KEY_IDS.home);

    await page.goto('/?room=ZZZZZZ');
    await expect(page.getByTestId('connection-status')).toHaveText('connected', TIMEOUT);
    await page.getByTestId('name-input').fill(LONG_A);
    await expectLayout(page, KEY_IDS.join);
    await page.getByTestId('join-button').click();
    await expect(page.getByTestId('bad-link-screen')).toBeVisible(TIMEOUT);
    await expectLayout(page, KEY_IDS.badLink);
  });

  test(`E28 UI3/UI4: waiting & join @${width}`, async ({ browser }) => {
    const { page: a } = await newPlayer(browser, { viewport });
    const { page: b } = await newPlayer(browser, { viewport });
    await a.goto('/');
    await expect(a.getByTestId('connection-status')).toHaveText('connected', TIMEOUT);
    await a.getByTestId('name-input').fill(LONG_A);
    await a.getByTestId('create-button').click();
    await expect(a.getByTestId('waiting-screen')).toBeVisible(TIMEOUT);
    await expectLayout(a, KEY_IDS.waiting);

    await b.goto(await a.getByTestId('invite-link').inputValue());
    await expect(b.getByTestId('join-screen')).toBeVisible(TIMEOUT);
    await expect(b.getByTestId('connection-status')).toHaveText('connected', TIMEOUT);
    await b.getByTestId('name-input').fill(LONG_B);
    await expectLayout(b, KEY_IDS.join);
  });

  test(`E29 UI3/UI4: table with long names @${width}`, async ({ browser }) => {
    const { a, b } = await startGame(browser, { viewport, names: [LONG_A, LONG_B] });
    for (const page of [a, b]) await expectLayout(page, KEY_IDS.table);

    for (let i = 0; i < 6; i++) await playStep(a, b);
    for (const page of [a, b]) {
      await expectLayout(page, KEY_IDS.table);
      await expectBoardFits(page);
    }

    await a.getByTestId('reaction-toggle').click();
    await expect(a.getByTestId('reaction-panel')).toBeVisible();
    await expectLayout(a, KEY_IDS.table);
  });

  test(`E30 UI4/UI5: round summary with long chain @${width}`, async ({ browser }) => {
    const { a, b } = await startGame(browser, { viewport, names: [LONG_A, LONG_B] });
    await playRoundToEnd(a, b);
    for (const page of [a, b]) {
      await expect(page.getByTestId('round-summary')).toBeVisible();
      await expectLayout(page, KEY_IDS.summary);
      await expectBoardFits(page);
    }
  });
}

for (const width of [360, 1280] as const) {
  test(`E31 UI9: opponent bubble does not cover the board @${width}`, async ({ browser }) => {
    const { a, b } = await startGame(browser, { viewport: viewportFor(width) });

    await sendReaction(a, 'laugh');
    const bubble = b.getByTestId('reaction-bubble-opponent');
    await expect(bubble).toBeVisible(TIMEOUT);
    await expectNoOverlap(bubble, [b.getByTestId('board'), b.getByTestId('controls')]);
    expect(
      await b.getByTestId('opponent-hand').getByTestId('reaction-bubble-opponent').count(),
    ).toBe(1);
    const mine = a.getByTestId('reaction-bubble-mine');
    await expect(mine).toBeVisible(TIMEOUT);
    await expectNoOverlap(mine, [a.getByTestId('board')]);

    await playRoundToEnd(a, b);
    // Кулдаун реакций 2 с (spec-12) — к концу раунда уже прошёл, но ждём доступности кнопки.
    await expect(bubble).toBeHidden(TIMEOUT);
    await sendReaction(a, 'good_game');
    await expect(bubble).toBeVisible(TIMEOUT);
    await expectNoOverlap(bubble, [b.getByTestId('board'), b.getByTestId('continue-button')]);
    await expect(mine).toBeVisible(TIMEOUT);
    await expectNoOverlap(mine, [a.getByTestId('board'), a.getByTestId('continue-button')]);
  });
}

test('E32 UI6: offline → no "your turn" highlight', async ({ browser }) => {
  const game = await startGame(browser, { viewport: viewportFor(360) });
  const { mover } = await currentMover(game.a, game.b);
  const ctx = mover === game.a ? game.ctxA : game.ctxB;
  const indicator = mover.getByTestId('turn-indicator');
  await expect(indicator).toHaveClass(/turn-indicator--mine/);
  await expect(mover.locator('[data-playable="true"]')).not.toHaveCount(0);

  await ctx.setOffline(true);
  await expect(mover.getByTestId('reconnecting-banner')).toBeVisible(TIMEOUT);
  await expect(indicator).toHaveAttribute('data-offline', 'true');
  await expect(indicator).not.toHaveClass(/turn-indicator--mine/);
  await expect(indicator).toHaveAttribute('data-my-turn', 'true');
  await expect(mover.locator('[data-playable="true"]')).toHaveCount(0);

  await ctx.setOffline(false);
  await expect(mover.getByTestId('reconnecting-banner')).toBeHidden({ timeout: 15_000 });
  await expect(indicator).not.toHaveAttribute('data-offline');
  await expect(indicator).toHaveClass(/turn-indicator--mine/);
  await expect(mover.locator('[data-playable="true"]')).not.toHaveCount(0);
});
