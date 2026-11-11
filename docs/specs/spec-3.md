# Spec #3 — Модель домино и правила (shared)

> Карточка: #3 (id 8066), теги `shared`, `rules`, приоритет high.
> Файл в репозитории после PR: `docs/specs/spec-3.md` (кладёт разработчик).
> Зависит от: #2 (каркас монорепо, уже в `main`). Используют: #4 (сервер), #6 (стол), #7 (конец партии).

## 1. Цель

Реализовать в `@domino/shared` чистую, детерминированную, сериализуемую модель **одного раунда** классического домино 1 на 1 (набор 0–6): кости, перемешивание по seed, раздача, базар, цепочка с двумя концами, проверка и применение ходов, первый ход, добор, пропуск, конец раунда (пустая рука / «рыба») и подсчёт очков. Без сети, без UI, без `Math.random`/`Date`. Каждое правило покрыто unit-тестом. Сервер (#4) будет вызывать только этот API и не дублировать правила.

## 2. Контекст (что уже есть)

- Монорепо из #2 (`docs/specs/spec-2.md`): npm workspaces, `shared/` без сборки (`exports: ./src/index.ts`), Vitest projects (`shared` — environment `node`, `include: src/**/*.test.ts`), strict TS c `noUncheckedIndexedAccess`, ESLint 9 + Prettier, CI `checks` + `e2e`.
- В `shared/src/` сейчас только `protocol.ts` (`server:hello`, `PROTOCOL_VERSION = 1`) и `index.ts` (реэкспорт).
- Игровой логики нет нигде. Комментариев к карточке нет.
- Сетевой цикл/комнаты — карточка #4; счёт партии из нескольких раундов, «до N очков» — карточка #7. Здесь — только раунд.

## 3. Правила раунда (нормативно)

| #   | Правило                                                                                                                                                                                                                                                                 |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1  | Набор — 28 костей `[a, b]`, `0 ≤ a ≤ b ≤ 6`, каждая ровно одна.                                                                                                                                                                                                         |
| R2  | Перемешивание — Fisher–Yates на ГПСЧ mulberry32 из 32-битного seed (алгоритм в 4.2). Одинаковый seed → одинаковая раздача на любой платформе.                                                                                                                           |
| R3  | Раздача: перемешанная колода, кости `[0..6]` → игроку 0, `[7..13]` → игроку 1, `[14..27]` → базар (порядок сохраняется; добор берёт `boneyard[0]`).                                                                                                                     |
| R4  | Первый ход: игрок, у которого старший дубль (6-6 > 5-5 > … > 0-0). Его первый ход **обязан** быть этой костью. Если дублей нет ни у кого — самая «тяжёлая» кость (макс. сумма; при равенстве — с большей старшей половиной, напр. 5-6 > … , 1-6 > 2-5 > 3-4).           |
| R5  | Кость можно положить на конец цепочки, если одна из её половин равна значению этого конца. Кость поворачивается так, чтобы совпадающая половина касалась конца. Цепочка линейная (без «спиннера»): у дубля тоже ровно два конца.                                        |
| R6  | Ход игрока — одно действие: `play` (положить кость), `draw` (взять из базара), `pass` (пропуск).                                                                                                                                                                        |
| R7  | `draw` разрешён, только если у игрока нет ни одного допустимого `play` и базар не пуст. Берётся одна кость; ход **остаётся** у того же игрока (он снова выбирает действие: `play` вытянутой/другой кости или ещё `draw`).                                               |
| R8  | `pass` разрешён, только если нет допустимого `play` и базар пуст. Ход переходит сопернику.                                                                                                                                                                              |
| R9  | Если есть допустимый `play`, игрок обязан сыграть (ни `draw`, ни `pass` нельзя). Какую кость и на какой конец — выбор игрока.                                                                                                                                           |
| R10 | После `play` ход переходит сопернику (если раунд не окончен).                                                                                                                                                                                                           |
| R11 | Конец раунда «домино» (`reason: 'domino'`): у игрока, только что сыгравшего, рука пуста. Он победитель.                                                                                                                                                                 |
| R12 | Конец раунда «рыба» (`reason: 'fish'`): базар пуст **и** ни у одного игрока нет допустимого `play`. Проверяется сразу после каждого `play`/`draw` (не нужно делать два `pass`). Победитель — у кого меньше сумма очков на руке; при равенстве — ничья (`winner: null`). |
| R13 | Очки руки — сумма всех половин всех костей (0-0 = 0). Победитель получает сумму очков на руке соперника: «домино» → очки руки проигравшего; «рыба» → очки руки проигравшего; ничья → 0.                                                                                 |
| R14 | После окончания раунда любые действия отклоняются.                                                                                                                                                                                                                      |
| R15 | Инвариант: в любом состоянии руки + базар + кости на столе = ровно 28 уникальных костей.                                                                                                                                                                                |

## 4. Изменения по пакетам

### 4.1 shared — структура

```
shared/src/
├─ index.ts              # + export * from './rules'
├─ protocol.ts           # без изменений
└─ rules/
   ├─ index.ts           # публичный API (реэкспорт ниже перечисленного)
   ├─ types.ts           # Pip, Tile, PlacedTile, PlayerIndex, Move, RoundState, RoundResult, MoveError …
   ├─ rng.ts             # createRng
   ├─ tiles.ts           # createDoubleSix, tileKey, sameTile, isDouble, tilePips, compareOpening
   ├─ deck.ts            # shuffle, deal
   ├─ board.ts           # boardEnds, canPlace, placeTile
   ├─ round.ts           # startRound, getLegalMoves, applyMove
   ├─ scoring.ts         # handPoints, resolveRound (внутр.)
   ├─ view.ts            # toPlayerView
   └─ *.test.ts          # рядом с модулями (см. раздел 7)
```

Требования ко всему модулю:

- **Чистые функции**, вход не мутируется (тест через `structuredClone`/`Object.freeze` до вызова и сравнение после).
- **JSON-сериализуемость**: состояние — только plain-объекты, массивы, числа, строки, `null` (нет `Map`, `Set`, классов, функций, `undefined`-полей). `JSON.parse(JSON.stringify(s))` эквивалентен `s`.
- Без `Math.random`, `Date`, `console`, зависимостей runtime. Без `throw` в `applyMove` для игровых ошибок — возвращается результат с кодом ошибки. `throw` (`Error`) допустим только на нарушение контракта вызова (некорректная колода в `startRound`, `seed` не целое).

### 4.2 Типы и API (контракт; имена — обязательные)

```ts
// types.ts
export type Pip = 0 | 1 | 2 | 3 | 4 | 5 | 6;
/** Каноническая форма: [low, high], low <= high. */
export type Tile = readonly [Pip, Pip];
export type PlayerIndex = 0 | 1;
export type End = 'left' | 'right';

/** Кость на столе в ориентации цепочки: left касается предыдущей, right — следующей. */
export interface PlacedTile {
  tile: Tile;
  left: Pip;
  right: Pip;
}

export type Move = { type: 'play'; tile: Tile; end: End } | { type: 'draw' } | { type: 'pass' };

export type RoundEndReason = 'domino' | 'fish';

export interface RoundResult {
  reason: RoundEndReason;
  winner: PlayerIndex | null; // null — ничья (только при 'fish')
  points: number; // очки победителю; 0 при ничьей
  handPoints: [number, number]; // очки рук игроков 0 и 1 на момент конца
}

export interface RoundState {
  hands: [Tile[], Tile[]];
  boneyard: Tile[]; // boneyard[0] — следующая к добору
  board: PlacedTile[]; // board[0] — левый край, board[at(-1)] — правый
  openingTile: Tile; // обязательная первая кость (R4)
  currentPlayer: PlayerIndex;
  status: 'playing' | 'finished';
  result: RoundResult | null; // != null ⇔ status === 'finished'
}

export type MoveError =
  | 'ROUND_FINISHED' // R14
  | 'NOT_YOUR_TURN'
  | 'TILE_NOT_IN_HAND'
  | 'MUST_PLAY_OPENING_TILE' // R4: первый ход не той костью
  | 'TILE_DOES_NOT_FIT' // R5
  | 'MUST_PLAY' // R9: draw/pass при наличии допустимого play
  | 'BONEYARD_EMPTY' // R7: draw при пустом базаре
  | 'BONEYARD_NOT_EMPTY'; // R8: pass при непустом базаре

export type ApplyResult = { ok: true; state: RoundState } | { ok: false; error: MoveError };
```

```ts
// rng.ts
/** mulberry32. Возвращает функцию → число в [0, 1). seed приводится `>>> 0`; нецелый seed → throw. */
export function createRng(seed: number): () => number;
```

Эталонная реализация mulberry32 (менять нельзя — от неё зависят golden-тесты):

```ts
let a = seed >>> 0;
return () => {
  a = (a + 0x6d2b79f5) >>> 0;
  let t = a;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
```

```ts
// tiles.ts
/** 28 костей в каноническом порядке: 0-0, 0-1, …, 0-6, 1-1, …, 6-6. */
export function createDoubleSix(): Tile[];
export function tileKey(t: Tile): string; // "3-5" (low-high); для любого порядка половин → каноническая строка
export function sameTile(a: Tile, b: Tile): boolean; // [5,3] и [3,5] — одна кость
export function isDouble(t: Tile): boolean;
export function tilePips(t: Tile): number; // a + b

// deck.ts
/** Fisher–Yates: for i = n-1 … 1: j = floor(rng() * (i + 1)); swap(i, j). Возвращает новый массив. */
export function shuffle<T>(items: readonly T[], rng: () => number): T[];

// board.ts
export function boardEnds(board: readonly PlacedTile[]): { left: Pip; right: Pip } | null; // null — пустой стол
export function canPlace(board: readonly PlacedTile[], tile: Tile, end: End): boolean; // пустой стол → true
/** Новый массив с повёрнутой костью. Предусловие canPlace === true, иначе throw. */
export function placeTile(board: readonly PlacedTile[], tile: Tile, end: End): PlacedTile[];

// round.ts
export interface StartRoundOptions {
  seed?: number; // используется, если deck не задан; по умолчанию 0
  deck?: readonly Tile[]; // готовый порядок 28 костей (для тестов); валидируется по R1, иначе throw
}
export function startRound(opts?: StartRoundOptions): RoundState;
/** Все допустимые ходы текущего игрока; [] если раунд окончен. */
export function getLegalMoves(state: RoundState): Move[];
export function applyMove(state: RoundState, player: PlayerIndex, move: Move): ApplyResult;

// scoring.ts
export function handPoints(hand: readonly Tile[]): number;

// view.ts
export interface PlayerView {
  you: PlayerIndex;
  hand: Tile[]; // своя рука полностью
  opponentHandCount: number;
  boneyardCount: number;
  board: PlacedTile[];
  currentPlayer: PlayerIndex;
  status: RoundState['status'];
  result: RoundResult | null; // при 'finished' — полностью (руки соперника раскрываются через handPoints)
  legalMoves: Move[]; // getLegalMoves, если currentPlayer === you, иначе []
}
export function toPlayerView(state: RoundState, player: PlayerIndex): PlayerView;
```

### 4.3 Поведение функций (детали, которые легко сделать по-разному)

**`placeTile`**

- Пустой стол: `{ tile, left: tile[0], right: tile[1] }` (каноническая форма → `left = low`), `end` игнорируется.
- `end: 'right'`, правый конец `r`: кладём в конец массива `{ tile, left: r, right: другая половина }`.
- `end: 'left'`, левый конец `l`: кладём в начало массива `{ tile, left: другая половина, right: l }`.
- Дубль: `left === right === pip`.
- `tile` на входе может быть в любом порядке (`[5,3]`); в `PlacedTile.tile` хранится каноническая форма.

**`startRound`**

1. `deck = opts.deck ?? shuffle(createDoubleSix(), createRng(opts.seed ?? 0))`.
2. Раздача по R3. Руки хранятся в порядке раздачи (сортировка — забота UI).
3. `openingTile` и `currentPlayer` по R4 (владелец `openingTile`).
4. `board: []`, `status: 'playing'`, `result: null`.

**`getLegalMoves`** (текущий игрок `p`)

- Пустой стол: ровно `[{ type: 'play', tile: openingTile, end: 'right' }]` (на пустом столе всегда `end: 'right'` — одна запись, без дублей).
- Иначе: для каждой кости руки (в порядке руки) и каждого конца (`left`, затем `right`), где `canPlace` — `play`. Если оба конца имеют одинаковое значение и кость подходит — **одна** запись с `end: 'right'` для недублей и дублей (результат цепочки различается только стороной; оставляем выбор `left` допустимым в `applyMove`, но список не дублирует). Для разных значений концов, если кость подходит к обоим, — две записи.
- Если `play` нет: базар не пуст → `[{ type: 'draw' }]`; пуст → `[{ type: 'pass' }]`.

**`applyMove`** — проверки строго в этом порядке (первая сработавшая даёт код):

1. `status === 'finished'` → `ROUND_FINISHED`.
2. `player !== currentPlayer` → `NOT_YOUR_TURN`.
3. `play`:
   1. кости нет в руке (`sameTile`) → `TILE_NOT_IN_HAND`;
   2. стол пуст и `!sameTile(tile, openingTile)` → `MUST_PLAY_OPENING_TILE`;
   3. `!canPlace` → `TILE_DOES_NOT_FIT`;
   4. убрать из руки, `placeTile`; пустая рука → конец по R11; иначе проверить «рыбу» (R12); иначе `currentPlayer` ← соперник.
4. `draw`: есть допустимый `play` → `MUST_PLAY`; базар пуст → `BONEYARD_EMPTY`; иначе перенести `boneyard[0]` в конец руки, `currentPlayer` не меняется, проверить «рыбу» (R12).
5. `pass`: есть допустимый `play` → `MUST_PLAY`; базар не пуст → `BONEYARD_NOT_EMPTY`; иначе `currentPlayer` ← соперник (рыба уже поймана бы на шаге 3/4 — после `pass` повторно проверять не нужно, но не вредно).
6. При завершении: `status: 'finished'`, `result` по R11–R13, `currentPlayer` не меняется.

Возвращаемое состояние — новый объект; неизменённые части можно переиспользовать по ссылке.

**`toPlayerView`** — не содержит ни одной кости соперника и базара (проверяется тестом по `JSON.stringify`), кроме случая `status === 'finished'`, когда в `result.handPoints` раскрыты только суммы.

### 4.4 server / client

Без изменений. Сервер начнёт использовать API в #4, клиент — `PlayerView`/`Move` в #6. `PROTOCOL_VERSION` не меняется.

## 5. Протокол

Не затрагивается: новых событий Socket.IO нет. Типы `Move`, `PlayerView`, `MoveError`, `RoundResult` — будущий payload событий #4 (`game:move`, `game:state`, `game:error`), поэтому обязаны оставаться JSON-сериализуемыми.

## 6. Критерии готовности

1. `import { startRound, applyMove, getLegalMoves, toPlayerView, createRng, createDoubleSix, shuffle, handPoints, boardEnds, canPlace, placeTile, tileKey, sameTile, isDouble, tilePips } from '@domino/shared'` и все типы из 4.2 компилируются в `server` и `client`.
2. Сигнатуры и имена совпадают с 4.2; коды ошибок — ровно 8 из `MoveError`.
3. `startRound({ seed: 42 })` даёт раздачу из golden-теста G1 (раздел 7) — бит в бит.
4. Каждое правило R1–R15 покрыто минимум одним тестом; ID правила указан в названии `it(...)` (напр. `'R7: draw keeps the turn'`). Grep `R1:`…`R15:` по `shared/src/rules/*.test.ts` находит все 15.
5. Property-тест P1 (раздел 7) проходит на 500 seed за < 5 с локально.
6. В `shared/src/rules` нет `Math.random`, `Date`, `console` (`rg 'Math\.random|Date|console' shared/src/rules` — пусто, кроме тестов при необходимости).
7. `npm run lint`, `npm run typecheck`, `npm test` — зелёные; CI `checks` и `e2e` зелёные на PR.
8. Существующие тесты (`protocol`, server, client) не изменены и проходят.
9. Спека лежит в `docs/specs/spec-3.md`; в README раздел «Структура» обновлён: «`shared/` — общие типы и правила раунда (`shared/src/rules`)».

## 7. Тест-кейсы

Все — unit (Vitest, проект `shared`). Для «ручных» раскладов используется `startRound({ deck })` и/или прямое построение `RoundState` хелпером в тестах (`makeState({...})`, файл `shared/src/rules/test-utils.ts`, исключается из публичного `index.ts`).

### Кости, ГПСЧ, перемешивание, раздача

| ID  | Правило | Кейс                                                         | Ожидание                                                                                 |
| --- | ------- | ------------------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| T1  | R1      | `createDoubleSix()`                                          | 28 костей, все `low ≤ high`, уникальные `tileKey`, 7 дублей, сумма всех очков = 168      |
| T2  | R1      | `tileKey([5,3])`, `sameTile([5,3],[3,5])`, `isDouble([4,4])` | `"3-5"`, `true`, `true`                                                                  |
| T3  | R2      | `createRng(1)` три вызова                                    | `0.6270739405881613`, `0.002735721180215478`, `0.5274470399599522`                       |
| T4  | R2      | два `createRng(7)`                                           | одинаковые последовательности из 100 чисел; все в `[0,1)`                                |
| T5  | R2      | `createRng(1.5)`                                             | throw                                                                                    |
| T6  | R2      | `shuffle` массива                                            | та же мультимножественность, вход не изменён, разные seed (1 и 2) → разный порядок       |
| G1  | R2, R3  | `startRound({ seed: 42 })`                                   | см. golden ниже                                                                          |
| T7  | R3      | `startRound({ seed })`                                       | `hands[0].length === 7`, `hands[1].length === 7`, `boneyard.length === 14`, `board = []` |
| T8  | R1      | `startRound({ deck })` с 27 костями / дублем кости / `[7,1]` | throw                                                                                    |

**G1 (golden, seed 42)**, записи в `tileKey`:

- `hands[0]`: `0-5 3-5 2-4 0-1 1-1 0-3 1-3`
- `hands[1]`: `1-4 4-6 0-0 5-5 3-3 3-6 0-2`
- `boneyard`: `3-4 1-5 2-3 4-5 1-2 2-6 2-2 0-6 5-6 0-4 6-6 4-4 1-6 2-5`
- `openingTile`: `5-5`, `currentPlayer`: `1`

(Контроль seed 1: `hands[0]` = `2-5 1-5 1-3 0-4 1-1 1-4 0-1`, `hands[1]` без дублей = `1-6 2-3 3-6 5-6 0-5 3-5 0-3` → `openingTile 1-1`, `currentPlayer 0`.)

### Первый ход

| ID  | Правило | Кейс                                                                                                    | Ожидание                                                |
| --- | ------- | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| F1  | R4      | у игрока 0 дубль 3-3, у игрока 1 дубль 6-6                                                              | `currentPlayer 1`, `openingTile 6-6`                    |
| F2  | R4      | дублей ни у кого; у 0 — `5-6`, у 1 — `4-6`                                                              | `openingTile 5-6`, `currentPlayer 0`                    |
| F3  | R4      | дублей нет; тяжелейшие `1-6` (у 0) и `2-5` (у 1) — сумма 7; все дубли и все кости с суммой ≥ 8 в базаре | `openingTile 1-6` (старшая половина 6 > 5)              |
| F4  | R4      | первый ход другой костью из руки                                                                        | `MUST_PLAY_OPENING_TILE`                                |
| F5  | R4      | `getLegalMoves` на пустом столе                                                                         | ровно `[{type:'play', tile: openingTile, end:'right'}]` |
| F6  | R4, R10 | первый ход `openingTile`                                                                                | `board` из 1 кости, `currentPlayer` сменился, рука −1   |

### Цепочка

| ID  | Правило | Кейс                                                   | Ожидание                                                    |
| --- | ------- | ------------------------------------------------------ | ----------------------------------------------------------- |
| B1  | R5      | `boardEnds([])`                                        | `null`                                                      |
| B2  | R5      | стол `[5\|5]`, `placeTile(…, [3,5], 'right')`          | `[{5,5},{left:5,right:3}]`, концы `5 / 3`                   |
| B3  | R5      | стол `[5\|5]`, `placeTile(…, [5,2], 'left')`           | `[{left:2,right:5},{5,5}]`, концы `2 / 5`, `tile` = `[2,5]` |
| B4  | R5      | `canPlace` кости без совпадений                        | `false`; `placeTile` → throw                                |
| B5  | R5      | дубль на конец: стол концы `2 / 3`, `[3,3]` на `right` | новый правый конец `3`                                      |
| B6  | R5      | вход `board` заморожен (`Object.freeze`)               | `placeTile` не бросает и не мутирует                        |

### Ходы, добор, пропуск

| ID  | Правило | Кейс                                                                          | Ожидание                                                                     |
| --- | ------- | ----------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| M1  | —       | ход не своим игроком                                                          | `NOT_YOUR_TURN`, состояние не изменилось                                     |
| M2  | —       | `play` кости, которой нет в руке                                              | `TILE_NOT_IN_HAND`                                                           |
| M3  | R5      | `play` неподходящей кости                                                     | `TILE_DOES_NOT_FIT`                                                          |
| M4  | R5      | `play` кости в виде `[5,3]` при руке с `[3,5]`                                | ok                                                                           |
| M5  | R9      | есть подходящая кость, `draw`                                                 | `MUST_PLAY`                                                                  |
| M6  | R9      | есть подходящая кость, `pass`                                                 | `MUST_PLAY`                                                                  |
| M7  | R7      | нет подходящих, базар не пуст, `draw`                                         | рука +1 (в конец, = прежний `boneyard[0]`), базар −1, `currentPlayer` тот же |
| M8  | R7      | вытянута неподходящая — снова `draw`; затем подходящая — `play`               | оба `draw` ok, после `play` ход у соперника                                  |
| M9  | R7      | нет подходящих, базар пуст, `draw`                                            | `BONEYARD_EMPTY`                                                             |
| M10 | R8      | нет подходящих, базар пуст, у соперника есть ход, `pass`                      | ok, `currentPlayer` сменился, остальное без изменений                        |
| M11 | R8      | нет подходящих, базар не пуст, `pass`                                         | `BONEYARD_NOT_EMPTY`                                                         |
| M12 | R6      | `getLegalMoves`: концы `2 / 4`, рука `[2,4],[1,2],[6,6]`                      | `play [2,4] left`, `play [2,4] right`, `play [1,2] left` (порядок как в 4.3) |
| M13 | R6      | `getLegalMoves`: концы `3 / 3`, рука `[3,5]`                                  | одна запись `play [3,5] right`; `applyMove(... end:'left')` тоже ok          |
| M14 | R6      | `getLegalMoves`: нет подходящих, базар есть / пуст                            | `[draw]` / `[pass]`                                                          |
| M15 | R6      | для 200 seed: каждый ход из `getLegalMoves` проходит `applyMove` с `ok: true` | все ok                                                                       |
| M16 | —       | `applyMove` не мутирует входное состояние (глубокий `Object.freeze`)          | без исключений, исходник равен копии до вызова                               |

### Конец раунда и очки

| ID  | Правило  | Кейс                                                                    | Ожидание                                                                                |
| --- | -------- | ----------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| E1  | R11, R13 | у игрока 0 последняя кость, он её играет; у 1 на руке `[6,6],[0,1]`     | `finished`, `{reason:'domino', winner:0, points:13, handPoints:[0,13]}`                 |
| E2  | R12, R13 | базар пуст, ни у кого нет хода после `play` игрока 0; суммы 0: 4, 1: 9  | `{reason:'fish', winner:0, points:9, handPoints:[4,9]}` сразу после `play` (без `pass`) |
| E3  | R12      | «рыба», суммы равны (7 и 7)                                             | `winner:null`, `points:0`                                                               |
| E4  | R12      | «рыба» наступает после `draw` последней кости базара (у обоих нет хода) | `finished`, `reason:'fish'`                                                             |
| E5  | R12      | базар пуст, у текущего нет хода, у соперника есть                       | не «рыба»: `status:'playing'`, легальный ход — `pass`                                   |
| E6  | R14      | любой `applyMove` после `finished`                                      | `ROUND_FINISHED` (даже для «чужого» игрока — проверка 1 раньше 2)                       |
| E7  | R14      | `getLegalMoves` после `finished`                                        | `[]`                                                                                    |
| E8  | R13      | `handPoints([])`, `handPoints([[0,0]])`, `handPoints([[6,6],[2,3]])`    | `0`, `0`, `17`                                                                          |
| E9  | R11      | последняя кость = выигрыш, даже если базар не пуст                      | `reason:'domino'`                                                                       |

### Свойства и представление

| ID  | Правило  | Кейс                                                                                                                                                         | Ожидание                                                                                                                                                                                                      |
| --- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P1  | R15, все | Симуляция: для seed 1…500 играть, выбирая на каждом шаге `getLegalMoves()[k]`, где `k = floor(rng() * len)` (`rng = createRng(seed + 10_000)`) до `finished` | на каждом шаге 28 уникальных костей (R15); соседние кости стыкуются (`board[i].right === board[i+1].left`); раунд завершается ≤ 100 действий; `result` согласован с руками; `JSON` round-trip равен состоянию |
| P2  | R2       | P1 дважды с одинаковыми seed                                                                                                                                 | идентичные финальные состояния                                                                                                                                                                                |
| V1  | —        | `toPlayerView(state, 0)` в середине раунда                                                                                                                   | `hand` = `hands[0]`; `opponentHandCount`, `boneyardCount` верны; в `JSON.stringify(view)` нет `tileKey` ни одной кости соперника/базара, которых нет на столе                                                 |
| V2  | —        | `toPlayerView` для не текущего игрока / текущего                                                                                                             | `legalMoves: []` / равно `getLegalMoves(state)`                                                                                                                                                               |

### Integration / e2e

Не требуются: сеть и UI не затрагиваются. Существующие `server`/`client`/e2e тесты должны остаться зелёными (критерий 8).

## 8. Порядок реализации (рекомендация)

1. `types.ts`, `tiles.ts`, `rng.ts`, `deck.ts` + T1–T8, G1.
2. `board.ts` + B1–B6.
3. `scoring.ts`, `round.ts` + F*, M*, E*.
4. `view.ts` + V1–V2; `test-utils.ts`; P1–P2.
5. Реэкспорт в `shared/src/index.ts`, README, `docs/specs/spec-3.md`.

## 9. Вне рамок

- Сеть, комнаты, события Socket.IO, хранение состояния на сервере (#4).
- UI стола, сортировка руки, анимации (#6).
- Партия из нескольких раундов, накопительный счёт, игра «до 101», кто начинает следующий раунд (#7).
- Варианты правил: «спиннер» (ход от дубля в 4 стороны), «Всё на пятёрку»/«Муггинс», «козлы», 3–4 игрока, наборы 0–9/0–12, особая стоимость 0-0 (25 очков), «яйца»/«рыба» с вычитанием, ограничение на число доборов.
- Перераздача при «плохой» руке (5+ дублей и т.п.).
- Таймеры хода, отмена хода, история ходов/реплей (`state` не хранит лог).
- Инструменты покрытия (`@vitest/coverage-v8`) и пороги coverage — покрытие правил контролируется трассировкой R1–R15 → тесты (критерий 4).

## 10. Допущения

1. Карточка описывает **один раунд**; «конец раунда и подсчёт очков» = результат раунда. Накопление очков по раундам — #7.
2. ГПСЧ — mulberry32, тасовка — Fisher–Yates «сверху вниз», раздача «первые 7 / следующие 7 / остальное» — выбраны ради простоты и воспроизводимости; golden-значения посчитаны по эталонной реализации из 4.2.
3. Игроки — индексы `0 | 1`; привязку к сокетам/именам делает сервер.
4. Первый ход обязан быть старшим дублем (а не «любой костью владельца дубля»). Без дублей (≈0,3 % раздач) — самая тяжёлая кость, без перераздачи.
5. Добор — по одной кости за действие, ход остаётся у игрока; брать «впрок» при наличии хода нельзя (R7/R9). Это даёт простую машину состояний и явные события для UI.
6. «Рыба» = базар пуст и ни у кого нет хода; детектируется сразу, без двух `pass` подряд. Победитель «рыбы» — меньшая сумма, получает сумму соперника (как в базовых правилах карточки); ничья — 0 очков.
7. Если концы цепочки одинаковые, `getLegalMoves` не дублирует ход для двух концов, но `applyMove` принимает любой конец — так UI не показывает «две одинаковые» подсказки.
8. `applyMove` возвращает код ошибки вместо исключения: сервер (#4) транслирует его клиенту как есть.
