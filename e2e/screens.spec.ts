import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, type Page } from '@playwright/test';
import {
  checkLayout,
  KEY_IDS,
  LONG_A,
  newPlayer,
  playRoundToEnd,
  playStep,
  readTable,
  test,
  TIMEOUT,
  viewportFor,
} from './helpers';

/**
 * spec-13 S1: снимки ключевых экранов (`npm run screens`, MATCH_TARGET=30) — артефакт для
 * ревью, не визуальная регрессия. Перед каждым снимком — `checkLayout` (UI3/UI4).
 */
test.describe.configure({ timeout: 600_000 });

const OUT_DIR = resolve('docs/screens');
const MAX_ROUNDS = 15;

for (const width of [360, 1280] as const) {
  test(`S1: key screens @${width}`, async ({ browser }) => {
    const dir = resolve(OUT_DIR, String(width));
    mkdirSync(dir, { recursive: true });
    const viewport = viewportFor(width);
    const player = { viewport, soundOff: true } as const;
    const { page: a } = await newPlayer(browser, player);
    const { page: b } = await newPlayer(browser, player);

    const shot = async (page: Page, file: string, ids: string[]) => {
      expect(await checkLayout(page, ids), file).toEqual([]);
      await page.screenshot({ path: resolve(dir, file), fullPage: true });
    };

    await a.goto('/');
    await expect(a.getByTestId('connection-status')).toHaveText('connected', TIMEOUT);
    await a.getByTestId('name-input').fill(LONG_A);
    await shot(a, '01-home.png', KEY_IDS.home);

    await a.getByTestId('create-button').click();
    await expect(a.getByTestId('waiting-screen')).toBeVisible(TIMEOUT);
    await shot(a, '02-waiting.png', KEY_IDS.waiting);

    await b.goto(await a.getByTestId('invite-link').inputValue());
    await expect(b.getByTestId('join-screen')).toBeVisible(TIMEOUT);
    await expect(b.getByTestId('connection-status')).toHaveText('connected', TIMEOUT);
    await b.getByTestId('name-input').fill('Боб');
    await shot(b, '03-join.png', KEY_IDS.join);

    await b.getByTestId('join-button').click();
    for (const page of [a, b])
      await expect(page.getByTestId('turn-indicator')).toBeVisible(TIMEOUT);
    await shot(a, '04-table-start.png', KEY_IDS.table);

    for (let i = 0; i < 6 && !(await readTable(a)).summary; i++) await playStep(a, b);
    await shot(a, '05-table-mid.png', KEY_IDS.table);

    let roundShot = false;
    for (let round = 1; round <= MAX_ROUNDS; round++) {
      await playRoundToEnd(a, b);
      const matchOver = (await a.getByTestId('match-finished').count()) > 0;
      if (matchOver && roundShot) {
        await expect(a.getByTestId('match-finished')).toHaveText(/ · Счёт \d+ : \d+$/);
        await shot(a, '07-match-finished.png', KEY_IDS.summary);
        return;
      }
      if (!matchOver && !roundShot) {
        await shot(a, '06-round-summary.png', KEY_IDS.summary);
        roundShot = true;
      }
      // «Следующий раунд» / «Реванш» у обоих → новый раунд.
      for (const page of [a, b]) await page.getByTestId('continue-button').click();
      for (const page of [a, b]) {
        await expect(page.getByTestId('round-summary')).toHaveCount(0, TIMEOUT);
        await expect(page.getByTestId('turn-indicator')).toBeVisible(TIMEOUT);
      }
    }
    throw new Error(
      `S1: за ${MAX_ROUNDS} раундов не встретились итоги без конца матча и конец матча`,
    );
  });
}
