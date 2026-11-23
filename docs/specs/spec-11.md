# Spec #11 — Таймер хода

> Карточка: #11 (id 10164), теги `server`, `client`, приоритет medium.
> Файл в репозитории после PR: `docs/specs/spec-11.md` (кладёт разработчик).
> Зависит от: #7 (`MatchState`, итоги раунда), #9 (`reconnectDeadline`, `useCountdown`, `RECONNECT_TIMEOUT`), #10 (`diffTable`, звуки). PR #7–#9 (`task-8-deploy` → `task-9-reconnect` → `task-10-sound-fx`) на момент написания **ещё не смержены** в `main`. **Ветку `task-11-turn-timer` создавать от `main` после merge PR #9**; если он ещё открыт — от `task-10-sound-fx` и потом rebase. Все ссылки на код ниже — по состоянию `task-10-sound-fx`.

## 1. Цель

Партия не зависает, если игрок отошёл и не ходит:

1. При создании комнаты выбирается время на ход: **Выкл / 30 с / 60 с** (по умолчанию 60 с).
2. Сервер — единственный источник истины: держит дедлайн хода и по его истечении **сам доигрывает ход** за игрока (сыграть самую тяжёлую допустимую кость / добрать из базара / пропустить).
3. Клиент показывает обратный отсчёт у игрока, чей ход; последние 10 с выделены.
4. Пока кто-то из игроков отключён (#9), таймер хода стоит на паузе.

## 2. Контекст (что уже есть)

| Что                                                                                                                                                               | Где                                                                | Что делаем в #11                                          |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ | --------------------------------------------------------- |
| Правила: `getLegalMoves` (только `play`, иначе `draw`, иначе `pass`; первый ход — только `openingTile`), `applyMove`; после `draw` ход остаётся за тем же игроком | `shared/src/rules/round.ts`                                        | Добавляем чистую `pickAutoMove` (§4.1), правила не меняем |
| `tilePips`, `isDouble`                                                                                                                                            | `shared/src/rules/tiles.ts`                                        | Используем для выбора «самой тяжёлой»                     |
| Контракт Socket.IO, `RoomStatePayload`, `ServerHelloPayload`, `RoomCreatePayload`                                                                                 | `shared/src/protocol.ts`                                           | Новые поля (§5)                                           |
| `RoomManager`: `create/join/rejoin/move/ready/disconnect`, таймер переподключения через `setTimeout` + `opts.now` (RC1, RC8), `expire` → `onForfeit`, `closeAll`  | `server/src/rooms/RoomManager.ts`                                  | Таймер хода по тому же образцу, колбэк `onAutoMove`       |
| `toRoomState`, `broadcastState`, обработчики событий, `parseName/parseRoomId/...`                                                                                 | `server/src/rooms/handlers.ts`, `validate.ts`                      | `turnTimer` в состоянии, разбор `turnSeconds`             |
| Конфиг из env (`RECONNECT_TIMEOUT`, `MATCH_TARGET`, …)                                                                                                            | `server/src/config.ts`, `server/src/app.ts`, `server/src/index.ts` | `TURN_TIMER_TEST_SECONDS`                                 |
| `useCountdown(remainingMs)` + `formatMmSs` (локальный дедлайн = момент получения + остаток)                                                                       | `client/src/game/useCountdown.ts`                                  | Переиспользуем как есть                                   |
| Форма создания: `HomeScreen` → `NameForm` → `useLobby.create` → `createRoom(socket, { name })`                                                                    | `client/src/lobby/*`                                               | Выбор времени хода                                        |
| Игровой стол: `turn-indicator`, `OpponentHand`, `HandView`                                                                                                        | `client/src/game/GameTable.tsx`                                    | Компонент `TurnTimer`                                     |
| `diffTable`: многошаговое изменение стола → «тихая синхронизация» без анимаций                                                                                    | `client/src/fx/diffTable.ts`                                       | Ничего не меняем (см. §3 T9)                              |
| e2e: `createGame/startGame/playStep/...`, webServer с `RECONNECT_TIMEOUT=8000`                                                                                    | `e2e/helpers.ts`, `playwright.config.ts`                           | `TURN_TIMER_TEST_SECONDS=3`, `e2e/turn-timer.spec.ts`     |

## 3. Правила (нормативно)

ID `T*` используются в именах тестов (`'T5: …'`).

| ID  | Правило                                                                                                                                                                                                                                                                                                                                                    |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T1  | Настройка комнаты `turnSeconds ∈ {0, 30, 60}` (0 — выкл). Задаётся только в `room:create`, по умолчанию **60**, не меняется до закрытия комнаты (в т.ч. на следующий раунд и реванш).                                                                                                                                                                      |
| T2  | Ход = отрезок, пока `round.currentPlayer` не меняется. Таймер **запускается** с полным лимитом, когда: стартовал раунд (`join`, `ready` → новый раунд/матч), после хода сменился `currentPlayer`. **Не перезапускается** после `draw` (ход остаётся за тем же игроком — добор не продлевает время).                                                        |
| T3  | Таймер **не идёт**, если `turnSeconds = 0`, фаза не `playing` (waiting, раунд окончен, экран итогов/«Следующий раунд», матч окончен, техпоражение).                                                                                                                                                                                                        |
| T4  | По истечении сервер выполняет **авто-ход** за `currentPlayer`: повторяет `move = pickAutoMove(round)` → `applyMove`, пока раунд идёт и ход у того же игрока. Т.е. ход доигрывается целиком: добирает из базара, пока не появится допустимая кость (тогда играет её) или базар не опустеет (тогда пропуск).                                                 |
| T5  | `pickAutoMove(state)`: если в `getLegalMoves` есть `play` — **самая тяжёлая** кость: max `tilePips`; при равенстве — дубль; при равенстве — первый по порядку `getLegalMoves` (это фиксирует и конец цепочки). Иначе — единственный ход из `getLegalMoves` (`draw` или `pass`). Первый ход раунда — всегда `openingTile` (так уже отдаёт `getLegalMoves`). |
| T6  | Авто-ход проходит через те же правила, что и ручной: `applyMove`, начисление очков при конце раунда (`recordRound`, как в `RoomManager.move`), «рыба», конец матча. После авто-хода — один `room:state` обоим и (если раунд продолжается) таймер соперника с полным лимитом.                                                                               |
| T7  | **Пауза**: пока хотя бы одно место отключено (`socketId === null`), таймер стоит; остаток замораживается. Когда подключены оба — таймер продолжается **с замороженного остатка** (не сбрасывается). Отключение при уже стоящей паузе остаток не меняет.                                                                                                    |
| T8  | Гонка: ручной ход, пришедший раньше срабатывания таймера, отменяет таймер. Срабатывание таймера для уже сменившегося хода — no-op (проверка по счётчику `turnSeq`). Ручной `game:move` после авто-хода получает обычную ошибку правил (`NOT_YOUR_TURN` и т.п.).                                                                                            |
| T9  | Клиент ничего не решает: остаток берёт из `room:state`, по нулю ход не делает и кнопки не блокирует (сервер пришлёт новое состояние). Авто-ход с добором приходит одним `room:state` → `diffTable` даёт «тихую синхронизацию» — допустимо.                                                                                                                 |
| T10 | Срок истечения считается от `opts.now()` (как RC8). В `room:state` уходит остаток `max(0, deadline − now)` на момент отправки.                                                                                                                                                                                                                             |

## 4. Изменения по пакетам

### 4.1 shared

**`shared/src/rules/autoMove.ts`** (новый), экспорт из `rules/index.ts`:

```ts
/** T5: ход, который сервер делает за игрока по истечении таймера. null — раунд окончен. */
export function pickAutoMove(state: RoundState): Move | null;
```

- Чистая функция, вход не мутирует; для `status === 'finished'` → `null`.
- Тесты — `shared/src/rules/autoMove.test.ts` (§7.1).

**`shared/src/protocol.ts`**:

```ts
/** T1: допустимые значения времени на ход, с. 0 — таймер выключен. */
export const TURN_SECONDS_OPTIONS = [0, 30, 60] as const;
export type TurnSeconds = number; // значение из TURN_SECONDS_OPTIONS или тестовое (§4.2)
export const DEFAULT_TURN_SECONDS = 60;

/** Таймер текущего хода глазами игрока (T2–T10). */
export interface TurnTimerView {
  /** Чей ход тикает (= game.currentPlayer). */
  seat: PlayerIndex;
  /** Остаток, мс, на момент отправки. На паузе — замороженный остаток. */
  remainingMs: number;
  /** T7: стоит ли таймер (кто-то отключён). */
  paused: boolean;
}

export interface RoomStatePayload {
  // …существующие поля…
  /** T1: настройка комнаты, с; 0 — выкл. */
  turnSeconds: number;
  /** null — таймер не идёт (T3). */
  turnTimer: TurnTimerView | null;
}

export interface RoomCreatePayload {
  name: string;
  /** T1: необязательно; нет — DEFAULT_TURN_SECONDS. Не из списка (§4.2) — INVALID_PAYLOAD. */
  turnSeconds?: number;
}

export interface ServerHelloPayload {
  // …существующие поля…
  /** Значения для выбора на экране создания, по возрастанию, начиная с 0. Обычно [0, 30, 60]; с TURN_TIMER_TEST_SECONDS — плюс тестовое. */
  turnSecondsOptions: number[];
}
```

`PROTOCOL_VERSION` не меняем (клиент и сервер деплоятся вместе; поле в `room:create` необязательное).

### 4.2 server

**`server/src/config.ts`** — `parseTurnTimerTestSeconds(env.TURN_TIMER_TEST_SECONDS)`: целое 1…29, не задана/пусто → `undefined`, иначе `throw` с понятным сообщением (как `parseReconnectTimeout`). Поле `turnTimerTestSeconds?: number` в `ServerConfig`; `index.ts` прокидывает в `startServer`.

**`server/src/app.ts`** — `StartServerOptions.turnTimerTestSeconds?: number`. Список допустимых значений `allowedTurnSeconds = [0, (test?), 30, 60]` (отсортирован). Передаётся в `RoomManager` и в `server:hello.turnSecondsOptions`. Новый колбэк `onAutoMove: (room) => broadcastState(io, room)`.

> Тестовое значение нужно только e2e (§7.4): в проде переменная не задаётся, и выбрать можно лишь 0/30/60.

**`server/src/rooms/RoomManager.ts`**:

```ts
export interface TurnTimerState {
  seat: PlayerIndex;
  /** Монотонный номер хода (T8). */
  seq: number;
  /** Идёт: момент истечения по now(); на паузе — null. */
  deadline: number | null;
  /** На паузе: замороженный остаток, мс; идёт — null. */
  pausedRemainingMs: number | null;
  handle: NodeJS.Timeout | null;
}

export interface Room {
  // …
  /** T1 */
  turnSeconds: number;
  /** null — таймер не идёт (T3). */
  turnTimer: TurnTimerState | null;
}

export interface RoomManagerOptions {
  // …
  /** Допустимые turnSeconds (по умолчанию [0, 30, 60]). */
  allowedTurnSeconds?: readonly number[];
  /** T6: авто-ход сделан (комната ещё в менеджере). */
  onAutoMove: (room: Room) => void;
}
```

Изменения методов:

| Метод                                 | Что меняется                                                                                                               |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `create(socketId, name, turnSeconds)` | Сохраняет `room.turnSeconds`. Валидация значения — в обработчике (см. ниже), менеджер доверяет входу.                      |
| `join`                                | После старта раунда — `syncTurnTimer(room)`.                                                                               |
| `move`                                | Вынести общую часть в `private apply(room, seat, move)` (applyMove + `recordRound`); после успеха — `syncTurnTimer(room)`. |
| `ready`                               | При старте раунда/матча — `syncTurnTimer(room)`.                                                                           |
| `disconnect`                          | `syncTurnTimer(room)` → пауза (T7).                                                                                        |
| `rejoin`                              | `syncTurnTimer(room)` → продолжение, если подключены оба.                                                                  |
| `expire`, `close`, `closeAll`         | Снимать и таймер хода (`clearTimers` расширить).                                                                           |

`private syncTurnTimer(room)` — единственное место, которое решает судьбу таймера:

1. Если `turnSeconds === 0` или раунд не `playing` или матч окончен → снять таймер, `room.turnTimer = null`.
2. Если `currentPlayer` ≠ `turnTimer?.seat` (или таймера нет) → новый ход: `seq++`, остаток = полный лимит `turnSeconds * 1000`.
   Иначе (тот же ход, напр. после `draw`/rejoin/disconnect) — остаток = текущий (`deadline − now` или `pausedRemainingMs`).
3. Если какое-то место отключено → пауза: `deadline = null`, `pausedRemainingMs = остаток`, `handle` снят.
   Иначе → идёт: `deadline = now + остаток`, `pausedRemainingMs = null`, `setTimeout(() => this.onTurnTimeout(room, seq), остаток)`.

`private onTurnTimeout(room, seq)`:

1. Если комнаты уже нет в менеджере, `room.turnTimer?.seq !== seq` или таймер на паузе → return (T8).
2. `seat = room.round.currentPlayer`; цикл `while (round.status === 'playing' && round.currentPlayer === seat) { apply(room, seat, pickAutoMove(round)!) }` (максимум 15 итераций — 14 добора + ход; ошибка `apply` = баг → `console.error` и выход из цикла).
3. `console.info(\`room ${id} auto-move (seat ${seat}, ${n} moves)\`)`, `syncTurnTimer(room)`, `opts.onAutoMove(room)`.

**`server/src/rooms/handlers.ts`**:

- `room:create`: `turnSeconds = payload.turnSeconds ?? DEFAULT_TURN_SECONDS`; если не целое или не входит в `allowedTurnSeconds` → `INVALID_PAYLOAD`. Разбор — новая `parseTurnSeconds(raw, allowed)` в `validate.ts`.
- `toRoomState(room, you, now)`: `turnSeconds: room.turnSeconds`, `turnTimer`: `null`, если `room.turnTimer === null`; иначе `{ seat, remainingMs: paused ? pausedRemainingMs : max(0, deadline − now), paused: deadline === null }`.
- `registerRoomHandlers` получает `allowedTurnSeconds` (или читает из менеджера).

### 4.3 client

**Выбор при создании** — `client/src/lobby/screens/HomeScreen.tsx`:

- Над кнопкой «Создать игру» — группа радиокнопок «Время на ход»: `Выкл` / `30 с` / `60 с` (+ `N с (тест)` для тестового значения). Варианты — из `server:hello.turnSecondsOptions`; пока hello не пришёл — `TURN_SECONDS_OPTIONS`.
- `data-testid="turn-seconds"` у группы (`role="radiogroup"`), у вариантов `data-testid="turn-seconds-<N>"` (`turn-seconds-0`, `-30`, `-60`, `-3`).
- По умолчанию выбрано последнее значение из `localStorage` `domino:turnSeconds` (если оно есть в списке), иначе 60. Сохраняется при создании комнаты (чтение/запись в try/catch, как `storage.ts`).
- `useLobby.create(name, turnSeconds)` → `createRoom(socket, { name, turnSeconds })`. `NameForm` не меняем — выбор живёт в `HomeScreen` и передаётся в `onCreate(name, turnSeconds)`.
- `JoinScreen` не меняется: второй игрок принимает настройку комнаты.

**Показ настройки** — в `MatchScore`: в строку «до 101 · Раунд 3» добавить `· ход 60 с` (`data-testid="turn-seconds-label"`); при `turnSeconds = 0` — не показывать.

**Отсчёт** — новый `client/src/game/TurnTimer.tsx`:

```tsx
<TurnTimer timer={room.turnTimer} /> // null → ничего не рендерит
```

- Использует `useCountdown(timer.paused ? null : timer.remainingMs)`; на паузе показывает `timer.remainingMs` статично.
- Разметка: `<span className="turn-timer" data-testid="turn-timer" data-seat={seat} data-urgent data-paused>`; текст — `formatMmSs(left)`, на паузе с префиксом `⏸ `.
- **Последние 10 с** (`left ≤ 10_000`, не на паузе): класс `turn-timer--urgent`, `data-urgent="true"` — красный цвет и пульсация (`@keyframes`; при `prefers-reduced-motion` — только цвет). Иначе `data-urgent="false"`.
- `role="timer"`, `aria-live="off"` (не зачитывать каждую секунду); `aria-label="Осталось на ход: mm:ss"`.
- Размещение в `GameTable.tsx` «у игрока, чей ход»: `timer.seat === you` → рядом с `turn-indicator`/над своей рукой; иначе — рядом с `OpponentHand`. Рендерится ровно один `turn-timer`.
- Ремонтировать (`key`) по `seat`+`remainingMs` не нужно: `useCountdown` сам пересчитывает дедлайн на каждый новый `remainingMs`.

Без звука на последних 10 с (вне рамок).

### 4.4 e2e / docs

- `playwright.config.ts`: в `webServer.env` добавить `TURN_TIMER_TEST_SECONDS: '3'` (как `RECONNECT_TIMEOUT`).
- `e2e/helpers.ts`: `createGame(page, name, opts?: { turnSeconds?: number })` — перед кликом выбирает `turn-seconds-<N>`; без опции поведение прежнее (60 с, существующие сценарии не трогаем — их ходы укладываются в 60 с).
- `README.md`: пункт в «Как сыграть» (время на ход, авто-ход, пауза), строка `TURN_TIMER_TEST_SECONDS` в таблице переменных окружения (только для тестов), новые поля в таблице протокола, ссылка на `spec-11.md`.

## 5. Протокол (Socket.IO)

Новых событий нет. Изменения payload:

| Событие        | Направление | Изменение                                                                                                                       |
| -------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `server:hello` | S → C       | `+ turnSecondsOptions: number[]` (обычно `[0, 30, 60]`)                                                                         |
| `room:create`  | C → S       | `{ name, turnSeconds? }`; `turnSeconds` не из `turnSecondsOptions` или не целое → ack `{ ok: false, error: 'INVALID_PAYLOAD' }` |
| `room:state`   | S → C       | `+ turnSeconds: number`, `+ turnTimer: { seat, remainingMs, paused } \| null`                                                   |

Когда сервер шлёт `room:state` из-за таймера: после авто-хода (обоим, один раз за авто-ход), а также, как и раньше, после каждого действия/отключения/возврата — с актуальным `turnTimer`. Отдельных «тиков» сервер не шлёт.

Пример `room:state.turnTimer`:

```json
{ "turnSeconds": 60, "turnTimer": { "seat": 1, "remainingMs": 41230, "paused": false } }
{ "turnSeconds": 60, "turnTimer": { "seat": 1, "remainingMs": 41230, "paused": true } }   // соперник отключён
{ "turnSeconds": 0,  "turnTimer": null }                                                   // выкл
```

## 6. Критерии готовности

1. На экране создания есть выбор «Выкл / 30 с / 60 с», по умолчанию 60 с; выбранное значение приходит в `room:state.turnSeconds` обоим игрокам и сохраняется на следующий раунд и реванш.
2. `room:create` с `turnSeconds` вне списка → `INVALID_PAYLOAD`; без поля → 60.
3. По истечении таймера сервер сам делает ход по T4–T5 во всех трёх случаях: есть допустимая кость (играет самую тяжёлую), нужно добирать (добирает до допустимой и играет её либо до пустого базара и пропускает), пропуск при пустом базаре.
4. Добор вручную не продлевает время; смена хода (ручная или авто) запускает таймер соперника с полным лимитом.
5. Авто-ход корректно завершает раунд/матч (очки, «рыба», победитель) так же, как ручной.
6. При `turnSeconds = 0` таймера нет: `turnTimer: null`, ничего не происходит без действий игроков, на клиенте нет `turn-timer`.
7. Пока любой игрок отключён — `turnTimer.paused = true`, авто-хода нет; после возврата отсчёт продолжается с замороженного остатка.
8. Клиент показывает `mm:ss` у игрока, чей ход; при ≤ 10 с — `data-urgent="true"` и выделение; на паузе — `⏸` и статичное значение.
9. Нет утечек таймеров: после закрытия комнаты/техпоражения/`close()` сервера нет активных `setTimeout` (тесты с фейковыми таймерами: `vi.getTimerCount() === 0`).
10. `npm run lint`, `typecheck`, `test`, `test:e2e` зелёные; существующие тесты не ослаблены.

## 7. Тест-кейсы

### 7.1 Unit — shared (`shared/src/rules/autoMove.test.ts`, имена `T*:`)

| ID  | Сценарий                                                                                               | Ожидание                                         |
| --- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------ |
| T5a | Пустой стол                                                                                            | `openingTile` на `right`                         |
| T5b | К цепочке подходят `[3,4]` (7 очков) и `[1,5]` (6 очков)                                               | `[3,4]`                                          |
| T5c | Равные суммы: подходят `[3,3]` и `[2,4]`                                                               | `[3,3]` (дубль)                                  |
| T5d | Одна кость подходит к обоим концам                                                                     | первый вариант из `getLegalMoves` (тот же `end`) |
| T5e | Нет допустимой, базар не пуст                                                                          | `{ type: 'draw' }`                               |
| T5f | Нет допустимой, базар пуст                                                                             | `{ type: 'pass' }`                               |
| T5g | Раунд окончен                                                                                          | `null`                                           |
| T5h | Свойство: для 200 случайных сидов результат ∈ `getLegalMoves(state)`, вход не мутирован (`deepFreeze`) |

### 7.2 Server — `RoomManager.test.ts` (unit, `vi.useFakeTimers()`, `now` от фейковых часов, `startRound` из фикстуры) и `server/src/turn-timer.test.ts` (сокеты, `useTestServer({ roundSeed: () => 42, … })`, `vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] })` либо короткий лимит через `turnTimerTestSeconds: 1`)

**Три обязательных случая авто-хода (критерий карточки):**

| ID   | Сценарий                                                                                                | Ожидание                                                                                                                                           |
| ---- | ------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| T4a  | **Есть ход**: у текущего игрока подходят две кости разного веса; продвинуть время на `turnSeconds*1000` | сыграна более тяжёлая, `currentPlayer` сменился, базар не изменился, `onAutoMove` вызван 1 раз; соперник получил `turnTimer.remainingMs === 60000` |
| T4b  | **Нужно брать**: хода нет, в базаре первая кость не подходит, вторая подходит                           | добрано 2 кости, вторая сыграна, ход у соперника; в руке игрока +1 кость относительно начала хода                                                  |
| T4b′ | Нужно брать, и базар заканчивается без подходящей кости                                                 | добран весь базар, затем `pass`, ход у соперника                                                                                                   |
| T4c  | **Пропуск**: хода нет, базар пуст                                                                       | `pass`, ход у соперника, рука/стол не изменились                                                                                                   |

Прочие:

| ID  | Сценарий                                                                                      | Ожидание                                                                                                |
| --- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| T1a | `room:create` без `turnSeconds`                                                               | `room:state.turnSeconds === 60` у обоих после join                                                      |
| T1b | `turnSeconds: 0/30/60`                                                                        | принято; `45`, `"60"`, `-1`, `3` (без тестовой env) → `INVALID_PAYLOAD`                                 |
| T1c | `turnTimerTestSeconds: 3`                                                                     | `server:hello.turnSecondsOptions === [0, 3, 30, 60]`, `turnSeconds: 3` принят                           |
| T2a | Старт раунда                                                                                  | `turnTimer = { seat: currentPlayer, remainingMs: 60000, paused: false }`                                |
| T2b | Ручной `draw` через 20 с                                                                      | `remainingMs ≈ 40000` (не сброшен)                                                                      |
| T2c | Ручной `play` до истечения                                                                    | таймер соперника 60000; продвинуть время на 59 999 мс — авто-хода нет; ещё 1 мс — авто-ход за соперника |
| T3a | `turnSeconds: 0`                                                                              | `turnTimer === null`; `vi.advanceTimersByTime(10 мин)` — состояние не изменилось                        |
| T3b | Раунд окончен (в т.ч. авто-ходом) / ждём «Следующий раунд»                                    | `turnTimer === null`, таймеров нет; после `ready` обоих — снова 60000                                   |
| T6a | Авто-ход последней костью                                                                     | раунд `finished`, очки начислены ровно один раз, `turnTimer === null`                                   |
| T6b | Авто-ход доводит матч до `target`                                                             | `match.winner` установлен, фаза `finished`                                                              |
| T7a | Через 20 с отключился соперник ходящего                                                       | `paused: true, remainingMs ≈ 40000`; продвинуть 5 мин (меньше `reconnectTimeoutMs`) — авто-хода нет     |
| T7b | Отключился сам ходящий                                                                        | то же (пауза)                                                                                           |
| T7c | Возврат (`rejoin`)                                                                            | `paused: false, remainingMs ≈ 40000`; через 40 с — авто-ход                                             |
| T7d | Оба отключены, вернулся один                                                                  | всё ещё `paused: true`                                                                                  |
| T7e | Отключённый не вернулся → техпоражение                                                        | таймер хода снят, авто-хода нет, `vi.getTimerCount() === 0`                                             |
| T8a | Ручной ход в тот же тик, что истекает таймер (сначала ход)                                    | один ход, без двойного авто-хода; старый таймер не срабатывает                                          |
| T8b | Ручной `game:move` после авто-хода                                                            | ack `NOT_YOUR_TURN`                                                                                     |
| T9  | `closeAll()` / `server.close()` при идущем таймере                                            | `vi.getTimerCount() === 0`                                                                              |
| C1  | `parseTurnTimerTestSeconds`: `''`→undefined, `'3'`→3, `'0'`, `'30'`, `'abc'`, `'2.5'` → throw | `server/src/config.test.ts`                                                                             |

### 7.3 Client — Vitest + Testing Library (фейковый сокет `client/src/test/fakeSocket.ts`, `vi.useFakeTimers()`)

| ID  | Сценарий                                                                               | Ожидание                                                                                             |
| --- | -------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| TC1 | `HomeScreen`: варианты из `turnSecondsOptions`, по умолчанию отмечен `turn-seconds-60` | выбрали 30 → `room:create` с `{ name, turnSeconds: 30 }`; в `localStorage` `domino:turnSeconds = 30` |
| TC2 | Сохранённое значение отсутствует в списке / `localStorage` бросает                     | по умолчанию 60, без ошибок                                                                          |
| TC3 | `TurnTimer` с `{ remainingMs: 15000, paused: false }`                                  | `00:15`, `data-urgent="false"`; через 5 с — `00:10`, `data-urgent="true"`                            |
| TC4 | `paused: true`                                                                         | `⏸ 00:15`, через 5 с текст тот же, `data-paused="true"`                                              |
| TC5 | `turnTimer: null`                                                                      | `turn-timer` отсутствует                                                                             |
| TC6 | `GameTable`: `seat === you` / `seat !== you`                                           | таймер у своей руки / у руки соперника, ровно один элемент                                           |
| TC7 | Новый `room:state` с другим `remainingMs`                                              | отсчёт сразу с нового значения                                                                       |
| TC8 | `MatchScore`                                                                           | `· ход 60 с` при 60; нет при 0                                                                       |

### 7.4 E2E — `e2e/turn-timer.spec.ts` (Playwright, Chromium, `TURN_TIMER_TEST_SECONDS=3`, timeout теста 60 с)

| ID  | Сценарий                                                                 | Ожидание                                                                                                                                                                                                                                                                   |
| --- | ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| E19 | A создаёт игру с `turn-seconds-3`, B входит. **Никто ничего не делает.** | у ходящего виден `turn-timer` (≤ `00:03`, `data-urgent="true"`); в течение 10 с на столе у обоих появляется кость (`openingTile` сыгран авто-ходом), `turn-indicator` переключился; ещё через ≤ 10 с — второй авто-ход (стол или базар изменились, ход снова переключился) |
| E20 | Игра с `turn-seconds-3`: ходящий делает ход вручную до истечения         | ход принят, таймер появился у соперника; через 10 с бездействия соперника — авто-ход за него                                                                                                                                                                               |
| E21 | Игра с `turn-seconds-0`                                                  | `turn-timer` отсутствует у обоих; через 6 с стол не изменился                                                                                                                                                                                                              |
| E22 | Игра с `turn-seconds-3`: у ходящего соперника закрыт контекст (как X16)  | у оставшегося `turn-timer` с `data-paused="true"`; 6 с — стол не изменился (пауза); соперник возвращается по ссылке — отсчёт пошёл, авто-ход случился                                                                                                                      |

Существующие e2e (E1–E18, X16–X19) проходят без изменений (лимит по умолчанию 60 с).

## 8. Порядок реализации (рекомендация)

1. shared: `pickAutoMove` + тесты; поля протокола.
2. server: config/env → `RoomManager` (`syncTurnTimer`, `onTurnTimeout`) + unit-тесты → handlers/validate → `turn-timer.test.ts`.
3. client: выбор на `HomeScreen` → `TurnTimer` → размещение в `GameTable`, `MatchScore`.
4. e2e + README.

## 9. Вне рамок

- Изменение времени на ход после создания комнаты; выбор вторым игроком; иные значения (15 с, 120 с, произвольные).
- Таймер на экране итогов («Следующий раунд»/«Реванш») и в ожидании соперника.
- Санкции за систематические авто-ходы (техпоражение после N тайм-аутов), «банк времени», шахматные часы.
- Звук/вибрация на последних секундах; уведомление «ход сделан автоматически» (видно по смене стола/хода).
- Умный выбор авто-хода (стратегия, выбор конца цепочки) — только правило T5.
- Персистентность таймеров между рестартами сервера (комнаты и так в памяти).

## 10. Допущения

1. **База — ветка `task-10-sound-fx`.** Карточки #8–#10 на доске в Done, но их PR (#7–#9) не смержены; переподключение (#9) считаем сделанным, поэтому пауза (T7) — в рамках задачи.
2. **Авто-ход доигрывает ход целиком** (T4): добор до подходящей кости и её розыгрыш либо добор всего базара и пропуск. Альтернатива «одна кость за срабатывание и новый таймер» затягивала бы партию до 14 × лимит — противоречит цели карточки.
3. **«Самая тяжёлая»** = max суммы очков; при равенстве — дубль; далее порядок `getLegalMoves` (детерминированно, удобно для тестов).
4. **Пауза — при отключении любого из игроков**, не только соперника ходящего: пока кто-то офлайн, игра заморожена (и авто-ход за отключённого не делается — его судьбу решает `RECONNECT_TIMEOUT`). После возврата отсчёт продолжается с остатка, а не с полного лимита.
5. **Добор не продлевает время** (T2) — иначе ход можно затягивать бесконечно.
6. Для e2e нужен короткий лимит: вводится test-only env `TURN_TIMER_TEST_SECONDS` (1…29), которое добавляет одно значение к списку выбора; в проде не задаётся. Глобально лимит не подменяется, чтобы не ломать существующие e2e.
7. `PROTOCOL_VERSION` не повышается: клиент и сервер деплоятся вместе, новое поле `room:create` необязательно.
8. Ошибка `applyMove` внутри авто-хода невозможна по построению (ход из `getLegalMoves`); если всё же случилась — логируем и выходим из цикла, таймер пересинхронизируется (`syncTurnTimer`), сервер не падает.
