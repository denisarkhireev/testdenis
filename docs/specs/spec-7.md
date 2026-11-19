# Spec #7 — Конец партии и подсчёт очков

> Карточка: #7 (id 8070), теги `server`, `client`, приоритет medium.
> Файл в репозитории после PR: `docs/specs/spec-7.md` (кладёт разработчик).
> Зависит от: #3 (`RoundResult`, `resolveRound`, R11–R13), #4 (`RoomManager`, `room:state`, K12), #5 (лобби), #6 (`GameTable`, `RoundResultBanner`, e2e-хелперы) — всё в `main` (`790f1dd`).

## 1. Цель

Превратить одиночный раунд в **матч до 101 очка** в той же комнате:

1. после конца раунда у обоих игроков — экран итогов: кто выиграл и почему (домино / рыба / ничья), **раскрытые руки обоих**, суммы очков на руках, начисленные очки;
2. общий счёт матча виден на столе всё время (в т.ч. во время раунда);
3. следующий раунд стартует, когда **оба** нажали «Следующий раунд»; очки копятся;
4. как только у кого-то счёт ≥ 101 — матч окончен, экран победителя матча и кнопка «Реванш» (новый матч 0:0 в той же комнате, когда оба нажали);
5. e2e: два игрока доигрывают раунд до конца, видят итоги, начинают следующий раунд.

Сервер — источник истины: начисление очков, счёт, конец матча, старт нового раунда — только на сервере. Клиент рисует `room:state` и шлёт намерение `game:ready`.

## 2. Контекст (что уже есть)

| Что | Где | Использование в #7 |
| --- | --- | --- |
| `RoundResult { reason, winner, points, handPoints }`, `resolveRound` (R11–R13: домино — победитель тот, кто вышел; рыба — у кого меньше очков на руке; равенство — ничья, 0 очков; победитель получает очки руки соперника) | `shared/src/rules/types.ts`, `scoring.ts` | Без изменений — это очки раунда, которые идут в счёт матча |
| `startRound({ seed })` — первый ход у владельца старшей кости (R4) | `shared/src/rules/round.ts` | Вызывается для каждого раунда матча, правило первого хода не меняется |
| `toPlayerView` — при `finished` отдаёт `result`, но руку соперника не раскрывает | `shared/src/rules/view.ts` | Добавить раскрытие руки соперника только при `finished` |
| `RoomManager`: одна `round` на комнату, `roomPhase()` → `waiting/playing/finished`; K12 — после конца раунда комната живёт, `game:move` → `ROUND_FINISHED` | `server/src/rooms/RoomManager.ts` | Добавить `match` и готовность мест; новый раунд/реванш без смены `roomId` |
| `toRoomState`, `broadcastState`, `withAck` | `server/src/rooms/handlers.ts` | Новый обработчик `game:ready`, новое поле `match` в payload |
| `RoomStatePayload`, `GameErrorCode`, `ClientToServerEvents` | `shared/src/protocol.ts` | Расширить (§5) |
| `RoundResultBanner` (`data-testid="round-finished"`) — минимальный итог (spec-6 §3.5) | `client/src/game/RoundResultBanner.tsx`, `GameTable.tsx` | Заменить экраном итогов `RoundSummary` |
| `GAME_ERROR_TEXT` — исчерпывающий маппинг кодов | `client/src/game/errors.ts` | Добавить новый код |
| `selectScreen`: `finished` → экран `game` | `client/src/lobby/useLobby.ts` | Без изменений |
| e2e-хелперы `startGame`, `playStep`, `readTable`, `makeMove` (seed-независимый ход) | `e2e/helpers.ts` | Новый хелпер `playRoundToEnd` |

## 3. Правила матча (нормативно)

| ID | Правило |
| --- | --- |
| M1 | Матч начинается при входе второго игрока (вместе с первым раундом): счёт `[0, 0]`, цель `target = 101`, номер раунда 1. |
| M2 | Когда раунд переходит в `finished`, сервер **ровно один раз** прибавляет `result.points` к счёту `result.winner`. Ничья (`winner === null`) — счёт не меняется. Результат раунда добавляется в историю `rounds`. |
| M3 | Если после начисления счёт победителя раунда ≥ `target` — матч окончен, `match.winner = winner`. Ничьей матча не бывает (за раунд очки получает максимум один игрок). |
| M4 | Матч не окончен и раунд `finished` → каждый игрок может отправить `game:ready`. Когда готовы **оба** — сервер синхронно стартует новый раунд (`startRound({ seed: roundSeed() })`), `roundNumber += 1`, готовность сбрасывается. Первый ход — по R4 (старшая кость), независимо от того, кто выиграл прошлый раунд. |
| M5 | Матч окончен → `game:ready` означает «Реванш». Когда готовы оба — новый матч: счёт `[0, 0]`, `rounds = []`, `roundNumber = 1`, `winner = null`, новый раунд. |
| M6 | `game:ready` идемпотентен: повтор от уже готового игрока → `ok`, состояние не меняется, `room:state` не рассылается. Отменить готовность нельзя. |
| M7 | `game:ready` во время раунда (`playing`) → `ROUND_NOT_FINISHED`; в `waiting` → `GAME_NOT_STARTED`; без комнаты → `NOT_IN_ROOM`. |
| M8 | Готовность хранится за местом, а не за сокетом: переживает отключение/`room:rejoin` в пределах grace. Отключённый соперник не блокирует свою готовность, но новый раунд стартует только при готовности обоих. Закрытие комнаты по grace (K9) — без начисления/техпоражения. |
| M9 | Рука соперника раскрывается в `PlayerView` **только** при `status === 'finished'`; во время раунда утечек нет (G8 остаётся в силе). |

## 4. Изменения по пакетам

### 4.1 shared

**`shared/src/rules/match.ts`** (новый, чистые функции, plain JSON):

```ts
export const MATCH_TARGET = 101;

export interface MatchState {
  target: number;
  /** Счёт мест 0 и 1. */
  scores: [number, number];
  /** Номер текущего (или последнего сыгранного) раунда, с 1. */
  roundNumber: number;
  /** Итоги сыгранных раундов по порядку. */
  rounds: RoundResult[];
  /** != null ⇔ матч окончен (M3). */
  winner: PlayerIndex | null;
}

export function createMatch(target?: number): MatchState;              // M1, M5
export function recordRound(match: MatchState, result: RoundResult): MatchState; // M2, M3; throw, если матч уже окончен
export function nextRoundNumber(match: MatchState): MatchState;        // M4: roundNumber + 1
```

- `recordRound` не мутирует вход; `target` валидируется в `createMatch` (целое > 0, иначе throw).
- Экспорт из `shared/src/rules/index.ts`: `MATCH_TARGET`, `createMatch`, `recordRound`, `nextRoundNumber`, тип `MatchState`.

**`shared/src/rules/view.ts`** — в `PlayerView` новое поле:

```ts
/** Рука соперника — только при status === 'finished' (M9), иначе null. */
opponentHand: Tile[] | null;
```

Обновить комментарий у `result` (руки теперь раскрываются полностью после конца раунда).

**`shared/src/protocol.ts`**:

```ts
export interface MatchView extends MatchState {
  /** Нажал ли игрок места i «Следующий раунд»/«Реванш» (M4–M6). Всегда [false,false] при playing. */
  ready: [boolean, boolean];
}

export interface RoomStatePayload {
  // ...как было
  /** null в waiting; иначе состояние матча (M1). */
  match: MatchView | null;
}

export type GameErrorCode =
  MoveError | 'INVALID_PAYLOAD' | 'NOT_IN_ROOM' | 'GAME_NOT_STARTED' | 'ROUND_NOT_FINISHED';

// ClientToServerEvents
'game:ready': (payload: GameReadyPayload, ack: (res: AckResult<object, GameErrorCode>) => void) => void;
export type GameReadyPayload = Record<string, never>; // {} ; любой объект принимается, лишние поля игнорируются
```

`RoomPhase` не меняется (`finished` = раунд окончен; окончен ли матч — `match.winner !== null`). `PROTOCOL_VERSION` остаётся `1` (изменения аддитивные, клиент и сервер деплоятся вместе).

### 4.2 server

**`RoomManager.ts`**:

- `Room` += `match: MatchState | null` (null в waiting), `ready: [boolean, boolean]`.
- `RoomManagerOptions` += `matchTarget: number`.
- `join`: вместе с `startRound` — `room.match = createMatch(opts.matchTarget)`, `ready = [false, false]` (M1).
- `move`: после успешного `applyMove`, если предыдущий `round.status === 'playing'`, а новый `'finished'` → `room.match = recordRound(room.match, round.result!)` (M2, M3; строго один раз).
- Новый метод `ready(roomId, seat): Result<{ room: Room; changed: boolean }, GameErrorCode>`:
  - нет комнаты → `NOT_IN_ROOM`; `round === null` → `GAME_NOT_STARTED`; `round.status === 'playing'` → `ROUND_NOT_FINISHED` (M7);
  - уже готов → `{ changed: false }` (M6);
  - иначе `ready[seat] = true`; если оба готовы: при `match.winner !== null` → `match = createMatch(target)` (M5), иначе `match = nextRoundNumber(match)` (M4); затем `round = startRound({ seed: roundSeed() })`, `ready = [false, false]`; `changed: true`.
- `disconnect`/`rejoin` готовность не трогают (M8).

**`handlers.ts`**:

- `toRoomState`: `match: room.match ? { ...room.match, ready: [...room.ready] } : null`.
- Обработчик `game:ready` через `withAck`: payload должен быть объектом, иначе `INVALID_PAYLOAD`; нет `socket.data.roomId/seat` → `NOT_IN_ROOM`; вызывает `rooms.ready`; `ack({ ok: true })`; `broadcastState` только если `changed`. Лог `room <id> ready (seat N)` / `room <id> round <n> started` / `room <id> rematch`.

**`app.ts` / `index.ts`**:

- `StartServerOptions.matchTarget?: number` (по умолчанию `MATCH_TARGET`), прокинуть в `RoomManager`.
- `index.ts`: переменная окружения `MATCH_TARGET` (целое > 0; иначе — ошибка запуска, как для остальных переменных). Нужна для ручной проверки и тестов матча, по умолчанию 101.

### 4.3 client

**Удалить** `RoundResultBanner.tsx` (и его использование), заменить:

1. **`game/MatchScore.tsx`** — табло матча, всегда над столом (`data-testid="match-score"`):
   `Аня 34 : 12 Боб · до 101 · Раунд 3`. Порядок — место 0 : место 1 (как в `players`), без пометки «(вы)». Элементы: `match-score-0`, `match-score-1` (только число), `match-round` (номер раунда), `match-target`.

2. **`game/RoundSummary.tsx`** — экран итогов, показывается **вместо** `turn-indicator` и блока `controls`, когда `game.status === 'finished'` (стол-цепочка остаётся видимой выше). Корень `data-testid="round-summary"`. Содержимое:

   | Элемент | testid | Текст |
   | --- | --- | --- |
   | Заголовок итога раунда (сохраняем testid из #6) | `round-finished` | `winner === you`: «Вы выиграли раунд: +N»; соперник: «Раунд выиграл <имя>: +N»; ничья: «Рыба — ничья». Суффикс причины: `domino` — « (домино)», `fish` с победителем — « (рыба)» |
   | Очки раунда | `round-points` | число `result.points` |
   | Своя рука | `summary-hand-<seat>` | кости `TileFace` (лицом), пустая рука — текст «пусто»; подпись «<имя>: N очк.» где N = `handPoints[seat]` (`summary-hand-points-<seat>`) |
   | Рука соперника | `summary-hand-<seat>` | из `game.opponentHand`, так же |
   | Итог матча (только если `match.winner !== null`) | `match-finished` | «Вы выиграли матч!» / «Матч выиграл <имя>» + финальный счёт |
   | Кнопка | `continue-button` | матч идёт: «Следующий раунд»; матч окончен: «Реванш» |
   | Статус готовности | `ready-status` | я готов: «Ждём соперника…» (кнопка `disabled`); соперник готов, я нет: «Соперник готов»; иначе пусто |

   Порядок рук: сначала место 0, потом 1 (как в табло). Сумма на кнопке/табло считается **не** на клиенте — только из `match` и `result`.

3. **`game/gameApi.ts`** — `sendReady(socket): Promise<MoveResult>` (`emitWithAck('game:ready', {})` с `ACK_TIMEOUT_MS`, reject → `'timeout'`), по образцу `sendMove`.

4. **`useGameTable.ts`** — метод `ready()` с той же защитой `pendingRef` (повторный клик в полёте игнорируется); кнопка `continue-button` активна, если `status === 'connected'`, `!pending`, `!match.ready[you]`. Ошибка ack — в существующий `move-error` (внутри `RoundSummary` рендерить такой же `<p data-testid="move-error" role="alert">`).

5. **`errors.ts`** — `ROUND_NOT_FINISHED: DESYNC_TEXT`.

6. **`GameTable.tsx` / `GameScreen.tsx`** — `GameTable` получает `match` из `room.match` (при `phase !== 'waiting'` он не null; если null — табло не рисовать). Новый раунд приходит обычным `room:state` с `status: 'playing'` — экран итогов исчезает сам, выбор/ошибки сбрасываются существующим механизмом `Bound<T>` (новая ссылка на `game`).

7. **`game.css`** — `round-summary` в одну колонку, руки переносятся (`flex-wrap`), на 360 px без горизонтальной прокрутки; кнопка ≥ 44 px высотой.

8. **`client/src/test/fixtures.ts`** — `makeRoom` по умолчанию добавляет `match: makeMatch()` (`scores [0,0]`, `target 101`, `roundNumber 1`, `rounds []`, `winner null`, `ready [false,false]`); `makeView` — `opponentHand: null`.

### 4.4 e2e / docs

- `e2e/helpers.ts`: `playRoundToEnd(a, b, maxSteps = 200)` — вызывает `playStep`, пока на обеих вкладках не появится `round-summary`; падает, если за `maxSteps` не закончился. `readTable` дополнить `scores: [number, number]` (из `match-score-0/1`).
- `playStep`: после хода, закончившего раунд, `turn-indicator` пропадает — существующая проверка уже учитывает это (`count() > 0`); проверка «итого 28 костей» на `finished` не применяется (рука соперника рисуется в `round-summary`, а не `opponent-tile`) — убедиться, что `readTable` считает только `hand-tile-*`/`opponent-tile`/`board-tile-*`, а финальная проверка инвариантов в `playStep` пропускается, если появился `round-summary`.
- `README.md`: шаг 5 «Как сыграть» — итоги раунда, матч до 101, «Следующий раунд»/«Реванш»; в таблицу протокола — `game:ready`; в таблицу переменных — `MATCH_TARGET`; ссылка на `docs/specs/spec-7.md`.
- `docs/specs/spec-7.md` — этот файл.

## 5. Протокол (Socket.IO)

| Событие | Направление | Payload | Ответ / смысл |
| --- | --- | --- | --- |
| `game:ready` (новое) | C → S | `{}` | ack `{ ok: true }` или `{ ok: false, error }`: `INVALID_PAYLOAD`, `NOT_IN_ROOM`, `GAME_NOT_STARTED`, `ROUND_NOT_FINISHED`. Смысл: «Следующий раунд» (матч идёт) или «Реванш» (матч окончен). При изменении — `room:state` обоим |
| `room:state` (изменено) | S → C | `RoomStatePayload` + `match: MatchView \| null`; `game.opponentHand: Tile[] \| null` | Рассылается также после начисления очков (внутри ответа на ход), после `game:ready` и при старте нового раунда/матча |
| `game:move` | C → S | без изменений | в `finished` по-прежнему `ROUND_FINISHED` |

Пример `room:state` у места 0 после выигрыша раунда местом 1 (домино):

```json
{
  "roomId": "ABC234", "you": 0, "phase": "finished",
  "players": [{ "seat": 0, "name": "Аня", "connected": true }, { "seat": 1, "name": "Боб", "connected": true }],
  "game": {
    "you": 0, "hand": [[2, 5], [6, 6]], "opponentHand": [], "opponentHandCount": 0,
    "boneyardCount": 3, "board": ["…"], "currentPlayer": 1, "status": "finished",
    "result": { "reason": "domino", "winner": 1, "points": 19, "handPoints": [19, 0] },
    "legalMoves": []
  },
  "match": { "target": 101, "scores": [0, 19], "roundNumber": 1,
             "rounds": [{ "reason": "domino", "winner": 1, "points": 19, "handPoints": [19, 0] }],
             "winner": null, "ready": [false, false] }
}
```

## 6. Критерии готовности

1. `npm run lint`, `npm run typecheck`, `npm test`, `npm run test:e2e` зелёные; CI (`checks`, `e2e`) проходит.
2. После последнего хода раунда обе вкладки без перезагрузки показывают `round-summary`: верный заголовок, обе руки лицом, суммы `handPoints`, `+points` — совпадают с `room:state.game.result`.
3. Табло `match-score` видно во время раунда и на экране итогов; после раунда счёт победителя вырос ровно на `result.points` (M2), при ничьей не изменился.
4. «Следующий раунд»: после клика одного игрока у него «Ждём соперника…» и кнопка неактивна, у другого — «Соперник готов»; после клика второго обе вкладки на новом раунде (`board` пуст, 7/7/14, `match-round` = 2), счёт сохранён.
5. Счёт ≥ 101 (проверяется с `matchTarget`/`MATCH_TARGET`) → `match-finished` с именем победителя, кнопка «Реванш»; после двух кликов — счёт 0 : 0, раунд 1.
6. `game:ready` во время раунда → `ROUND_NOT_FINISHED`; повторный `ready` не рассылает `room:state`; `game:move` в `finished` → `ROUND_FINISHED`.
7. Во время раунда `room:state` не содержит костей соперника (`opponentHand: null`), после конца — содержит ровно его руку.
8. F5 на экране итогов восстанавливает тот же экран и ту же готовность; F5 после старта нового раунда — новый раунд.
9. На ширине 360 px экран итогов без горизонтальной прокрутки, кнопка видима.
10. `RoundResultBanner` удалён, `data-testid="round-finished"` сохранён на заголовке итогов.

## 7. Тест-кейсы

### 7.1 Unit — `shared/src/rules/match.test.ts` (имена `M*:`)

| ID | Сценарий | Ожидание |
| --- | --- | --- |
| M1 | `createMatch()` | `{ target: 101, scores: [0,0], roundNumber: 1, rounds: [], winner: null }`; `createMatch(0)`/`createMatch(1.5)` → throw |
| M2a | `recordRound` с `winner: 1, points: 19` | `scores [0,19]`, `rounds.length 1`, вход не изменён |
| M2b | ничья `winner: null, points: 0` | счёт не изменился, раунд в истории |
| M3a | счёт `[95, 0]`, раунд +6 за место 0 | `scores [101, 0]`, `winner 0` (ровно 101 — победа) |
| M3b | счёт `[95, 0]`, +5 | `winner null` |
| M3c | `recordRound` при `winner != null` | throw |
| M4 | `nextRoundNumber` | `roundNumber + 1`, остальное без изменений |
| V1 | `toPlayerView` в `playing` | `opponentHand === null` |
| V2 | `toPlayerView` в `finished` | `opponentHand` равен `hands[соперник]` (в т.ч. `[]` у вышедшего) |

### 7.2 Server — `server/src/rooms/RoomManager.test.ts` (unit) и `server/src/match.test.ts` (сокеты, `useTestServer({ roundSeed: () => 42, matchTarget })`, имена `N*:`)

| ID | Сценарий | Ожидание |
| --- | --- | --- |
| N1 | `room:join` | `room:state.match` = M1-состояние, `ready [false,false]`; в `waiting` у создателя `match: null` |
| N2 | Доиграть раунд по `getLegalMoves` локальной копии (как G7) | последний `room:state`: `phase finished`, `match.scores[winner] === result.points`, `rounds.length 1`, `opponentHand` = локальная рука соперника |
| N3 | `game:ready` во время раунда | `ROUND_NOT_FINISHED`, нет `room:state` |
| N4 | `game:ready` до старта / вне комнаты / payload `null` | `GAME_NOT_STARTED` / `NOT_IN_ROOM` / `INVALID_PAYLOAD` |
| N5 | Место 0 `ready` | ack ok; оба получают `room:state` с `ready [true,false]`, `phase finished` |
| N6 | Место 0 `ready` повторно | ack ok, `expectNoState` у обоих |
| N7 | Место 1 `ready` | оба получают `phase playing`, `roundNumber 2`, `ready [false,false]`, счёт сохранён, 7/7/14, `board []` |
| N8 | `matchTarget: 1`, доиграть раунд с победителем | `match.winner === result.winner`; `ready` обоих → `scores [0,0]`, `roundNumber 1`, `rounds []`, `winner null`, `phase playing` |
| N9 | Место 0 `ready`, место 0 отключилось и вернулось `room:rejoin` | `ready [true,false]` сохранён (M8); место 1 `ready` → новый раунд |
| N10 | G8 (утечки) обновить | во время `playing` нет костей соперника; в `finished` разрешена только `game.opponentHand` (и `handPoints` — числа) |
| N11 | Ничья по рыбе (готовая колода через `deck` в unit-тесте `RoomManager`, подставленная фабрикой раунда) | счёт не меняется, `rounds.length 1` |

Для N11 допускается добавить в `RoomManagerOptions` необязательный `startRound?: () => RoundState` (по умолчанию `startRound({ seed: roundSeed() })`) — только для тестов.

### 7.3 Client — компонентные (`game/RoundSummary.test.tsx`, `game/GameTable.test.tsx`, фейковый сокет)

| ID | Сценарий | Ожидание |
| --- | --- | --- |
| S1 | `playing` | `match-score` «Аня 0 : 0 Боб», нет `round-summary` |
| S2 | `finished`, победил `you` по домино | `round-finished` «Вы выиграли раунд: +19 (домино)», обе руки в `summary-hand-0/1`, суммы, кнопка «Следующий раунд» активна, `turn-indicator` и `draw-button` отсутствуют |
| S3 | победил соперник, рыба | «Раунд выиграл Боб: +7 (рыба)» |
| S4 | ничья | «Рыба — ничья», `round-points` 0 |
| S5 | клик `continue-button` | `emit('game:ready', {})` один раз; двойной клик — один emit |
| S6 | `ready [true,false]` у `you=0` | кнопка disabled, «Ждём соперника…» |
| S7 | `ready [false,true]` у `you=0` | кнопка активна, «Соперник готов» |
| S8 | `match.winner = 0` | `match-finished` «Вы выиграли матч!», кнопка «Реванш» |
| S9 | ack `{ ok:false, error:'ROUND_NOT_FINISHED' }` / таймаут | текст в `move-error` |
| S10 | новый `room:state` с `playing` после итогов | итоги скрыты, стол интерактивен, `match-round` 2 |
| S11 | `status !== 'connected'` | `continue-button` disabled |

### 7.4 E2E — `e2e/match.spec.ts` (Playwright, две вкладки, timeout теста 120 с)

| ID | Сценарий | Ожидание |
| --- | --- | --- |
| E12 | `startGame` → `playRoundToEnd` | на обеих вкладках `round-summary`; одинаковый `round-points`; `match-score` у обеих одинаков; сумма счёта = `round-points`; видны `summary-hand-0` и `summary-hand-1` |
| E13 | после E12: A жмёт `continue-button` | у A «Ждём соперника…», у B «Соперник готов»; B жмёт → обе вкладки: `turn-indicator` виден, `boneyard-count` 14, `board-tile-*` нет, `match-round` 2, счёт сохранён. Если после первого раунда матч уже окончен (редко, ≥ 101 за раунд) — кнопка «Реванш», после неё счёт 0 : 0 и `match-round` 1 (обе ветки допустимы, тест проверяет по `match-finished`) |
| E14 | экран итогов на 360×640 | нет горизонтальной прокрутки, `continue-button` видим |
| E15 | F5 вкладки B на экране итогов | после восстановления — тот же `round-points` и счёт |

E8–E11 продолжают проходить без изменений сценариев.

## 8. Порядок реализации (рекомендация)

1. shared: `match.ts` + тесты M*, `opponentHand` во view + V*, протокол.
2. server: `RoomManager` (match, ready), `game:ready`, `matchTarget`/`MATCH_TARGET`, тесты N*.
3. client: `MatchScore`, `RoundSummary`, `sendReady`, фикстуры, тесты S*; удалить `RoundResultBanner`.
4. e2e E12–E15, README.

## 9. Вне рамок

- Техпоражение/начисление очков при уходе игрока (закрытие комнаты по grace — как в K9, без счёта).
- Альтернативные правила подсчёта (сумма обеих рук при рыбе, «козёл», округление до 5, «яйца/пусто-пусто»), настройка цели матча из UI.
- Выбор, кто ходит первым в следующем раунде (остаётся R4).
- Отмена готовности, таймер авто-старта следующего раунда, чат.
- Хранение истории матчей/статистики вне памяти процесса, лидерборды.
- Анимации раскрытия рук, звуки.

## 10. Допущения

1. **Подсчёт очков раунда не меняется**: используется уже реализованный R13 (`resolveRound`): победитель получает сумму очков руки соперника; при рыбе побеждает тот, у кого меньше; равенство — ничья, 0 очков.
2. **Матч до 101**: побеждает первый, у кого счёт **≥ 101** после начисления (точное попадание не требуется).
3. **Следующий раунд и реванш — по согласию обоих** (`game:ready` от обоих), чтобы оба успели посмотреть итоги. Одно событие на оба случая; смысл задаёт `match.winner`.
4. **«Реванш» = новый матч в той же комнате** с теми же местами (без смены `roomId` и токенов), счёт обнуляется.
5. Первый ход каждого раунда — по R4 (старшая кость), а не победитель/проигравший прошлого раунда.
6. `RoomPhase` и `PROTOCOL_VERSION` не меняются: изменения протокола аддитивные, клиент и сервер деплоятся вместе.
7. Раскрытие руки соперника — через новое поле `PlayerView.opponentHand` (а не через `RoundResult`), чтобы `RoundState` не дублировал руки.
8. `MATCH_TARGET` — переменная окружения для ручной проверки и тестов; в CI/e2e используется значение по умолчанию 101, поэтому e2e проверяет конец матча только как допустимую ветку (E13), а детерминированно — интеграционный тест N8.
9. `data-testid="round-finished"` сохраняется (решение по spec-6 §10 п.5), чтобы не ломать существующие проверки.
