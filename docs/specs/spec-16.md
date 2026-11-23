# Spec #16 — Вариант правил «Козёл»

> Карточка: #16 (id 10169), теги `shared`, `server`, `client`, приоритет low.
> Файл в репозитории после PR: `docs/specs/spec-16.md` (кладёт разработчик).
> Зависит от: #14 (настройки комнаты — **образец для всего, что ниже**: `RoomSettings`, `room:info`, `RoomSettingsLine`, радиогруппы `HomeScreen`), #15 (бот — должен играть в обоих вариантах без изменений), #7 (матч и итоги раунда).
> Ветки #8 → #15 стековые и на момент написания **не смержены** в `main`. **Ветку `task-16-kozel` создавать от `main` после merge #15**; если он ещё открыт — от `origin/task-15-bot` и потом rebase. Все ссылки на код — по состоянию `task-15-bot`.

## 1. Цель

1. Правила подсчёта очков и конца матча вынести в подключаемый **вариант правил** (`RulesVariant`) в `shared/src/rules/variants/`. Вариант по умолчанию — `classic`, поведение классики не меняется ни в одном бите.
2. Реализовать вариант `kozel` («Козёл») для двоих: очки записываются **проигравшему** раунд, матч **проигрывает** тот, кто первым наберёт цель.
3. Создатель комнаты выбирает «Классика / Козёл» вместе с остальными настройками; вариант виден второму игроку до входа, на экране ожидания, на табло и учтён в текстах итогов.

## 2. Контекст (что уже есть)

| Что                                                                                                                                           | Где                                                                             | Что делаем в #16                                                                     |
| --------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `resolveRound(reason, hands, dominoWinner?)` → `RoundResult { reason, winner, points, handPoints }` — классический итог (R11–R13)             | `shared/src/rules/scoring.ts`                                                   | Становится `classic.resolveRound`; сам код не меняется                               |
| `applyMove(state, player, move)` вызывает `resolveRound` в `applyPlay` (домино) и `finishIfFish` (рыба)                                       | `shared/src/rules/round.ts`                                                     | 4-й необязательный параметр `variant = classicVariant`                               |
| `recordRound(match, result)` — очки победителю раунда, `winner` матча = кто достиг `target`; `forfeitMatch`, `createMatch`, `nextRoundNumber` | `shared/src/rules/match.ts`                                                     | Становится `classic.recordRound`; `MatchState` **не меняется** (M1 делает `toEqual`) |
| Настройки комнаты: `RoomSettings { matchTarget, handSize, turnSeconds }`, `parseOption`, `Room.*`, `room:info`, плоские поля в `room:state`   | `shared/src/protocol.ts`, `server/src/rooms/{validate,handlers,RoomManager}.ts` | Ещё одна настройка `variant` — **так же**                                            |
| `RoomManager.apply()` — единственная точка `applyMove` + `recordRound` (ручной ход, авто-ход по таймеру, бот)                                 | `server/src/rooms/RoomManager.ts`                                               | Передаёт вариант комнаты                                                             |
| `HomeScreen`: `ChoiceGroup` (числовые варианты), `useChoice`, `storage.ts` (`loadInteger`)                                                    | `client/src/lobby/screens/HomeScreen.tsx`, `client/src/lobby/storage.ts`        | Группа «Правила»; `ChoiceGroup` — обобщить на `string \| number`                     |
| `RoomSettingsLine` «Матч до 101 · 7 костей в руке · ход 60 с»                                                                                 | `client/src/lobby/RoomSettingsLine.tsx` (Join/Waiting)                          | Префикс «Классика · » / «Козёл · »                                                   |
| `MatchScore` «Аня 34 : 12 Боб · до 101 · по 5 костей · Раунд 3 · ход 60 с»                                                                    | `client/src/game/MatchScore.tsx`                                                | Пункт варианта                                                                       |
| `RoundSummary`: `roundTitle` («Вы выиграли раунд: +13 (домино)»), `match-finished` («Вы выиграли матч!»)                                      | `client/src/game/RoundSummary.tsx`                                              | Тексты для «Козла»                                                                   |
| Бот `pickBotMove` / авто-ход `pickAutoMove` — только `getLegalMoves` и руки                                                                   | `shared/src/rules/{bot,autoMove}.ts`                                            | Без изменений (ходы в обоих вариантах одинаковые)                                    |
| e2e: `createGame` / `createBotGame` / `startGame` с опциями `{ turnSeconds, matchTarget, handSize }`, `playRoundToEnd`, `playRoundVsBot`      | `e2e/helpers.ts`                                                                | Опция `variant`                                                                      |

## 3. Правила «Козла» (нормативно)

ID `K*` — в именах тестов (`'K3: …'`). Всё, что не сказано ниже, — как в классике (spec-3 R1–R15, spec-7 M*, spec-14 S*).

| ID  | Правило                                                                                                                                                                                                                                                                                                                    |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| K1  | **Ход игры идентичен классике**: набор 0–6, раздача по `room.handSize` (spec-14 S4), первый ход — старший дубль / старшая кость (R4), приставление, добор из базара, пропуск при пустом базаре, условие «рыбы» (R12), коды ошибок ходов. Отличаются только итог раунда (K2–K4) и конец матча (K5–K6).                      |
| K2  | **Домино** (игрок выложил последнюю кость): `winner` = вышедший, **очки записываются сопернику** (`scorer = 1 − winner`), `points = handPoints[scorer]` (сумма всех половин его костей, R13).                                                                                                                              |
| K3  | **Рыба**, суммы на руках различаются: `winner` = у кого сумма **меньше**, очки записываются тому, у кого **больше** (`scorer`), `points = handPoints[scorer]` — **только его собственная** сумма (руку соперника не прибавляем).                                                                                           |
| K4  | **Рыба**, суммы равны: `winner = null`, `scorer = null`, `points = 0` — никому ничего не записывается.                                                                                                                                                                                                                     |
| K5  | Матч: `scores[scorer] += points` после каждого раунда. Как только `scores[scorer] ≥ target` — матч окончен; этот игрок — **«козёл»** (проиграл), `match.winner = 1 − scorer`. Раунд с `points = 0` (в т.ч. K4) матч не заканчивает. За раунд очки получает не более одного игрока, поэтому «одновременно двое» невозможно. |
| K6  | Цель матча — та же настройка комнаты (`matchTarget`, 51/101/151, spec-14 S1–S2), но смысл обратный: «до N» — до N очков **проигрыша**. Техническое поражение (spec-9 RC5) — как в классике: `winner = 1 − forfeit`.                                                                                                        |
| K7  | Вариант — настройка комнаты: задаётся только в `room:create`, хранится в `Room`, не меняется до закрытия комнаты (следующий раунд, реванш, переподключение) — как spec-14 S1.                                                                                                                                              |
| K8  | `room:create` без поля `variant` → `'classic'`. Поле есть, но не из `['classic', 'kozel']` (`'KOZEL'`, `1`, `null`, `''`) → ack `{ ok: false, error: 'INVALID_PAYLOAD' }`, комната не создаётся.                                                                                                                           |
| K9  | Вариант доступен и для игры с ботом (spec-15): бот выбирает ход так же (`pickBotMove`), авто-готовность бота — как есть.                                                                                                                                                                                                   |

Пример (руки на конец раунда, цель 101):

| Ситуация                                  | `handPoints` | Классика                   | Козёл                                             |
| ----------------------------------------- | ------------ | -------------------------- | ------------------------------------------------- |
| Игрок 0 вышел (домино)                    | `[0, 13]`    | winner 0, +13 игроку 0     | winner 0, scorer 1, +13 игроку 1                  |
| Рыба                                      | `[4, 9]`     | winner 0, +9 игроку 0      | winner 0, scorer 1, +9 игроку 1                   |
| Рыба, поровну                             | `[7, 7]`     | ничья, 0                   | ничья, scorer null, 0                             |
| Счёт 95 : 40, игрок 0 получает +9 (→ 104) | —            | (классика: матч выиграл 0) | матч окончен, игрок 0 — козёл, `match.winner = 1` |

## 4. Изменения по пакетам

### 4.1 shared

**Новая папка `shared/src/rules/variants/`:**

```ts
// variants/types.ts
import type { MatchState } from '../match';
import type { PlayerIndex, RoundEndReason, RoundResult, Tile } from '../types';

export type VariantId = 'classic' | 'kozel';

/** Подключаемая часть правил: итог раунда и начисление очков в матч. Ходы — общие (K1). */
export interface RulesVariant {
  id: VariantId;
  /** Итог раунда по причине конца и рукам. dominoWinner — сыгравший последнюю кость. */
  resolveRound(
    reason: RoundEndReason,
    hands: readonly [readonly Tile[], readonly Tile[]],
    dominoWinner?: PlayerIndex,
  ): RoundResult;
  /** Записать итог раунда в матч, определить конец матча. Вход не мутируется; оконченный матч — throw. */
  recordRound(match: MatchState, result: RoundResult): MatchState;
}
```

```ts
// variants/classic.ts — ровно существующие функции, без копирования логики
export const classicVariant: RulesVariant = { id: 'classic', resolveRound, recordRound };

// variants/kozel.ts — K2–K5
export const kozelVariant: RulesVariant = {
  id: 'kozel',
  resolveRound: resolveKozelRound,
  recordRound: recordKozelRound,
};

// variants/index.ts
export const VARIANT_IDS: readonly VariantId[] = ['classic', 'kozel'];
export const DEFAULT_VARIANT: VariantId = 'classic';
/** Неизвестный id → throw (сервер передаёт только проверенное). */
export function getVariant(id: VariantId): RulesVariant;
/** spec-16: кому записаны очки раунда; для классики (поля нет) — winner. */
export function roundScorer(result: RoundResult): PlayerIndex | null;
```

**`shared/src/rules/types.ts`** — в `RoundResult` одно **необязательное** поле (классика его не заполняет, поэтому все `toEqual` классики остаются верными):

```ts
export interface RoundResult {
  reason: RoundEndReason;
  /** null — ничья (только при 'fish'). В «Козле» — тоже тот, кто вышел / у кого меньше (K2, K3). */
  winner: PlayerIndex | null;
  /** Очки раунда: классика — победителю, «Козёл» — scorer'у. 0 при ничьей. */
  points: number;
  handPoints: [number, number];
  /** spec-16: кому записаны points. Нет поля ⇒ winner (классика). «Козёл» заполняет всегда (null при K4). */
  scorer?: PlayerIndex | null;
}
```

- `resolveKozelRound`: `winner` вычисляется так же, как в классике (можно вызвать классический `resolveRound` и переложить), затем `scorer = winner === null ? null : 1 − winner`, `points = scorer === null ? 0 : handPoints[scorer]`.
- `recordKozelRound`: `throw`, если `match.winner !== null`; `scorer = roundScorer(result)`; `null` → только добавить итог в `rounds`; иначе `scores[scorer] += points`, при `scores[scorer] ≥ target` → `winner = 1 − scorer`. Поля `MatchState` те же (`forfeit` не трогаем).

**`shared/src/rules/round.ts`** — `applyMove(state, player, move, variant: RulesVariant = classicVariant)`; `variant` пробрасывается в `applyPlay` и `finishIfFish` (`applyDraw`, `applyPass` вызывают `finishIfFish`) вместо прямого вызова `resolveRound`. `RoundState` **не меняется** (вариант не хранится в состоянии раунда — оно остаётся plain JSON). `startRound`, `getLegalMoves` — без изменений.

**`shared/src/rules/match.ts`** — без изменений (`recordRound` остаётся экспортом и реализацией классики).

**`shared/src/rules/index.ts`** — экспорт `VariantId`, `RulesVariant`, `VARIANT_IDS`, `DEFAULT_VARIANT`, `getVariant`, `classicVariant`, `kozelVariant`, `roundScorer`.

**`shared/src/protocol.ts`** (рядом с `HAND_SIZE_OPTIONS`):

```ts
/** spec-16 K8: варианты правил для экрана создания. */
export const VARIANT_OPTIONS: readonly VariantId[] = VARIANT_IDS;

export interface RoomSettings {
  matchTarget: number;
  handSize: number;
  turnSeconds: number;
  /** spec-16 K7 */
  variant: VariantId;
}

export interface RoomCreatePayload {
  // …существующие поля…
  /** spec-16 K8: нет — 'classic'; не из VARIANT_OPTIONS — INVALID_PAYLOAD. */
  variant?: VariantId;
}

export interface RoomStatePayload {
  // …существующие поля…
  /** spec-16 K7: вариант правил комнаты, во всех фазах. */
  variant: VariantId;
}
```

`server:hello` **не** расширяем: список вариантов фиксированный (нет тестовых значений из env, в отличие от `matchTargetOptions`) — клиент берёт `VARIANT_OPTIONS` из shared. `PROTOCOL_VERSION` не меняем (как в spec-11/14).

### 4.2 server

**`server/src/rooms/validate.ts`** — по образцу `parseOpponent`:

```ts
/** spec-16 K8: нет поля — 'classic'; иначе один из VARIANT_OPTIONS, прочее — fail. */
export function parseVariant(value: unknown): Parsed<VariantId>;
```

**`server/src/rooms/RoomManager.ts`**:

| Место                                 | Изменение                                                                                                                                                                                               |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Room`                                | `variant: VariantId` (K7; комментарий «не меняется до закрытия»)                                                                                                                                        |
| `create(socketId, name, settings)`    | Умолчание `variant = DEFAULT_VARIANT`; сохраняет в `room.variant`. Старые вызовы без `variant` (тесты) — классика                                                                                       |
| `createWithBot` (spec-15)             | Принимает и сохраняет `variant` так же                                                                                                                                                                  |
| `info(roomId)`                        | + `variant: room.variant`                                                                                                                                                                               |
| `apply(room, seat, move)`             | `const variant = getVariant(room.variant)`; `applyMove(previous, seat, move, variant)`; `room.match = variant.recordRound(room.match, result.state.result!)`. Остальное (B7 — готовность бота) как есть |
| `join` / `ready` (реванш) / `forfeit` | Без изменений: `createMatch(room.matchTarget)`, `forfeitMatch` одинаковы для обоих вариантов (K6)                                                                                                       |

**`server/src/rooms/handlers.ts`**:

- `room:create`: `const variant = parseVariant(payload.variant)`; `!variant.ok` → `INVALID_PAYLOAD` (в общее условие с `turnSeconds/matchTarget/handSize/opponent`); передать в `create`/`createWithBot`. Лог: `room X created (kozel, target 101, hand 7, turn 60s)`.
- `toRoomState`: `variant: room.variant`.
- `room:info` — значение придёт из `RoomManager.info` автоматически.

`app.ts`, `config.ts`, `index.ts` — без изменений (новых env нет).

### 4.3 client

**`client/src/lobby/screens/HomeScreen.tsx`** — первой (над «Играем до») радиогруппа:

| Группа  | legend    | Варианты (подпись)                        | testid группы / варианта                                            | По умолчанию                            |
| ------- | --------- | ----------------------------------------- | ------------------------------------------------------------------- | --------------------------------------- |
| Правила | «Правила» | `classic` → «Классика», `kozel` → «Козёл» | `variant-choice` / `variant-choice-classic`, `variant-choice-kozel` | сохранённое (если в списке) → `classic` |

- `ChoiceGroup`/`useChoice` сделать обобщёнными (`<T extends string | number>`); числовые группы работают как раньше (testid, `value`, классы `.lobby-option` — те же).
- Под группой — одна строка-подсказка `data-testid="variant-hint"` (класс `lobby-hint`, мелкий текст):
  - классика: «Очки получает победитель раунда; выигрывает набравший цель.»
  - козёл: «Очки записываются проигравшему раунда; кто первым наберёт цель — козёл и проиграл.»
- `storage.ts`: `loadVariant/saveVariant` (ключ `domino:variant`), try/catch; значение не из `VARIANT_OPTIONS` → `null`. Сохраняется при «Создать игру» / «Играть с ботом».
- `onCreate(name, settings, opponent)` — `settings` уже `RoomSettings`, теперь с `variant`; `createRoom(socket, { name, ...settings, opponent })` — без изменений по форме.
- Подписи вариантов — общая функция `variantLabel(id): string` в `client/src/lobby/variant.ts` (используют `HomeScreen`, `RoomSettingsLine`, `MatchScore`).

**`RoomSettingsLine`** — префикс варианта: «**Козёл** · Матч до 101 · 7 костей в руке · ход 60 с» / «**Классика** · Матч до …» (`data-testid="<testId>-variant"`). Остальная строка без изменений (существующие `toHaveTextContent` — подстрочные, остаются зелёными). Используется в `JoinScreen` (`join-settings`) и `WaitingScreen` (`waiting-settings`) — передать `variant` из `room:info` / `room:state`.

**`MatchScore`** — проп `variant?: VariantId` (по умолчанию `classic`); **первым** пунктом `.match-score-meta`: `<span className="match-score-item" data-testid="variant-label">Классика|Козёл</span>`, дальше «до N» и т.д. Показывается всегда (критерий карточки «вариант виден на табло»). `GameTable` передаёт `room.variant`.

**`RoundSummary`** — проп `variant?: VariantId` (по умолчанию `classic`; при `classic` тексты **не меняются**). Для `kozel` (`scorer = roundScorer(result)`, `why = ' (домино)' | ' (рыба)'`):

| Элемент                         | Условие                          | Текст                                                    |
| ------------------------------- | -------------------------------- | -------------------------------------------------------- |
| `round-finished`                | `scorer === null`                | «Рыба — ничья, очков никому»                             |
|                                 | `scorer === you`                 | «Очки записаны вам: +{points}{why}»                      |
|                                 | `scorer === opponent`            | «Очки записаны: {имя соперника} +{points}{why}»          |
| `round-points`                  | всегда                           | как есть: «Очки за раунд: {points}»                      |
| `match-finished` (матч окончен) | проигравший (`1 − winner`) = you | «Вы — козёл! Матч выиграл {имя} · Счёт A : B»            |
|                                 | проигравший = соперник           | «Вы выиграли матч! {имя соперника} — козёл · Счёт A : B» |

Кнопки «Следующий раунд» / «Реванш», `ready-status`, руки и их суммы — без изменений. `ForfeitSummary` — без изменений.

**Фикстуры** `client/src/test/fixtures.ts`: в `RoomStatePayload` добавить `variant: 'classic'`.

### 4.4 e2e

- `e2e/helpers.ts`: `CreateGameOptions.variant?: VariantId` — `check()` на `variant-choice-<id>`, если задан, в `createGame`, `createBotGame`; `startGame` прокидывает. `KEY_IDS` для экрана создания — добавить `variant-choice`.
- Новый `e2e/kozel.spec.ts` (сценарии §7.5). `playwright.config.ts` — без изменений.
- `layout.spec.ts`: экран создания с четырьмя группами и табло с пунктом варианта — на 360 / 1280 px без горизонтального скролла, варианты ≥ 44 px (UI3).

## 5. Протокол

| Событие       | Направление | Изменение payload                          | Ответ / смысл                                                                                    |
| ------------- | ----------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------ |
| `room:create` | C → S       | + `variant?: 'classic' \| 'kozel'`         | ack как раньше; нет поля → `classic`; иное значение → `INVALID_PAYLOAD`, комната не создана (K8) |
| `room:info`   | C → S       | —                                          | `settings` + `variant` (`{ matchTarget, handSize, turnSeconds, variant }`)                       |
| `room:state`  | S → C       | + `variant: VariantId`                     | во всех фазах, включая `waiting` (K7)                                                            |
| `room:state`  | S → C       | `game.result.scorer?` (только при `kozel`) | кому записаны `points`; в классике поля нет                                                      |

Остальные события (`room:join`, `room:rejoin`, `game:move`, `game:ready`, `game:react`, `server:hello`, `room:closed`, `room:reaction`) не меняются. README: строка про выбор правил в «Как сыграть с другом» п.1; раздел «Правила раунда» — абзац про `RulesVariant` и правила «Козла» со ссылкой на `spec-16`; таблицу протокола — `variant?` в `room:create`.

## 6. Критерии готовности

1. Существующие тесты классики зелёные **без изменений**: `git diff main -- shared/src/rules/*.test.ts` не содержит правок существующих тестов (только новые файлы / новые `describe`), существующие `e2e/*.spec.ts` не изменены. В тестах сервера/клиента, сравнивающих payload целиком (`toEqual` на `room:info`, фикстура `RoomStatePayload`), допускается **только** добавление поля `variant: 'classic'`.
2. `applyMove` без 4-го аргумента и с `classicVariant` даёт идентичные `RoundState` (property-тест по seed); `getVariant('classic').recordRound === recordRound`.
3. `kozelVariant.resolveRound` и `recordRound` проходят unit-тесты K2–K5 (§7.1), включая равную рыбу и окончание матча «козлом».
4. `room:create` без `variant` → комната `classic`; с `variant: 'kozel'` → `room:state.variant = 'kozel'` у обоих игроков во всех фазах, в `room:info`, после «Следующий раунд», после реванша и после переподключения.
5. `room:create` с `variant` не из списка → `INVALID_PAYLOAD`, комната не создана.
6. В комнате `kozel` после конца раунда очки в `match.scores` прибавляются игроку `result.scorer` (= проигравшему раунда), а не победителю; при `scores[scorer] ≥ matchTarget` — `match.winner = 1 − scorer`, фаза `finished`, «Реванш» начинает новый `kozel`-матч 0 : 0.
7. Авто-ход по таймеру (spec-11) и ход бота (spec-15) в комнате `kozel` начисляют очки по правилам «Козла» (все пути идут через `RoomManager.apply`).
8. Экран создания: группа «Правила» (по умолчанию «Классика»), выбор запоминается в `localStorage`; второй игрок видит «Козёл · Матч до …» до входа; на табло у обоих — пункт «Козёл» / «Классика».
9. Итоги раунда/матча в «Козле» показывают тексты из §4.3; в классике тексты прежние.
10. e2e: партия в «Козла» доигрывается до итогов раунда, очки на табло записаны проигравшему раунда (E-K1).
11. `npm run lint`, `npm run typecheck`, `npm test`, `npm run test:e2e` — зелёные.

## 7. Тест-кейсы

### 7.1 unit — shared (новый `shared/src/rules/variants/kozel.test.ts`, `variants.test.ts`)

| ID   | Кейс                                                                                                                                                                            |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| K2-1 | `kozel.resolveRound('domino', [[], [[6,6],[0,1]]], 0)` → `{ reason: 'domino', winner: 0, scorer: 1, points: 13, handPoints: [0, 13] }`                                          |
| K2-2 | То же зеркально: игрок 1 вышел → `scorer: 0`, `points = handPoints[0]`                                                                                                          |
| K2-3 | Проигравший держит только `[0,0]` → `points: 0`, `scorer` = он (особых правил для «пустышки» нет)                                                                               |
| K3-1 | `kozel.resolveRound('fish', hands)` с суммами `[4, 9]` → `winner: 0, scorer: 1, points: 9` (не 13 и не 4)                                                                       |
| K3-2 | Суммы `[12, 3]` → `winner: 1, scorer: 0, points: 12`                                                                                                                            |
| K4-1 | Суммы `[7, 7]` → `winner: null, scorer: null, points: 0`                                                                                                                        |
| K5-1 | `kozel.recordRound(createMatch(101), {…scorer: 1, points: 13})` → `scores: [0, 13]`, `winner: null`, `rounds.length = 1`; вход не мутирован                                     |
| K5-2 | Счёт `[95, 40]`, раунд `scorer: 0, points: 9` → `scores: [104, 40]`, `winner: 1` (игрок 0 — козёл)                                                                              |
| K5-3 | Ровно до цели: `[92, 0]` + 9 → `[101, 0]`, `winner: 1` (≥, не >)                                                                                                                |
| K5-4 | Ничья K4 при счёте `[100, 100]` → счёт не меняется, `winner: null`, итог добавлен в `rounds`                                                                                    |
| K5-5 | `recordRound` оконченного матча → throw                                                                                                                                         |
| K1-1 | Полный раунд через `applyMove(…, kozelVariant)` по фиксированной колоде до домино: ходы и `state` (кроме `result`) совпадают с прогоном классики; `result.scorer` — проигравший |
| K1-2 | Подобранная позиция рыбы через `applyMove(…, kozelVariant)` (ход `pass`/`play`, ведущий к рыбе) → `result` по K3                                                                |
| V-1  | `getVariant('classic') === classicVariant`, `getVariant('kozel') === kozelVariant`; неизвестный id → throw; `VARIANT_IDS = ['classic','kozel']`                                 |
| V-2  | Property (несколько seed × handSize 5/6/7): раунд случайными легальными ходами через `applyMove` без варианта и с `classicVariant` → идентичные цепочки состояний               |
| V-3  | `roundScorer`: классический результат без поля → `winner`; `scorer: null` → `null`; `scorer: 1` → 1                                                                             |

### 7.2 unit — server (`validate.test.ts`, `RoomManager.test.ts`)

| ID   | Кейс                                                                                                                                                                                                 |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| K8-1 | `parseVariant(undefined)` → ok `'classic'`; `'kozel'` → ok; `'KOZEL'`, `''`, `null`, `1`, `{}` → fail                                                                                                |
| K7-1 | `create(…, { variant: 'kozel' })` → `room.variant = 'kozel'`; `info(id).value.variant = 'kozel'`; `create` без настроек → `'classic'`                                                                |
| K7-2 | `kozel`-комната с фабрикой `startRound` на короткую партию: конец раунда → очки у проигравшего; `ready` ×2 → вариант тот же; довести до конца матча → `winner = 1 − scorer`; реванш → `kozel`, 0 : 0 |
| K7-3 | `kozel` + `turnSeconds` (фейковые таймеры): авто-ход завершает раунд → начисление по «Козлу»                                                                                                         |
| K9-1 | `createWithBot(…, { variant: 'kozel' })`: бот доигрывает раунд → очки по «Козлу», бот готов (B7)                                                                                                     |

### 7.3 integration — server (Socket.IO, новый `server/src/kozel.test.ts`)

| ID   | Кейс                                                                                                                                                                               |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| KI-1 | `room:create { name, variant: 'kozel' }` → ok; `room:state` (waiting) `variant: 'kozel'`; после `room:join` у обоих `variant: 'kozel'`; `room:info` → `settings.variant = 'kozel'` |
| KI-2 | `room:create { variant: 'goat' }` / `{ variant: 1 }` → `INVALID_PAYLOAD`; повторный корректный `room:create` того же сокета — ok                                                   |
| KI-3 | Сервер с фабрикой раунда (короткая колода): `kozel`-раунд доигран через `game:move` → `game.result.scorer` = проигравший, `match.scores[scorer] = result.points` у обоих           |
| KI-4 | `room:create` без `variant` → `variant: 'classic'`, `result.scorer` отсутствует (регресс)                                                                                          |

### 7.4 unit — client (Vitest + RTL)

| ID   | Кейс                                                                                                                                                                                                                               |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| KC-1 | `HomeScreen`: по умолчанию отмечен `variant-choice-classic`, `variant-hint` — текст классики; выбрать «Козёл» → подсказка меняется; «Создать игру» → `onCreate(name, { …, variant: 'kozel' }, 'human')`, `domino:variant` сохранён |
| KC-2 | Сохранённое `domino:variant = 'kozel'` → отмечен «Козёл»; мусор в storage (`'x'`) → «Классика»                                                                                                                                     |
| KC-3 | `RoomSettingsLine` с `variant: 'kozel'` → `<testId>-variant` «Козёл», строка «Козёл · Матч до 101 · …»                                                                                                                             |
| KC-4 | `MatchScore`: `variant-label` = «Козёл» / «Классика» (по умолчанию)                                                                                                                                                                |
| KC-5 | `RoundSummary` `kozel`: домино, вышел соперник → «Очки записаны вам: +13 (домино)»; вышли вы → «Очки записаны: Боб +13 (домино)»; рыба поровну → «Рыба — ничья, очков никому»                                                      |
| KC-6 | `RoundSummary` `kozel`, матч окончен: проигравший вы → «Вы — козёл! Матч выиграл Аня · Счёт …»; иначе «Вы выиграли матч! Боб — козёл · Счёт …»                                                                                     |
| KC-7 | `RoundSummary` без `variant` — существующие тексты (существующий `RoundSummary.test.tsx` не меняется)                                                                                                                              |

### 7.5 e2e (Playwright, `e2e/kozel.spec.ts`)

| ID   | Кейс                                                                                                                                                                                                                                                                                                                                                                                                              |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| E-K1 | **Критерий карточки.** `startGame(browser, { variant: 'kozel' })`; у обоих `variant-label` = «Козёл». `playRoundToEnd(a, b)` → у обоих `round-summary`; если `round-finished` ≠ «Рыба — ничья…»: игрок, **у которого остались кости с большей суммой** (`summary-hand-points-<seat>`), получил на табло `match-score-<seat>` = `round-points`, у другого — 0; иначе счёт 0 : 0. Итоги одинаковы на обеих вкладках |
| E-K2 | B открывает ссылку `kozel`-комнаты → `join-settings-variant` = «Козёл» до входа; у A на экране ожидания `waiting-settings-variant` = «Козёл»                                                                                                                                                                                                                                                                      |
| E-K3 | Игра с ботом: `createBotGame(page, 'Аня', { variant: 'kozel' })`, `playRoundVsBot` → итоги раунда видны, очки записаны проигравшему                                                                                                                                                                                                                                                                               |
| E-K4 | Регресс: игра без выбора → `variant-label` = «Классика», очки у победителя раунда (как E12)                                                                                                                                                                                                                                                                                                                       |
| L-*  | `layout.spec.ts`: экран создания (4 группы) и табло «Козёл · до 101 · …» на 360/1280 — без горизонтального скролла                                                                                                                                                                                                                                                                                                |

## 8. Вне рамок

- Варианты на 3–4 игрока и игра парами (классический «Козёл» вчетвером).
- Особые правила подсчёта «Козла»: «голый» дубль 0:0 = 25 очков, «яйца», «записать на гору», сброс счёта при ровно 101/«отсидка», удвоение очков за рыбу, суммирование обеих рук при рыбе.
- Изменение правил ходов для «Козла»: первый ход в следующем раунде за победителем, ход любым дублем, ход с 1:1 и т.п. (K1 — ходы как в классике).
- Смена варианта в уже созданной комнате, в т.ч. перед реваншем.
- Отдельный экран с подробными правилами варианта (только однострочная подсказка).
- Новые переменные окружения, расширение `server:hello`, увеличение `PROTOCOL_VERSION`.
- Изменения стратегии бота под «Козла» (бот и так сбрасывает тяжёлые кости).

## 9. Допущения

1. **База — `task-15-bot`** (стек #8–#15 не смержен в `main`). Если #15 будет смержен позже — правки `createWithBot`/E-K3/K9-1 применяются после rebase; K1–K8 от бота не зависят.
2. **Точные правила «Козла» для двоих** (карточка поручила зафиксировать в спеке): ходы — классические; в домино очки = сумма руки оставшегося с костями; в рыбе — **собственная** сумма руки игрока с большей суммой; при равной рыбе — никому. Выбран минимальный набор, однозначно следующий из формулировки карточки; народные дополнения (25 за 0:0 и т.п.) — вне рамок.
3. **Цель матча** берётся из существующей настройки `matchTarget` (51/101/151): для «Козла» это порог проигрыша. Отдельной цели для варианта не вводим.
4. **«Тесты классики без изменений»** трактуется как: существующие тесты правил (`shared/src/rules/*.test.ts`) и e2e-сценарии не правятся вообще; в тестах, сравнивающих протокольные payload целиком (`room:info` в `server/src/settings.test.ts`, клиентские фикстуры), добавляется только поле `variant: 'classic'` — так же, как spec-14 добавлял `matchTarget/handSize`. Чтобы не трогать `toEqual` в M1/R*, `MatchState` и `RoundState` не расширяются, а `RoundResult.scorer` — необязательное поле, которое классика не заполняет.
5. **Вариант не хранится в `RoundState`/`MatchState`**: он — свойство комнаты и передаётся в `applyMove`/`recordRound` параметром. `match.winner` в «Козле» по-прежнему означает победителя матча; «козёл» = `1 − winner` (UI считает сам).
6. **`round.winner` в «Козле»** сохраняет классический смысл (кто вышел / у кого меньше) — так бот, звуки и анимации (spec-10), опирающиеся на `winner`, работают без изменений; кому записаны очки — только `scorer`.
7. Вариант на табло показывается **всегда** (и «Классика» тоже), т.к. карточка требует «вариант виден на табло»; в отличие от «по h костей» (spec-14), который скрыт при значении по умолчанию. Слово короткое, вёрстка 360 px проверяется `layout.spec`.
8. Последний выбор варианта запоминается в `localStorage`, как остальные настройки (spec-11/14) — удобство, не требование карточки.
