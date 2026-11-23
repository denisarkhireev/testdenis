import { expect, type Page } from '@playwright/test';
import {
  checkLayout,
  currentMoverOf,
  expectTeamInvariants,
  joinByLink,
  newPlayer,
  noHorizontalScroll,
  playTeamRoundToEnd,
  playTeamStep,
  readHand,
  readTeamTable,
  sendReaction,
  startTeamGame,
  test,
  TIMEOUT,
} from './helpers';

// spec-17 §7.5: четыре браузерных контекста на одну комнату 2×2.
test.describe.configure({ timeout: 120_000 });

const SEEN = { timeout: 3_000 };

async function tables(pages: readonly Page[]) {
  return Promise.all(pages.map(readTeamTable));
}

test('E-T1: A создаёт «2 на 2», B/C/D входят по ссылке — у всех стол, напарник сверху', async ({
  browser,
}) => {
  const players = await Promise.all([0, 1, 2, 3].map(() => newPlayer(browser)));
  const [a, b, c, d] = players.map((p) => p.page) as [Page, Page, Page, Page];

  await a.goto('/');
  await expect(a.getByTestId('connection-status')).toHaveText('connected', TIMEOUT);
  await a.getByTestId('mode-choice-2x2').check();
  await expect(a.getByTestId('mode-hint')).toBeVisible();
  await expect(a.getByTestId('hand-size-choice-7')).toBeChecked();
  await a.getByTestId('name-input').fill('Аня');
  await expect(a.getByTestId('bot-button')).toBeDisabled();
  await a.getByTestId('create-button').click();
  await expect(a.getByTestId('waiting-count')).toHaveText('Ожидаем игроков: 1/4', TIMEOUT);
  const link = await a.getByTestId('invite-link').inputValue();

  await joinByLink(b, link, 'Боб');
  await joinByLink(c, link, 'Вера');
  for (const page of [a, b, c]) {
    await expect(page.getByTestId('waiting-count')).toHaveText('Ожидаем игроков: 3/4', TIMEOUT);
  }
  await expect(c.getByTestId('waiting-seat-2')).toHaveText(/Место 3 · Команда 1: Вера \(вы\)/);
  await expect(a.getByTestId('waiting-seat-3')).toHaveText(/свободно/);

  await joinByLink(d, link, 'Гена');
  for (const page of [a, b, c, d]) {
    await expect(page.getByTestId('game-screen')).toBeVisible(TIMEOUT);
  }
  await expect(a.getByTestId('seat-top').getByTestId('seat-name')).toHaveText('Вера');
  await expect(a.getByTestId('seat-top')).toContainText('(напарник)');
  await expect(a.getByTestId('seat-left').getByTestId('seat-name')).toHaveText('Боб');
  await expect(a.getByTestId('seat-right').getByTestId('seat-name')).toHaveText('Гена');
  await expect(a.getByTestId('match-score')).toContainText('Аня и Вера');
  await expect(a.getByTestId('match-score')).toContainText('Боб и Гена');
  for (const page of [a, b, c, d]) {
    await expect(page.getByTestId('boneyard')).toHaveCount(0);
    await expect(page.getByTestId('draw-button')).toHaveCount(0);
  }

  // Первый ход — у владельца 6:6: у него ровно одна подсвеченная кость — 6:6.
  const pages = [a, b, c, d];
  const mover = await currentMoverOf(pages);
  await expect(mover.locator('[data-playable="true"]')).toHaveCount(1);
  await expect(mover.locator('[data-playable="true"]')).toHaveAttribute(
    'data-testid',
    'hand-tile-6-6',
  );
  expectTeamInvariants(await tables(pages));
});

test('E-T2: четыре браузерных контекста делают по несколько ходов (8 шагов с инвариантами)', async ({
  browser,
}) => {
  const { pages } = await startTeamGame(browser);
  const movers: number[] = [];
  for (let step = 0; step < 8; step++) {
    const mover = await currentMoverOf(pages);
    movers.push(pages.indexOf(mover));
    await playTeamStep(pages);
    if ((await readTeamTable(pages[0])).summary) break;
  }
  // ход по кругу: каждое следующее место = предыдущее + 1
  for (let i = 1; i < movers.length; i++) expect(movers[i]).toBe((movers[i - 1]! + 1) % 4);
  if (movers.length === 8) {
    for (const seat of [0, 1, 2, 3]) {
      expect(movers.filter((m) => m === seat).length).toBeGreaterThanOrEqual(2);
    }
  }
});

test('E-T3: раунд до конца — итоги у всех 4, табло по командам, «Следующий раунд» от всех', async ({
  browser,
}) => {
  const { pages } = await startTeamGame(browser);
  await playTeamRoundToEnd(pages);
  const points = Number(await pages[0].getByTestId('round-points').textContent());
  for (const page of pages) {
    await expect(page.getByTestId('round-summary')).toBeVisible(TIMEOUT);
    for (const seat of [0, 1, 2, 3]) {
      await expect(page.getByTestId(`summary-hand-${seat}`)).toBeVisible();
    }
    await expect(page.getByTestId('round-points')).toHaveText(String(points));
  }
  const scores = (await tables(pages)).map((t) => t.scores);
  for (const s of scores) expect(s).toEqual(scores[0]);
  expect(Math.max(...scores[0]!)).toBe(points);

  for (const [i, page] of pages.entries()) {
    await page.getByTestId('continue-button').click();
    if (i < 3) {
      await expect(page.getByTestId('ready-status')).toHaveText(`Ждём остальных: ${i + 1}/4`);
    }
  }
  for (const page of pages) {
    await expect(page.getByTestId('match-round')).toHaveText('2', TIMEOUT);
    await expect(page.getByTestId('turn-indicator')).toBeVisible(TIMEOUT);
  }
  expectTeamInvariants(await tables(pages));
});

test('E-T4: пятый по ссылке видит «0 из 4» и получает «Все четыре места уже заняты»', async ({
  browser,
}) => {
  const { link } = await startTeamGame(browser);
  const { page: e } = await newPlayer(browser);
  await e.goto(link);
  await expect(e.getByTestId('join-free-seats')).toHaveText('Свободно мест: 0 из 4', TIMEOUT);
  await e.getByTestId('name-input').fill('Ева');
  await e.getByTestId('join-button').click();
  await expect(e.getByTestId('form-error')).toHaveText('Все четыре места уже заняты', TIMEOUT);
});

test('E-T5: C перезагружает вкладку посреди раунда — остальные видят «нет связи», C возвращается', async ({
  browser,
}) => {
  const { pages, contexts, link } = await startTeamGame(browser);
  await playTeamStep(pages);
  await playTeamStep(pages);
  const hand = await readHand(pages[2]);

  await pages[2].close();
  // У A — C напарник (сверху), у B — слева, у D — справа.
  await expect(pages[0].getByTestId('seat-top').getByTestId('seat-offline')).toBeVisible(TIMEOUT);
  await expect(pages[1].getByTestId('seat-left').getByTestId('seat-offline')).toBeVisible();
  await expect(pages[3].getByTestId('seat-right').getByTestId('seat-offline')).toBeVisible();
  await expect(pages[0].getByTestId('opponent-offline')).toContainText('Вера отключился');

  const c2 = await contexts[2]!.newPage();
  await c2.goto(link);
  await expect(c2.getByTestId('game-screen')).toBeVisible(TIMEOUT);
  expect(await readHand(c2)).toEqual(hand);
  const back = [pages[0], pages[1], c2, pages[3]];
  for (const page of back) await expect(page.getByTestId('seat-offline')).toHaveCount(0, TIMEOUT);
  await expect(pages[0].getByTestId('opponent-offline')).toHaveCount(0);

  await playTeamStep(back);
  await playTeamStep(back);
});

test('E-T6: таймер 3 с — никто не ходит, сервер кладёт 6:6, ход у следующего места', async ({
  browser,
}) => {
  test.skip(!!process.env.E2E_BASE_URL, 'нужен TURN_TIMER_TEST_SECONDS=3 на сервере');
  const { pages } = await startTeamGame(browser, { turnSeconds: 3 });
  const mover = await currentMoverOf(pages);
  const seat = pages.indexOf(mover);
  await expect(mover.getByTestId('turn-timer')).toBeVisible(TIMEOUT);
  // у остальных таймер — в блоке места ходящего
  const watcher = pages[(seat + 2) % 4]!;
  await expect(watcher.getByTestId('seat-top').getByTestId('turn-timer')).toBeVisible();

  for (const page of pages) {
    await expect(page.getByTestId('board-tile-0')).toBeVisible({ timeout: 10_000 });
  }
  const next = pages[(seat + 1) % 4]!;
  await expect(next.getByTestId('turn-indicator')).toHaveAttribute('data-my-turn', 'true', TIMEOUT);
  expectTeamInvariants(await tables(pages));
});

test('E-T7: реакция B — у A слева, у C справа, у D сверху', async ({ browser }) => {
  const { pages } = await startTeamGame(browser);
  const [a, b, c, d] = pages;
  await sendReaction(b, 'thumbs_up');
  await expect(a.getByTestId('seat-left').getByTestId('reaction-bubble-opponent')).toHaveText(
    '👍',
    SEEN,
  );
  await expect(c.getByTestId('seat-right').getByTestId('reaction-bubble-opponent')).toHaveText(
    '👍',
    SEEN,
  );
  await expect(d.getByTestId('seat-top').getByTestId('reaction-bubble-opponent')).toHaveText(
    '👍',
    SEEN,
  );
  await expect(b.getByTestId('reaction-bubble-mine')).toHaveText('👍', SEEN);
});

test('E-T8: 360 px — стол и итоги раунда без горизонтального скролла', async ({ browser }) => {
  const viewport = { width: 360, height: 740 };
  const { pages } = await startTeamGame(browser, {
    viewport,
    names: ['АнастасияАлександров', 'Бобби-Длинноимённый1', 'Вера', 'Геннадий-Длинное-Имя'],
  });
  const ids = ['seat-top', 'seat-left', 'seat-right', 'match-score', 'turn-indicator', 'board'];
  for (const page of pages) {
    expect(await noHorizontalScroll(page)).toBe(true);
    expect(await checkLayout(page, [...ids, 'pass-button', 'my-hand'])).toEqual([]);
  }
  await playTeamStep(pages);
  await playTeamStep(pages);
  for (const page of pages) expect(await checkLayout(page, ids)).toEqual([]);

  await playTeamRoundToEnd(pages);
  for (const page of pages) {
    expect(await noHorizontalScroll(page)).toBe(true);
    expect(
      await checkLayout(page, [
        'match-score',
        'round-summary',
        'round-finished',
        'continue-button',
      ]),
    ).toEqual([]);
  }
});
