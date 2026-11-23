# Spec #12 — Эмодзи-реакции и быстрые фразы

> Карточка: #12 (id 10165), теги `server`, `client`, приоритет medium.
> Файл в репозитории после PR: `docs/specs/spec-12.md` (кладёт разработчик).
> Зависит от: #4 (`RoomManager`, `handlers.ts`, `withAck`), #6/#7 (`GameTable`, `RoundSummary`), #9 (`opts.now`, `newPlayer` в e2e), #11 (текущий вид `GameTable`/`RoomManager`). Ветки `task-8-deploy` → … → `task-11-turn-timer` идут стеком и на момент написания **в `main` не смержены**. **Ветку `task-12-reactions` создавать от `main` после merge PR #11**; если он ещё открыт — от `task-11-turn-timer`, потом rebase. Все ссылки на код ниже — по состоянию `task-11-turn-timer` (`e17a454`).

## 1. Цель

Дать игрокам перекинуться парой слов без чата:

1. Панель с **фиксированным** набором из 9 реакций: 👍 😂 😮 😡 🎉 и фразы «Ну ты даёшь», «Рыба!», «Ходи уже», «Хорошая игра».
2. Выбранная реакция ~3 с видна «облачком» у руки отправителя **у обоих** игроков.
3. Свободного текста нет: клиент шлёт только `reactionId`, сервер проверяет его по белому списку и пересылает только id.
4. Анти-спам на сервере: не чаще 1 реакции в 2 с на игрока.

## 2. Контекст (что уже есть)

| Что                                                                                                                                 | Где                                                | Что делаем в #12                                                |
| ----------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- | --------------------------------------------------------------- |
| Контракт Socket.IO: `ClientToServerEvents`, `ServerToClientEvents`, `AckResult`, соглашение «ошибки только в ack»                   | `shared/src/protocol.ts`                           | Событие `game:react` (C→S) и `room:reaction` (S→C), коды ошибок |
| `RoomManager`: `Room.seats[seat]` (`SeatState`), `opts.now()` (RC8/T10), `roomPhase()`; техпоражение удаляет комнату                | `server/src/rooms/RoomManager.ts`                  | Метод `react()`, поле `lastReactionAt` в `SeatState`            |
| `withAck`, `socketById`, привязка `socket.data.{roomId,seat}`, `broadcastState` (персональный emit каждому месту)                   | `server/src/rooms/handlers.ts`                     | Обработчик `game:react`, рассылка `room:reaction` по образцу    |
| `isObject`, `Parsed<T>`                                                                                                             | `server/src/rooms/validate.ts`                     | `parseReactionId`                                               |
| `useTestServer`, `emitAck`, `vi.useFakeTimers` + `now`                                                                              | `server/src/test-helpers.ts`, `turn-timer.test.ts` | Тесты `reactions.test.ts`                                       |
| `GameTable`: `MatchScore`, `turn-indicator`, `OpponentHand` (сверху), `BoardView`, `controls`/`HandView` или `RoundSummary` (снизу) | `client/src/game/GameTable.tsx`                    | Якоря облачков сверху/снизу, панель реакций                     |
| `sendMove`/`sendReady` (`emitWithAck` + `ACK_TIMEOUT_MS`, reject → `'timeout'`)                                                     | `client/src/game/gameApi.ts`                       | `sendReaction` по образцу                                       |
| `useReducedMotion`                                                                                                                  | `client/src/fx/useReducedMotion.ts`                | Без анимации появления облачка при reduce                       |
| Фейковый сокет для client-тестов                                                                                                    | `client/src/test/fakeSocket.ts`                    | Эмуляция `room:reaction`                                        |
| e2e: `newPlayer`, `createGame`, `joinByLink`, `startGame`, `reducedMotion: 'reduce'` по умолчанию                                   | `e2e/helpers.ts`                                   | `e2e/reactions.spec.ts`                                         |

## 3. Правила (нормативно)

ID `RX*` используются в именах тестов (`'RX4: …'`).

| ID   | Правило                                                                                                                                                                                                                                                                                             |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| RX1  | Набор реакций фиксирован и задан **только** в `shared` (`REACTIONS`, §4.1): 9 элементов, порядок = порядок кнопок на панели. Клиент и сервер берут текст/список только оттуда.                                                                                                                      |
| RX2  | Реакцию можно отправить, когда в комнате двое и есть раунд: фаза `playing` **или** `finished` (экран итогов, конец матча). В `waiting` → `GAME_NOT_STARTED`; без комнаты (в т.ч. после закрытия/техпоражения) → `NOT_IN_ROOM`. Чей сейчас ход — не важно.                                           |
| RX3  | Проверка payload: не объект → `INVALID_PAYLOAD`; `reactionId` не строка **или** строка не из `REACTION_IDS` (в т.ч. сам эмодзи `"👍"`, текст фразы, пустая строка, `"__proto__"`, 10 КБ мусора) → `UNKNOWN_REACTION`. Лишние поля игнорируются. Сравнение — точное (`includes`), без trim/регистра. |
| RX4  | Анти-спам: на место хранится `lastReactionAt` (по `opts.now()`). Если `now − lastReactionAt < REACTION_COOLDOWN_MS (2000)` → `TOO_FREQUENT`. Ровно 2000 мс — разрешено. Отклонённая попытка (любая ошибка) `lastReactionAt` **не** меняет.                                                          |
| RX5  | Порядок проверок: payload (RX3, кроме членства в списке) → комната/место (`NOT_IN_ROOM`) → фаза (`GAME_NOT_STARTED`) → id в списке (`UNKNOWN_REACTION`) → кулдаун (`TOO_FREQUENT`). Т.е. произвольная строка всегда даёт `UNKNOWN_REACTION`, даже в кулдауне.                                       |
| RX6  | Принятая реакция: `ack({ ok: true })`, затем **каждому подключённому** месту комнаты (включая отправителя) — `room:reaction { seat, reactionId, seq }`. Отправитель видит своё облачко по эху сервера, не оптимистично. Отключённому месту не доставляется и не буферизуется.                       |
| RX7  | `seq` — сквозной монотонный счётчик `RoomManager` (как `turnSeq`), нужен клиенту как ключ: повтор той же реакции перезапускает облачко.                                                                                                                                                             |
| RX8  | Реакция **не меняет** состояние игры: `room:state` не рассылается, таймер хода (spec-11), готовность (spec-7), переподключение (spec-9) не затрагиваются.                                                                                                                                           |
| RX9  | Кулдаун хранится за местом, не за сокетом: переживает `room:rejoin` (обойти анти-спам переподключением нельзя). Реванш/новый раунд его не сбрасывают.                                                                                                                                               |
| RX10 | Клиент: облачко показывается `REACTION_SHOW_MS = 3000` мс с момента получения `room:reaction`. На место — максимум одно облачко: новая реакция того же места заменяет текущую и перезапускает 3 с. Облачка обоих мест могут быть видны одновременно.                                                |
| RX11 | Клиент не шлёт реакцию, пока для этого места не истёк локальный кулдаун (кнопки `disabled` 2 с после **успешного** ack). Это только UX; источник истины — RX4.                                                                                                                                      |

## 4. Изменения по пакетам

### 4.1 shared

**`shared/src/reactions.ts`** (новый):

```ts
export const REACTIONS = [
  { id: 'thumbs_up', kind: 'emoji', text: '👍', label: 'Класс' },
  { id: 'laugh', kind: 'emoji', text: '😂', label: 'Смешно' },
  { id: 'wow', kind: 'emoji', text: '😮', label: 'Ого' },
  { id: 'angry', kind: 'emoji', text: '😡', label: 'Злюсь' },
  { id: 'party', kind: 'emoji', text: '🎉', label: 'Ура' },
  { id: 'you_got_me', kind: 'phrase', text: 'Ну ты даёшь', label: 'Ну ты даёшь' },
  { id: 'fish', kind: 'phrase', text: 'Рыба!', label: 'Рыба!' },
  { id: 'hurry', kind: 'phrase', text: 'Ходи уже', label: 'Ходи уже' },
  { id: 'good_game', kind: 'phrase', text: 'Хорошая игра', label: 'Хорошая игра' },
] as const satisfies readonly ReactionDef[];

export interface ReactionDef {
  id: string;
  kind: 'emoji' | 'phrase';
  /** Что рисуется в кнопке и в облачке. */
  text: string;
  /** aria-label кнопки (для эмодзи — словами). */
  label: string;
}

export type ReactionId = (typeof REACTIONS)[number]['id'];
export const REACTION_IDS: readonly ReactionId[]; // REACTIONS.map(r => r.id)
export function isReactionId(value: unknown): value is ReactionId; // typeof string && REACTION_IDS.includes
export function reactionById(id: ReactionId): ReactionDef;

/** RX4: минимальный интервал между реакциями одного игрока, мс. */
export const REACTION_COOLDOWN_MS = 2000;
/** RX10: сколько облачко видно на клиенте, мс. */
export const REACTION_SHOW_MS = 3000;
```

- `isReactionId` не должен давать `true` для ключей прототипа (используется массив, не объект-словарь).
- Экспорт из `shared/src/index.ts`.

**`shared/src/protocol.ts`** — см. §5.

### 4.2 server

**`RoomManager.ts`**:

- `SeatState` += `lastReactionAt: number | null` (`null` при `create`/`join`); `rejoin` его **не** сбрасывает (RX9).
- `private reactionSeq = 0`.
- Новый метод:

  ```ts
  react(roomId: string, seat: PlayerIndex, reactionId: string):
    Result<{ room: Room; reaction: RoomReactionPayload }, ReactionErrorCode>
  ```

  Логика строго по RX5: нет комнаты или места → `NOT_IN_ROOM`; `room.round === null` → `GAME_NOT_STARTED`; `!isReactionId(reactionId)` → `UNKNOWN_REACTION`; `last !== null && now − last < REACTION_COOLDOWN_MS` → `TOO_FREQUENT`; иначе `lastReactionAt = now`, `reaction = { seat, reactionId, seq: ++reactionSeq }`. Состояние комнаты больше ничем не меняется (RX8), таймеры не трогаются.

**`validate.ts`**: `parseReactionId(value: unknown): Parsed<string>` — только `typeof value === 'string'` (иначе fail → `UNKNOWN_REACTION`, RX3). Членство в списке проверяет `RoomManager` (единое место правил).

**`handlers.ts`** — обработчик через `withAck('game:react', …)`:

1. `!isObject(payload)` → `INVALID_PAYLOAD`.
2. `parseReactionId(payload.reactionId)` не ok → `UNKNOWN_REACTION`.
3. Нет `socket.data.roomId/seat` → `NOT_IN_ROOM`.
4. `rooms.react(...)`; ошибка → ack с ней.
5. `ack({ ok: true })`, затем `emitReaction(io, room, reaction)`: для `seat` 0 и 1 — `socketById(...)?.emit('room:reaction', reaction)` (персональные emit, как `broadcastState`; широковещательный emit в комнату запрещён).
6. Логов на каждую реакцию нет (шум); `TOO_FREQUENT` не логируется.

> Порядок 1–3 отличается от RX5 только тем, что «не строка» отсекается раньше комнаты — на итоговый код это не влияет (любая не-строка → `UNKNOWN_REACTION`, RX3). Исключение: не-строка вне комнаты даст `UNKNOWN_REACTION`, а не `NOT_IN_ROOM` — допустимо.

Конфиг/env не меняется (кулдаун — константа из shared).

### 4.3 client

Новая папка **`client/src/reactions/`**:

1. **`reactionsApi.ts`** — `sendReaction(socket, reactionId): Promise<AckResult<object, ReactionErrorCode> | 'timeout'>` (`emitWithAck('game:react', { reactionId })`, `ACK_TIMEOUT_MS`), по образцу `sendMove`.

2. **`useReactions.ts`** — `useReactions(socket, you, status)`:
   - подписка `socket.on('room:reaction', …)` в эффекте, отписка в cleanup;
   - состояние `bubbles: { mine: Bubble | null; opponent: Bubble | null }`, `Bubble = { reactionId, seq }`; на событие: `seat === you` → `mine`, иначе `opponent`; таймер `REACTION_SHOW_MS` на каждое место, новая реакция места — `clearTimeout` старого и новый таймер (RX10); все таймеры чистятся при размонтировании;
   - `send(reactionId)`: игнорирует вызов, если `pending` или `cooldown`; при `ok` — `cooldown = true` на `REACTION_COOLDOWN_MS` (RX11); при ошибке/`timeout` — `error = REACTION_ERROR_TEXT[code] | TIMEOUT_TEXT`, ошибка сама гаснет через 3 с или при следующей успешной отправке;
   - возвращает `{ bubbles, send, canSend, error }`, `canSend = status === 'connected' && !pending && !cooldown`.

3. **`errors.ts`** — исчерпывающий `REACTION_ERROR_TEXT: Record<ReactionErrorCode, string>`: `TOO_FREQUENT` → «Не так часто», остальные (`INVALID_PAYLOAD`, `UNKNOWN_REACTION`, `NOT_IN_ROOM`, `GAME_NOT_STARTED`) → `DESYNC_TEXT` (как в `game/errors.ts`).

4. **`ReactionBubble.tsx`** — `{ who: 'mine' | 'opponent'; bubble: Bubble | null }`. Рендерит **всегда** контейнер-якорь `data-testid="reaction-anchor-<who>"` (`position: relative`, нулевая высота — раскладка стола не прыгает). Внутри при `bubble !== null`: `<div data-testid="reaction-bubble-<who>" data-reaction-id={id} key={seq} role="status" aria-live="polite">` с `reactionById(id).text`; для эмодзи — крупный шрифт (≈2rem), для фраз — обычный. Облачко абсолютно спозиционировано (у соперника — «хвост» вверх к его руке, у себя — вниз к своей руке), не перехватывает клики (`pointer-events: none`). Анимация появления (fade/scale ≤ 150 мс) — только если `!useReducedMotion()`.

5. **`ReactionPanel.tsx`** — `{ canSend; error; onSend }`:
   - кнопка-переключатель `data-testid="reaction-toggle"` «💬» (`aria-label="Реакции"`, `aria-expanded`); по клику открывает/закрывает `data-testid="reaction-panel"`;
   - в панели 9 кнопок `data-testid="reaction-<id>"` в порядке `REACTIONS`, `aria-label` = `label`, `disabled={!canSend}`; клик → `onSend(id)` и закрытие панели; Esc и клик вне панели — закрыть;
   - `<p data-testid="reaction-error" role="alert">` с `error ?? ''`.

6. **`GameTable.tsx`** — `const reactions = useReactions(socket, game.you, status)`; разметка:
   - `<ReactionBubble who="opponent">` — сразу после `OpponentHand` (в фазе `finished`, когда `OpponentHand` скрыта, — на том же месте, после `turn-indicator`/`MatchScore`), т.е. якорь соперника рендерится **в обеих фазах**;
   - `<ReactionBubble who="mine">` — непосредственно над `HandView` при `playing` и над `RoundSummary` при `finished`;
   - `<ReactionPanel>` — в строке рядом с `controls` при `playing` и под `RoundSummary` при `finished` (видна в обеих фазах, RX2).
   - Игровые хуки и кнопки (`useGameTable`, `pendingRef`) не трогаем: реакции — отдельный `pending`, ход и реакция могут лететь одновременно.

7. **`reactions.css`** (импорт из `ReactionPanel`/`ReactionBubble`): панель — `flex-wrap`, кнопки ≥ 44×44 px; на 360 px панель без горизонтальной прокрутки; облачко `max-width: 70vw`, фраза в одну-две строки.

8. Звук на реакцию **не** добавляем (см. «Вне рамок»).

### 4.4 e2e / docs

- `e2e/reactions.spec.ts` (E23–E26, §7.4); хелпер в `e2e/helpers.ts`: `sendReaction(page, id)` — `reaction-toggle` → `reaction-<id>`.
- README: пункт «Реакции» в «Как сыграть с другом», строка `reactions.spec.ts — E23–E26` в «Структура», ссылка на `docs/specs/spec-12.md`.

## 5. Протокол (Socket.IO)

Изменения аддитивные, `PROTOCOL_VERSION` остаётся `1`.

```ts
// shared/src/protocol.ts
import type { ReactionId } from './reactions';

/** C→S: отправить реакцию из фиксированного набора (spec-12). Только id, никакого текста. */
export interface GameReactPayload {
  reactionId: ReactionId; // на проводе — любая строка; сервер проверяет RX3
}

/** S→C: реакция игрока места `seat`; приходит обоим, включая отправителя (RX6). */
export interface RoomReactionPayload {
  seat: PlayerIndex;
  reactionId: ReactionId;
  /** RX7: монотонный номер, ключ для перезапуска облачка. */
  seq: number;
}

export type ReactionErrorCode =
  'INVALID_PAYLOAD' | 'UNKNOWN_REACTION' | 'NOT_IN_ROOM' | 'GAME_NOT_STARTED' | 'TOO_FREQUENT';

export interface ServerToClientEvents {
  // ...как было
  'room:reaction': (payload: RoomReactionPayload) => void;
}

export interface ClientToServerEvents {
  // ...как было
  'game:react': (
    payload: GameReactPayload,
    ack: (res: AckResult<object, ReactionErrorCode>) => void,
  ) => void;
}
```

| Событие         | Направление | Payload                     | Ответ / эффект                                                                                |
| --------------- | ----------- | --------------------------- | --------------------------------------------------------------------------------------------- |
| `game:react`    | C → S       | `{ reactionId: string }`    | ack `{ ok: true }` или `{ ok: false, error: ReactionErrorCode }`; без ack — игнор (`withAck`) |
| `room:reaction` | S → C       | `{ seat, reactionId, seq }` | каждому подключённому месту комнаты; `room:state` не шлётся                                   |

## 6. Критерии готовности

1. В `shared` есть `REACTIONS` (ровно 9: 👍 😂 😮 😡 🎉, «Ну ты даёшь», «Рыба!», «Ходи уже», «Хорошая игра»), `isReactionId`, константы `REACTION_COOLDOWN_MS = 2000`, `REACTION_SHOW_MS = 3000`; события `game:react`/`room:reaction` типизированы в `protocol.ts`.
2. **Произвольная строка вместо id отклоняется сервером**: `game:react { reactionId: 'привет' }` → ack `{ ok: false, error: 'UNKNOWN_REACTION' }`, второй игрок **не** получает `room:reaction` (integration-тест RX3a).
3. Принятая реакция приходит обоим игрокам с правильным `seat`; `room:state` при этом не рассылается.
4. Вторая реакция того же игрока раньше 2000 мс → `TOO_FREQUENT`, через ≥ 2000 мс — принята; кулдаун не обходится переподключением.
5. В `waiting` → `GAME_NOT_STARTED`; без комнаты → `NOT_IN_ROOM`; реакции работают и во время раунда, и на экране итогов/конца матча.
6. **e2e: A отправляет реакцию — B её видит** (`reaction-bubble-opponent` с текстом реакции у B, `reaction-bubble-mine` у A), облачко исчезает примерно через 3 с (E23).
7. Кнопки панели `disabled` 2 с после отправки; на 360 px панель и облачка без горизонтальной прокрутки.
8. Реакции не влияют на ход игры: таймер хода, `legalMoves`, готовность, ход во время отправки реакции — без изменений (существующие тесты зелёные).
9. `npm run lint`, `npm run typecheck`, `npm test`, `npm run test:e2e` — зелёные; README и `docs/specs/spec-12.md` обновлены.

## 7. Тест-кейсы

### 7.1 Unit — shared (`shared/src/reactions.test.ts`, имена `RX*:`)

| ID   | Сценарий                                                                                                                          | Ожидание                                                           |
| ---- | --------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| RX1a | `REACTIONS`                                                                                                                       | длина 9, id уникальны, тексты ровно из карточки в заданном порядке |
| RX3u | `isReactionId`: все id из списка                                                                                                  | `true`                                                             |
| RX3v | `isReactionId('👍')`, `('Рыба!')`, `('')`, `('THUMBS_UP')`, `(' fish')`, `('__proto__')`, `('toString')`, `(1)`, `(null)`, `({})` | `false`                                                            |

### 7.2 Server — `RoomManager.test.ts` (unit, `now` от фейковых часов) и `server/src/reactions.test.ts` (сокеты, `useTestServer`, `emitAck`)

| ID   | Сценарий                                                                       | Ожидание                                                                                                                   |
| ---- | ------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| RX2a | Комната в `waiting`, создатель шлёт `thumbs_up`                                | `GAME_NOT_STARTED`                                                                                                         |
| RX2b | Сокет без комнаты                                                              | `NOT_IN_ROOM`                                                                                                              |
| RX2c | Раунд `finished` (экран итогов) и матч окончен                                 | `ok`, реакция доставлена                                                                                                   |
| RX2d | Не свой ход                                                                    | `ok`                                                                                                                       |
| RX3a | **Произвольная строка** `reactionId: 'привет'` / `'👍'` / `'a'.repeat(10_000)` | `UNKNOWN_REACTION`; у B за 200 мс нет `room:reaction`; `lastReactionAt` не изменился (сразу после — валидная реакция `ok`) |
| RX3b | `reactionId: 42` / `null` / нет поля                                           | `UNKNOWN_REACTION`                                                                                                         |
| RX3c | payload `'fish'` / `null` / `[]`                                               | `INVALID_PAYLOAD`                                                                                                          |
| RX3d | Лишние поля `{ reactionId: 'fish', text: 'мат' }`                              | `ok`; у B payload ровно `{ seat, reactionId: 'fish', seq }` (без `text`)                                                   |
| RX3e | `game:react` без ack-колбэка                                                   | игнор, сервер жив, `room:reaction` не разослан                                                                             |
| RX4a | A: реакция в t=0, вторая в t=1999                                              | вторая — `TOO_FREQUENT`, B получил только первую                                                                           |
| RX4b | A: t=0, затем t=2000                                                           | обе `ok`                                                                                                                   |
| RX4c | A в t=0, B в t=100                                                             | обе `ok` (кулдаун на игрока)                                                                                               |
| RX4d | A: t=0 ok, t=500 `TOO_FREQUENT`, t=2000                                        | третья `ok` (отклонённая не продлевает кулдаун)                                                                            |
| RX5a | В кулдауне шлём `'привет'`                                                     | `UNKNOWN_REACTION` (не `TOO_FREQUENT`)                                                                                     |
| RX6a | A шлёт `good_game`                                                             | A и B получают `room:reaction { seat: 0, reactionId: 'good_game' }`; ack приходит раньше события у A                       |
| RX6b | B отключён (в grace), A шлёт реакцию                                           | `ok`; после `rejoin` B **не** получает старую реакцию                                                                      |
| RX7a | Две реакции подряд (с паузой 2 с)                                              | `seq` второй > `seq` первой                                                                                                |
| RX8a | A шлёт реакцию во время своего хода с таймером (spec-11)                       | `room:state` не пришёл; `turnTimer.remainingMs` в следующем `room:state` не сброшен; `ready` не изменился                  |
| RX9a | A: реакция в t=0, disconnect + `rejoin` в t=500, реакция в t=600               | `TOO_FREQUENT`                                                                                                             |

### 7.3 Client — Vitest + Testing Library (фейковый сокет, `vi.useFakeTimers()`)

| ID    | Сценарий                                                             | Ожидание                                                                                                                    |
| ----- | -------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| RX10a | Сокет эмитит `room:reaction { seat: opponent, reactionId: 'laugh' }` | `reaction-bubble-opponent` с текстом «😂», `data-reaction-id="laugh"`; через 2999 мс есть, через 3000 мс — нет              |
| RX10b | Две реакции соперника с интервалом 2 с                               | видна только вторая; исчезает через 3 с после **второй**                                                                    |
| RX10c | Реакции обоих мест                                                   | видны оба облачка одновременно; своё — в `reaction-anchor-mine`                                                             |
| RX10d | Раунд `finished` (RoundSummary)                                      | оба якоря и `reaction-toggle` присутствуют                                                                                  |
| RX11a | Клик `reaction-toggle` → `reaction-hurry`                            | `emitWithAck('game:react', { reactionId: 'hurry' })`; панель закрылась; облачко **не** появилось до прихода `room:reaction` |
| RX11b | После `ok`-ack                                                       | кнопки `reaction-*` `disabled` 2000 мс, затем активны                                                                       |
| RX11c | Ack `TOO_FREQUENT` / таймаут                                         | `reaction-error` = «Не так часто» / `TIMEOUT_TEXT`; гаснет через 3 с                                                        |
| RX11d | `status !== 'connected'`                                             | кнопки `disabled`                                                                                                           |
| RX11e | Esc при открытой панели                                              | панель закрыта                                                                                                              |
| RX11f | Размонтирование `GameTable` с активным облачком                      | `vi.getTimerCount()` не растёт, отписка от `room:reaction` (нет warning о setState)                                         |
| RX11g | `REACTION_ERROR_TEXT`                                                | покрывает все `ReactionErrorCode` (typecheck + тест на непустые строки)                                                     |

### 7.4 E2E — `e2e/reactions.spec.ts` (Playwright, Chromium, игроки через `newPlayer`)

| ID  | Сценарий                                                          | Ожидание                                                                                                                      |
| --- | ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| E23 | **A и B в игре; A: `reaction-toggle` → `reaction-thumbs_up`**     | у B `reaction-bubble-opponent` с текстом «👍» видим (≤ 2 с); у A `reaction-bubble-mine` «👍»; у B через ≤ 5 с облачко исчезло |
| E24 | B отправляет фразу `good_game`                                    | у A `reaction-bubble-opponent` с текстом «Хорошая игра»                                                                       |
| E25 | A отправляет реакцию и сразу пытается вторую                      | кнопки `reaction-*` у A `disabled`; через ~2 с — активны, вторая реакция видна у B                                            |
| E26 | Мобильная ширина 360×740: открыть панель, отправить «Ну ты даёшь» | `document.documentElement.scrollWidth <= 360`; облачко видно у соперника                                                      |

Проверка «произвольная строка отклоняется» — на уровне сервера (RX3a), т.к. UI не позволяет отправить строку не из набора.

## 8. Порядок реализации (рекомендация)

1. shared: `reactions.ts` + тесты; типы протокола.
2. server: `SeatState.lastReactionAt`, `RoomManager.react` + unit → `validate`/`handlers` → `reactions.test.ts`.
3. client: `reactionsApi` → `useReactions` → `ReactionBubble`/`ReactionPanel` → размещение в `GameTable` + тесты.
4. e2e + README.

## 9. Вне рамок

- Свободный текстовый чат, пользовательские/настраиваемые наборы, локализация фраз.
- История реакций, доставка отключённому игроку, показ реакций после F5/переподключения (событие эфемерное).
- Реакции в лобби/на экране ожидания (`waiting`) и зрители.
- Звук и вибрация на реакцию; отключение («заглушить соперника»).
- Модерация, жалобы, глобальный rate-limit по IP/сокету для остальных событий.
- Анимации сложнее простого fade/scale.

## 10. Допущения

1. **База — `task-11-turn-timer`**: PR #8–#11 не смержены; используем `opts.now()` (spec-9) и разметку `GameTable` из spec-11. Если #12 придётся делать от `main` без них — `now` добавить в `RoomManagerOptions` так же (по умолчанию `Date.now`), e2e писать на текущих хелперах `main`.
2. **Отдельный код `UNKNOWN_REACTION`** (а не `INVALID_PAYLOAD`) для строки не из набора — явно проверяется критерием карточки и отличим от битого payload. Не-строка в `reactionId` тоже `UNKNOWN_REACTION`, битый сам payload — `INVALID_PAYLOAD`.
3. **Эхо отправителю через сервер** (не оптимистично): гарантирует, что облачко у A появляется только если сервер реакцию принял, и одинаковое поведение у обоих.
4. **Отдельное событие `room:reaction`**, а не поле в `room:state`: реакция эфемерна, не должна триггерить `diffTable`/звуки (spec-10) и пересчёт стола.
5. **Разрешены и на экране итогов/конца матча** — «Хорошая игра» по смыслу нужна именно там; в `waiting` соперника нет.
6. «~3 секунды» = ровно `REACTION_SHOW_MS = 3000` от получения события; «не чаще 1 в 2 с» = интервал ≥ 2000 мс между **принятыми** реакциями одного места.
7. id реакций — латинские snake_case (стабильны при смене текста/эмодзи); текст живёт только в `shared`.
8. «У аватара/руки» — аватаров в игре нет, поэтому якорь — зона руки: у соперника — над столом рядом с его рубашками, у себя — над своей рукой / экраном итогов.
