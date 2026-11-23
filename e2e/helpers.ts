import {
  test as base,
  devices,
  expect,
  type Browser,
  type BrowserContext,
  type Page,
} from '@playwright/test';

export const TIMEOUT = { timeout: 10_000 };
const INVITE_RE = /\/\?room=[A-HJ-NP-Z2-9]{6}$/;

export interface CreateGameOptions {
  /** spec-11: выбрать `turn-seconds-<N>` перед созданием; нет — значение по умолчанию (60 с). */
  turnSeconds?: number;
}

/** Вкладка A: «Создать игру» → экран ожидания; возвращает ссылку-приглашение. */
export async function createGame(
  page: Page,
  name: string,
  { turnSeconds }: CreateGameOptions = {},
): Promise<string> {
  await page.goto('/');
  await expect(page.getByTestId('connection-status')).toHaveText('connected', TIMEOUT);
  if (turnSeconds !== undefined) await page.getByTestId(`turn-seconds-${turnSeconds}`).check();
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

type StorageState = Awaited<ReturnType<BrowserContext['storageState']>>;

export interface PlayerOptions {
  viewport?: { width: number; height: number };
  /** Сохранённый `ctx.storageState()` — «тот же браузер» после закрытия (spec-9 X16). */
  storageState?: StorageState;
  /**
   * spec-10 §4.4: по умолчанию 'reduce' — полёты костей не запускаются, DOM обновляется
   * мгновенно; 'no-preference' — с анимациями (E17).
   */
  reducedMotion?: 'reduce' | 'no-preference';
}

/** Контексты, открытые `newPlayer` в текущем тесте; закрываются фикстурой `test` ниже. */
const openContexts = new Set<BrowserContext>();

/**
 * spec-9: место держится за браузером (localStorage), поэтому каждый игрок — отдельный
 * контекст (вкладки одного контекста — один игрок).
 */
export async function newPlayer(
  browser: Browser,
  { viewport, storageState, reducedMotion = 'reduce' }: PlayerOptions = {},
): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext({
    ...devices['Desktop Chrome'],
    baseURL: base.info().project.use.baseURL,
    permissions: ['clipboard-read', 'clipboard-write'],
    reducedMotion,
    ...(viewport ? { viewport } : {}),
    ...(storageState ? { storageState } : {}),
  });
  openContexts.add(context);
  context.once('close', () => openContexts.delete(context));
  return { context, page: await context.newPage() };
}

/** `test` с автоматическим закрытием контекстов `newPlayer` после каждого теста. */
export const test = base.extend<{ closePlayers: void }>({
  closePlayers: [
    // eslint-disable-next-line no-empty-pattern
    async ({}, use) => {
      await use();
      await Promise.all([...openContexts].map((context) => context.close()));
      openContexts.clear();
    },
    { auto: true },
  ],
});

export interface StartedGame {
  a: Page;
  b: Page;
  ctxA: BrowserContext;
  ctxB: BrowserContext;
  link: string;
}

/** A и B — в разных контекстах — встречаются в комнате; обе вкладки на столе. */
export async function startGame(
  browser: Browser,
  {
    viewport,
    reducedMotion,
    turnSeconds,
  }: Pick<PlayerOptions, 'viewport' | 'reducedMotion'> & CreateGameOptions = {},
): Promise<StartedGame> {
  const { context: ctxA, page: a } = await newPlayer(browser, { viewport, reducedMotion });
  const { context: ctxB, page: b } = await newPlayer(browser, { viewport, reducedMotion });
  const link = await createGame(a, 'Аня', { turnSeconds });
  await joinByLink(b, link, 'Боб');
  for (const page of [a, b]) {
    await expect(page.getByTestId('game-screen')).toBeVisible(TIMEOUT);
    await expect(page.getByTestId('turn-indicator')).toBeVisible(TIMEOUT);
  }
  return { a, b, ctxA, ctxB, link };
}

/** `data-testid` костей своей руки (`hand-tile-*`) в порядке DOM. */
export async function readHand(page: Page): Promise<string[]> {
  return page
    .locator('[data-testid^="hand-tile-"]')
    .evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-testid') ?? ''));
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
