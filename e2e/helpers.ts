import { expect, type BrowserContext, type Page } from '@playwright/test';

export const TIMEOUT = { timeout: 10_000 };
const INVITE_RE = /\/\?room=[A-HJ-NP-Z2-9]{6}$/;

/** Вкладка A: «Создать игру» → экран ожидания; возвращает ссылку-приглашение. */
export async function createGame(page: Page, name: string): Promise<string> {
  await page.goto('/');
  await expect(page.getByTestId('connection-status')).toHaveText('connected', TIMEOUT);
  await page.getByTestId('name-input').fill(name);
  await page.getByTestId('create-button').click();
  await expect(page.getByTestId('waiting-screen')).toBeVisible(TIMEOUT);
  const link = await page.getByTestId('invite-link').inputValue();
  expect(link).toMatch(INVITE_RE);
  return link;
}

/** Вкладка по ссылке: имя → «Войти». */
export async function joinByLink(page: Page, link: string, name: string): Promise<void> {
  await page.goto(link);
  await expect(page.getByTestId('join-screen')).toBeVisible(TIMEOUT);
  await expect(page.getByTestId('connection-status')).toHaveText('connected', TIMEOUT);
  await page.getByTestId('name-input').fill(name);
  await page.getByTestId('join-button').click();
}

export interface StartGameOptions {
  viewport?: { width: number; height: number };
}

/** Две вкладки одного контекста встречаются в комнате; обе — на столе. */
export async function startGame(
  context: BrowserContext,
  { viewport }: StartGameOptions = {},
): Promise<{ a: Page; b: Page }> {
  const a = await context.newPage();
  const b = await context.newPage();
  if (viewport) {
    await a.setViewportSize(viewport);
    await b.setViewportSize(viewport);
  }
  const link = await createGame(a, 'Аня');
  await joinByLink(b, link, 'Боб');
  for (const page of [a, b]) {
    await expect(page.getByTestId('game-screen')).toBeVisible(TIMEOUT);
    await expect(page.getByTestId('turn-indicator')).toBeVisible(TIMEOUT);
  }
  return { a, b };
}

export interface Table {
  hand: number;
  opp: number;
  boneyard: number;
  board: number;
  myTurn: boolean;
  /** Табло матча: место 0, место 1 (spec-7). */
  scores: [number, number];
  /** Показан экран итогов раунда (spec-7). */
  summary: boolean;
}

/** То, что нарисовано на столе вкладки. */
export async function readTable(page: Page): Promise<Table> {
  return page.evaluate(() => {
    const count = (selector: string) => document.querySelectorAll(selector).length;
    const indicator = document.querySelector('[data-testid="turn-indicator"]');
    return {
      hand: count('[data-testid^="hand-tile-"]'),
      opp: count('[data-testid="opponent-tile"]'),
      boneyard: Number(document.querySelector('[data-testid="boneyard-count"]')?.textContent),
      board: count('[data-testid^="board-tile-"]'),
      myTurn: indicator?.getAttribute('data-my-turn') === 'true',
      scores: [0, 1].map((seat) =>
        Number(document.querySelector(`[data-testid="match-score-${seat}"]`)?.textContent),
      ) as [number, number],
      summary: count('[data-testid="round-summary"]') > 0,
    };
  });
}

export type MoveKind = 'play' | 'draw' | 'pass';

/**
 * Seed-независимый ход по подсветке: первая играбельная кость (если просит конец — правый),
 * иначе активная из «Взять из базара» / «Пропустить».
 */
export async function makeMove(page: Page): Promise<MoveKind> {
  const playable = page.locator('[data-playable="true"]');
  if ((await playable.count()) > 0) {
    await playable.first().click();
    const endRight = page.getByTestId('end-right');
    if (await endRight.isVisible()) await endRight.click();
    return 'play';
  }
  if (await page.getByTestId('draw-button').isEnabled()) {
    await page.getByTestId('draw-button').click();
    return 'draw';
  }
  await expect(page.getByTestId('pass-button')).toBeEnabled();
  await page.getByTestId('pass-button').click();
  return 'pass';
}

/** Ходящая вкладка — ровно одна с `data-my-turn="true"`. */
export async function currentMover(a: Page, b: Page): Promise<{ mover: Page; other: Page }> {
  await expect
    .poll(async () => {
      const [ta, tb] = [await readTable(a), await readTable(b)];
      return Number(ta.myTurn) + Number(tb.myTurn);
    }, TIMEOUT)
    .toBe(1);
  return (await readTable(a)).myTurn ? { mover: a, other: b } : { mover: b, other: a };
}

function expectTotal(table: Table) {
  expect(table.hand + table.opp + table.boneyard + table.board).toBe(28);
}

/**
 * Ждёт, пока вкладка нарисует ожидаемое (`toMatchObject`) — или экран итогов,
 * если ход закончил раунд (руки тогда показываются только в `round-summary`).
 */
async function expectSettled(page: Page, expected: Partial<Table>): Promise<void> {
  await expect
    .poll(async () => {
      const table = await readTable(page);
      if (table.summary) return true;
      return Object.entries(expected).every(([key, value]) => table[key as keyof Table] === value);
    }, TIMEOUT)
    .toBe(true);
}

/**
 * Один ход ходящей вкладки с проверкой инвариантов на обеих вкладках (E8).
 * Ждёт, пока обе вкладки нарисуют результат хода. Если ход закончил раунд —
 * ждёт `round-summary` на обеих, инварианты стола не проверяются (spec-7 §4.4).
 */
export async function playStep(a: Page, b: Page): Promise<MoveKind> {
  const { mover, other } = await currentMover(a, b);
  const before = await readTable(mover);
  const kind = await makeMove(mover);

  if (kind === 'play') {
    await expectSettled(mover, { board: before.board + 1, hand: before.hand - 1 });
    await expectSettled(other, { board: before.board + 1, opp: before.hand - 1 });
  } else if (kind === 'draw') {
    await expectSettled(mover, {
      hand: before.hand + 1,
      boneyard: before.boneyard - 1,
      myTurn: true,
    });
    await expectSettled(other, {
      opp: before.hand + 1,
      boneyard: before.boneyard - 1,
      myTurn: false,
    });
  } else {
    await expectSettled(other, { myTurn: true });
  }

  if ((await readTable(mover)).summary || (await readTable(other)).summary) {
    for (const page of [mover, other]) {
      await expect(page.getByTestId('round-summary')).toBeVisible(TIMEOUT);
    }
    return kind;
  }

  const [tm, to] = [await readTable(mover), await readTable(other)];
  expectTotal(tm);
  expectTotal(to);
  expect(tm.opp).toBe(to.hand);
  expect(to.opp).toBe(tm.hand);
  expect(tm.board).toBe(to.board);
  expect(tm.boneyard).toBe(to.boneyard);
  if (kind === 'play') {
    // ход перешёл
    expect(tm.myTurn).toBe(false);
    expect(to.myTurn).toBe(true);
  }
  return kind;
}

/** spec-7: `playStep`, пока на обеих вкладках не появится `round-summary`. */
export async function playRoundToEnd(a: Page, b: Page, maxSteps = 200): Promise<number> {
  for (let steps = 0; steps < maxSteps; steps++) {
    const [ta, tb] = [await readTable(a), await readTable(b)];
    if (ta.summary && tb.summary) return steps;
    await playStep(a, b);
  }
  throw new Error(`round did not finish in ${maxSteps} steps`);
}
