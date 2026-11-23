import { expect } from '@playwright/test';
import {
  currentMover,
  makeMove,
  newPlayer,
  readTable,
  startGame,
  test,
  TIMEOUT,
  type Table,
} from './helpers';

/** spec-11 §7.4: TURN_TIMER_TEST_SECONDS=3 в playwright.config.ts. */
const TEST_SECONDS = 3;
const AUTO = { timeout: 10_000 };

test.describe('turn timer (spec-11)', () => {
  test.skip(!!process.env.E2E_BASE_URL, 'нужен TURN_TIMER_TEST_SECONDS=3 на сервере');
  test.setTimeout(60_000);

  /** Стол (без счёта) — чтобы заметить авто-ход. */
  const snapshot = ({ board, boneyard, hand, opp, myTurn }: Table) =>
    JSON.stringify({ board, boneyard, hand, opp, myTurn });

  test('E19: nobody acts → the server moves for the idle player, twice in a row', async ({
    browser,
  }) => {
    const { a, b } = await startGame(browser, { turnSeconds: TEST_SECONDS });
    const { mover, other } = await currentMover(a, b);

    const timer = mover.getByTestId('turn-timer');
    await expect(timer).toBeVisible(TIMEOUT);
    await expect(timer).toHaveText(/^00:0[0-3]$/);
    await expect(timer).toHaveAttribute('data-urgent', 'true');
    await expect(mover.getByTestId('turn-seconds-label')).toHaveText('ход 3 с');

    // Первый авто-ход: обязательная первая кость легла на стол у обоих, ход перешёл.
    for (const page of [a, b]) await expect(page.getByTestId(/^board-tile-/)).toHaveCount(1, AUTO);
    await expect(other.getByTestId('turn-indicator')).toHaveAttribute('data-my-turn', 'true');
    await expect(mover.getByTestId('turn-indicator')).toHaveAttribute('data-my-turn', 'false');
    await expect(other.getByTestId('turn-timer')).toBeVisible();
    const afterFirst = await readTable(other);

    // Второй авто-ход — уже за другого игрока: стол или базар изменились, ход вернулся.
    await expect(mover.getByTestId('turn-indicator')).toHaveAttribute('data-my-turn', 'true', AUTO);
    const afterSecond = await readTable(other);
    expect(
      afterSecond.board !== afterFirst.board || afterSecond.boneyard !== afterFirst.boneyard,
    ).toBe(true);
  });

  test('E20: a manual move before the deadline is accepted; the idle opponent gets an auto-move', async ({
    browser,
  }) => {
    const { a, b } = await startGame(browser, { turnSeconds: TEST_SECONDS });
    const { mover, other } = await currentMover(a, b);
    expect(await makeMove(mover)).toBe('play');

    await expect(other.getByTestId('turn-indicator')).toHaveAttribute('data-my-turn', 'true');
    await expect(other.getByTestId('turn-timer')).toBeVisible();
    await expect(mover.getByTestId('turn-timer')).toBeVisible(); // у руки соперника
    expect(await mover.getByTestId('turn-timer').getAttribute('data-seat')).toBe(
      await other.getByTestId('turn-timer').getAttribute('data-seat'),
    );

    // Соперник бездействует — сервер ходит за него, ход возвращается.
    await expect(mover.getByTestId('turn-indicator')).toHaveAttribute('data-my-turn', 'true', AUTO);
  });

  test('E21: turn timer off → no countdown and nothing happens on its own', async ({ browser }) => {
    const { a, b } = await startGame(browser, { turnSeconds: 0 });
    for (const page of [a, b]) {
      await expect(page.getByTestId('turn-timer')).toHaveCount(0);
      await expect(page.getByTestId('turn-seconds-label')).toHaveCount(0);
    }
    const before = [snapshot(await readTable(a)), snapshot(await readTable(b))];
    await a.waitForTimeout(6_000);
    expect([snapshot(await readTable(a)), snapshot(await readTable(b))]).toEqual(before);
    await expect(a.getByTestId(/^board-tile-/)).toHaveCount(0);
  });

  test('E22: the timer pauses while a player is offline and resumes after the return', async ({
    browser,
  }) => {
    const { a, b, ctxA, ctxB, link } = await startGame(browser, { turnSeconds: TEST_SECONDS });
    const { mover } = await currentMover(a, b);
    const [staying, leavingCtx] = mover === a ? [b, ctxA] : [a, ctxB];
    const state = await leavingCtx.storageState();
    await leavingCtx.close();

    await expect(staying.getByTestId('opponent-offline')).toBeVisible(TIMEOUT);
    const timer = staying.getByTestId('turn-timer');
    await expect(timer).toHaveAttribute('data-paused', 'true', TIMEOUT);
    await expect(timer).toHaveText(/^пауза 00:0[0-3]$/);
    const paused = snapshot(await readTable(staying));
    await staying.waitForTimeout(6_000);
    expect(snapshot(await readTable(staying))).toBe(paused);
    await expect(timer).toHaveAttribute('data-paused', 'true');

    const { page: back } = await newPlayer(browser, { storageState: state });
    await back.goto(link);
    await expect(back.getByTestId('game-screen')).toBeVisible(TIMEOUT);
    await expect(staying.getByTestId('opponent-offline')).toBeHidden(TIMEOUT);
    await expect(staying.getByTestId('turn-timer')).toHaveAttribute('data-paused', 'false');
    // Отсчёт пошёл с остатка — авто-ход случился.
    await expect.poll(async () => snapshot(await readTable(staying)), AUTO).not.toBe(paused);
  });
});
