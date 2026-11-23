# Spec #14 — Настройки комнаты: цель матча и размер руки

> Карточка: #14 (id 10167), теги `server`, `client`, `shared`, приоритет low.
> Файл в репозитории после PR: `docs/specs/spec-14.md` (кладёт разработчик).
> Зависит от: #7 (`MatchState.target`, табло), #11 (настройка комнаты `turnSeconds` — **образец для всего, что ниже**), #13 (вёрстка лобби, `checkLayout`).
> Ветки #8 → #13 (`task-8-deploy` … `task-13-ui-polish`) стековые и на момент написания **не смержены** в `main`. **Ветку `task-14-room-settings` создавать от `main` после merge #13**; если он ещё открыт — от `origin/task-13-ui-polish` и потом rebase. Все ссылки на код — по состоянию `task-13-ui-polish`.

## 1. Цель

Создатель комнаты выбирает параметры партии:

1. **Цель матча**: 51 / 101 / 151 очко (по умолчанию 101).
2. **Размер руки**: 5 / 6 / 7 костей (по умолчанию 7); базар = 28 − 2 × рука.
3. Настройки хранятся в комнате, не меняются до её закрытия (в т.ч. на следующий раунд и реванш), видны второму игроку **до входа** (экран приглашения) и обоим на табло («до 51»).
4. Сервер принимает только перечисленные значения; `MATCH_TARGET` из env остаётся значением по умолчанию (для тестов).

## 2. Контекст (что уже есть)

| Что | Где | Что делаем в #14 |
| --- | --- | --- |
| `HAND_SIZE = 7`, `deal(deck)` → `[0..6]`, `[7..13]`, базар `[14..]` | `shared/src/rules/deck.ts` | `deal(deck, handSize = 7)` |
| `startRound({ seed, deck })`, `findOpening` (старший дубль, иначе старшая кость по `compareOpening`) | `shared/src/rules/round.ts`, `tiles.ts` | Опция `handSize`; правило первого хода не меняем |
| `MATCH_TARGET = 101`, `createMatch(target)` (целое > 0, иначе throw) | `shared/src/rules/match.ts` | Без изменений; новые константы — в `protocol.ts` |
| Настройка `turnSeconds`: `TURN_SECONDS_OPTIONS`, `DEFAULT_TURN_SECONDS`, `server:hello.turnSecondsOptions`, `RoomCreatePayload.turnSeconds?`, `parseTurnSeconds(value, allowed, fallback)`, `Room.turnSeconds`, `RoomStatePayload.turnSeconds` | `shared/src/protocol.ts`, `server/src/app.ts`, `server/src/rooms/{validate,handlers,RoomManager}.ts` | Делаем **так же** для `matchTarget` и `handSize` |
| `MATCH_TARGET` из env → `config.matchTarget` → `startServer({ matchTarget })` → `RoomManager.opts.matchTarget` → `createMatch` в `join` | `server/src/config.ts`, `app.ts`, `RoomManager.ts` | Становится **значением по умолчанию** для комнаты, а не единой целью сервера |
| `MAX_AUTO_MOVES = 15` («14 доборов + ход») | `server/src/rooms/RoomManager.ts` | При руке 5 базар 18 → лимит считать от базара (§4.2) |
| `ready` → реванш: `createMatch(room.match.target)` | `RoomManager.ready` | Уже берёт цель из комнаты; `newRound()` — с `room.handSize` |
| `HomeScreen`: радиогруппа «Время на ход» (`turn-seconds-<N>`), `loadTurnSeconds/saveTurnSeconds`, `onCreate(name, turnSeconds)` | `client/src/lobby/screens/HomeScreen.tsx`, `storage.ts`, `useLobby.ts`, `Lobby.tsx` | Ещё две группы; `onCreate(name, settings)` |
| `JoinScreen`: «Вас пригласили в игру ABC234» + `NameForm` | `client/src/lobby/screens/JoinScreen.tsx` | Блок настроек комнаты (через новый `room:info`) |
| `WaitingScreen` (код, ссылка) | `client/src/lobby/screens/WaitingScreen.tsx` | Строка настроек |
| `MatchScore`: «Аня 34 : 12 Боб · до 101 · Раунд 3 · ход 60 с» (`match-target`, `turn-seconds-label`) | `client/src/game/MatchScore.tsx` | `· по 5 костей` при руке ≠ 7 |
| e2e: `createGame(page, name, { turnSeconds })`, `startGame`, `checkLayout` (min 44 px для `.turn-seconds-option`) | `e2e/helpers.ts` | Опции `matchTarget`, `handSize`; селектор вариантов |

## 3. Правила (нормативно)

ID `S*` — в именах тестов (`'S3: …'`).

| ID | Правило |
| --- | --- |
| S1 | Настройки комнаты: `matchTarget ∈ allowedMatchTargets`, `handSize ∈ {5, 6, 7}`. Задаются только в `room:create`, хранятся в `Room`, **не меняются** до закрытия комнаты (следующий раунд, реванш, переподключение). |
| S2 | `allowedMatchTargets` = отсортированное множество `{51, 101, 151}` ∪ `{defaultMatchTarget}`, где `defaultMatchTarget = MATCH_TARGET из env ?? 101`. Т.е. в проде (env не задан) — ровно `[51, 101, 151]`; с `MATCH_TARGET=30` — `[30, 51, 101, 151]` (тестовое значение, как `TURN_TIMER_TEST_SECONDS` в spec-11). |
| S3 | Нет поля в `room:create` → значение по умолчанию: `matchTarget = defaultMatchTarget`, `handSize = 7`. Поле есть, но не целое число или не из списка (`100`, `"101"`, `null`, `4`, `8`, `6.5`) → ack `{ ok: false, error: 'INVALID_PAYLOAD' }`, комната не создаётся. |
| S4 | Раздача: `hands[0] = deck[0..h)`, `hands[1] = deck[h..2h)`, `boneyard = deck[2h..28)`; размеры `h / h / 28 − 2h` (5→18, 6→16, 7→14). Порядок колоды сохраняется. |
| S5 | Первый ход (R4) не меняется: старший дубль среди 2h костей на руках; если дублей на руках нет (при h = 5/6 вероятнее) — старшая кость по `compareOpening`. Добор, пропуск, рыба, подсчёт очков — без изменений. |
| S6 | Матч комнаты создаётся с `room.matchTarget` (в `join` и при реванше); конец матча — счёт ≥ `room.matchTarget` (M3 как есть). |
| S7 | Второй игрок видит настройки **до входа**: `room:info { roomId }` → ack с настройками (§5). Неизвестная комната → `ROOM_NOT_FOUND` (клиент сразу показывает «Комната не найдена…»). |
| S8 | Оба игрока видят настройки в `room:state` во всех фазах (в т.ч. `waiting`) и на табло: «до N» (уже есть через `match.target`), «по h костей» — только если `h ≠ 7`. |
| S9 | Клиент ничего не валидирует сверх выбора из списка: варианты берёт из `server:hello`; сервер — источник истины. |

## 4. Изменения по пакетам

### 4.1 shared

**`shared/src/rules/deck.ts`**:

```ts
/** spec-14 S1: допустимые размеры руки. */
export const HAND_SIZES = [5, 6, 7] as const;
export const HAND_SIZE = 7; // по умолчанию (как было)

/** S4: [0..h) → игроку 0, [h..2h) → игроку 1, остальное → базар. h ∉ HAND_SIZES → throw. */
export function deal(deck: readonly Tile[], handSize: number = HAND_SIZE): { hands: [Tile[], Tile[]]; boneyard: Tile[] };
```

**`shared/src/rules/round.ts`** — `StartRoundOptions.handSize?: number` (по умолчанию `HAND_SIZE`), передаётся в `deal`. Неверное значение → `throw` (сервер передаёт только проверенное).

**`shared/src/rules/index.ts`** — экспорт `HAND_SIZE`, `HAND_SIZES`.

**`shared/src/protocol.ts`** (рядом с `TURN_SECONDS_OPTIONS`):

```ts
/** spec-14 S2: стандартные цели матча. */
export const MATCH_TARGET_OPTIONS: readonly number[] = [51, 101, 151];
/** spec-14 S1: размеры руки (= HAND_SIZES), по умолчанию 7. */
export const HAND_SIZE_OPTIONS: readonly number[] = [5, 6, 7];
export const DEFAULT_HAND_SIZE = 7;

/** Настройки комнаты (S1). */
export interface RoomSettings {
  matchTarget: number;
  handSize: number;
  /** spec-11 T1 */
  turnSeconds: number;
}

export interface ServerHelloPayload {
  // …существующие поля…
  /** S2: варианты цели матча, по возрастанию. Обычно [51, 101, 151]; с MATCH_TARGET — плюс тестовое. */
  matchTargetOptions: number[];
  /** S3: цель по умолчанию (MATCH_TARGET ?? 101) — выбрана на экране создания, если нет сохранённой. */
  defaultMatchTarget: number;
  /** S1: [5, 6, 7]. */
  handSizeOptions: number[];
}

export interface RoomCreatePayload {
  name: string;
  turnSeconds?: number;
  /** S3: нет — defaultMatchTarget; не из matchTargetOptions — INVALID_PAYLOAD. */
  matchTarget?: number;
  /** S3: нет — 7; не из HAND_SIZE_OPTIONS — INVALID_PAYLOAD. */
  handSize?: number;
}

export interface RoomStatePayload {
  // …существующие поля (turnSeconds остаётся как есть)…
  /** S8: настройки комнаты, во всех фазах (в waiting match = null, а цель уже нужна). */
  matchTarget: number;
  handSize: number;
}

/** S7: C→S, предпросмотр комнаты до входа. */
export interface RoomInfoPayload {
  roomId: string;
}
export interface RoomInfoAck {
  roomId: string;
  settings: RoomSettings;
}

// ClientToServerEvents:
'room:info': (payload: RoomInfoPayload, ack: (res: AckResult<RoomInfoAck, RoomErrorCode>) => void) => void;
```

`PROTOCOL_VERSION` не меняем (клиент и сервер деплоятся вместе; новые поля `room:create` необязательные) — как в spec-11.

### 4.2 server

**`server/src/app.ts`**:

- `defaultMatchTarget = opts.matchTarget ?? MATCH_TARGET`; `allowedMatchTargets = [...new Set([...MATCH_TARGET_OPTIONS, defaultMatchTarget])].sort((a, b) => a - b)` (S2). Проверка `createMatch(defaultMatchTarget)` на старте остаётся.
- В `RoomManager`: `defaultMatchTarget`, `allowedMatchTargets` (вместо смысла «единая цель сервера» у `matchTarget`; поле `matchTarget` в `RoomManagerOptions` можно оставить как default — тесты с `matchTarget: 1` продолжают работать, т.к. `create` без явного значения берёт его).
- `server:hello`: `matchTargetOptions: [...allowedMatchTargets]`, `defaultMatchTarget`, `handSizeOptions: [...HAND_SIZE_OPTIONS]`.
- `config.ts`, `index.ts` — **без изменений** (`MATCH_TARGET` уже разбирается).

**`server/src/rooms/validate.ts`** — по образцу `parseTurnSeconds`:

```ts
/** S3: undefined → fallback; иначе целое из allowed, иначе fail. */
export function parseOption(value: unknown, allowed: readonly number[], fallback: number): Parsed<number>;
```

`parseTurnSeconds` можно выразить через неё (не обязательно).

**`server/src/rooms/RoomManager.ts`**:

| Место | Изменение |
| --- | --- |
| `Room` | `matchTarget: number; handSize: number` (S1; комментарий «не меняется до закрытия») |
| `create(socketId, name, settings: RoomSettings)` | Сохраняет `matchTarget`, `handSize`, `turnSeconds`. Менеджер доверяет входу (валидация в обработчике), но `settings` по умолчанию = `{ matchTarget: defaultMatchTarget, handSize: 7, turnSeconds: DEFAULT_TURN_SECONDS }` для старых тестов. |
| `join` | `room.match = createMatch(room.matchTarget)` (S6) |
| `ready` (реванш) | Уже `createMatch(room.match.target)` — заменить на `room.matchTarget` для явности |
| `newRound()` → `newRound(room)` | `startRound({ seed: roundSeed(), handSize: room.handSize })`; тестовая фабрика `opts.startRound` получает `room` аргументом (необязательно использовать) |
| `MAX_AUTO_MOVES` | Удалить константу; лимит цикла авто-хода = `round.boneyard.length + 1` на момент начала (при руке 5 — до 18 доборов + ход). Комментарий spec-11 T4 обновить. |
| `info(roomId): Result<RoomSettings, 'ROOM_NOT_FOUND'>` | Новый, чистое чтение |

**`server/src/rooms/handlers.ts`**:

- `room:create`: после `turnSeconds` —
  `matchTarget = parseOption(payload.matchTarget, rooms.allowedMatchTargets, rooms.defaultMatchTarget)`,
  `handSize = parseOption(payload.handSize, HAND_SIZE_OPTIONS, DEFAULT_HAND_SIZE)`; любой `fail` → `INVALID_PAYLOAD`. Лог: `room X created (target 101, hand 7, turn 60s)`.
- `room:info` (через `withAck`): `!isObject(payload)` или `parseRoomId` fail → `INVALID_PAYLOAD`; нет комнаты → `ROOM_NOT_FOUND`; иначе `{ ok: true, roomId, settings }`. **Не** привязывает сокет к комнате, разрешён в любом состоянии сокета, `room:state` не шлёт.
- `toRoomState`: `matchTarget: room.matchTarget`, `handSize: room.handSize`.

### 4.3 client

**`client/src/lobby/screens/HomeScreen.tsx`** — над группой «Время на ход» ещё две радиогруппы той же разметки/стилей (класс вариантов — общий, см. §4.4):

| Группа | legend | Варианты (подпись) | testid группы / варианта | По умолчанию |
| --- | --- | --- | --- | --- |
| Цель матча | «Играем до» | `51`, `101`, `151`; не из `MATCH_TARGET_OPTIONS` — `30 (тест)` | `match-target-choice` / `match-target-choice-<N>` | сохранённое (если есть в списке) → `defaultMatchTarget` из hello → 101 |
| Размер руки | «Костей в руке» | `5`, `6`, `7` | `hand-size-choice` / `hand-size-choice-<N>` | сохранённое (если есть в списке) → 7 |

- Варианты — из `server:hello` (`matchTargetOptions`, `handSizeOptions`, `defaultMatchTarget`), пока hello нет — `MATCH_TARGET_OPTIONS` / `HAND_SIZE_OPTIONS` / 101. Логика выбора — как `initialChoice` у `turnSeconds` (выбор, отсутствующий в новом списке, сбрасывается на default).
- `storage.ts`: `loadMatchTarget/saveMatchTarget` (`domino:matchTarget`), `loadHandSize/saveHandSize` (`domino:handSize`) — try/catch, как `loadTurnSeconds`. Сохраняются при нажатии «Создать игру».
- `onCreate(name, settings: RoomSettings)`; `useLobby.create(name, settings)` → `createRoom(socket, { name, ...settings })`; `Lobby.tsx` прокидывает новые поля hello (как `turnSecondsOptions`; хранить их там же, где сейчас `turnSecondsOptions`).

**Общий компонент подписи** `client/src/lobby/RoomSettingsLine.tsx`:

```tsx
<RoomSettingsLine settings={s} testId="join-settings" />
// «Матч до 101 · 7 костей в руке · ход 60 с» (turnSeconds = 0 → «без таймера»)
// внутри: data-testid="<testId>-target" (число), "<testId>-hand" (число), "<testId>-turn"
```

**`JoinScreen`**: под заголовком — `RoomSettingsLine` (`testId="join-settings"`).

- `useLobby`: на экране `join` при `status === 'connected'` (и на каждый новый hello) вызвать `roomInfo(socket, { roomId: urlRoom })` (новая функция в `roomApi.ts`, тот же таймаут ack, что у `joinRoom`). Хранить `state.roomInfo: RoomSettings | null`.
- `ok` → показать строку; `ROOM_NOT_FOUND` → `badLink: true` (экран «Комната не найдена или ссылка устарела» — без ввода имени); timeout/иная ошибка → строку не показывать, вход работает как раньше. Пока ответа нет — строку не показывать (без спиннера).
- `goHome`/успешный join — сбрасывать `roomInfo`.

**`WaitingScreen`**: `RoomSettingsLine` (`testId="waiting-settings"`) из `room.matchTarget/handSize/turnSeconds` — создатель видит, что выбрал.

**`MatchScore`**: проп `handSize?: number`; при `handSize !== 7` — пункт `по {h} костей` (`data-testid="hand-size-label"`) после «до N». «до N» по-прежнему из `match.target` (= `room.matchTarget`). Передать `room.handSize` из `GameTable`.

**Фикстуры** `client/src/test/fixtures.ts`: в `RoomStatePayload` добавить `matchTarget: 101, handSize: 7`.

### 4.4 e2e и вёрстка

- `e2e/helpers.ts`: `createGame(page, name, { turnSeconds, matchTarget, handSize })` — `check()` на `match-target-choice-<N>` / `hand-size-choice-<N>`, если заданы; `startGame` прокидывает те же опции. `HOME_KEYS` (список для layout) — добавить `match-target-choice`, `hand-size-choice`.
- `checkLayout`: селектор вариантов `.turn-seconds-option` → общий класс `.lobby-option` (переименовать у всех трёх групп; min 44 px UI3 сохраняется). На 360 px три группы помещаются без горизонтального скролла (`noHorizontalScroll`).
- `playwright.config.ts` — без изменений (env `MATCH_TARGET` не задан → default 101). `playwright.screens.config.ts` с `MATCH_TARGET=30` продолжает работать: 30 попадает в варианты и выбран по умолчанию.

## 5. Протокол

| Событие | Направление | Payload | Ответ / смысл |
| --- | --- | --- | --- |
| `server:hello` | S → C | + `matchTargetOptions: number[]`, `defaultMatchTarget: number`, `handSizeOptions: number[]` | варианты для экрана создания (S2) |
| `room:create` | C → S | `{ name, turnSeconds?, matchTarget?, handSize? }` | ack как раньше; невалидные значения → `INVALID_PAYLOAD` (S3) |
| `room:info` (новое) | C → S | `{ roomId }` | ack `{ ok: true, roomId, settings: { matchTarget, handSize, turnSeconds } }` \| `{ ok: false, error: 'INVALID_PAYLOAD' \| 'ROOM_NOT_FOUND' }`; без побочных эффектов |
| `room:state` | S → C | + `matchTarget: number`, `handSize: number` | во всех фазах, включая `waiting` (S8) |

Остальные события не меняются. README: строка `room:info` в таблицу протокола, абзац «Как сыграть» п.1 — про выбор цели и руки, `MATCH_TARGET` в таблице env — «цель матча по умолчанию; добавляется в варианты выбора».

## 6. Критерии готовности

1. `deal(deck, 5)` / `deal(deck, 6)` / `deal(deck)` дают руки 5/5, 6/6, 7/7 и базар 18/16/14 (= 28 − 2h), без потерь и дублей, в порядке колоды; `deal(deck, 4)` и `deal(deck, 8)` → throw.
2. `startRound({ seed, handSize: 5 })` даёт валидный раунд; правило первого хода работает и без дублей на руках.
3. `room:create` без новых полей создаёт комнату с `matchTarget = MATCH_TARGET ?? 101`, `handSize = 7` — все существующие тесты (`npm test`, `npm run test:e2e`) зелёные без правок ожиданий, кроме добавления новых полей в фикстуры/`toEqual` на `room:state`/`server:hello`.
4. `room:create` с `matchTarget ∉ allowedMatchTargets` или `handSize ∉ {5,6,7}` (в т.ч. строки, дроби, `null`) → `INVALID_PAYLOAD`, комната не создана.
5. Комната с `matchTarget: 51, handSize: 5`: после `join` у обоих в `room:state` `matchTarget: 51`, `handSize: 5`, `match.target: 51`, своя рука 5, `opponentHandCount: 5`, `boneyardCount: 18`; после «Следующий раунд» и после реванша — те же 51 и 5.
6. Авто-ход по таймеру (spec-11) при руке 5 может добрать все 18 костей базара (лимит цикла не 15).
7. `room:info` возвращает настройки существующей комнаты (в т.ч. уже полной), `ROOM_NOT_FOUND` для неизвестной, не меняет `socket.data` и не шлёт `room:state`.
8. Экран создания: три группы, по умолчанию 101 / 7 / 60 с; выбор запоминается в `localStorage` и восстанавливается после перезагрузки.
9. Второй игрок по ссылке видит «Матч до 51 · 5 костей в руке · …» **до** нажатия «Войти»; ссылка на несуществующую комнату сразу ведёт на экран «Комната не найдена…».
10. Табло у обоих: «до 51»; при руке ≠ 7 — «по 5 костей», при 7 — пункта нет.
11. `npm run lint`, `npm run typecheck`, `npm test`, `npm run test:e2e` — зелёные; `layout.spec.ts` проходит на 360 и 1280 px.

## 7. Тест-кейсы

### 7.1 unit — shared (`deck.test.ts`, `round.test.ts`)

| ID | Кейс |
| --- | --- |
| S4-1 | `deal(deck, 5)`: `hands[0] = deck[0..5)`, `hands[1] = deck[5..10)`, `boneyard = deck[10..28)`, длина базара 18 |
| S4-2 | `deal(deck, 6)`: 6 / 6 / 16, срезы `[0..6)`, `[6..12)`, `[12..28)` |
| S4-3 | `deal(deck)` = `deal(deck, 7)`: 7 / 7 / 14 (регресс R3) |
| S4-4 | Для h ∈ {5, 6, 7}: объединение рук и базара = 28 уникальных костей; `boneyard.length === 28 − 2h` (`it.each`) |
| S4-5 | `deal(deck, 4)`, `deal(deck, 8)`, `deal(deck, 6.5)` → throw |
| S5-1 | `startRound({ deck, handSize: 5 })`, колода без дублей в первых 10 костях → `openingTile` = старшая кость по `compareOpening`, `currentPlayer` — её владелец |
| S5-2 | `startRound({ seed, handSize: 6 })` → `getLegalMoves` = `[openingTile]`; раунд доигрывается случайными легальными ходами до `finished` (property-тест для h ∈ {5,6,7}, несколько seed), инвариант «28 костей всего» держится |

### 7.2 unit — server (`validate.test.ts`, `RoomManager.test.ts`)

| ID | Кейс |
| --- | --- |
| S3-1 | `parseOption(undefined, [51,101,151], 101)` → ok 101; `parseOption(151, …)` → ok 151; `100`, `'101'`, `null`, `101.5` → fail |
| S1-1 | `create(..., { matchTarget: 51, handSize: 5, turnSeconds: 0 })` → `room.matchTarget = 51`, `room.handSize = 5`; `join` → `match.target = 51`, руки по 5, базар 18 |
| S1-2 | Довести раунд до конца (`startRound`-фабрика с короткой партией), `ready` ×2 → новый раунд с рукой 5; конец матча → реванш → `match.target` = 51, рука 5 |
| S1-3 | `create` без настроек при `opts.matchTarget = 1` → `room.matchTarget = 1` (старые тесты N*) |
| S6-1 | `info(id)` → настройки; `info('NOPE')` → `ROOM_NOT_FOUND` |
| T4-14 | Рука 5, таймер истёк у игрока без хода при полном базаре (подобранная колода) → авто-ход добирает > 14 костей и играет/пропускает; ошибок в логе нет |

### 7.3 integration — server (Socket.IO, `rooms.test.ts` / новый `settings.test.ts`)

| ID | Кейс |
| --- | --- |
| SI-1 | `server:hello` без env: `matchTargetOptions = [51,101,151]`, `defaultMatchTarget = 101`, `handSizeOptions = [5,6,7]`; с `matchTarget: 30` в `startServer` → `[30,51,101,151]`, default 30 |
| SI-2 | `room:create { name, matchTarget: 51, handSize: 6 }` → ok; `room:state` (waiting) содержит `matchTarget: 51`, `handSize: 6`; после `room:join` у обоих `game.hand.length = 6`, `opponentHandCount = 6`, `boneyardCount = 16`, `match.target = 51` |
| SI-3 | `room:create` с `matchTarget: 100` / `handSize: 8` / `handSize: '5'` → `INVALID_PAYLOAD`, `socket.data.roomId` не установлен (повторный корректный `room:create` того же сокета — ok) |
| SI-4 | `room:info { roomId: 'abc234' }` (нижний регистр) → ok с настройками; `{ roomId: 'ZZZZZZ' }` → `ROOM_NOT_FOUND`; `{}` → `INVALID_PAYLOAD`; после `room:info` сокет может сделать `room:join` |
| SI-5 | `room:create` без новых полей при `matchTarget: 20` в `startServer` → комната с целью 20 и рукой 7 |

### 7.4 unit — client (Vitest + RTL)

| ID | Кейс |
| --- | --- |
| SC-1 | `HomeScreen`: по умолчанию отмечены `match-target-choice-101`, `hand-size-choice-7`; выбрать 51 и 5 → «Создать игру» → `onCreate(name, { matchTarget: 51, handSize: 5, turnSeconds: 60 })`, значения сохранены в storage |
| SC-2 | `HomeScreen` с `matchTargetOptions = [30,51,101,151]`, `defaultMatchTarget = 30` → отмечен 30, подпись «30 (тест)»; сохранённое 151 приоритетнее default |
| SC-3 | Lobby на `?room=ABC234`: fake socket отвечает на `room:info` → в `join-settings` видно `51` и `5`; ответ `ROOM_NOT_FOUND` → `bad-link-screen`; таймаут → `join-screen` без `join-settings`, «Войти» работает |
| SC-4 | `WaitingScreen` показывает `waiting-settings` из `room:state` |
| SC-5 | `MatchScore`: `handSize = 5` → `hand-size-label` «по 5 костей»; `handSize = 7` → пункта нет; `match-target` = `match.target` |

### 7.5 e2e (Playwright, `e2e/settings.spec.ts`)

| ID | Кейс |
| --- | --- |
| E-S1 | **Критерий карточки.** A создаёт игру с целью 51 (`createGame(a, 'Аня', { matchTarget: 51 })`); B открывает ссылку → `join-settings-target` = `51` до входа; B входит → у **обоих** `match-target` = `51` (табло «до 51») |
| E-S2 | A создаёт с `handSize: 5`; после входа B: у каждого 5 костей в руке, рука соперника 5, `boneyard-count` = `18`; на табло `hand-size-label` = «по 5 костей» |
| E-S3 | Значения по умолчанию: игра без выбора → «до 101», `hand-size-label` отсутствует, 7 костей, базар 14 (регресс E-сценариев) |
| E-S4 | Ссылка на несуществующую комнату `/?room=ZZZZZZ` → сразу `bad-link-screen` |
| L-* | `layout.spec.ts`: экран создания с тремя группами на 360/1280 — без горизонтального скролла, варианты ≥ 44 px |

## 8. Вне рамок

- Изменение настроек после создания комнаты, в т.ч. перед реваншем; голосование второго игрока за настройки.
- Произвольная цель матча (ввод числа), другие наборы костей (0–9 и т.п.), другие правила подсчёта.
- Изменение правила первого хода при отсутствии дублей (остаётся «старшая кость»).
- Отображение настроек в истории раундов/итогах; аналитика выбранных значений.
- Новая переменная окружения для размера руки (тестам хватает выбора в UI/payload).
- Увеличение `PROTOCOL_VERSION`.

## 9. Допущения

1. **База — `task-13-ui-polish`**: настройки делаются по уже принятому в spec-11 образцу `turnSeconds` (опции в `server:hello`, необязательные поля `room:create`, `INVALID_PAYLOAD`). Если #11 не будет смержен — разработчик переносит образец (`parseOption`, радиогруппы) сам, требования S1–S9 не меняются.
2. **`MATCH_TARGET` = значение по умолчанию**, а не ограничение: env-значение вне 51/101/151 (например, 20/30 в тестах и `npm run screens`) добавляется в допустимые и выбрано по умолчанию на клиенте — иначе `screens`/ручная проверка `MATCH_TARGET=20 npm run dev` сломались бы. В проде env не задан → строго 51/101/151.
3. **«Видны второму игроку в лобби»** трактуется как «до входа в комнату», поэтому нужен `room:info`; он раскрывает только настройки (не имена и не состояние), код комнаты и так известен держателю ссылки. Побочный плюс — мёртвая ссылка распознаётся до ввода имени.
4. Настройки в `room:state` — плоские поля `matchTarget`, `handSize` рядом с существующим `turnSeconds` (не вложенный `settings`), чтобы не ломать `turnSeconds` из spec-11. `RoomSettings` используется в `room:info` и на клиенте.
5. «по h костей» на табло показывается только при h ≠ 7 — чтобы не перегружать строку табло на 360 px (spec-13); «до N» показывается всегда (уже есть).
6. Последний выбор цели и руки запоминается в `localStorage`, как время на ход (spec-11) — удобство, не требование карточки.
