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

/** spec-13 §4.4: ширины, на которых проверяется вёрстка. */
export const WIDTHS = [360, 390, 768, 1280] as const;
export type Width = (typeof WIDTHS)[number];

const VIEWPORT_HEIGHT: Record<Width, number> = { 360: 740, 390: 844, 768: 1024, 1280: 800 };

export function viewportFor(width: Width): { width: number; height: number } {
  return { width, height: VIEWPORT_HEIGHT[width] };
}

/** Нет горизонтального скролла страницы. */
export async function noHorizontalScroll(page: Page): Promise<boolean> {
  return page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
}

/** spec-13: NAME_MAX_LENGTH = 20 символов без пробелов. */
export const LONG_A = 'АнастасияАлександров';
export const LONG_B = 'Бобби-Длинноимённый1';

/** spec-13 §4.4: ключевые testid экранов для `checkLayout` (layout.spec и screens.spec). */
export const KEY_IDS = {
  home: ['name-input', 'create-button', 'turn-seconds', 'sound-toggle'],
  badLink: ['home-button', 'sound-toggle'],
  waiting: ['invite-link', 'copy-button', 'sound-toggle'],
  join: ['join-room-code', 'name-input', 'join-button', 'sound-toggle'],
  table: [
    'match-score',
    'players',
    'turn-indicator',
    'opponent-hand',
    'board',
    'boneyard',
    'draw-button',
    'pass-button',
    'reaction-toggle',
    'reaction-panel',
    'my-hand',
    'hand-tile-*',
    'end-left',
    'end-right',
  ],
  summary: [
    'match-score',
    'round-summary',
    'round-finished',
    'match-finished',
    'summary-hand-0',
    'summary-hand-1',
    'board',
    'continue-button',
    'board-tile-*',
  ],
};

export interface LayoutViolation {
  target: string;
  rule: 'horizontal-scroll' | 'min-height-44' | 'inside-viewport';
  value: number;
}

/**
 * spec-13 §4.4 `checkLayout`: (1) нет горизонтального скролла (UI4); (2) каждый видимый
 * button / текстовый input / `.turn-seconds-option` в `main` — не ниже 44 px (UI3);
 * (3) каждый видимый элемент из `keyTestIds` целиком по горизонтали внутри вьюпорта (UI4).
 * `prefix*` в `keyTestIds` — все элементы с testid, начинающимся на `prefix`.
 * Возвращает список нарушений; ожидается `[]`.
 */
export async function checkLayout(page: Page, keyTestIds: string[]): Promise<LayoutViolation[]> {
  return page.evaluate((ids) => {
    const violations: LayoutViolation[] = [];
    const root = document.documentElement;
    const width = root.clientWidth;
    if (root.scrollWidth > width) {
      violations.push({ target: 'document', rule: 'horizontal-scroll', value: root.scrollWidth });
    }
    const visible = (el: HTMLElement) =>
      el.offsetParent !== null || getComputedStyle(el).position === 'fixed';
    const describe = (el: HTMLElement) =>
      el.dataset.testid ?? `${el.tagName.toLowerCase()}.${el.className || '?'}`;

    const interactive = document.querySelectorAll<HTMLElement>(
      'main button, main input[type="text"], main input:not([type]), main .turn-seconds-option',
    );
    for (const el of interactive) {
      if (!visible(el)) continue;
      const height = el.getBoundingClientRect().height;
      if (height < 44)
        violations.push({ target: describe(el), rule: 'min-height-44', value: height });
    }

    for (const id of ids) {
      const selector = id.endsWith('*')
        ? `[data-testid^="${id.slice(0, -1)}"]`
        : `[data-testid="${id}"]`;
      for (const el of document.querySelectorAll<HTMLElement>(selector)) {
        if (!visible(el)) continue;
        const rect = el.getBoundingClientRect();
        if (rect.left < -0.5) {
          violations.push({ target: describe(el), rule: 'inside-viewport', value: rect.left });
        } else if (rect.right > width + 0.5) {
          violations.push({ target: describe(el), rule: 'inside-viewport', value: rect.right });
        }
      }
    }
    return violations;
  }, keyTestIds);
}

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
  /** spec-13 §4.4: выключить звук до загрузки страницы (стабильные скриншоты). */
  soundOff?: boolean;
}

/** Контексты, открытые `newPlayer` в текущем тесте; закрываются фикстурой `test` ниже. */
const openContexts = new Set<BrowserContext>();

/**
 * spec-9: место держится за браузером (localStorage), поэтому каждый игрок — отдельный
 * контекст (вкладки одного контекста — один игрок).
 */
export async function newPlayer(
  browser: Browser,
  { viewport, storageState, reducedMotion = 'reduce', soundOff = false }: PlayerOptions = {},
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
  if (soundOff) {
    await context.addInitScript(() => localStorage.setItem('domino:sound', 'off'));
  }
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
    soundOff,
    turnSeconds,
    names = ['Аня', 'Боб'],
  }: Pick<PlayerOptions, 'viewport' | 'reducedMotion' | 'soundOff'> &
    CreateGameOptions & {
      /** spec-13: имена A и B (по умолчанию «Аня» / «Боб»). */
      names?: [string, string];
    } = {},
): Promise<StartedGame> {
  const { context: ctxA, page: a } = await newPlayer(browser, {
    viewport,
    reducedMotion,
    soundOff,
  });
  const { context: ctxB, page: b } = await newPlayer(browser, {
    viewport,
    reducedMotion,
    soundOff,
  });
  const link = await createGame(a, names[0], { turnSeconds });
  await joinByLink(b, link, names[1]);
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

/** spec-12: открыть панель 💬 (если закрыта) и нажать реакцию `reaction-<id>`. */
export async function sendReaction(page: Page, id: string): Promise<void> {
  if (!(await page.getByTestId('reaction-panel').isVisible())) {
    await page.getByTestId('reaction-toggle').click();
  }
  await page.getByTestId(`reaction-${id}`).click();
}
