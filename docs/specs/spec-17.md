# Spec #17 — Игра на четверых (2 на 2)

> Карточка: #17 (id 10170), теги `shared`, `server`, `client`, приоритет low.
> Файл в репозитории после PR: `docs/specs/spec-17.md` (кладёт разработчик).
> Зависит от: #9 (переподключение, техпоражение), #11 (таймер хода), #14 (настройки комнаты — **образец** для новой настройки `mode`), #16 (варианты правил — интерфейс `RulesVariant` обобщаем на 4 руки), #12 (реакции).
> Ветки #8 → #16 стековые и на момент написания **не смержены** в `main`. **Ветку `task-17-teams` создавать от `main` после merge #16**; если он ещё открыт — от `origin/task-16-kozel` и потом rebase. Все ссылки на код ниже — по состоянию `task-16-kozel`.

## 1. Цель

1. Добавить режим комнаты **2×2**: 4 места, команды «места 1+3» и «места 2+4» (в коде — места `0+2` и `1+3`), напарники сидят напротив.
2. Правила 2×2: по 7 костей, базара нет, ход по кругу, нет хода — пропуск; раунд и очки — командные; «рыба» — побеждает команда с меньшей суммой.
3. UI 2×2: своя рука снизу, напарник сверху, соперники слева и справа рубашкой, табло по командам, вёрстка без горизонтального скролла от 360 px.
4. Переподключение, таймер хода и реакции работают для 4 игроков.
5. Режим 1×1 (по умолчанию) не меняется ни в поведении, ни в протоколе (кроме нового поля `mode`), все прежние тесты зелёные.

## 2. Контекст (что уже есть)

| Что                                                                                                                                                                                   | Где                                                                             | Что делаем в #17                                                |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| `PlayerIndex = 0 \| 1`, `RoundState.hands: [Tile[], Tile[]]`, `RoundResult.handPoints: [number, number]`                                                                              | `shared/src/rules/types.ts`                                                     | Обобщаем на 4 места (§4.1)                                      |
| `deal(deck, handSize)` — 2 руки + базар; `startRound({ seed, deck, handSize })`; `findOpening`, `isFish`, `opponent()` — на 2 руки                                                    | `shared/src/rules/{deck,round}.ts`                                              | Параметр `playerCount: 2 \| 4`, круг `nextSeat`                 |
| `resolveRound` (классика), `kozelVariant`, `RulesVariant`                                                                                                                             | `shared/src/rules/{scoring.ts,variants/}`                                       | Руки — массив любой длины; для 4 рук — командный итог           |
| `MatchState { scores, winner, forfeit }` — по местам 0/1; `recordRound`, `forfeitMatch`                                                                                               | `shared/src/rules/match.ts`                                                     | Те же поля, но индекс — **команда** (в 1×1 команда = место)     |
| `toPlayerView` — `opponentHandCount`, `opponentHand`                                                                                                                                  | `shared/src/rules/view.ts`                                                      | Для 4 мест — доп. поля `handCounts`, `hands`                    |
| `RoomSettings { matchTarget, handSize, turnSeconds, variant }`, `room:info`, плоские поля в `room:state`                                                                              | `shared/src/protocol.ts`, `server/src/rooms/{validate,handlers,RoomManager}.ts` | Ещё одна настройка `mode` — **так же**, как spec-14/16          |
| `Room.seats: [SeatState, SeatState \| null]`, `join` → место 1, `startMatch`, `ready: [boolean, boolean]`, `expire` (RC4–RC6), `syncTurnTimer` (пауза, если кто-то отключён), `react` | `server/src/rooms/RoomManager.ts`                                               | Массив мест длины 2/4; циклы `[0, 1] as const` → по всем местам |
| `broadcastState`, `emitReaction`, `toRoomState` — циклы по `[0, 1]`                                                                                                                   | `server/src/rooms/handlers.ts`                                                  | По всем местам комнаты                                          |
| `HomeScreen` (`ChoiceGroup`, `useChoice`, `storage.ts`), `JoinScreen`, `WaitingScreen`, `RoomSettingsLine`                                                                            | `client/src/lobby/**`                                                           | Группа «Игроки: 1 на 1 / 2 на 2», экран ожидания на 4 места     |
| `GameTable` (+ `OpponentHand`, `MatchScore`, `RoundSummary`, `TurnTimer`, `ReactionBubble`), `GameScreen` (плашка отключения), `ForfeitSummary`                                       | `client/src/game/**`, `client/src/lobby/screens/GameScreen.tsx`                 | Раскладка 2×2 отдельной веткой; путь 1×1 не трогаем             |
| `diffTable` (`Who = 'me' \| 'opponent'`), `useTileFlights`, `useReactions` (`mine` / `opponent`)                                                                                      | `client/src/fx/**`, `client/src/reactions/**`                                   | Для 4 мест — привязка к месту                                   |
| e2e: `newPlayer` (отдельный контекст на игрока), `createGame`/`startGame` с опциями, `playStep`/`playRoundToEnd`, `checkLayout`, `WIDTHS`                                             | `e2e/helpers.ts`                                                                | 4-игроковые хелперы + `e2e/team.spec.ts`                        |

## 3. Правила 2×2 (нормативно)

ID `Q*` — в именах тестов (`'Q6: …'`). Всё, что не сказано, — как в 1×1 (spec-3 R*, spec-7 M*, spec-14 S*, spec-16 K*).

| ID  | Правило                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Q1  | Места `0..3` по часовой стрелке. Команда места: `teamOf(s) = s % 2` → команда 0 = места 0 и 2, команда 1 = места 1 и 3 (в UI — «места 1 и 3» / «места 2 и 4»). Напарник: `(s + 2) % 4`. В 1×1 `teamOf(s) = s`.                                                                                                                                                                                                                                  |
| Q2  | Раздача: колода 28 (как R2), `hands[i] = deck[7i .. 7i+7)`, `i = 0..3`, `boneyard = []`. Размер руки в 2×2 — **только 7**.                                                                                                                                                                                                                                                                                                                      |
| Q3  | Первый ход — по R4 среди всех четырёх рук (т.к. розданы все 28 костей, это всегда `[6,6]`). Так же в каждом следующем раунде и в реванше.                                                                                                                                                                                                                                                                                                       |
| Q4  | Очередь: после `play` и `pass` ход переходит к `nextSeat(s) = (s + 1) % 4`. `draw` в 2×2 никогда не легален (`getLegalMoves` не возвращает его; запрос → существующие коды `MUST_PLAY` / `BONEYARD_EMPTY`).                                                                                                                                                                                                                                     |
| Q5  | Нет допустимого `play` → единственный легальный ход `pass` (существующая логика при пустом базаре).                                                                                                                                                                                                                                                                                                                                             |
| Q6  | **Домино**: место `s` выложило последнюю кость → раунд окончен, `winner = teamOf(s)`, `points` = сумма очков рук **двух мест команды соперников** (рука напарника не считается), `dominoSeat = s`.                                                                                                                                                                                                                                              |
| Q7  | **Рыба**: ни одно из 4 мест не может сыграть (базар пуст всегда). `teamPoints[t]` = сумма рук двух мест команды `t`. Меньшая сумма побеждает: `winner = t_min`, `points = teamPoints[1 − t_min]`. Суммы равны → `winner = null`, `points = 0`.                                                                                                                                                                                                  |
| Q8  | Матч — по командам: `scores[team]`, `recordRound` прежний (`scores[result.winner] += points`, конец при `≥ target`). Цель — настройка комнаты `matchTarget` (spec-14).                                                                                                                                                                                                                                                                          |
| Q9  | «Козёл» в 2×2 (spec-16, без особых правил): `winner` — как Q6/Q7, `scorer = 1 − winner` (команда), `points = teamPoints[scorer]`; ничья — `scorer = null`, 0. Команда, первой набравшая `≥ target`, — «козлы», `match.winner` = другая команда.                                                                                                                                                                                                 |
| Q10 | «Следующий раунд» / «Реванш» стартует, когда готовы **все 4** места (`ready[s]` по местам).                                                                                                                                                                                                                                                                                                                                                     |
| Q11 | Режим — настройка комнаты: задаётся только в `room:create` (`mode: '1x1' \| '2x2'`, нет поля → `'1x1'`), не меняется до закрытия комнаты. Иное значение → `INVALID_PAYLOAD`. В `2x2`: `opponent: 'bot'` → `INVALID_PAYLOAD`; `handSize` задан и ≠ 7 → `INVALID_PAYLOAD`; не задан → 7.                                                                                                                                                          |
| Q12 | Вход по ссылке: `room:join` занимает **наименьшее свободное** место. Свободных нет → `ROOM_FULL`. Матч стартует синхронно, когда заняты все 4 места (как K4 в 1×1).                                                                                                                                                                                                                                                                             |
| Q13 | Отключение в фазе `waiting` (2×2): истёк `RECONNECT_TIMEOUT` у места 0 (создатель) → комната закрывается `player_left` (как RC4); у места ≠ 0 → место **освобождается** (`seats[s] = null`), остальным — `room:state`; ссылка снова принимает игрока на это место.                                                                                                                                                                              |
| Q14 | Отключение в игре (2×2): истёк таймаут места `L`, матч не окончен и подключён **хотя бы один** игрок команды соперников → техпоражение команды `teamOf(L)`: `forfeit = teamOf(L)`, `forfeitSeat = L`, `winner = 1 − teamOf(L)`; финальный `room:state` всем подключённым (включая напарника `L`), затем комната удаляется (как RC5). Иначе (матч окончен или все соперники тоже отключены) → `room:closed { reason: 'player_left' }` (как RC6). |
| Q15 | Таймер хода (spec-11) — на месте `currentPlayer`; пауза, пока отключено **любое** место; авто-ход — `pickAutoMove` (в 2×2 это `play` или `pass`, ровно одно действие).                                                                                                                                                                                                                                                                          |
| Q16 | Реакции (spec-12): `room:reaction { seat, … }` — всем подключённым местам; кулдаун — на место.                                                                                                                                                                                                                                                                                                                                                  |

Пример (`handPoints` по местам 0..3 на конец раунда):

| Ситуация             | `handPoints`    | `teamPoints` | Итог                                    |
| -------------------- | --------------- | ------------ | --------------------------------------- |
| Место 2 вышло        | `[5, 9, 0, 4]`  | `[5, 13]`    | `winner 0`, `points 13`, `dominoSeat 2` |
| Рыба                 | `[3, 10, 6, 2]` | `[9, 12]`    | `winner 0`, `points 12`                 |
| Рыба поровну         | `[4, 5, 6, 5]`  | `[10, 10]`   | `winner null`, `points 0`               |
| Козёл, место 1 вышло | `[6, 0, 8, 3]`  | `[14, 3]`    | `winner 1`, `scorer 0`, `points 14`     |

## 4. Изменения по пакетам

### 4.1 shared

**`rules/types.ts`:**

```ts
/** Место за столом: 0..1 в 1×1, 0..3 в 2×2. */
export type PlayerIndex = 0 | 1 | 2 | 3;
/** spec-17: команда; в 1×1 команда = место. */
export type TeamIndex = 0 | 1;
export type PlayerCount = 2 | 4;

export interface RoundResult {
  reason: RoundEndReason;
  /** Команда-победитель раунда (в 1×1 = место). null — ничья. */
  winner: TeamIndex | null;
  points: number;
  /** Очки рук по местам; длина = число мест. */
  handPoints: number[];
  /** spec-16: команда, которой записаны points (только «Козёл»). */
  scorer?: TeamIndex | null;
  /** spec-17: только при 4 местах — суммы команд. */
  teamPoints?: [number, number];
  /** spec-17: только при 4 местах и reason 'domino' — кто вышел. */
  dominoSeat?: PlayerIndex;
}

export interface RoundState {
  /** Руки по местам; длина 2 или 4 = число мест. */
  hands: Tile[][];
  // остальное без изменений
}
```

Расширение `PlayerIndex` намеренно ломает `typecheck` везде, где индексировали кортежи `[x, y]` местом или считали соперника как `p === 0 ? 1 : 0`, — каждое такое место исправляется осознанно (место → `nextSeat` / `teamOf`).

**Новый `rules/seats.ts`** (экспорт из `rules/index.ts`):

```ts
export function playerCountOf(state: Pick<RoundState, 'hands'>): PlayerCount; // hands.length
export function nextSeat(seat: PlayerIndex, count: PlayerCount): PlayerIndex; // (seat + 1) % count
export function teamOf(seat: PlayerIndex, count: PlayerCount): TeamIndex; // count === 2 ? seat : seat % 2
export function teamSeats(team: TeamIndex, count: PlayerCount): PlayerIndex[]; // 2: [team]; 4: [team, team + 2]
export function partnerOf(seat: PlayerIndex): PlayerIndex; // (seat + 2) % 4, только для 4 мест
```

**`rules/deck.ts`:** `deal(deck, handSize = 7, playerCount: PlayerCount = 2)` → `{ hands: Tile[][], boneyard }`; `playerCount = 4` и `handSize ≠ 7` → `throw`. Для 2 мест результат побайтно прежний.

**`rules/round.ts`:**

| Место                     | Изменение                                                                     |
| ------------------------- | ----------------------------------------------------------------------------- |
| `StartRoundOptions`       | + `playerCount?: PlayerCount` (по умолчанию 2)                                |
| `findOpening(hands)`      | По всем рукам (Q3)                                                            |
| `opponent()`              | Удалить; везде `nextSeat(player, playerCountOf(state))`                       |
| `isFish`                  | `boneyard.length === 0 && hands.every(h => !hasPlay(board, h))`               |
| `applyPlay` / `applyDraw` | Новая рука — `hands.map((h, i) => i === player ? newHand : h)` вместо кортежа |
| `applyPlay` (домино)      | `variant.resolveRound('domino', hands, player)` — без изменений сигнатуры     |

**`rules/scoring.ts` — `resolveRound(reason, hands: readonly (readonly Tile[])[], dominoWinner?: PlayerIndex)`:**

- `hands.length === 2` — **ровно текущий код** и текущий объект (без `teamPoints`/`dominoSeat`);
- `hands.length === 4` — Q6/Q7, результат с `teamPoints` и (для домино) `dominoSeat`.

**`rules/variants/`:** в `RulesVariant.resolveRound` тип `hands` → `readonly (readonly Tile[])[]`. `kozel.resolveKozelRound`: `scorer = winner === null ? null : 1 − winner`; `points = scorer === null ? 0 : (classic.teamPoints ?? classic.handPoints)[scorer]` (Q9). `recordKozelRound` и `classic.recordRound` — без изменений логики (индекс уже командный).

**`rules/match.ts`:** `MatchState` — те же поля; в комментариях и типах: `scores` — по командам, `winner: TeamIndex | null`, `forfeit: TeamIndex | null` (команда с техпоражением), + необязательное `forfeitSeat?: PlayerIndex` (только 2×2). `createMatch` **не** добавляет `forfeitSeat` (M1 делает `toEqual`). `forfeitMatch(match, loserTeam, loserSeat?)` — `forfeitSeat` пишется, только если передан.

**`rules/view.ts` — `PlayerView`:**

```ts
export interface PlayerView {
  // все прежние поля без изменений
  /** spec-17: только при 4 местах — число костей по местам (включая своё). */
  handCounts?: number[];
  /** spec-17: только при 4 местах — все руки по местам при 'finished', иначе null. */
  hands?: Tile[][] | null;
}
```

Для 2 мест вид **побайтно прежний** (тест `view.test.ts` сравнивает набор ключей). Для 4 мест: `handCounts`, `hands` заполнены; `opponentHandCount = 0`, `opponentHand = null` (в 2×2 не используются). `legalMoves` — как раньше.

**`rules/autoMove.ts`, `rules/bot.ts`** — без изменений.

**`protocol.ts`:**

```ts
/** spec-17 Q11 */
export type RoomMode = '1x1' | '2x2';
export const ROOM_MODES: readonly RoomMode[] = ['1x1', '2x2'];
export const DEFAULT_ROOM_MODE: RoomMode = '1x1';
export function seatCountOf(mode: RoomMode): PlayerCount; // 2 | 4

export interface RoomSettings {
  /* прежние */ mode: RoomMode;
}
export interface RoomCreatePayload {
  /* прежние */ mode?: RoomMode;
}
export interface RoomInfoAck {
  roomId: string;
  settings: RoomSettings;
  /** spec-17: свободных мест сейчас. */ freeSeats: number;
}

export interface RoomStatePayload {
  // прежние поля
  /** spec-17: во всех фазах. players — занятые места по возрастанию seat (в 2×2 возможны пропуски, напр. [0, 2]). */
  mode: RoomMode;
}
export interface MatchView extends MatchState {
  /** Готовность по местам; длина = число мест. */
  ready: boolean[];
}
```

`RoomJoinedAck.seat`, `RoomRejoinedAck.seat`, `RoomPlayer.seat`, `RoomReactionPayload.seat`, `TurnTimerView.seat` — тип `PlayerIndex` (уже 0..3). `server:hello` и `PROTOCOL_VERSION` не меняем (как spec-11/14/16).

### 4.2 server

**`rooms/validate.ts`:** `parseMode(value): Parsed<RoomMode>` — по образцу `parseVariant` (нет поля → `'1x1'`).

**`rooms/handlers.ts`:**

- `room:create`: парсит `mode`; проверки Q11 (`2x2` + `bot` → `INVALID_PAYLOAD`; `2x2` + `handSize` задан и ≠ 7 → `INVALID_PAYLOAD`; не задан → 7). Лог: `room X created (2x2, classic, target 101, hand 7, turn 60s)`.
- `room:join`: лог `room X joined (seat N)`, при старте — `round started`.
- `toRoomState`: `players` — по всем местам комнаты, + `mode`; `match.ready` — копия массива.
- `broadcastState`, `emitReaction`, `notifyRoomClosed`, `notifyForfeit` — цикл по `room.seats` (длина 2/4) вместо `[0, 1] as const`.
- `room:info` → `{ settings: { …, mode }, freeSeats }`.

**`rooms/RoomManager.ts`:**

| Место                              | Изменение                                                                                                                                                                                                                                                                                                            |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Room`                             | `mode: RoomMode`; `seats: (SeatState \| null)[]` длины `seatCountOf(mode)`, `seats[0]` всегда занято; `ready: boolean[]` той же длины                                                                                                                                                                                |
| `create(socketId, name, settings)` | Умолчание `mode = '1x1'`; создаёт массивы нужной длины                                                                                                                                                                                                                                                               |
| `info`                             | + `mode`, `freeSeats` (число `null` в `seats`)                                                                                                                                                                                                                                                                       |
| `join`                             | Первое свободное место (Q12); нет — `ROOM_FULL`; `startMatch` только когда все места заняты; возвращает `seat: PlayerIndex`                                                                                                                                                                                          |
| `createWithBot`                    | Только 1×1 (обработчик не пропустит `2x2`) — без изменений                                                                                                                                                                                                                                                           |
| `newRound`                         | `startRound({ seed, handSize, playerCount: seatCountOf(room.mode) })`                                                                                                                                                                                                                                                |
| `rejoin`                           | Поиск токена по всем местам                                                                                                                                                                                                                                                                                          |
| `ready`                            | Старт, когда `ready.every(Boolean)` (Q10); сброс — `fill(false)`                                                                                                                                                                                                                                                     |
| `syncTurnTimer`                    | Логика прежняя (`room.seats.some(...)` уже покрывает 4 места) — проверить тестом Q15                                                                                                                                                                                                                                 |
| `onTurnTimeout`                    | Без изменений (`maxMoves = boneyard + 1` = 1 в 2×2)                                                                                                                                                                                                                                                                  |
| `expire(room, loser)`              | Ветка `waiting` + 2×2 + `loser ≠ 0` → освободить место, вызвать новый колбэк `onSeatFreed(room)` (Q13). Ветка игры: «соперник подключён» → «подключён хоть один из `teamSeats(1 − teamOf(loser))`»; `forfeitMatch(match, teamOf(loser), mode === '2x2' ? loser : undefined)` (Q14). 1×1 — побайтно прежнее поведение |
| `RoomManagerOptions`               | + `onSeatFreed?: (room: Room) => void` (в `app.ts` → `broadcastState`)                                                                                                                                                                                                                                               |
| `roomPhase`                        | Без изменений                                                                                                                                                                                                                                                                                                        |

**`app.ts`** — прокинуть `onSeatFreed`. Новых переменных окружения нет.

### 4.3 client

Принцип: при `room.mode === '1x1'` рендерится ровно прежнее дерево (все существующие RTL-тесты без правок, кроме фикстур с новым полем `mode`). 2×2 — отдельные компоненты.

**Лобби**

- `HomeScreen`: первой группой — `ChoiceGroup<RoomMode>` `testId="mode-choice"`, легенда «Игроки», подписи «1 на 1» / «2 на 2» (`mode-choice-1x1`, `mode-choice-2x2`). При `2x2`: группа «Костей в руке» `disabled`, выбрано 7, подсказка `data-testid="mode-hint"` «2 на 2: напарник напротив, по 7 костей, базара нет»; кнопка «Играть с ботом» `disabled` (в `NameForm` — проп `secondary.disabled`). Выбор запоминается в `localStorage['domino:mode']` (`loadMode`/`saveMode` в `storage.ts`, по образцу `loadVariant`). `onCreate` передаёт `mode`; в `2x2` поле `handSize` не отправляется.
- `RoomSettingsLine`: в `2x2` префикс «2 на 2 · », в `1x1` строка прежняя.
- `JoinScreen`: при `roomInfo.mode === '2x2'` — строка `data-testid="join-free-seats"` «Свободно мест: N из 4». Текст `ROOM_FULL` для 2×2 — «Все четыре места уже заняты» (для 1×1 прежний «В этой игре уже два игрока»).
- `WaitingScreen` (2×2; новые пропсы `mode`, `players`, `you`): «Ожидаем игроков: K/4» (`waiting-count`), список мест `waiting-seat-0..3`: «Место 1 · Команда 1: Аня (вы)» / «Место 2 · Команда 2: свободно». Ссылка-приглашение — та же. Экран видят все, кто вошёл до старта (фаза `waiting`) — `selectScreen` не меняется.

**Игровой стол 2×2** — `GameTable` при `game.handCounts` (4 места) рендерит новый `TeamTable`:

| Зона   | Место            | Содержимое                                                                             |
| ------ | ---------------- | -------------------------------------------------------------------------------------- |
| низ    | `you`            | своя рука (`HandView`), кнопка «Пропустить», панель реакций, свой таймер, своё облачко |
| верх   | `partnerOf(you)` | `SeatHand`: имя + «(напарник)», рубашки по `handCounts[seat]`                          |
| слева  | `(you + 1) % 4`  | `SeatHand`: имя, рубашки (вертикально)                                                 |
| справа | `(you + 3) % 4`  | `SeatHand`                                                                             |
| центр  | —                | `BoardView`                                                                            |

- `SeatHand` (новый, `client/src/game/SeatHand.tsx`): `data-testid="seat-top|seat-left|seat-right"`, `data-seat={seat}`, `data-active="true"` у ходящего (подсветка рамкой), имя `seat-name`, число `seat-hand-count`, метка «нет связи» `seat-offline` при `connected: false`, облачко реакции этого места, `TurnTimer`, если таймер на этом месте.
- Строка «Базар» и кнопка «Взять из базара» в 2×2 **не рендерятся**.
- Индикатор хода (`turn-indicator`, `data-my-turn` как раньше): «Ваш ход» / «Ход напарника: Вера» / «Ход: Боб».
- `MatchScore` (2×2): «Аня и Вера **34** : **12** Боб и Гена · до 101 · Раунд 3» — команда 0 слева; testid `match-score-0/1` — счёт команд; остальные пункты прежние; «по h костей» не показывается.
- `RoundSummary` (2×2): заголовок `round-finished` — «Ваша команда выиграла раунд: +13 (домино)» / «Раунд выиграла команда Боб и Гена: +13 (рыба)» / «Рыба — ничья»; «Козёл»: «Очки записаны вашей команде: +14 (домино)» / «Очки записаны команде Боб и Гена: +14 (рыба)» / «Рыба — ничья, очков никому». Четыре руки лицом (`summary-hand-0..3`, данные из `game.hands`), суммы команд `summary-team-points-0/1`. Итог матча: «Ваша команда выиграла матч!» / «Матч выиграла команда X и Y»; «Козёл»: «Ваша команда — козлы! Матч выиграла команда X и Y» / «Вы выиграли матч! X и Y — козлы». Статус готовности: «Ждём остальных: K/4» (вы нажали) / «Готовы: K/4» (вы нет, K > 0) / пусто.
- `ForfeitSummary` (2×2): победа — «Победа! Игрок команды соперников не вернулся в игру»; `forfeitSeat === you` — прежний текст поражения; иначе — «Поражение: напарник не вернулся в игру». Сравнение — по `teamOf(you)`.
- `GameScreen`: плашка отключения в 2×2 — для первого отключённого места: «{имя} отключился, ждём… mm:ss» (testid `opponent-offline` / `opponent-countdown` те же).
- `useReactions`: дополнительно `bySeat: Partial<Record<PlayerIndex, Bubble>>`; `mine`/`opponent` для 1×1 как раньше. В 2×2 облачко места `s` рисуется в его `SeatHand`, своё — как раньше.
- `fx/diffTable`: если у видов есть `handCounts` — события `play`/`draw` определяются по `handCounts`, у чужих ходов добавляется `seat`; для 2 мест события и тесты прежние. `useTileFlights`: источник полёта чужой кости — элемент `[data-seat="<seat>"]`. Звуки — прежние (`turn` — когда ход перешёл ко мне).
- **Адаптив** (`game.css`): CSS grid `"top top top" / "left board right" / "me me me"`. При ширине < 600 px боковые `SeatHand` — компактные (колонка ≤ 64 px: имя с `text-overflow: ellipsis`, вместо ряда рубашек — одна рубашка и «× N»), верхний — одна строка рубашек мелкого размера. На 360/390/768/1280 px — без горизонтального скролла, ключевые элементы в вьюпорте (`checkLayout`), кнопки ≥ 44 px (spec-13).

### 4.4 e2e

`e2e/helpers.ts`:

- `CreateGameOptions.mode?: '1x1' | '2x2'` → `createGame` отмечает `mode-choice-<mode>`;
- `startTeamGame(browser, { names?, turnSeconds?, variant?, matchTarget?, viewport? })` → `{ pages: [Page, Page, Page, Page], contexts, link }`: 4 контекста через `newPlayer`, A создаёт 2×2, B/C/D входят по ссылке (по порядку → места 1, 2, 3), ждёт `game-screen` у всех;
- `currentMoverOf(pages)` — страница с `data-my-turn="true"` (ровно одна);
- `readTeamTable(page)` → `{ hand, board, seats: Record<'top'|'left'|'right', { seat, count, active }>, summary }`;
- `playTeamStep(pages)` — ход ходящего (`makeMove` уже умеет `play`/`pass`) + инварианты §7.5 на всех 4 страницах;
- `playTeamRoundToEnd(pages, maxSteps = 200)`.

## 5. Протокол

| Событие                                                                               | Направление | Изменение payload                                                                                                                                                                                                                                                           | Ответ / смысл                                                                                                     |
| ------------------------------------------------------------------------------------- | ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `room:create`                                                                         | C → S       | + `mode?: '1x1' \| '2x2'`                                                                                                                                                                                                                                                   | нет поля → `1x1`; иное → `INVALID_PAYLOAD`; `2x2` + `opponent:'bot'` или `handSize ≠ 7` → `INVALID_PAYLOAD` (Q11) |
| `room:join`                                                                           | C → S       | —                                                                                                                                                                                                                                                                           | `seat` — наименьшее свободное (1..3 в 2×2); нет мест → `ROOM_FULL` (Q12)                                          |
| `room:info`                                                                           | C → S       | —                                                                                                                                                                                                                                                                           | `settings` + `mode`; новое поле `freeSeats`                                                                       |
| `room:state`                                                                          | S → C       | + `mode` (все фазы); `players` — до 4, по `seat`; `match.ready` — длина 2/4; `match.forfeitSeat?` (2×2); `game.handCounts?`, `game.hands?` (2×2); `game.result.teamPoints?`, `dominoSeat?` (2×2); `scores`/`winner`/`forfeit`/`result.winner`/`scorer` — индексы **команд** | В 1×1 значения побайтно прежние, кроме `mode: '1x1'`                                                              |
| `room:reaction`                                                                       | S → C       | —                                                                                                                                                                                                                                                                           | `seat` 0..3, всем подключённым (Q16)                                                                              |
| `room:closed`, `room:rejoin`, `game:move`, `game:ready`, `game:react`, `server:hello` | —           | без изменений                                                                                                                                                                                                                                                               | `game:ready` в 2×2 ждёт всех 4 (Q10)                                                                              |

README: «Как сыграть с друзьями вчетвером» (выбор «2 на 2», ссылка на троих, раскладка), правила 2×2 в «Правила раунда», `team.spec.ts` в «Структура».

## 6. Критерии готовности

1. `npm run typecheck`, `npm run lint`, `npm test`, `npm run test:e2e` — зелёные; **существующие тесты не правятся**, кроме добавления поля `mode: '1x1'` в фикстуры / `toEqual` протокольных payload (`room:info` в `server/src/settings.test.ts`, `client/src/test/fixtures.ts`) и `freeSeats` в ответ `room:info` — как это делали spec-14/16.
2. `startRound({ playerCount: 4 })`: 4 руки по 7, базар пуст, первый ход — `[6,6]`, очередь `0→1→2→3→0` (Q2–Q4) — unit.
3. Итог раунда 2×2 по Q6/Q7/Q9 совпадает с таблицей примеров §3 — unit.
4. Для 2 мест `startRound`/`applyMove`/`toPlayerView`/`resolveRound` дают побайтно прежние объекты (property-тест по 40 seed × handSize 5/6/7, как V-2 в spec-16).
5. Сервер: 4 сокета встречаются, матч стартует ровно при 4-м `join`; 5-й получает `ROOM_FULL`; каждый видит только свою руку (`hand`) и `handCounts` остальных — integration.
6. Q13/Q14/Q15/Q16 покрыты integration-тестами с фейковыми таймерами.
7. UI: в 2×2 своя рука снизу, напарник сверху, соперники слева/справа, рубашки соответствуют `handCounts`, табло по командам; на 360 px нет горизонтального скролла — e2e.
8. e2e: четыре браузерных контекста делают не менее 8 ходов подряд с проверкой инвариантов (E-T2).
9. В 1×1 UI, тексты и `data-testid` не изменились (все прежние e2e и RTL-тесты зелёные без правок).

## 7. Тест-кейсы

### 7.1 unit — shared (`rules/seats.test.ts`, `rules/team.test.ts`, дополнения `variants/kozel.test.ts`)

| ID   | Кейс                                                                                                                                                              |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Q1-1 | `teamOf`: 2 места → `[0,1]`; 4 места → `[0,1,0,1]`; `partnerOf(1) = 3`; `nextSeat(3, 4) = 0`; `teamSeats(1, 4) = [1, 3]`                                          |
| Q2-1 | `deal(deck, 7, 4)` → 4 руки по 7 подряд из колоды, `boneyard = []`; `deal(deck, 6, 4)` → throw; `deal(deck, 7)` = прежний результат                               |
| Q3-1 | 20 seed: `startRound({ seed, playerCount: 4 })` — `openingTile = [6,6]`, `currentPlayer` = владелец `[6,6]`                                                       |
| Q4-1 | Фиксированное состояние: после `play` места 3 ходит 0; после `pass` места 1 ходит 2                                                                               |
| Q4-2 | `getLegalMoves` в 2×2 никогда не содержит `draw` (100 случайных раундов до конца)                                                                                 |
| Q5-1 | Нет `play` → `[{ type: 'pass' }]`; `draw` → `MUST_PLAY`/`BONEYARD_EMPTY` по прежней логике                                                                        |
| Q6-1 | Место 2 выкладывает последнюю → `{ reason:'domino', winner:0, points:13, handPoints:[5,9,0,4], teamPoints:[5,13], dominoSeat:2 }`                                 |
| Q6-2 | Рука напарника вышедшего не входит в `points`                                                                                                                     |
| Q7-1 | Рыба `[3,10,6,2]` → `winner 0`, `points 12`, `teamPoints [9,12]`; нет `dominoSeat`                                                                                |
| Q7-2 | Рыба `[4,5,6,5]` → `winner null`, `points 0`                                                                                                                      |
| Q7-3 | Рыба наступает, только если **все 4** без хода (у одного есть ход — раунд идёт)                                                                                   |
| Q8-1 | `recordRound` с командным результатом: `scores[winner] += points`, конец матча при `≥ target`                                                                     |
| Q9-1 | Козёл 2×2: место 1 вышло, `[6,0,8,3]` → `winner 1`, `scorer 0`, `points 14`; рыба поровну → `scorer null`, 0                                                      |
| Q-V1 | `toPlayerView` 4 мест: `hand` — своя, `handCounts` длины 4, `hands = null` при `playing` и все 4 руки при `finished`; `opponentHandCount 0`, `opponentHand null`  |
| Q-R1 | Регресс: 40 seed × handSize 5/6/7 — цепочки состояний и виды для 2 мест равны снимку, построенному старым кодом (набор ключей `PlayerView`/`RoundResult` прежний) |
| Q-F1 | `forfeitMatch(m, 1, 3)` → `{ winner 0, forfeit 1, forfeitSeat 3 }`; `forfeitMatch(m, 1)` — без ключа `forfeitSeat`                                                |

### 7.2 unit — server (`validate.test.ts`, `RoomManager.test.ts`)

| ID   | Кейс                                                                                                                                                               |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| S-Q1 | `parseMode`: `undefined → '1x1'`; `'2x2'` ок; `'2X2'`, `4`, `null`, `''` → fail                                                                                    |
| S-Q2 | `create({ mode:'2x2' })` → `seats.length 4`, `ready.length 4`; `info` → `mode '2x2'`, `freeSeats 3`                                                                |
| S-Q3 | `join` ×3 → места 1, 2, 3; после 2-го `round === null`, после 3-го — раунд с 4 руками, `match` создан; 4-й `join` → `ROOM_FULL`                                    |
| S-Q4 | `ready`: 3 места → раунд не стартует; 4-е → новый раунд, `ready` сброшен                                                                                           |
| S-Q5 | Q13: waiting, место 2 отключилось и истёк таймаут → `seats[2] = null`, `onSeatFreed` вызван, следующий `join` получает место 2; место 0 → `onClose('player_left')` |
| S-Q6 | Q14: игра, место 3 истекло, место 0 подключено → `forfeit 1`, `forfeitSeat 3`, `winner 0`, `onForfeit`; если места 0 и 2 оба отключены → `onClose('player_left')`  |
| S-Q7 | Q15: отключено место 2 → таймер на паузе; вернулось → продолжается с остатка; истёк на месте 1 → ровно один авто-ход, ход у места 2                                |
| S-Q8 | 1×1: существующие тесты `RoomManager.test.ts` зелёные без правок                                                                                                   |

### 7.3 integration — server (Socket.IO, новый `server/src/team.test.ts`; раунд через `startRound`-фабрику с фиксированной колодой)

| ID   | Кейс                                                                                                                                                                                                                                                    |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| I-Q1 | `room:create { mode:'2x2', handSize:6 }` → `INVALID_PAYLOAD`; `{ mode:'2x2', opponent:'bot' }` → `INVALID_PAYLOAD`; `{ mode:'2x2' }` → ok, `room:state.mode = '2x2'`, `handSize 7`                                                                      |
| I-Q2 | 4 сокета: после каждого `join` все подключённые получают `room:state` с `players.length` = 2, 3, 4; после 4-го `phase 'playing'`, у каждого `game.hand.length 7`, `handCounts [7,7,7,7]`, `boneyardCount 0`; в payload места `s` нет костей других мест |
| I-Q3 | 5-й сокет `room:join` → `ROOM_FULL`; `room:info` → `freeSeats 0`                                                                                                                                                                                        |
| I-Q4 | Ходы по кругу: `game:move` не в свою очередь → `NOT_YOUR_TURN`; раунд до домино → у всех 4 одинаковый `result` с `teamPoints`, `match.scores` командные                                                                                                 |
| I-Q5 | `game:ready` от 3 мест → `ready` с тремя `true`, раунд не начат; от 4-го → `roundNumber 2`                                                                                                                                                              |
| I-Q6 | `game:react` с места 2 → `room:reaction { seat: 2 }` получили все 4                                                                                                                                                                                     |
| I-Q7 | Отключение места 1 → остальные 3 видят `connected:false`, `reconnectRemainingMs`; `room:rejoin` по токену → то же место, та же рука                                                                                                                     |
| I-Q8 | Техпоражение (Q14) с `RECONNECT_TIMEOUT` = 200 мс → 3 оставшихся получают `phase 'finished'`, `match.forfeit`, `forfeitSeat`; затем `game:move` → `NOT_IN_ROOM`                                                                                         |

### 7.4 unit — client (Vitest + RTL)

| ID    | Кейс                                                                                                                                                                                         |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C-Q1  | `HomeScreen`: выбор «2 на 2» → hand-size `disabled` и 7, «Играть с ботом» `disabled`, подсказка видна; `room:create` уходит с `mode:'2x2'` без `handSize`; выбор сохраняется в `domino:mode` |
| C-Q2  | `WaitingScreen` 2×2: «Ожидаем игроков: 2/4», места 1–4 с командами, «(вы)» у своего                                                                                                          |
| C-Q3  | `JoinScreen` 2×2: «Свободно мест: 1 из 4»; `ROOM_FULL` → «Все четыре места уже заняты»                                                                                                       |
| C-Q4  | `TeamTable` (`you = 1`): `seat-top` — место 3, `seat-left` — место 2, `seat-right` — место 0; рубашки = `handCounts`; `data-active` у `currentPlayer`; нет `boneyard` и `draw-button`        |
| C-Q5  | Индикатор: «Ваш ход» / «Ход напарника: …» / «Ход: …»                                                                                                                                         |
| C-Q6  | `MatchScore` 2×2: «Аня и Вера 34 : 12 Боб и Гена»                                                                                                                                            |
| C-Q7  | `RoundSummary` 2×2: тексты классики и «Козла» (по таблице §4.3), 4 руки, `summary-team-points-*`, «Ждём остальных: 3/4»                                                                      |
| C-Q8  | `ForfeitSummary` 2×2: три текста (победа / сам не вернулся / напарник не вернулся)                                                                                                           |
| C-Q9  | Реакция `room:reaction { seat: 3 }` → облачко внутри `[data-seat="3"]`                                                                                                                       |
| C-Q10 | `diffTable` на видах 4 мест: `play` места 2 → `{ type:'play', who:'opponent', seat: 2, … }`; для 2 мест — прежние события (старые тесты без правок)                                          |
| C-Q11 | Таймер хода на месте 2 → `TurnTimer` внутри его `SeatHand`; на своём — снизу                                                                                                                 |

### 7.5 e2e (Playwright, новый `e2e/team.spec.ts`)

Инварианты `playTeamStep` на каждой из 4 страниц: `board + hand + Σ seat-hand-count = 28`; `board` одинаков у всех; `seat-hand-count` места `s` у каждого = длине руки на странице места `s`; `data-my-turn="true"` ровно у одной страницы; после `play` ход у следующего по кругу.

| ID   | Сценарий                                                                                                                                                                                                                                          |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| E-T1 | 4 контекста: A создаёт «2 на 2» — `waiting-count` «1/4»; B, C входят — у всех вошедших «3/4»; D входит — у всех 4 игровой стол. У A: `seat-top` = C, `seat-left` = B, `seat-right` = D; нет «Базар»/«Взять из базара»; первый ход у владельца 6:6 |
| E-T2 | **Четыре браузерных контекста делают по несколько ходов**: 8 × `playTeamStep` (каждый игрок сходил минимум 2 раза, если раунд не кончился раньше) с инвариантами                                                                                  |
| E-T3 | Раунд до конца (`playTeamRoundToEnd`): `round-summary` у всех 4, 4 руки лицом, табло одинаково у всех, счёт команды-победителя = `round-points`; все 4 жмут «Следующий раунд» → «Раунд 2» у всех                                                  |
| E-T4 | 5-й контекст по ссылке: «Свободно мест: 0 из 4» → «Войти» → «Все четыре места уже заняты»                                                                                                                                                         |
| E-T5 | Середина раунда: C делает F5 → у A, B, D метка `seat-offline`/плашка, затем пропадает; у C та же рука; ещё 2 `playTeamStep`                                                                                                                       |
| E-T6 | `turnSeconds: 3`: никто не ходит → через ~3 с у всех 4 на столе 6:6, ход у следующего места                                                                                                                                                       |
| E-T7 | B шлёт реакцию → у A облачко в `seat-left`, у C — в `seat-right`, у D — в `seat-top`                                                                                                                                                              |
| E-T8 | Ширина 360 px, 4 контекста: на столе и на итогах раунда `noHorizontalScroll` и `checkLayout` для `seat-top`, `seat-left`, `seat-right`, `match-score`, `turn-indicator`, `pass-button`                                                            |
| —    | Все прежние e2e (1×1) без правок                                                                                                                                                                                                                  |

## 8. Вне рамок

- Бот в 2×2, смешанные столы (люди + боты), режимы на 3 игрока, «каждый сам за себя» вчетвером.
- Выбор места/команды игроком, пересадка, смена режима в созданной комнате (в т.ч. перед реваншем).
- Особые правила командного домино/«Козла»: первый ход победителя прошлого раунда, «яйца», «голый» 0:0 = 25, удвоение за рыбу и т.п.
- Подсказки/чат для напарников, показ руки напарника.
- Техпоражение без закрытия комнаты (замена ушедшего игрока, игра втроём).
- Новые env-переменные, изменение `server:hello`, `PROTOCOL_VERSION`, скриншоты `npm run screens` для 2×2.
- Полёты костей для чужих ходов, если `[data-seat]`-источник не найден, — допускается мгновенное появление (без падения).

## 9. Допущения

1. **База — `task-16-kozel`** (стек #8–#16 не смержен в `main`); при merge стека — rebase, ссылки на код остаются верны.
2. **Очки за домино в 2×2** — сумма рук двух соперников (рука напарника не прибавляется и не вычитается); за рыбу — сумма команды-проигравшей (симметрично классике «победитель получает руку соперника»). Карточка правило не уточняет.
3. **Первый ход каждого раунда** — владелец `[6,6]` (R4/Q3), а не победитель прошлого раунда — как в 1×1.
4. **«Козёл» в 2×2 разрешён** и работает по Q9 без особых правил: интерфейс `RulesVariant` обобщается почти бесплатно, а запрет потребовал бы отдельной валидации и UI. Если продукт решит иначе — достаточно отклонять `mode:'2x2' + variant:'kozel'` в `room:create`.
5. **Командный индекс вместо нового поля**: `MatchState.scores/winner/forfeit` и `RoundResult.winner/scorer` переосмысляются как индексы команд (в 1×1 команда = место, значения не меняются) — чтобы не трогать M1/R*/K* тесты и протокол 1×1. Новые поля (`teamPoints`, `dominoSeat`, `forfeitSeat`, `handCounts`, `hands`) **необязательные** и появляются только при 4 местах — как `scorer` в spec-16.
6. **Добавление `mode` в `room:state`/`room:info` и `freeSeats` в `room:info`** — единственная правка существующих тестов/фикстур (как `variant` в spec-16); это не считается «покраснением» прежних тестов.
7. **Отключение в waiting** (Q13): место не-создателя освобождается, чтобы 4-й игрок мог зайти по той же ссылке; уход создателя закрывает комнату, как в 1×1.
8. **Техпоражение — командное** (Q14): уход одного игрока приводит к поражению его команды; напарник получает финальный экран поражения.
9. Нумерация в UI — с 1 («места 1 и 3»), в коде и протоколе — с 0 (места 0 и 2), как в карточке.
10. Раскладка «слева — следующий по ходу, справа — предыдущий» соответствует ходу по часовой стрелке при виде сверху.
