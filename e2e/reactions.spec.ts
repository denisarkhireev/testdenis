import { expect } from '@playwright/test';
import { sendReaction, startGame, test, TIMEOUT } from './helpers';

test.describe.configure({ timeout: 60_000 });

const SEEN = { timeout: 2_000 };

test('E23: A sends 👍 — B sees it at the opponent hand, A at own hand; gone in ~3 s', async ({
  browser,
}) => {
  const { a, b } = await startGame(browser);
  await sendReaction(a, 'thumbs_up');

  const atB = b.getByTestId('reaction-bubble-opponent');
  await expect(atB).toBeVisible(SEEN);
  await expect(atB).toHaveText('👍');
  await expect(atB).toHaveAttribute('data-reaction-id', 'thumbs_up');
  await expect(a.getByTestId('reaction-bubble-mine')).toHaveText('👍', SEEN);
  await expect(b.getByTestId('reaction-bubble-mine')).toHaveCount(0);

  await expect(atB).toHaveCount(0, { timeout: 5_000 });
  await expect(a.getByTestId('reaction-bubble-mine')).toHaveCount(0, { timeout: 5_000 });
});

test('E24: B sends the phrase «Хорошая игра» — A sees it', async ({ browser }) => {
  const { a, b } = await startGame(browser);
  await sendReaction(b, 'good_game');
  await expect(a.getByTestId('reaction-bubble-opponent')).toHaveText('Хорошая игра', SEEN);
});

test('E25: buttons are disabled for ~2 s after a reaction, then the next one goes through', async ({
  browser,
}) => {
  const { a, b } = await startGame(browser);
  await sendReaction(a, 'laugh');
  await expect(b.getByTestId('reaction-bubble-opponent')).toHaveText('😂', SEEN);

  await a.getByTestId('reaction-toggle').click();
  for (const id of ['thumbs_up', 'laugh', 'fish', 'good_game']) {
    await expect(a.getByTestId(`reaction-${id}`)).toBeDisabled();
  }
  await expect(a.getByTestId('reaction-wow')).toBeEnabled({ timeout: 4_000 });
  await sendReaction(a, 'wow');
  await expect(b.getByTestId('reaction-bubble-opponent')).toHaveText('😮', SEEN);
});

test('E26: 360×740 — panel and bubble without horizontal scroll', async ({ browser }) => {
  const { a, b } = await startGame(browser, { viewport: { width: 360, height: 740 } });
  await a.getByTestId('reaction-toggle').click();
  await expect(a.getByTestId('reaction-panel')).toBeVisible(TIMEOUT);
  const noScroll = () => document.documentElement.scrollWidth <= 360;
  expect(await a.evaluate(noScroll)).toBe(true);
  const button = (await a.getByTestId('reaction-you_got_me').boundingBox())!;
  expect(button.width).toBeGreaterThanOrEqual(44);
  expect(button.height).toBeGreaterThanOrEqual(44);

  await a.getByTestId('reaction-you_got_me').click();
  await expect(b.getByTestId('reaction-bubble-opponent')).toHaveText('Ну ты даёшь', SEEN);
  await expect(b.getByTestId('reaction-bubble-opponent')).toBeInViewport();
  expect(await b.evaluate(noScroll)).toBe(true);
  expect(await a.evaluate(noScroll)).toBe(true);
});
