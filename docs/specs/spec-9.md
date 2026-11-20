# Spec #9 — Переподключение и обрыв связи

> Карточка: #9 (id 10162), теги `server`, `client`, приоритет high.
> Файл в репозитории после PR: `docs/specs/spec-9.md` (кладёт разработчик).
> Зависит от: #4 (`RoomManager`, `room:rejoin`, K8–K9), #5 (лобби, L8–L10), #7 (`MatchState`, `RoundSummary`), #8 (PR #7 `task-8-deploy`: `server/src/config.ts`, `E2E_BASE_URL`). **Ветку `task-9-reconnect` создавать от `main` после merge PR #7**; если он ещё не смержен — от `task-8-deploy` и потом rebase.

## 1. Цель

Игрок, у которого пропал интернет или закрылась вкладка, возвращается в ту же партию, а соперник видит, что происходит:

1. Место в комнате держится за **браузером** (токен в `localStorage`), а не за вкладкой/сокетом. Повторное открытие ссылки-приглашения тем же браузером возвращает на своё место с полным состоянием (рука, стол, счёт, чей ход), а не создаёт «третьего игрока».
2. У соперника — плашка «Соперник отключился, ждём… mm:ss» с обратным отсчётом.
3. Таймаут ожидания `RECONNECT_TIMEOUT` (по умолчанию 2 мин): по истечении отключившемуся засчитывается **поражение в матче**, оставшийся видит экран итогов с победой (сейчас комната просто закрывается).
4. Клиент сам переподключается при обрыве сокета и показывает «Переподключение…».
5. Чужой токен не открывает чужую руку.

Сервер — источник истины: дедлайн, таймер и техническое поражение считаются только на сервере; клиент лишь рисует обратный отсчёт по присланному остатку.

## 2. Контекст (что уже есть)

| Что                                                                                                                                                     | Где                                                  | Что делаем в #9                                                                                       |
| ------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `playerToken` = `randomUUID()` на место, выдаётся в ack `room:create`/`room:join` (K3)                                                                  | `server/src/rooms/ids.ts`, `RoomManager.create/join` | Без изменений — токен остаётся серверным секретом места                                               |
| `room:rejoin { roomId, playerToken }` → место, `replaced` для старого сокета (D2–D6)                                                                    | `RoomManager.rejoin`, `handlers.ts`                  | Без изменений логики; добавляются тесты на чужой токен (§7.2)                                         |
| Grace: `disconnect()` ставит таймер `reconnectGraceMs` (60 с), по истечении — `close(room,'player_left')` (K8–K9)                                       | `RoomManager.disconnect/close`                       | Переименовать в timeout, 120 с; по истечении в матче — **техническое поражение** вместо закрытия (§3) |
| `RECONNECT_GRACE_MS`                                                                                                                                    | `server/src/index.ts` / (`config.ts` в PR #7)        | Заменить на `RECONNECT_TIMEOUT`                                                                       |
| `RoomPlayer { seat, name, connected }`                                                                                                                  | `shared/src/protocol.ts`                             | + `reconnectRemainingMs`                                                                              |
| `MatchState { target, scores, roundNumber, rounds, winner }`, `recordRound`                                                                             | `shared/src/rules/match.ts`                          | + `forfeit`, функция `forfeitMatch`                                                                   |
| Сессия `{roomId, playerToken}` в `sessionStorage['domino:session']` (L8), авто-rejoin на каждый `server:hello` (L9), приоритет сессии над `?room` (L10) | `client/src/lobby/storage.ts`, `useLobby.ts`         | Перенести в `localStorage`, ключ по `roomId` (§3, RC10–RC14); L9 сохраняется                          |
| Плашка «Соперник отключился, ждём возвращения…» (`opponent-offline`)                                                                                    | `client/src/lobby/screens/GameScreen.tsx`            | Добавить таймер mm:ss                                                                                 |
| `ConnectionStatus = 'connecting'                                                                                                                        | 'connected'                                          | 'disconnected'`; socket.io-client уже переподключается сам (по умолчанию `reconnection: true`)        | `client/src/useConnectionStatus.ts`, `socket.ts` | + статус `reconnecting` и баннер |
| Кнопки хода/готовности неактивны при `status !== 'connected'`                                                                                           | `useGameTable.ts`, `GameTable.tsx`                   | Без изменений — работает и для `reconnecting`                                                         |
| e2e: два игрока — две вкладки **одного** контекста (`startGame(context)`)                                                                               | `e2e/helpers.ts`, `lobby.spec.ts`                    | Перевести на два контекста (общий `localStorage` сделал бы их одним игроком)                          |

## 3. Правила (нормативно)

| ID   | Правило                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| RC1  | Место «отключено», когда его текущий сокет отключился (как K8). Сервер запоминает `deadline = now + reconnectTimeoutMs`. Пока место отключено, второй игрок продолжает ходить, если его очередь (K8 без изменений).                                                                                                                                                                                                                                                                              |
| RC2  | `reconnectTimeoutMs` = env `RECONNECT_TIMEOUT` (целое число **миллисекунд** > 0), по умолчанию `120000`. Невалидное значение (`abc`, `0`, `-5`, `1.5`) — процесс падает на старте с понятной ошибкой (как `MATCH_TARGET`). `RECONNECT_GRACE_MS` больше не читается.                                                                                                                                                                                                                              |
| RC3  | `room:rejoin` с верным токеном до дедлайна: таймер снимается, `deadline = null`, обоим подключённым — `room:state` (соперник видит `connected: true`, плашка пропадает). Вернувшийся получает полное состояние своим видом (`toRoomState(room, seat)`).                                                                                                                                                                                                                                          |
| RC4  | Истёк таймаут места `L` (loser), комната в фазе `waiting` (соперника нет) → комната закрывается, как сейчас (K9/D7).                                                                                                                                                                                                                                                                                                                                                                             |
| RC5  | Истёк таймаут места `L`, есть соперник `W`, матч **не окончен** (`match.winner === null`) и `W` **подключён** → техническое поражение: `match = forfeitMatch(match, L)` → `winner = W`, `forfeit = L`, счёт не меняется, `ready = [false,false]`. `W` получает `room:state` (фаза `finished`, у `L` `connected:false`). Затем комната удаляется из памяти, сокет `W` отвязывается (`socket.data` очищается) **без** `room:closed`.                                                               |
| RC6  | Истёк таймаут места `L`, но матч уже окончен (`match.winner !== null`, ждали «Реванш») **или** второй игрок тоже отключён → комната закрывается как раньше: `room:closed { reason: 'player_left' }` подключённым, комната удаляется.                                                                                                                                                                                                                                                             |
| RC7  | `roomPhase(room)` = `'finished'`, если `room.match?.forfeit != null` (независимо от статуса раунда). После RC5 любые `game:move`/`game:ready` от `W` → `NOT_IN_ROOM`; `room:rejoin` от `L` (или `W`) → `ROOM_NOT_FOUND`.                                                                                                                                                                                                                                                                         |
| RC8  | Остаток для клиента: в каждом `room:state` у отключённого игрока `reconnectRemainingMs = max(0, deadline − now)` на момент отправки; у подключённого — `null`. Клиент строит локальный дедлайн `Date.now() + reconnectRemainingMs` при получении (не зависит от расхождения часов).                                                                                                                                                                                                              |
| RC9  | Токен никогда не попадает в `room:state`, `room:closed`, логи сервера и URL клиента. `room:rejoin` с токеном, не принадлежащим ни одному месту этой комнаты (в т.ч. токен из другой комнаты), → `INVALID_TOKEN`, сокет не привязывается, `room:state` ему не шлётся. Токен места `s` даёт только вид места `s` (`you === s`).                                                                                                                                                                    |
| RC10 | Клиент хранит токены в `localStorage['domino:sessions']` = `{ [roomId]: { playerToken: string, savedAt: number } }`. Запись — после успешного `room:create`/`room:join`. Не более 10 записей: при добавлении 11-й удаляется запись с наименьшим `savedAt`. Битый JSON / не тот формат / записи с неверными полями — игнорируются (ключ перезаписывается при следующем save). Все обращения — в `try/catch`. Старый ключ `sessionStorage['domino:session']` при загрузке удаляется и не читается. |
| RC11 | При загрузке страницы: если в URL валидный `?room=X` и есть запись для `X` → сессия `{X, token}`, экран `restoring`, на `server:hello` — `room:rejoin` (L9). Если записи нет → `join-screen` (как сейчас). Без `?room` — `home-screen`, записи не трогаются. (Заменяет L10.)                                                                                                                                                                                                                     |
| RC12 | Запись для `roomId` удаляется: по «На главную»; при `room:closed {reason:'player_left'}`; при `room:state` с `match.forfeit != null` (партия окончена навсегда); при ответе rejoin `ROOM_NOT_FOUND`/`INVALID_TOKEN`. **Не удаляется** при `room:closed {reason:'replaced'}` и по «На главную» с экрана `replaced` — токеном пользуется другая вкладка того же браузера.                                                                                                                          |
| RC13 | Две вкладки одного браузера с одной комнатой — один игрок: открывшая позже делает `room:rejoin`, первая получает `replaced` («Игра открыта в другой вкладке»). Пинг-понга нет: вкладка после `replaced` не делает rejoin (сессия в памяти сбрасывается, сокет не переподключается).                                                                                                                                                                                                              |
| RC14 | Статус соединения: `connecting` (до первого `hello`) → `connected` (на `hello` с верной версией) → при `disconnect`, если `socket.active` (socket.io сам переподключается) — `reconnecting`; если не active (ручной `disconnect()`/несовпадение протокола) — `disconnected`. Из `reconnecting` в `connected` — на следующий `hello`, после чего L9 делает rejoin.                                                                                                                                |
| RC15 | Клиент на событие `window` `offline` вызывает `socket.io.engine?.close()` — сокет рвётся сразу (а не через ping-таймаут), socket.io уходит в авто-переподключение (reason `transport close`). На `online` ничего не делаем — переподключение уже идёт с backoff.                                                                                                                                                                                                                                 |
| RC16 | Сервер: `pingInterval: 10_000`, `pingTimeout: 5_000` (вместо 25 с/20 с) — пропажа сети без закрытия сокета обнаруживается ≤ 15 с.                                                                                                                                                                                                                                                                                                                                                                |

## 4. Изменения по пакетам

### 4.1 shared

`shared/src/rules/match.ts`:

```ts
export interface MatchState {
  target: number;
  scores: [number, number];
  roundNumber: number;
  rounds: RoundResult[];
  winner: PlayerIndex | null;
  /** != null ⇔ матч окончен техническим поражением этого места (spec-9 RC5). Тогда winner = 1 − forfeit. */
  forfeit: PlayerIndex | null;
}

/** RC5: техническое поражение места `loser`. Счёт и история не меняются. Вход не мутируется; матч уже окончен — throw. */
export function forfeitMatch(match: MatchState, loser: PlayerIndex): MatchState;
```

- `createMatch` возвращает `forfeit: null`; `recordRound`/`nextRoundNumber` сохраняют `forfeit` (он всегда `null`, т.к. после forfeit матч окончен).
- Экспорт `forfeitMatch` из `shared/src/rules/index.ts` / `shared/src/index.ts`.

`shared/src/protocol.ts`:

```ts
export interface RoomPlayer {
  seat: PlayerIndex;
  name: string;
  connected: boolean;
  /** RC8: сколько мс ещё ждём возвращения; null — игрок подключён. */
  reconnectRemainingMs: number | null;
}
```

- `MatchView` получает `forfeit` автоматически (extends `MatchState`).
- `RoomClosedReason`, коды ошибок, события — **без изменений**. `PROTOCOL_VERSION` не меняется (изменения аддитивные, клиент и сервер едут одним образом).

### 4.2 server

**`server/src/rooms/RoomManager.ts`**

- `RoomManagerOptions`: `reconnectGraceMs` → `reconnectTimeoutMs`; + `now?: () => number` (по умолчанию `Date.now`, для тестов); + `onForfeit: (room: Room, loser: PlayerIndex) => void` — вызывается **после** удаления комнаты из менеджера.
- `SeatState`: `graceTimer` → `reconnectTimer`; + `reconnectDeadline: number | null`.
- `disconnect()`: ставит `reconnectDeadline = now() + reconnectTimeoutMs` и таймер `expire(room, seat)`.
- `rejoin()`: снимает таймер, `reconnectDeadline = null` (RC3).
- новый приватный `expire(room, loser)` — ветвление RC4 / RC5 / RC6:
  ```
  opponent = room.seats[1 - loser]
  if (!opponent || !room.match || room.match.winner !== null || opponent.socketId === null)
    → close(room, 'player_left')                     // RC4, RC6
  else
    room.match = forfeitMatch(room.match, loser); room.ready = [false, false]
    clearTimers(room); rooms.delete(room.id); opts.onForfeit(room, loser)   // RC5
  ```
- `roomPhase()`: `if (room.match?.forfeit != null) return 'finished'` первым условием после `waiting` (RC7).
- Публичный метод `remainingMs(state: SeatState): number | null` (или вычисление в `toRoomState` через переданный `now`) — RC8.

**`server/src/rooms/handlers.ts`**

- `toRoomState(room, you, now = Date.now())`: в `players[]` добавить `reconnectRemainingMs: state.socketId === null && state.reconnectDeadline !== null ? Math.max(0, state.reconnectDeadline - now) : null`.
- Новый экспорт `notifyForfeit(io, room, loser)`: `broadcastState(io, room)` (уйдёт только подключённому `W`), затем `detach` его сокета; `console.info(\`room ${id} forfeit (seat ${loser})\`)`. **Без** `room:closed`.
- В лог `room:rejoin` и любых ошибок токен не выводить (RC9; сейчас не выводится — зафиксировать тестом не нужно, только ревью).

**`server/src/app.ts`**

- `StartServerOptions.reconnectGraceMs` → `reconnectTimeoutMs`; `DEFAULT_RECONNECT_GRACE_MS` → `DEFAULT_RECONNECT_TIMEOUT_MS = 120_000`.
- `new Server(httpServer, { cors, pingInterval: 10_000, pingTimeout: 5_000 })` (RC16).
- `RoomManager({ ..., onForfeit: (room, loser) => notifyForfeit(io, room, loser) })`.

**`server/src/config.ts`** (из PR #7; если его нет — `server/src/index.ts`)

- `reconnectTimeoutMs: parseReconnectTimeout(env.RECONNECT_TIMEOUT)`; `parseReconnectTimeout` — по образцу `parseMatchTarget` (пусто/не задано → `undefined`; не целое > 0 → `throw new Error('RECONNECT_TIMEOUT must be a positive integer (milliseconds), got "…"')`). Убрать чтение `RECONNECT_GRACE_MS`.

**`fly.toml`**: в `[env]` добавить `RECONNECT_TIMEOUT = "120000"` (явное значение по умолчанию).

**Переименования в тестах**: `reconnectGraceMs` → `reconnectTimeoutMs` в `rooms.test.ts`, `game.test.ts`, `match.test.ts`, `RoomManager.test.ts`, `test-helpers.ts` (`StartServerOptions`). Существующий D5 (grace → `room:closed`) меняется на RC5 (см. §7.2 X5); D7 остаётся.

### 4.3 client

**`client/src/lobby/storage.ts`** (RC10, RC12)

```ts
export interface Session {
  roomId: string;
  playerToken: string;
}
export function loadSession(roomId: string): Session | null; // запись для комнаты или null
export function saveSession(session: Session): void; // upsert + savedAt = Date.now() + обрезка до 10
export function clearSession(roomId: string): void; // удалить одну запись
export function dropLegacySession(): void; // sessionStorage.removeItem('domino:session')
```

`loadName/saveName` — без изменений.

**`client/src/lobby/useLobby.ts`**

- `initLobbyState()`: `dropLegacySession()`; `session = urlRoom` валиден ? `loadSession(urlRoom)` : `null` (RC11). Удалить логику L10 «session.roomId ≠ urlRoom → clear».
- `onClosed`: если `reason === 'replaced'` — только `sessionRef.current = null` (в памяти), **без** `clearSession`; иначе `clearSession(roomId)` (RC12, RC13).
- `onState`: если `payload.match?.forfeit != null` → `clearSession(payload.roomId)`, `sessionRef.current = null` (чтобы переподключение не делало rejoin в удалённую комнату). Экран остаётся `game` — по последнему `room:state`.
- `onHello` → rejoin: при `ok:false`/таймауте `clearSession(session.roomId)`; текст ошибки — `REJOIN_FAILED_TEXT` (без изменений).
- `goHome()`: `clearSession(roomId)` для текущей комнаты, кроме случая `state.closed === 'replaced'`.
- После `ok` в `submit` — `saveSession` (сигнатура та же).

**`client/src/useConnectionStatus.ts`** (RC14, RC15)

- `ConnectionStatus = 'connecting' | 'connected' | 'reconnecting' | 'disconnected'`.
- `onDisconnect`: `setStatus(socket.active ? 'reconnecting' : 'disconnected')`.
- `useEffect`: `window.addEventListener('offline', onOffline)`, где `onOffline = () => socket.io.engine?.close()`; снять в cleanup.
- (С PR #7 хук возвращает `{ status, publicUrl }` — сохранить.)

**`client/src/App.tsx`**

- `STATUS_TEXT.reconnecting = 'reconnecting…'`.
- Над `<Lobby>`: при `status === 'reconnecting'` — `<p className="reconnecting-banner" data-testid="reconnecting-banner" role="status">Переподключение…</p>` (фиксированная плашка сверху, не сдвигает стол на мобильной ширине — `position: sticky; top: 0`).
- Все `Record<ConnectionStatus, …>` по коду должны получить новый ключ (typecheck подскажет).

**`client/src/game/useCountdown.ts`** (новый)

```ts
/** RC8: остаток от момента получения; тик раз в 250 мс; null на входе → null. */
export function useCountdown(remainingMs: number | null): number | null;
export function formatMmSs(ms: number): string; // ceil до секунд: 120000 → "02:00", 61001 → "01:02", 0/отрицательное → "00:00"
```

Дедлайн пересчитывается при каждом новом значении `remainingMs` (т.е. на каждый `room:state`).

**`client/src/lobby/screens/GameScreen.tsx`**

- Плашка: `Соперник отключился, ждём… <span data-testid="opponent-countdown">mm:ss</span>` (`data-testid="opponent-offline"`, `role="status"`). Если `reconnectRemainingMs === null` при `connected:false` (не должно быть) — без таймера.
- Если `room.match?.forfeit != null` → вместо `GameTable` рендерить `<ForfeitSummary room={room} onHome={onHome} />`; плашку отключения не показывать. `GameScreen` получает проп `onHome` (из `Lobby` — `goHome`).

**`client/src/game/ForfeitSummary.tsx`** (новый, стили — в `game.css` рядом с `RoundSummary`)

- `data-testid="forfeit-summary"`, `aria-label="Итоги матча"`.
- Заголовок `data-testid="forfeit-result"`: если `forfeit !== you` — «Победа! Соперник не вернулся в игру»; иначе (вернулся проигравший, теоретически недостижимо из-за удаления комнаты, но тип допускает) — «Поражение: время на возвращение истекло».
- `MatchScore` (текущий счёт, без изменений).
- Кнопка «На главную» (`data-testid="home-button"`) → `goHome`. Кнопки «Реванш»/«Следующий раунд» нет.

**`client/src/lobby/errors.ts`**: без изменений. **`ClosedScreen`**: без изменений (`player_left` теперь только для RC4/RC6).

### 4.4 e2e / docs

- `playwright.config.ts`: `webServer.env = { ...process.env, RECONNECT_TIMEOUT: '8000' }` (укороченный таймаут для X-тестов; F5-тесты укладываются). При локальном `reuseExistingServer` уже запущенный `npm run dev` должен быть поднят с тем же env — отметить в README.
- `e2e/helpers.ts`:
  - `newPlayer(browser, { viewport?, storageState? }): Promise<{ context, page }>` — `browser.newContext({ ...devices['Desktop Chrome'], baseURL: test.info().project.use.baseURL, permissions: ['clipboard-read','clipboard-write'], viewport, storageState })`. Контексты закрывать в `finally`/`afterEach`.
  - `startGame(browser, opts)` — A и B в **разных** контекстах; возвращает `{ a, b, ctxA, ctxB, link }`.
  - `readHand(page): Promise<string[]>` — `data-testid` костей руки (`hand-tile-*`) в порядке DOM.
- Перевести E3, E5, E6 (`lobby.spec.ts`) и все вызовы `startGame(context)` (E8–E15) на `browser` и отдельные контексты. E6: третий игрок — третий контекст.
- Новый `e2e/reconnect.spec.ts` — X-сценарии (§7.4). Тест X17 — `test.skip(!!process.env.E2E_BASE_URL, 'нужен короткий RECONNECT_TIMEOUT')`.
- README: п. 8 «Как сыграть» — токен в `localStorage`, возврат по ссылке, плашка с таймером, техпоражение; «проверить на себе» — теперь **два разных браузера / обычное + инкогнито окно** (вкладки одного браузера — один игрок); таблица env: `RECONNECT_TIMEOUT` вместо `RECONNECT_GRACE_MS`; таблица протокола: `room:state` — `players[].reconnectRemainingMs`, `match.forfeit`; `room:closed player_left` — только waiting/конец матча/оба ушли; список e2e — `reconnect.spec.ts` (X16–X19).
- `docs/specs/spec-9.md` — этот файл.

## 5. Протокол (Socket.IO)

Новых событий нет. Изменения payload:

| Событие       | Направление | Изменение                                                                                                                                   |
| ------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `room:state`  | S → C       | `players[i].reconnectRemainingMs: number \| null` (RC8); `match.forfeit: 0 \| 1 \| null` (RC5); при `forfeit != null` — `phase: 'finished'` |
| `room:closed` | S → C       | `player_left` больше не шлётся при техпоражении (RC5); только RC4/RC6                                                                       |
| `room:rejoin` | C → S       | без изменений; `INVALID_TOKEN` для токена чужой комнаты, `ROOM_NOT_FOUND` после техпоражения                                                |

Пример (у A после отключения B, прошло 15 с):

```json
{
  "roomId": "ABC234",
  "you": 0,
  "phase": "playing",
  "players": [
    { "seat": 0, "name": "Аня", "connected": true, "reconnectRemainingMs": null },
    { "seat": 1, "name": "Боб", "connected": false, "reconnectRemainingMs": 105000 }
  ],
  "game": { "...": "toPlayerView(round, 0)" },
  "match": {
    "target": 101,
    "scores": [12, 0],
    "roundNumber": 2,
    "rounds": [],
    "winner": null,
    "forfeit": null,
    "ready": [false, false]
  }
}
```

После таймаута у A: `"phase": "finished"`, `"match": { …, "winner": 0, "forfeit": 1 }`, у Боба `"connected": false, "reconnectRemainingMs": 0`; затем сокет A отвязан, комнаты нет.

Последовательность «B закрыл вкладку и вернулся по ссылке»:

```
B: tab close → server: disconnect(B) → deadline=now+120s → A: room:state (B offline, 120000)
A: плашка «Соперник отключился, ждём… 02:00» … 01:43
B: открывает /?room=ABC234 → localStorage[ABC234] есть → restoring → hello → room:rejoin{ABC234,tB}
server: таймер снят → ack{ok,seat:1} → B: room:state (рука/стол/счёт/ход) ; A: room:state (B online) → плашка исчезает
```

## 6. Критерии готовности

1. `npm run lint`, `npm run typecheck`, `npm test`, `npm run test:e2e` — зелёные; CI (`checks`, `e2e`, `docker`) зелёный.
2. Закрытие контекста B посреди раунда и открытие ссылки-приглашения в новом контексте с тем же `storageState` возвращает B за стол с **той же** рукой (те же `hand-tile-*`), столом, базаром, счётом и очередью хода; партия продолжается ходами (X16).
3. Пока B отключён, у A видна плашка `opponent-offline` с таймером `mm:ss`, значение уменьшается; после возвращения B плашка исчезает (X16).
4. B не вернулся: через `RECONNECT_TIMEOUT` у A — `forfeit-summary` «Победа! Соперник не вернулся в игру», кнопка «На главную» ведёт на `home-screen`; повторный вход B по ссылке → не за стол (экран `join` с ошибкой/`bad-link`), комнаты нет (X17, X5).
5. Повторное открытие ссылки в том же браузере (новая вкладка того же контекста) → за стол на своё место, `join-screen` не показывается, третьего игрока нет; старая вкладка (если открыта) — «Игра открыта в другой вкладке» (X18).
6. Обрыв сети (`context.setOffline(true)`) → у B баннер `reconnecting-banner` «Переподключение…», у A — плашка отключения; после `setOffline(false)` баннер пропадает, стол тот же, без перезагрузки страницы (X19).
7. `room:rejoin` с токеном другой комнаты или выдуманным — `INVALID_TOKEN`, никакого `room:state` этому сокету; ни один `room:state` не содержит ни одного токена (X8–X10).
8. Невалидный `RECONNECT_TIMEOUT` роняет старт сервера с понятной ошибкой; по умолчанию — 120 000 мс (X11).
9. README и `fly.toml` обновлены по §4.4/§4.2.

## 7. Тест-кейсы

### 7.1 Unit — shared (`shared/src/rules/match.test.ts`, имена `X*:`)

| ID  | Сценарий                                     | Ожидание                                                                                                    |
| --- | -------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| X1  | `forfeitMatch(createMatch(), 1)`             | `winner: 0`, `forfeit: 1`, `scores` и `rounds` прежние, вход не мутирован; `createMatch().forfeit === null` |
| X2  | `forfeitMatch` для матча с `winner !== null` | throw                                                                                                       |

### 7.2 Server — `RoomManager.test.ts` (unit, `vi.useFakeTimers()`, `now` от фейковых часов) и `server/src/reconnect.test.ts` (сокеты, `useTestServer({ roundSeed: () => 42, reconnectTimeoutMs: 300 })`)

| ID  | Сценарий                                                                                      | Ожидание                                                                                                                                                                                                                                                                  |
| --- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| X3  | playing; B `disconnect`; сразу и через 100 мс `toRoomState(room, 0)`                          | `players[1]`: `connected:false`, `reconnectRemainingMs` = 300 и 200; у A — `null`                                                                                                                                                                                         |
| X4  | B отключился, через 200 мс `rejoin`                                                           | `reconnectRemainingMs: null`, `connected:true`; через 300 мс ни `onClose`, ни `onForfeit` не вызваны                                                                                                                                                                      |
| X5  | (сокеты) playing, B отключился, ждём 300 мс                                                   | A получает `room:state` с `phase:'finished'`, `match.winner:0`, `match.forfeit:1`, `scores` прежние; **не** получает `room:closed`; затем `game:move`/`game:ready` от A → `NOT_IN_ROOM`; `room:rejoin` B с его токеном → `ROOM_NOT_FOUND`; `room:join` → `ROOM_NOT_FOUND` |
| X6  | то же в фазе `finished` (раунд окончен, матч нет)                                             | как X5 (техпоражение)                                                                                                                                                                                                                                                     |
| X7  | матч окончен (`matchTarget: 1`, раунд доигран), B отключился > timeout                        | A получает `room:closed {reason:'player_left'}` (RC6); оба отключены → `onClose` один раз, `onForfeit` не вызван                                                                                                                                                          |
| X8  | две комнаты R1, R2; сокет делает `room:rejoin {roomId:R1, playerToken: токен из R2}`          | `INVALID_TOKEN`; за 200 мс сокет не получил `room:state`; `game:move` → `NOT_IN_ROOM`                                                                                                                                                                                     |
| X9  | `room:rejoin {R1, токен места 0}` новым сокетом                                               | ack `seat:0`; полученный `room:state.you === 0`, `game.hand` = рука места 0, у соперника только `opponentHandCount`                                                                                                                                                       |
| X10 | собрать все `room:state`/`room:closed` обоих игроков за раунд + отключение/возврат            | `JSON.stringify(payload)` ни разу не содержит ни `tokenA`, ни `tokenB`                                                                                                                                                                                                    |
| X11 | `loadConfig({ RECONNECT_TIMEOUT: '5000' })`, `{}`, `'abc'`, `'0'`, `'1.5'` (`config.test.ts`) | `5000`; `undefined` (→ 120 000 в `startServer`); throw ×3                                                                                                                                                                                                                 |
| —   | Существующие D1–D4, D6–D8                                                                     | проходят после переименования опции; D5 заменён X5                                                                                                                                                                                                                        |

### 7.3 Client — Vitest + Testing Library (фейковый сокет `client/src/test/fakeSocket.ts`)

| ID    | Где                                                | Сценарий                                                                                           | Ожидание                                                                                                                                                |
| ----- | -------------------------------------------------- | -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C-X1  | `storage.test.ts`                                  | save R1, R2 → `loadSession('R1')`; `clearSession('R1')`; 11 записей; битый JSON; `getItem` бросает | объект; `null` для R1, R2 на месте; осталось 10 без самой старой; `null` без исключения ×2                                                              |
| C-X2  | `storage.test.ts`                                  | в `sessionStorage['domino:session']` старая сессия, `dropLegacySession()`                          | ключ удалён, `localStorage` не тронут                                                                                                                   |
| C-X3  | `Lobby.test.tsx`                                   | `localStorage` содержит токен для `ABC234`, URL `/?room=ABC234`, `hello`                           | `restoring-screen`; `emitWithAck('room:rejoin', {roomId:'ABC234', playerToken:'t'})`; `join-screen` не рендерится                                       |
| C-X4  | `Lobby.test.tsx`                                   | токен есть только для `ZZZ222`, URL `/?room=ABC234`                                                | `join-screen`; запись `ZZZ222` не удалена                                                                                                               |
| C-X5  | `Lobby.test.tsx`                                   | в игре, `room:closed {replaced}` → «На главную»                                                    | `closed-screen`; запись в `localStorage` **осталась**                                                                                                   |
| C-X6  | `Lobby.test.tsx`                                   | `room:closed {player_left}` / rejoin `INVALID_TOKEN`                                               | запись удалена                                                                                                                                          |
| C-X7  | `Lobby.test.tsx`                                   | `room:state` с `match.forfeit:1`, `you:0`                                                          | `forfeit-summary`, текст «Победа! Соперник не вернулся в игру», запись удалена; последующий `hello` не шлёт `room:rejoin`; «На главную» → `home-screen` |
| C-X8  | `GameScreen`/`Lobby.test.tsx` (`vi.useFakeTimers`) | `room:state` с соперником `connected:false, reconnectRemainingMs: 65000`, +2 с                     | `opponent-countdown` «01:05» → «01:03»; новый `room:state` с `connected:true` — плашки нет                                                              |
| C-X9  | `useCountdown.test.ts`                             | `formatMmSs` 120000 / 61001 / 999 / 0 / −5                                                         | `02:00` / `01:02` / `00:01` / `00:00` / `00:00`                                                                                                         |
| C-X10 | `App.test.tsx`                                     | `hello` → `disconnect` при `socket.active=true`; затем `hello`                                     | `reconnecting-banner` «Переподключение…», `connection-status` «reconnecting…»; после `hello` баннера нет, `connected`                                   |
| C-X11 | `App.test.tsx`                                     | `disconnect` при `socket.active=false`                                                             | `disconnected`, баннера нет                                                                                                                             |
| C-X12 | `App.test.tsx`                                     | `window.dispatchEvent(new Event('offline'))`                                                       | вызван `socket.io.engine.close()` (в фейковом сокете — `vi.fn`)                                                                                         |
| —     | существующие L-3, L-14, C3 и др.                   | переписать с `sessionStorage` на `localStorage['domino:sessions']`                                 | —                                                                                                                                                       |

### 7.4 E2E — `e2e/reconnect.spec.ts` (Playwright, Chromium, `RECONNECT_TIMEOUT=8000`, timeout теста 60 с)

| ID  | Сценарий                                                                                                                          | Ожидание                                                                                                                                                                                                             |
| --- | --------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| X16 | `startGame(browser)`; 2× `playStep`; запомнить `readTable(b)`, `readHand(b)`; `state = await ctxB.storageState()`; `ctxB.close()` | у A `opponent-offline` с текстом `/Соперник отключился, ждём… \d{2}:\d{2}/`, значение через 2 с меньше                                                                                                               |
|     | `newPlayer(browser, { storageState: state })` → `b2.goto(link)`                                                                   | `game-screen` без `join-screen`; `readTable(b2)` и `readHand(b2)` равны запомненным (hand, opp, boneyard, board, myTurn, scores); у A плашка исчезла; `playStep(a, b2)` проходит                                     |
| X17 | `startGame`; `ctxB.close()` (не возвращаемся)                                                                                     | у A через ≤ 20 с `forfeit-summary` с «Победа!»; `home-button` → `home-screen`                                                                                                                                        |
| X18 | `startGame`; B: `b.close()` (вкладка, контекст жив) → `ctxB.newPage().goto(link)`                                                 | `game-screen` с той же рукой, `join-screen` не показан; затем ещё одна вкладка `ctxB` по ссылке → вторая за столом, первая — `closed-screen` «Игра открыта в другой вкладке»; у A по-прежнему два игрока в `players` |
| X19 | `startGame`; `ctxB.setOffline(true)`                                                                                              | у B `reconnecting-banner`; у A `opponent-offline` (≤ 5 с); `ctxB.setOffline(false)` → у B баннера нет, `connection-status` = `connected`, `readTable(b)` прежний; у A плашки нет                                     |
| —   | E3, E5, E6, E8–E15                                                                                                                | зелёные на двух контекстах                                                                                                                                                                                           |

## 8. Порядок реализации (рекомендация)

1. shared: `forfeit`, `forfeitMatch`, `reconnectRemainingMs` в протоколе + X1–X2.
2. server: переименование опции, `RECONNECT_TIMEOUT`, дедлайн, `expire` (RC4–RC6), `notifyForfeit`, ping-настройки + X3–X11.
3. client: storage на `localStorage` + `useLobby`, затем статус `reconnecting`/`offline`, `useCountdown` + плашка, `ForfeitSummary` + C-X*.
4. e2e: хелперы на контекстах, перевод старых сценариев, `reconnect.spec.ts`; README, `fly.toml`.

## 9. Вне рамок

- Сохранение комнат между рестартами/деплоями сервера и несколько инстансов (комнаты по-прежнему в памяти одной машины; Fly `auto_stop_machines` может остановить машину, если оба игрока отключены).
- Пауза таймера хода / автоход за отключившегося; перенос очереди хода — ход отключившегося просто ждёт.
- Аккаунты, вход с другого устройства/браузера (токен привязан к браузеру; перенос — нет).
- Кнопка «Вернуться в игру» на главной (`/` без `?room`) со списком незавершённых партий.
- Сохранение результата техпоражения для проигравшего (вернувшийся после таймаута видит общую ошибку «Не удалось вернуться в игру»).
- Rate-limit перебора токенов, timing-safe сравнение (UUID v4 — 122 бита случайности).
- Кнопка «Сдаться» / добровольный выход из матча.
- «Реванш» после техпоражения (комната удалена; новая игра — через «На главную»).

## 10. Допущения

1. **`RECONNECT_TIMEOUT` в миллисекундах** — как все существующие env (`RECONNECT_GRACE_MS`); `RECONNECT_GRACE_MS` удаляется без алиаса (в `fly.toml` он не задан, проды не ломаются).
2. **Токен — серверный `playerToken` места**, хранимый клиентом в `localStorage` по `roomId`, а не отдельный клиентский device-id: минимальное изменение протокола, токен по-прежнему не угадывается и даёт доступ только к своему месту.
3. **«Тот же игрок» = тот же браузер (профиль)**. Следствие: вкладки одного браузера больше не могут играть друг против друга; e2e и ручная проверка — разные контексты / обычное + инкогнито окно. Это отменяет решение spec-5 §10 п.2 (`sessionStorage`), как и просит карточка.
4. **Сценарий e2e «закрыть контекст и открыть снова»** моделируется через `ctxB.storageState()` → новый контекст с этим `storageState` (Playwright не умеет «переоткрыть» закрытый контекст; `localStorage` в `storageState` входит).
5. **Техпоражение — конец матча**, а не раунда: счёт не меняется, `winner` = оставшийся. Рука соперника при этом не раскрывается (раунд мог не закончиться).
6. После техпоражения **комната сразу удаляется**, оставшийся видит итог по последнему `room:state` до нажатия «На главную»; F5 на этом экране ведёт на `join`/ошибку (комнаты нет) — приемлемо.
7. Если ушли **оба** или матч уже окончен — поведение прежнее (`room:closed player_left`), чтобы не придумывать победителя без зрителя.
8. `PROTOCOL_VERSION` не повышается: поля аддитивные, клиент и сервер выкатываются одним образом (spec-8).
9. Укороченный таймаут в e2e (8 с) задаётся всем e2e через `webServer.env`; F5-сценарии (E5, E11, E15) возвращаются за < 2 с и не страдают. Против внешнего сервера (`E2E_BASE_URL`, docker-job) X17 пропускается.
10. Если в CI `context.setOffline` не рвёт WebSocket/не шлёт `offline` стабильно, X19 допустимо реализовать через `page.evaluate(() => window.dispatchEvent(new Event('offline')))` + `setOffline(true)` для блокировки повторного подключения; суть проверки (баннер → восстановление без перезагрузки) не меняется.
