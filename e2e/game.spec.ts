import { expect, test, type Page } from '@playwright/test';
import { currentMover, playStep, readTable, startGame, TIMEOUT } from './helpers';

test.describe.configure({ timeout: 60_000 });

async function noHorizontalScroll(page: Page): Promise<boolean> {
  return page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
}

test('E8: two players make several moves', async ({ context }) => {
  const { a, b } = await startGame(context);
  const kinds: string[] = [];

  for (let actions = 0; actions < 40 && (await readTable(a)).board < 4; actions++) {
    kinds.push(await playStep(a, b));
  }

  expect((await readTable(a)).board).toBeGreaterThanOrEqual(4);
  expect((await readTable(b)).board).toBe((await readTable(a)).board);
  expect(kinds.filter((kind) => kind === 'play').length).toBeGreaterThanOrEqual(4);
});

test('E9: the first move is the only highlighted tile', async ({ context }) => {
  const { a, b } = await startGame(context);
  const { mover, other } = await currentMover(a, b);

  await expect(mover.getByTestId('turn-indicator')).toHaveText('Ваш ход');
  await expect(mover.locator('[data-playable="true"]')).toHaveCount(1);
  await expect(mover.getByTestId('draw-button')).toBeDisabled();
  await expect(mover.getByTestId('pass-button')).toBeDisabled();
  await expect(other.locator('[data-playable="true"]')).toHaveCount(0);
  await expect(mover.getByTestId('board-empty')).toBeVisible();

  await mover.locator('[data-playable="true"]').click();
  for (const page of [a, b]) {
    await expect(page.getByTestId('board-tile-0')).toBeVisible(TIMEOUT);
  }
  await expect(other.getByTestId('turn-indicator')).toHaveAttribute('data-my-turn', 'true');
  await expect(mover.getByTestId('turn-indicator')).toHaveAttribute('data-my-turn', 'false');
});

for (const viewport of [
  { width: 375, height: 667 },
  { width: 360, height: 640 },
]) {
  test(`E10: mobile width ${viewport.width}×${viewport.height}`, async ({ context }) => {
    const { a, b } = await startGame(context, { viewport });

    const check = async () => {
      for (const page of [a, b]) {
        expect(await noHorizontalScroll(page)).toBe(true);
        await expect(page.getByTestId('turn-indicator')).toBeVisible();
        await expect(page.getByTestId('boneyard-count')).toBeVisible();
        await expect(page.getByTestId('draw-button')).toBeVisible();
        await expect(page.getByTestId('pass-button')).toBeVisible();
        const tiles = page.locator('[data-testid^="hand-tile-"]');
        await expect(tiles.first()).toBeVisible();
        for (const tile of await tiles.all()) {
          expect((await tile.boundingBox())!.width).toBeGreaterThanOrEqual(40);
        }
      }
    };

    await check();
    await playStep(a, b);
    await playStep(a, b);
    await check();
  });
}

test('E11: reload restores the same table', async ({ context }) => {
  const { a, b } = await startGame(context);
  await playStep(a, b);
  await playStep(a, b);

  const before = await readTable(b);
  await b.reload();
  await expect(b.getByTestId('game-screen')).toBeVisible(TIMEOUT);
  await expect
    .poll(async () => {
      const { board, hand, boneyard, opp } = await readTable(b);
      return { board, hand, boneyard, opp };
    }, TIMEOUT)
    .toEqual({
      board: before.board,
      hand: before.hand,
      boneyard: before.boneyard,
      opp: before.opp,
    });

  await playStep(a, b);
});
