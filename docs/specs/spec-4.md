# Spec #4 — Сервер: комнаты и игровой цикл по WebSocket

> Карточка: #4 (id 8067), тег `server`, приоритет high.
> Файл в репозитории после PR: `docs/specs/spec-4.md` (кладёт разработчик).
> Зависит от: #2 (каркас), #3 (правила раунда `@domino/shared/rules`) — оба в `main`.
> Используют: #5 (лобби, приглашение по ссылке), #6 (стол и ходы), #7 (конец партии, матч до 101, реванш).

## 1. Цель

Сервер на Socket.IO держит в памяти **комнаты на двоих** и **один раунд** в каждой:

1. игрок создаёт комнату → получает код комнаты и секретный токен места;
2. второй игрок входит по коду → сервер сам стартует раунд (`startRound` из shared);
3. ходы приходят намерениями `game:move`, проверяются **только** `applyMove` из shared;
4. после каждого изменения сервер шлёт **каждому** игроку его вид (`toPlayerView`): свои кости — полностью, чужие — только количество, базар — только количество;
5. отключение не убивает место: игрок возвращается по токену (`room:rejoin`) в течение grace-периода; по истечении — комната закрывается;
6. всё покрыто интеграционными тестами с двумя реальными socket-клиентами.

## 2. Контекст (что уже есть)

| Что                                                                                                                  | Где                           | Использование в #4                                           |
| -------------------------------------------------------------------------------------------------------------------- | ----------------------------- | ------------------------------------------------------------ |
| `startServer({ port, host, corsOrigin })` → `{ port, close() }`, `/health`, `server:hello`                           | `server/src/app.ts`           | расширить опциями и обработчиками, поведение I1–I6 не менять |
| Контракт событий, `PROTOCOL_VERSION = 1`, `SocketData = Record<string, never>`                                       | `shared/src/protocol.ts`      | дополнить событиями и типами (раздел 5)                      |
| `startRound`, `applyMove`, `getLegalMoves`, `toPlayerView`, `PlayerView`, `Move`, `MoveError`, `Tile`, `PlayerIndex` | `shared/src/rules/*` (spec-3) | единственный источник правил; **не дублировать** логику      |
| Интеграционные тесты `I1–I6` (socket.io-client, `port: 0`, `transports: ['websocket']`)                              | `server/src/app.test.ts`      | образец хелперов; новые тесты — в отдельных файлах           |
| Клиент знает только `server:hello`                                                                                   | `client/src/*`                | не меняется (лобби — #5, стол — #6)                          |

Комментариев к карточке нет.

## 3. Модель комнаты (нормативно)

| #   | Правило                                                                                                                                                                                                                                                                                                 |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| K1  | Комната — 2 места: `seat 0` — создатель, `seat 1` — вошедший. `seat` = `PlayerIndex` в `RoundState`. Кто ходит первым, решают правила (R4), а не место.                                                                                                                                                 |
| K2  | `roomId` — 6 символов из алфавита `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` (без `I O 0 1`), генерируется `crypto.randomInt`, уникален среди живых комнат (при коллизии — перегенерировать). На входе `roomId` нормализуется `trim().toUpperCase()`.                                                           |
| K3  | `playerToken` — `crypto.randomUUID()`, выдаётся при `room:create` / `room:join`, знает только владелец места. Нужен только для `room:rejoin`. Никогда не попадает в payload другому игроку.                                                                                                             |
| K4  | Фазы комнаты: `waiting` (1 место занято) → `playing` (2 места, раунд идёт) → `finished` (раунд окончен, `RoundState.status === 'finished'`). Переход `waiting → playing` происходит **синхронно** в обработчике успешного `room:join`.                                                                  |
| K5  | Раунд: `startRound({ seed })`, где `seed = opts.roundSeed()` (по умолчанию `crypto.randomInt(0, 2 ** 32)`). `seed` и `RoundState` хранятся только на сервере.                                                                                                                                           |
| K6  | Один сокет — максимум одна комната. Привязка хранится в `socket.data` (`{ roomId, seat }`).                                                                                                                                                                                                             |
| K7  | Имя: `trim()`, длина 1–20 символов (после trim), иначе `INVALID_NAME`. Совпадение имён допустимо.                                                                                                                                                                                                       |
| K8  | Место «отключено», когда его сокет отключился. Место за игроком сохраняется `reconnectGraceMs` (по умолчанию 60 000 мс). Ходы второго игрока при этом **продолжают** приниматься (если его очередь).                                                                                                    |
| K9  | Истёк grace у любого места → комната закрывается: всем ещё подключённым сокетам комнаты — `room:closed { reason: 'player_left' }`, их `socket.data` очищается, комната удаляется из памяти.                                                                                                             |
| K10 | `room:rejoin` с верным `{ roomId, playerToken }` в пределах grace (или при ещё подключённом старом сокете): таймер отменяется, место привязывается к новому сокету. Если старый сокет ещё подключён — он получает `room:closed { reason: 'replaced' }` и отвязывается (без принудительного disconnect). |
| K11 | После любого изменения комнаты (вход, старт, ход, отключение, возврат) **каждому подключённому** игроку отправляется `room:state` со **своим** видом. Широковещательно `io.to(room).emit` с одним payload для обоих — запрещено.                                                                        |
| K12 | В фазе `finished` комната живёт, пока не истечёт grace отключившегося игрока (K9). Новый раунд/реванш — #7; `game:move` возвращает `ROUND_FINISHED` из `applyMove`.                                                                                                                                     |
| K13 | Хранение — только в памяти процесса; рестарт сервера теряет комнаты (норма для этой карточки).                                                                                                                                                                                                          |

## 4. Изменения по пакетам

### 4.1 shared

Только `shared/src/protocol.ts` — типы событий и payload (раздел 5). `PROTOCOL_VERSION` остаётся `1`: изменения только добавляют события (совместимо). Правила (`shared/src/rules`) **не меняются**.

### 4.2 server

```
server/src/
├─ app.ts               # startServer: + опции, подключение registerRoomHandlers(io, rooms)
├─ index.ts             # + env RECONNECT_GRACE_MS (необязательно, число мс)
├─ rooms/
│  ├─ ids.ts            # generateRoomId(exists), generateToken()
│  ├─ validate.ts       # parseName, parseRoomId, parseMove (runtime-валидация payload)
│  ├─ RoomManager.ts    # доменная логика комнат: без socket.io, тестируется unit-тестами
│  ├─ handlers.ts       # обвязка socket.io ↔ RoomManager, рассылка room:state
│  └─ *.test.ts
└─ *.test.ts            # интеграционные тесты (раздел 7)
```

**`StartServerOptions`** (новые поля необязательные; существующие вызовы не ломаются):

```ts
export interface StartServerOptions {
  port: number;
  host?: string;
  corsOrigin?: string | string[];
  /** Seed каждого нового раунда. По умолчанию crypto.randomInt(0, 2 ** 32). Тесты подставляют константу. */
  roundSeed?: () => number;
  /** Сколько держать место отключившегося игрока, мс. По умолчанию 60_000. */
  reconnectGraceMs?: number;
}
```

`index.ts`: `reconnectGraceMs = Number(process.env.RECONNECT_GRACE_MS) || undefined`; README — строка в таблицу env.

**`RoomManager`** (без зависимостей от socket.io; таймеры через `setTimeout`, тестируются `vi.useFakeTimers()`):

```ts
type SeatState = {
  name: string;
  token: string;
  socketId: string | null;
  graceTimer: NodeJS.Timeout | null;
};
interface Room {
  id: string;
  seats: [SeatState, SeatState | null];
  round: RoundState | null; // null в фазе waiting
}
// phase вычисляется: round === null → 'waiting'; round.status === 'finished' → 'finished'; иначе 'playing'

class RoomManager {
  constructor(opts: {
    roundSeed: () => number;
    reconnectGraceMs: number;
    onClose: (room: Room, reason: RoomClosedReason) => void;
  });
  create(
    socketId: string,
    name: string,
  ): Result<{ room: Room; seat: 0; token: string }, RoomErrorCode>;
  join(
    socketId: string,
    roomId: string,
    name: string,
  ): Result<{ room: Room; seat: 1; token: string }, RoomErrorCode>;
  rejoin(
    socketId: string,
    roomId: string,
    token: string,
  ): Result<{ room: Room; seat: PlayerIndex; replacedSocketId: string | null }, RoomErrorCode>;
  move(roomId: string, seat: PlayerIndex, move: Move): Result<{ room: Room }, GameErrorCode>;
  disconnect(roomId: string, seat: PlayerIndex, socketId: string): Room | null; // ставит grace-таймер
  get(roomId: string): Room | undefined;
  closeAll(): void; // очищает таймеры (вызывается из close())
}
```

- `move`: `GAME_NOT_STARTED`, если `round === null`; иначе `applyMove(round, seat, move)` → при `ok:false` вернуть его `error` как есть; при `ok:true` заменить `round`.
- `disconnect` игнорируется, если `socketId` не совпадает с текущим сокетом места (старый сокет после `replaced`).
- `close()` сервера обязан вызвать `closeAll()` — иначе висящие таймеры держат процесс/тесты.

**`handlers.ts`** — порядок проверок для каждого события:

| Событие       | Проверки (первая сработавшая → ack `{ ok:false, error }`)                                                | Успех                                                                                                                      |
| ------------- | -------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `room:create` | `ALREADY_IN_ROOM` (есть `socket.data.roomId`) → `INVALID_PAYLOAD` (не объект) → `INVALID_NAME`           | ack `{ ok:true, roomId, seat:0, playerToken }`, затем `room:state` создателю (`phase:'waiting'`, `game:null`)              |
| `room:join`   | `ALREADY_IN_ROOM` → `INVALID_PAYLOAD` → `INVALID_NAME` → `ROOM_NOT_FOUND` → `ROOM_FULL` (место 1 занято) | ack `{ ok:true, roomId, seat:1, playerToken }`, старт раунда, `room:state` обоим (`phase:'playing'`)                       |
| `room:rejoin` | `ALREADY_IN_ROOM` → `INVALID_PAYLOAD` → `ROOM_NOT_FOUND` → `INVALID_TOKEN`                               | ack `{ ok:true, roomId, seat }` (без токена), старому сокету `room:closed{replaced}` при необходимости, `room:state` обоим |
| `game:move`   | `INVALID_PAYLOAD` (`parseMove`) → `NOT_IN_ROOM` → `GAME_NOT_STARTED` → коды `MoveError` из `applyMove`   | ack `{ ok:true }`, `room:state` обоим                                                                                      |
| `disconnect`  | —                                                                                                        | если в комнате: `RoomManager.disconnect`, `room:state` второму (его `players[x].connected:false`)                          |

Общие требования к обработчикам:

- ack — последний аргумент; если клиент прислал не функцию — событие игнорируется (лог `console.warn`), сервер не падает.
- Любой мусор в payload (`null`, строка, лишние поля, `tile: [7, 1]`, `tile: [1.5, 2]`, `end: 'top'`) → `INVALID_PAYLOAD`, исключения наружу не вылетают.
- `parseMove` возвращает **новый** объект только с известными полями; `tile` — массив из двух целых 0–6 (порядок любой, `applyMove` сам канонизирует).
- При ошибке хода `room:state` **не** рассылается; состояние не меняется.
- Ack отправляется **до** рассылки `room:state` (клиент знает исход своего действия раньше нового состояния).
- Логи: `console.info` на create/join/rejoin/close (`room ABC234 created`, …). Без вывода токенов, seed и рук.

### 4.3 client

Без изменений кода. Должен проходить `typecheck` с новыми типами протокола. UI лобби — #5, стол — #6.

## 5. Протокол (Socket.IO)

Все типы — в `shared/src/protocol.ts`, экспортируются из `@domino/shared`. Payload — JSON-сериализуемые.

```ts
import type { Move, MoveError, PlayerIndex, PlayerView } from './rules';

export type RoomPhase = 'waiting' | 'playing' | 'finished';

export interface RoomPlayer {
  seat: PlayerIndex;
  name: string;
  connected: boolean;
}

/** Состояние комнаты глазами одного игрока. Единственное событие с состоянием. */
export interface RoomStatePayload {
  roomId: string;
  you: PlayerIndex;
  phase: RoomPhase;
  /** По месту: players[0] — создатель; длина 1 в waiting, 2 потом. */
  players: RoomPlayer[];
  /** null в waiting; иначе toPlayerView(round, you). */
  game: PlayerView | null;
}

export type RoomClosedReason = 'player_left' | 'replaced';
export interface RoomClosedPayload {
  roomId: string;
  reason: RoomClosedReason;
}

export type RoomErrorCode =
  | 'INVALID_PAYLOAD'
  | 'INVALID_NAME'
  | 'ROOM_NOT_FOUND'
  | 'ROOM_FULL'
  | 'ALREADY_IN_ROOM'
  | 'INVALID_TOKEN';

export type GameErrorCode = MoveError | 'INVALID_PAYLOAD' | 'NOT_IN_ROOM' | 'GAME_NOT_STARTED';

export type AckResult<T, E extends string> = ({ ok: true } & T) | { ok: false; error: E };

export interface RoomJoinedAck {
  roomId: string;
  seat: PlayerIndex;
  playerToken: string;
}
export interface RoomRejoinedAck {
  roomId: string;
  seat: PlayerIndex;
}

export interface ServerToClientEvents {
  'server:hello': (payload: ServerHelloPayload) => void;
  'room:state': (payload: RoomStatePayload) => void;
  'room:closed': (payload: RoomClosedPayload) => void;
}

export interface ClientToServerEvents {
  'room:create': (
    payload: { name: string },
    ack: (res: AckResult<RoomJoinedAck, RoomErrorCode>) => void,
  ) => void;
  'room:join': (
    payload: { roomId: string; name: string },
    ack: (res: AckResult<RoomJoinedAck, RoomErrorCode>) => void,
  ) => void;
  'room:rejoin': (
    payload: { roomId: string; playerToken: string },
    ack: (res: AckResult<RoomRejoinedAck, RoomErrorCode>) => void,
  ) => void;
  'game:move': (
    payload: { move: Move },
    ack: (res: AckResult<object, GameErrorCode>) => void,
  ) => void;
}

export interface SocketData {
  roomId?: string;
  seat?: PlayerIndex;
}
```

Пример: ход игрока 1 (`seat 1`):

```
C1 → game:move { move: { type: 'play', tile: [6, 3], end: 'right' } }
S  → C1 ack { ok: true }
S  → C0 room:state { …, game: { you: 0, hand: [...7 костей C0...], opponentHandCount: 5, … } }
S  → C1 room:state { …, game: { you: 1, hand: [...5 костей C1...], opponentHandCount: 6, … } }
```

Конфиденциальность (проверяется тестами): в любом payload, полученном сокетом игрока `p`, нет `tileKey` ни одной кости соперника или базара, которой нет на столе; нет `seed`, `playerToken` соперника, `RoundState`.

## 6. Критерии готовности

1. `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`, `npm run test:e2e` — зелёные; существующие I1–I6 и e2e E1–E2 проходят без изменений.
2. Типы раздела 5 экспортируются из `@domino/shared`; сервер и клиент типизируют Socket.IO через них (`Server<ClientToServerEvents, …, SocketData>`), в коде нет `as any` для событий.
3. Создание → вход вторым → оба получают `room:state` с `phase:'playing'`, `game.hand.length === 7`, `game.opponentHandCount === 7`, `game.boneyardCount === 14`; ход у владельца старшего дубля (совпадает с локальным `startRound({ seed })`).
4. Сервер не содержит правил домино: в `server/src` нет проверок совпадения половин/базара/очков — только вызовы `startRound`/`applyMove`/`toPlayerView` (проверяется ревью; `rg "boneyard|canPlace|handPoints" server/src` находит только тесты).
5. Каждый код ошибки из таблицы 4.2 воспроизводится интеграционным тестом; невалидный payload не роняет сервер и не меняет состояние.
6. Конфиденциальность из раздела 5 проверена на каждом `room:state` полного раунда (тест G7).
7. Отключение → соперник видит `connected:false`; `room:rejoin` в пределах grace возвращает место и актуальный `game`; после grace — `room:closed { reason:'player_left' }` и `ROOM_NOT_FOUND` для этого `roomId`.
8. `server.close()` не оставляет таймеров: тест-раннер завершается без «hanging process», тесты с `reconnectGraceMs: 60_000` не ждут минуту.
9. README: раздел «Протокол комнат» (события таблицей, ссылка на spec-4) и `RECONNECT_GRACE_MS` в таблице env; `docs/specs/spec-4.md` в PR.

## 7. Тест-кейсы

Детерминизм: во всех интеграционных тестах `startServer({ port: 0, host: '127.0.0.1', roundSeed: () => SEED, reconnectGraceMs })`; ожидаемые руки считаются локально `startRound({ seed: SEED })`. Хелперы (`connectClient`, `emitAck(socket, event, payload)` → Promise ack, `nextState(socket, predicate?)`) — в `server/src/test-helpers.ts`. Таймауты ожидания ≤ 2 с.

### Unit — `rooms/*.test.ts`

| ID  | Кейс                                                                                                  | Ожидание                                                |
| --- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| U1  | `generateRoomId` 1000 раз                                                                             | 6 символов, только из алфавита K2                       |
| U2  | `generateRoomId(exists)`, где `exists` первые 3 раза `true`                                           | возвращает 4-й кандидат, без бесконечного цикла         |
| U3  | `parseName`: `'  Аня '`, `''`, `'   '`, 21 символ, `42`                                               | `'Аня'`, ошибка ×4                                      |
| U4  | `parseRoomId`: `' abc234 '`                                                                           | `'ABC234'`; `123`/`null` → ошибка                       |
| U5  | `parseMove`: валидные play/draw/pass; `tile:[7,1]`, `[1.5,2]`, `[1]`, `end:'top'`, `type:'x'`, `null` | ok ×3; ошибка для остальных; лишние поля отброшены      |
| U6  | `RoomManager.move` до `join`                                                                          | `GAME_NOT_STARTED`                                      |
| U7  | `RoomManager.move` чужим местом                                                                       | `NOT_YOUR_TURN` (проброс из `applyMove`)                |
| U8  | fake timers: `disconnect` → `advanceTimersByTime(grace - 1)` → `rejoin`                               | ok, `onClose` не вызван                                 |
| U9  | fake timers: `disconnect` → `advanceTimersByTime(grace)`                                              | `onClose(room, 'player_left')`, `get(id) === undefined` |
| U10 | `disconnect` со «старым» socketId после `rejoin`                                                      | игнорируется, таймер не ставится                        |
| U11 | `closeAll()` при активных таймерах                                                                    | `vi.getTimerCount() === 0`                              |

### Integration — `server/src/rooms.test.ts`, `server/src/game.test.ts` (реальные socket.io-клиенты)

Комнаты:

| ID  | Кейс                                                                | Ожидание                                                                                                                                                             |
| --- | ------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1  | A `room:create {name:'A'}`                                          | ack `{ok:true, seat:0, roomId:/^[A-HJ-NP-Z2-9]{6}$/, playerToken}`; A получает `room:state {phase:'waiting', players:[{seat:0,name:'A',connected:true}], game:null}` |
| R2  | B `room:join {roomId: lowercase(roomId), name:'B'}`                 | ack `{ok:true, seat:1}`; оба получают `room:state phase:'playing'`, `players` длины 2, `you` = своё место                                                            |
| R3  | `room:join` в несуществующую                                        | `ROOM_NOT_FOUND`                                                                                                                                                     |
| R4  | третий клиент C `room:join` в полную комнату                        | `ROOM_FULL`; A и B не получают новых `room:state`                                                                                                                    |
| R5  | A повторно `room:create` / `room:join`                              | `ALREADY_IN_ROOM`                                                                                                                                                    |
| R6  | `room:create {name:''}`, `room:create null`, `room:join {roomId:1}` | `INVALID_NAME`, `INVALID_PAYLOAD`, `INVALID_PAYLOAD`                                                                                                                 |
| R7  | 2 комнаты параллельно (4 клиента)                                   | разные `roomId`; ход в одной не порождает `room:state` в другой                                                                                                      |
| R8  | событие без ack-функции (`socket.emit('room:create', {name:'A'})`)  | сервер жив: следующий `room:create` с ack у другого клиента — ok                                                                                                     |

Игра:

| ID  | Кейс                                                                                                  | Ожидание                                                                                                                                                                                                |
| --- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| G1  | после старта (SEED)                                                                                   | `game.hand` каждого = `startRound({seed:SEED}).hands[you]`; `currentPlayer` совпадает; у ходящего `legalMoves` = `[opening play]`, у другого `[]`                                                       |
| G2  | ходящий шлёт `legalMoves[0]`                                                                          | ack `{ok:true}`; оба получают `room:state` с `board.length === 1`, ход перешёл                                                                                                                          |
| G3  | не ходящий шлёт `game:move`                                                                           | ack `{ok:false, error:'NOT_YOUR_TURN'}`; `room:state` не приходит (ждём 200 мс)                                                                                                                         |
| G4  | первый ход не той костью                                                                              | `MUST_PLAY_OPENING_TILE`                                                                                                                                                                                |
| G5  | `game:move` до старта / от сокета вне комнаты                                                         | `GAME_NOT_STARTED` / `NOT_IN_ROOM`                                                                                                                                                                      |
| G6  | `game:move {move:{type:'play', tile:[9,9], end:'right'}}`, `{move:'x'}`, `null`                       | `INVALID_PAYLOAD` ×3                                                                                                                                                                                    |
| G7  | полный раунд: на каждый `room:state` ходящий шлёт `legalMoves[0]` до `phase:'finished'` (≤ 100 ходов) | `phase:'finished'`, `game.result` у обоих одинаковый и равен результату локальной симуляции с тем же SEED и той же стратегией; **в каждом** полученном payload — проверка конфиденциальности (раздел 5) |
| G8  | `game:move` после `finished`                                                                          | `ROUND_FINISHED`                                                                                                                                                                                        |

Отключение/возврат (`reconnectGraceMs: 300`):

| ID  | Кейс                                                                               | Ожидание                                                                                                                                |
| --- | ---------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | в `playing` B `disconnect()`                                                       | A получает `room:state`, `players[1].connected === false`                                                                               |
| D2  | B подключается новым сокетом, `room:rejoin {roomId, playerToken}` в пределах grace | ack `{ok:true, seat:1}`; B получает `room:state` с тем же `game.hand`, что до отключения; A — `connected:true`                          |
| D3  | во время отключения B ходит A (его очередь)                                        | ok; после rejoin B видит этот ход на `board`                                                                                            |
| D4  | `room:rejoin` с чужим/ложным токеном                                               | `INVALID_TOKEN`; с несуществующим `roomId` — `ROOM_NOT_FOUND`                                                                           |
| D5  | B отключён > grace                                                                 | A получает `room:closed {reason:'player_left'}`; затем `game:move` от A → `NOT_IN_ROOM`; `room:join` в этот `roomId` → `ROOM_NOT_FOUND` |
| D6  | B открыл второй сокет и сделал `room:rejoin`, первый ещё подключён                 | первый получает `room:closed {reason:'replaced'}`, его `game:move` → `NOT_IN_ROOM`; второй играет                                       |
| D7  | в `waiting` A отключился > grace                                                   | комната удалена: `room:join` → `ROOM_NOT_FOUND`                                                                                         |
| D8  | `server.close()` при отключённом игроке (grace 60 000)                             | `close()` резолвится сразу, таймеров нет                                                                                                |

### E2E

Не требуются (UI не меняется). Существующие E1–E2 должны остаться зелёными. Сценарий «две вкладки в одной комнате» — #5.

## 8. Порядок реализации (рекомендация)

1. Типы протокола в `shared/src/protocol.ts` → `typecheck`.
2. `ids.ts`, `validate.ts` + U1–U5.
3. `RoomManager` + U6–U11.
4. `handlers.ts`, опции `startServer`, `closeAll` в `close()`; `test-helpers.ts`; R*, G*, D*.
5. README, `index.ts` (env), `docs/specs/spec-4.md`.

## 9. Вне рамок

- UI лобби, ссылка-приглашение, хранение `playerToken` в браузере (`localStorage`) и авто-`rejoin` на клиенте — #5.
- Отрисовка стола, отправка ходов из UI — #6.
- Несколько раундов, счёт матча до 101, реванш/новый раунд в той же комнате, экран итогов с раскрытыми руками — #7.
- Выход из комнаты по кнопке (`room:leave`), зрители, чат, больше двух игроков.
- Таймер хода, автоход/автопропуск за отключённого, техническое поражение.
- Персистентность (Redis/БД), горизонтальное масштабирование, Socket.IO adapter, connection state recovery Socket.IO.
- Аутентификация пользователей, rate limiting, защита от перебора `roomId`.
- Изменения правил в `shared/src/rules`.

## 10. Допущения

1. Карточка не задаёт формат ID — выбран короткий читаемый код из 6 символов (≈ 10⁹ вариантов, достаточно для игры друзей); он же будет в ссылке-приглашении #5.
2. Возврат после отключения — по явному `playerToken` (а не по `socket.id`, который меняется при переподключении). Встроенный connection state recovery Socket.IO не используем: он не переживает смену вкладки/перезагрузку страницы.
3. Grace по умолчанию 60 с; по истечении комната закрывается без победителя — техпоражение и счёт — забота #7.
4. Отключение соперника не ставит игру на паузу: ходить может только тот, чья очередь, так что «пауза» возникает естественно, если очередь отключившегося.
5. Одно событие состояния `room:state` (комната + `PlayerView`) вместо пары `room:*`/`game:state` — меньше гонок на клиенте; ошибки — только через ack, отдельного `game:error` нет.
6. `PROTOCOL_VERSION` не повышается: события только добавлены.
7. Состояние после конца раунда хранится до закрытия комнаты, чтобы #7 мог добавить «новый раунд» без смены `roomId`.
8. Места фиксированы: создатель — `seat 0`; очередь первого хода определяют правила (R4), а не место.
