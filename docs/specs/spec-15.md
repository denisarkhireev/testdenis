# Spec #15 — Игра против бота

> Карточка: #15 (id 10168), теги `server`, `client`, `shared`, приоритет low.
> Файл в репозитории после PR: `docs/specs/spec-15.md` (кладёт разработчик).
> Зависит от: #7 (матч, итоги, «Реванш»), #9 (переподключение, `connected`), #11 (`pickAutoMove`, таймер хода — **образец планировщика**), #12 (реакции), #14 (настройки комнаты, `HomeScreen`).
> Ветки #8 → #14 стековые и на момент написания **не смержены** в `main` (PR #7–#13 открыты). **Ветку `task-15-bot` создавать от `main` после merge #14**; если он ещё открыт — от `origin/task-14-room-settings`, потом rebase. Все ссылки на код — по состоянию `task-14-room-settings`.

## 1. Цель

Один игрок может сыграть без друга:

1. В лобби кнопка **«Играть с ботом»**: создаётся комната, место 1 сразу занимает бот «Бот», раунд стартует без экрана ожидания.
2. Стратегия бота — чистая функция в `shared`: самая тяжёлая допустимая кость → при равенстве дубль → нет хода — добор/пропуск.
3. Бот ходит на сервере с задержкой 0.8–1.5 с, чтобы ход было видно.
4. Матч, итоги раунда, «Следующий раунд» и «Реванш» — как с человеком; бот подтверждает готовность сам.

## 2. Контекст (что уже есть)

| Что                                                                                                                                                  | Где                                | Что делаем в #15                                                                          |
| ---------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- | ----------------------------------------------------------------------------------------- |
| `pickAutoMove(state)` — ровно нужная стратегия (spec-11 T5: max `tilePips`, при равенстве дубль, затем порядок `getLegalMoves`; иначе `draw`/`pass`) | `shared/src/rules/autoMove.ts`     | Выносим выбор в `chooseHeaviest(moves)`; бот = `chooseHeaviest(view.legalMoves)`          |
| `PlayerView.legalMoves` (= `getLegalMoves`, если ход `you`, иначе `[]`)                                                                              | `shared/src/rules/view.ts`         | Бот принимает решение **только по своему `PlayerView`** — не видит руку соперника и базар |
| `RoomManager.create/join`, `apply` (ход + `recordRound`), `syncTurnTimer` + `onTurnTimeout` + `opts.onAutoMove`                                      | `server/src/rooms/RoomManager.ts`  | `createWithBot`, `syncBot` + `onBotTurn`, `opts.onBotMove`, авто-готовность бота          |
| `ready()` — старт раунда/реванша, когда `ready = [true, true]`                                                                                       | там же                             | Без изменений: бот уже `ready` к моменту нажатия человека                                 |
| `expire()` — RC4–RC6 (закрыть / техпоражение)                                                                                                        | там же                             | Соперник-бот ⇒ всегда `close('player_left')`                                              |
| `toRoomState` — `players[].connected = socketId !== null`                                                                                            | `server/src/rooms/handlers.ts`     | Бот: `connected: true`, `bot: true`                                                       |
| `room:create` + `parseOption` (spec-14)                                                                                                              | `handlers.ts`, `validate.ts`       | Новое поле `opponent`                                                                     |
| `config.ts`: `TURN_TIMER_TEST_SECONDS` как тестовая env                                                                                              | `server/src/config.ts`, `app.ts`   | `BOT_DELAY_MS` по тому же образцу                                                         |
| `HomeScreen` (3 группы настроек + `NameForm` «Создать игру»), `useLobby.create(name, settings)`, `selectScreen` (phase ≠ waiting → `game`)           | `client/src/lobby/...`             | Вторая кнопка; `create(..., 'bot')`; экран игры открывается сам                           |
| `RoundSummary`: «Соперник готов» при `match.ready[opponent]`                                                                                         | `client/src/game/RoundSummary.tsx` | Без изменений (работает за счёт авто-готовности)                                          |
| e2e-хелперы `createGame`, `makeMove`, `readTable`, `playRoundToEnd(a, b)`                                                                            | `e2e/helpers.ts`                   | `createBotGame`, `playRoundVsBot(page)`                                                   |

## 3. Правила (нормативно)

ID `B*` — в именах тестов (`'B3: …'`).

| ID  | Правило                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| B1  | `pickBotMove(view: PlayerView): Move \| null` — чистая, не мутирует вход. `null`, если `view.status === 'finished'` или `view.legalMoves` пуст (не ход бота). Иначе `chooseHeaviest(view.legalMoves)`: среди `play` — max `tilePips`; при равенстве — дубль; при равенстве — первый по порядку `legalMoves` (фиксирует и конец цепочки). Нет `play` — единственный ход (`draw` или `pass`). Первый ход раунда — `openingTile` (так отдаёт `getLegalMoves`). |
| B2  | Комната с ботом: место 0 — человек (создатель), место 1 — бот с именем `Бот`. Комната сразу в `playing` (матч `createMatch(room.matchTarget)` + раунд с `room.handSize`), как после `join`. Настройки (`matchTarget`, `handSize`, `turnSeconds`) — из `room:create`, по spec-14. `room:join` в такую комнату → `ROOM_FULL` (естественно, место занято).                                                                                                     |
| B3  | Ход бота: если раунд `playing`, `currentPlayer` — бот, матч не окончен (`winner === null`, нет `forfeit`) и человек подключён — сервер планирует **одно действие** (`play`/`draw`/`pass`) через задержку; по срабатыванию — `pickBotMove(toPlayerView(round, botSeat))` → `apply` → `room:state` обоим (т.е. человеку) → снова `syncBot`.                                                                                                                   |
| B4  | Задержка: первое действие хода бота — случайное целое `800…1500` мс; каждый следующий **добор подряд** в том же ходу — `400` мс. Env `BOT_DELAY_MS` (целое `0…5000`, только тесты/e2e) заменяет **обе** задержки фиксированным значением.                                                                                                                                                                                                                   |
| B5  | Пока человек отключён (`socketId === null`) — бот не ходит (таймер снимается); после `room:rejoin` — планируется заново с полной задержкой. По истечении `RECONNECT_TIMEOUT` комната с ботом **закрывается** (`player_left`), техпоражения нет.                                                                                                                                                                                                             |
| B6  | Таймер хода (spec-11) идёт только на ходах человека: на ходу бота `turnTimer = null`. Бот не считается «отключённым» для паузы T7.                                                                                                                                                                                                                                                                                                                          |
| B7  | Готовность: в момент перехода раунда `playing → finished` (в `apply`, любой источник хода) сервер ставит `ready[botSeat] = true`. «Следующий раунд»/«Реванш» человека → `ready = [true, true]` → старт по `ready()` как есть (M4–M7, spec-14 S6).                                                                                                                                                                                                           |
| B8  | В `room:state` у бота `{ seat: 1, name: 'Бот', connected: true, reconnectRemainingMs: null, bot: true }`; у людей `bot: false`.                                                                                                                                                                                                                                                                                                                             |
| B9  | Реакции (spec-12): `game:react` человека работает как есть; бот реакций не шлёт. Клиент в комнате с ботом панель реакций не показывает.                                                                                                                                                                                                                                                                                                                     |
| B10 | Сервер — источник истины: ход бота проходит через тот же `applyMove`, что и ход человека; невалидный ход бота невозможен по построению (B1 выбирает из `legalMoves`). Если всё же `!ok` — `console.error`, повторно не планировать (без зацикливания).                                                                                                                                                                                                      |

## 4. Изменения по пакетам

### 4.1 shared

**`shared/src/rules/autoMove.ts`** — вынести выбор, поведение `pickAutoMove` не меняется:

```ts
/** spec-11 T5 / spec-15 B1: самый тяжёлый play (очки → дубль → порядок), иначе единственный ход. */
export function chooseHeaviest(moves: readonly Move[]): Move | null;

export function pickAutoMove(state: RoundState): Move | null {
  return chooseHeaviest(getLegalMoves(state));
}
```

**`shared/src/rules/bot.ts`** (новый):

```ts
/** spec-15 B1: ход бота по его собственному виду раунда. null — не его ход / раунд окончен. */
export function pickBotMove(view: PlayerView): Move | null {
  if (view.status !== 'playing') return null;
  return chooseHeaviest(view.legalMoves);
}
```

Экспорт `pickBotMove`, `chooseHeaviest` из `shared/src/rules/index.ts`.

**`shared/src/protocol.ts`**:

```ts
/** spec-15: соперник при создании комнаты. */
export type Opponent = 'human' | 'bot';
export const BOT_NAME = 'Бот';

export interface RoomCreatePayload {
  // ...как есть (name, turnSeconds?, matchTarget?, handSize?)
  /** spec-15 B2: нет — 'human'; не из Opponent — INVALID_PAYLOAD. */
  opponent?: Opponent;
}

export interface RoomPlayer {
  // ...как есть
  /** spec-15 B8: место занимает бот. */
  bot: boolean;
}
```

`PROTOCOL_VERSION` не меняем (изменение аддитивное; клиент и сервер деплоятся вместе — как в spec-14). `RoomPlayer.bot` — **обязательное** поле: `typecheck` укажет все места, где собираются игроки (фикстуры клиента, тесты).

### 4.2 server

**`server/src/config.ts`**: `botDelayMs?: number` ← `parseBotDelay(env.BOT_DELAY_MS)` — целое `0…5000`, иначе `throw` с понятным текстом (как `parseTurnTimerTestSeconds`). Пусто/нет — `undefined`.

**`server/src/app.ts`**: прокинуть в `RoomManager`:

```ts
botDelayMs: (kind) => opts.botDelayMs ?? (kind === 'turn' ? randomInt(800, 1501) : BOT_DRAW_DELAY_MS),
onBotMove: (room) => broadcastState(io, room),
```

(`randomInt` из `node:crypto` уже используется для `roundSeed`.) `StartServerOptions.botDelayMs?: number`.

**`server/src/rooms/RoomManager.ts`**:

| Что                                       | Изменение                                                                                                                                                                                                                                                                                                                                           |
| ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SeatState`                               | `+ bot: boolean` (люди — `false`).                                                                                                                                                                                                                                                                                                                  |
| `Room`                                    | `+ botTimer: NodeJS.Timeout \| null`.                                                                                                                                                                                                                                                                                                               |
| `RoomManagerOptions`                      | `+ botDelayMs: (kind: 'turn' \| 'draw') => number` (по умолчанию `turn` → 800…1500, `draw` → 400); `+ onBotMove: (room: Room) => void`.                                                                                                                                                                                                             |
| константы                                 | `BOT_SEAT = 1 as const`, `BOT_DRAW_DELAY_MS = 400`, `BOT_TURN_DELAY_MS = [800, 1500]`.                                                                                                                                                                                                                                                              |
| `create()`                                | заполнять `bot: false`; инициализировать `botTimer: null`.                                                                                                                                                                                                                                                                                          |
| `createWithBot(socketId, name, settings)` | `create(...)` + `seats[1] = { name: BOT_NAME, token: generateToken(), socketId: null, bot: true, ... }` + общий с `join` старт матча (вынести хвост `join` в `private startMatch(room)`: `createMatch`, `ready = [false,false]`, `newRound`, `syncTimers`). Возвращает тот же тип, что `create`.                                                    |
| `syncTimers(room)`                        | новый приватный: `syncTurnTimer(room); syncBot(room)`. Заменяет **все** вызовы `syncTurnTimer` (`join`, `rejoin`, `move`, `ready`, `disconnect`, `onTurnTimeout`).                                                                                                                                                                                  |
| `syncBot(room, kind = 'turn')`            | `clearTimeout(botTimer)`; если условия B3 выполнены — `botTimer = setTimeout(() => onBotTurn(room), opts.botDelayMs(kind))`, иначе `null`.                                                                                                                                                                                                          |
| `onBotTurn(room)`                         | guard: комната всё ещё в менеджере и условия B3; `move = pickBotMove(toPlayerView(round, BOT_SEAT))`; `apply(room, BOT_SEAT, move)`; при ошибке — B10. Затем `syncTurnTimer(room)`, `syncBot(room, move.type === 'draw' && round.currentPlayer === BOT_SEAT ? 'draw' : 'turn')`, `opts.onBotMove(room)`. Лог: `room X bot move (play\|draw\|pass)`. |
| `apply()`                                 | после `recordRound` (переход в `finished`): `if (room.seats[1]?.bot) room.ready[1] = true` (B7).                                                                                                                                                                                                                                                    |
| `syncTurnTimer()`                         | `turnTimer = null`, если `room.seats[round.currentPlayer]?.bot` (B6); в `paused` не учитывать места с `bot: true`.                                                                                                                                                                                                                                  |
| `rejoin()`                                | место бота не находится по токену (токен бота никуда не отдаётся) — без изменений.                                                                                                                                                                                                                                                                  |
| `expire()`                                | соперник `bot` ⇒ `close(room, 'player_left')` (B5).                                                                                                                                                                                                                                                                                                 |
| `clearTimers()`                           | `+ clearTimeout(room.botTimer)`, `botTimer = null`.                                                                                                                                                                                                                                                                                                 |
| `ready()`                                 | без изменений.                                                                                                                                                                                                                                                                                                                                      |

**`server/src/rooms/validate.ts`**: `parseOpponent(value): Result<Opponent>` — `undefined` → `'human'`; `'human' | 'bot'` → ok; иначе ошибка.

**`server/src/rooms/handlers.ts`**:

- `room:create`: `opponent = parseOpponent(payload.opponent)`; ошибка → `INVALID_PAYLOAD`. `'bot'` → `rooms.createWithBot(...)`, лог `room X created vs bot (target…, hand…, turn…s)`; иначе как сейчас. Ack тот же `RoomJoinedAck` (seat 0, токен человека); затем `broadcastState`.
- `toRoomState`: `connected: state.bot || state.socketId !== null`, `reconnectRemainingMs: state.bot ? null : …`, `bot: state.bot`.

### 4.3 client

| Файл                                                           | Изменение                                                                                                                                                                                                                                                                                               |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `lobby/screens/NameForm.tsx`                                   | Необязательный `secondary?: { label: string; testId: string; onSubmit(name: string): void }` — вторая кнопка `type="button"` под основной, та же активность (`canSubmit && isValidName`). Enter в поле — по-прежнему основная кнопка.                                                                   |
| `lobby/screens/HomeScreen.tsx`                                 | `onCreate(name, settings, opponent: Opponent)`; `secondary = { label: 'Играть с ботом', testId: 'bot-button', onSubmit: … 'bot' }`. Настройки сохраняются (`save*`) для обеих кнопок.                                                                                                                   |
| `lobby/useLobby.ts`, `Lobby.tsx`                               | `create(name, settings, opponent = 'human')` → `createRoom(socket, { name, ...settings, opponent })` (поле `opponent` слать только при `'bot'`). Экран ожидания не показывается: первый `room:state` уже `playing` → `selectScreen` → `game`. Сессия/токен сохраняются как обычно (F5 → `room:rejoin`). |
| `game/MatchScore.tsx` (или место, где выводится имя соперника) | У соперника с `bot: true` — значок `🤖` перед именем, `data-testid="opponent-bot"`, `aria-label="бот"`.                                                                                                                                                                                                 |
| `game/GameTable.tsx`                                           | Комната с ботом (`players.some(p => p.bot)`) — `ReactionPanel` не рендерится (B9). Остальное — без изменений: «Ход соперника» на ходу бота, анимации/звуки (spec-10) из `diffTable` работают сами.                                                                                                      |
| `test/fixtures.ts`                                             | `bot: false` в фикстурах `RoomPlayer`; фикстура комнаты с ботом.                                                                                                                                                                                                                                        |

Клиент **ничего не решает за бота** и не имитирует задержку — только отображает `room:state`.

### 4.4 e2e / docs

- `playwright.config.ts` → `webServer.env`: `BOT_DELAY_MS: '300'` (ускорение e2e; реальные 0.8–1.5 с проверяются в server-тестах с фейковыми таймерами).
- `e2e/helpers.ts`: `createBotGame(page, name, opts?: CreateGameOptions)` — как `createGame`, но клик `bot-button` и ожидание `game-table`; `playRoundVsBot(page, maxSteps = 200)` — цикл: есть `round-summary` → return; `myTurn` → `makeMove(page)` и ждать изменения стола; иначе `expect.poll` до `myTurn` или `summary`; на каждом шаге — инвариант суммы 28 (`expectTotal`).
- `README.md`: раздел «Как сыграть с ботом» (2–3 строки), `BOT_DELAY_MS` в описании env, `bot.spec.ts` в списке e2e.

## 5. Протокол (Socket.IO)

Новых событий нет.

| Событие                                   | Направление | Изменение                                                                                                                                                                                                                          |
| ----------------------------------------- | ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `room:create`                             | C→S         | payload `+ opponent?: 'human' \| 'bot'`. Невалидное значение (`'Bot'`, `1`, `null`) → ack `{ ok: false, error: 'INVALID_PAYLOAD' }`, комната не создаётся. Успех — `{ ok: true, roomId, seat: 0, playerToken }` (как сейчас).      |
| `room:state`                              | S→C         | `players[i] + bot: boolean`. В комнате с ботом первый `room:state` после `room:create` — сразу `phase: 'playing'`, `players.length === 2`. Ходы бота приходят обычными `room:state`. После конца раунда `match.ready[1] === true`. |
| `room:join`                               | C→S         | Без изменений; в комнату с ботом → `ROOM_FULL`.                                                                                                                                                                                    |
| `room:info`                               | C→S         | Без изменений.                                                                                                                                                                                                                     |
| `game:move` / `game:ready` / `game:react` | C→S         | Без изменений. Попытка человека сходить на ходу бота → `NOT_YOUR_TURN` (как сейчас).                                                                                                                                               |

Пример `room:create`: `{ "name": "Аня", "matchTarget": 51, "handSize": 7, "turnSeconds": 0, "opponent": "bot" }`.

## 6. Критерии готовности

1. На главном экране есть кнопка «Играть с ботом» (`bot-button`), активна при валидном имени и соединении; по клику сразу открывается игровой стол (без экрана ожидания), соперник — «🤖 Бот».
2. Бот делает ход не раньше 800 мс и не позже 1500 мс после перехода хода к нему (`BOT_DELAY_MS` не задан); доборы подряд — по 400 мс.
3. Ход бота всегда допустим и соответствует B1 (самая тяжёлая → дубль → добор/пропуск); unit-тесты `pickBotMove` на наборе позиций (§7.1) зелёные.
4. Бот не использует скрытую информацию: `pickBotMove` принимает только `PlayerView` (проверяется типом и тестом B1h).
5. Раунд против бота доигрывается до экрана итогов; очки начисляются, табло обновляется; «Следующий раунд» стартует раунд сразу по одному нажатию человека (до нажатия видно «Соперник готов»); по достижении цели — «Реванш» стартует новый матч 0 : 0 одним нажатием.
6. Таймер хода (если выбран) тикает только на ходах человека; авто-ход по таймеру за человека работает как в spec-11.
7. F5 в игре с ботом возвращает на то же место; пока человек отключён, бот не ходит; по `RECONNECT_TIMEOUT` комната закрывается без техпоражения.
8. Игра двух людей не изменилась: все существующие unit/integration/e2e тесты зелёные без правки логики (допустима только правка фикстур под `bot: false`).
9. `npm run lint`, `npm run typecheck`, `npm test`, `npm run test:e2e` — зелёные.

## 7. Тест-кейсы

### 7.1 Unit — shared (`shared/src/rules/bot.test.ts`, имена `B1*:`; позиции — через `makeState` + `toPlayerView(state, 1)`, вход `deepFreeze`)

| ID  | Позиция                                                                                                                        | Ожидание                                                         |
| --- | ------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------- |
| B1a | Пустой стол, ход бота                                                                                                          | `{ play, openingTile, end: 'right' }`                            |
| B1b | Стол `4…1`, рука `[1,5] [3,4] [0,0]`                                                                                           | `[3,4]` (7 > 6), `end: 'left'`                                   |
| B1c | Стол `3…2`, рука `[2,4] [3,3]` (обе = 6)                                                                                       | `[3,3]` — дубль                                                  |
| B1d | Стол `1…4`, рука `[1,6] [3,4]` (обе = 7, дублей нет)                                                                           | первая из них по порядку `legalMoves`                            |
| B1e | Стол `5…3`, рука `[3,5]` — подходит к обоим концам                                                                             | конец — как у первого подходящего элемента `legalMoves`          |
| B1f | Нет подходящих, базар не пуст                                                                                                  | `{ type: 'draw' }`                                               |
| B1g | Нет подходящих, базар пуст                                                                                                     | `{ type: 'pass' }`                                               |
| B1h | Ход соперника (`currentPlayer ≠ you`) / `status: 'finished'`                                                                   | `null`                                                           |
| B1i | Тяжёлая кость в руке не подходит: рука `[6,6] [1,4]`, стол `4…0`                                                               | `[1,4]` (`[6,6]` игнорируется)                                   |
| B1j | Свойство: 200 сидов, доигрывание раунда, где **оба** места ходят `pickBotMove(toPlayerView(s, s.currentPlayer))`               | каждый ход `applyMove(...).ok`, раунд завершается ≤ 100 действий |
| B1k | Регрессия spec-11: `pickAutoMove(state)` ≡ `pickBotMove(toPlayerView(state, state.currentPlayer))` на 200 сидах по ходу раунда | равны                                                            |

Существующие `autoMove.test.ts` (T5a–…) проходят без изменений.

### 7.2 Unit — server (`RoomManager.test.ts`, `vi.useFakeTimers()`, `botDelayMs` подставляется; `startRound` из фикстуры; `validate.test.ts`, `config.test.ts`)

| ID   | Сценарий                                                                                                         | Ожидание                                                                                                        |
| ---- | ---------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| B2a  | `createWithBot`                                                                                                  | `seats[1].bot === true`, имя `Бот`, `round !== null`, `match.target === matchTarget`, `roomPhase === 'playing'` |
| B2b  | `join` в комнату с ботом                                                                                         | `ROOM_FULL`                                                                                                     |
| B3a  | Ход бота (фикстура: открывающий дубль у бота), `botDelayMs = 1000`                                               | до 999 мс `round.board.length === 0`; на 1000 мс — 1 кость, `onBotMove` вызван 1 раз                            |
| B3b  | Человек сходил → ход бота                                                                                        | бот ходит через задержку, затем ход у человека, таймер бота `null`                                              |
| B4a  | `botDelayMs` по умолчанию: 1000 вызовов `kind: 'turn'`                                                           | все в `[800, 1500]`; `kind: 'draw'` → 400                                                                       |
| B4b  | Бот без подходящей кости, базар 3, подходит 3-я                                                                  | 3 `draw` (первый через `turn`-задержку, следующие — по 400 мс), затем `play`; 4 вызова `onBotMove`              |
| B4c  | Базар пуст, хода нет                                                                                             | `pass` после задержки, ход у человека                                                                           |
| B5a  | Человек `disconnect` на ходу бота до срабатывания                                                                | ход не сделан, `botTimer === null`; после `rejoin` — ход через полную задержку                                  |
| B5b  | Человек не вернулся за `reconnectTimeoutMs`                                                                      | `onClose(room, 'player_left')`, `onForfeit` не вызван                                                           |
| B6a  | `turnSeconds = 30`, ход бота                                                                                     | `turnTimer === null`; ход человека — таймер идёт, не на паузе                                                   |
| B7a  | Раунд закончился ходом человека / ходом бота                                                                     | `ready === [false, true]`; `ready(room, 0)` → `started: 'round'`                                                |
| B7b  | Матч окончен (`winner !== null`)                                                                                 | `ready[1] === true`; `ready(room, 0)` → `started: 'match'`, счёт 0 : 0, бот снова ходит при необходимости       |
| B10a | `startRound`-фикстура + шпион `applyMove` → `!ok`                                                                | `console.error`, бот не перепланирован, исключения нет                                                          |
| V1   | `parseOpponent`: `undefined`→`human`, `'bot'`, `'human'` ok; `'Bot'`, `1`, `null`, `{}` → ошибка                 | —                                                                                                               |
| C1   | `parseBotDelay`: `''`/нет → `undefined`; `'0'`, `'300'`, `'5000'` ok; `'-1'`, `'5001'`, `'1.5'`, `'abc'` → throw | —                                                                                                               |
| R1   | Регрессия: в комнате двух людей `botTimer` всегда `null`, поведение `ready`/таймера не изменилось                | существующие тесты зелёные                                                                                      |

### 7.3 Integration — server (`server/src/bot.test.ts`, Socket.IO через `useTestServer({ roundSeed: () => 42, botDelayMs: 0 })`)

| ID  | Сценарий                                                                                         | Ожидание                                                                                                                |
| --- | ------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| I1  | `room:create { name, opponent: 'bot' }`                                                          | ack ok, seat 0; первый `room:state`: `phase 'playing'`, 2 игрока, у места 1 `bot: true, connected: true`                |
| I2  | `room:create { opponent: 'robot' }`                                                              | `INVALID_PAYLOAD`                                                                                                       |
| I3  | Второй клиент `room:join` в эту комнату                                                          | `ROOM_FULL`                                                                                                             |
| I4  | Клиент доигрывает раунд: на каждом `room:state`, где ход его, шлёт `game:move` с `legalMoves[0]` | приходит `room:state` с `phase 'finished'`, `match.ready = [false, true]`; `game:ready` → новый раунд (`roundNumber 2`) |
| I5  | `game:move` на ходу бота                                                                         | `NOT_YOUR_TURN`                                                                                                         |
| I6  | Комната двух людей (`room:create` без `opponent`)                                                | `players[*].bot === false`, поведение как раньше                                                                        |

### 7.4 Unit — client (Vitest + RTL, `fakeSocket`)

| ID  | Сценарий                                    | Ожидание                                                                                                                               |
| --- | ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| UC1 | `HomeScreen`: имя пустое / валидное         | `bot-button` disabled / enabled                                                                                                        |
| UC2 | Клик `bot-button` с выбранными настройками  | `room:create` с `{ name, matchTarget, handSize, turnSeconds, opponent: 'bot' }`; Enter в поле имени — `create-button` (без `opponent`) |
| UC3 | `room:state` с ботом после create           | рендерится `game-table`, не `waiting-screen`                                                                                           |
| UC4 | Соперник `bot: true`                        | виден `opponent-bot`, нет панели реакций; соперник-человек — нет `opponent-bot`, панель есть                                           |
| UC5 | Итоги раунда, `match.ready = [false, true]` | «Соперник готов», кнопка активна                                                                                                       |

### 7.5 E2E (Playwright, `e2e/bot.spec.ts`, `BOT_DELAY_MS=300`, timeout теста 120 с)

| ID   | Сценарий                                                 | Ожидание                                                                                                    |
| ---- | -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| E-B1 | Одна вкладка: имя → «Играть с ботом»                     | сразу `game-table`, видно `opponent-bot`, нет `invite-link`                                                 |
| E-B2 | `playRoundVsBot(page)` — игрок доигрывает раунд до конца | `round-summary` виден; на каждом шаге сумма костей = 28; бот сделал ≥ 1 ход (`opp` уменьшилось хотя бы раз) |
| E-B3 | На итогах                                                | «Соперник готов»; клик «Следующий раунд» → новый раунд (`Раунд 2` на табло)                                 |
| E-B4 | F5 в середине раунда против бота                         | тот же стол (рука, цепочка, счёт) и соперник-бот; бот продолжает ходить                                     |

## 8. Вне рамок

- Уровни сложности, «умная» стратегия (подсчёт костей, блокировка соперника), выбор имени/аватара бота.
- Бот на месте 0 / выбор, кто ходит первым; два бота; бот, подменяющий отключившегося человека.
- Реакции от бота, «реплики» бота.
- Статистика игр против бота, сохранение партий, оффлайн-режим без сервера.
- Изменение правил игры, таймера хода (spec-11) и переподключения (spec-9) для игр двух людей.

## 9. Допущения

1. **Стратегия = spec-11 T5.** Описание карточки совпадает с `pickAutoMove`, поэтому общий выбор вынесен в `chooseHeaviest`; при равенстве очков и «дубльности» — первый по порядку `legalMoves` (детерминированно, тестируемо).
2. **Бот решает по `PlayerView`**, а не по `RoundState` — честность гарантирована типом.
3. **Задержка «на действие», а не «на ход»:** каждый добор виден отдельно; чтобы серия доборов (до 14–18) не тянулась 20+ с, повторные доборы — 400 мс.
4. **Бот всегда на месте 1**, человек — создатель (место 0); первый ход — по R4 (может быть за ботом).
5. **Готовность бота** выставляется сразу в момент конца раунда (человек видит «Соперник готов») — это и есть «реванш подтверждается автоматически».
6. **Отключение человека:** бот ждёт; по таймауту комната закрывается без техпоражения (некому показывать результат).
7. **Таймер хода** применим только к человеку; настройка `turnSeconds` в игре с ботом сохраняется.
8. **Реакции** в игре с ботом скрыты в UI (сервер их не запрещает — лишняя логика не нужна).
9. **`BOT_DELAY_MS`** — тестовая env по образцу `TURN_TIMER_TEST_SECONDS`; в проде не задаётся. `PROTOCOL_VERSION` остаётся 1 (аддитивные поля, как в spec-14).
10. Ветка — от `task-14-room-settings`/`main` после merge стека #8–#14 (см. шапку).
