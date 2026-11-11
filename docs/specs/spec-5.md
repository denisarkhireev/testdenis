# Spec #5 — Клиент: лобби и приглашение друга по ссылке

> Карточка: #5 (id 8068), тег `client`, приоритет medium.
> Файл в репозитории после PR: `docs/specs/spec-5.md` (кладёт разработчик).
> Зависит от: #2 (каркас), #3 (правила), #4 (комнаты на сервере) — все в `main` (`c931476`).
> Используют: #6 (игровой стол — заменяет заглушку экрана игры), #7 (конец партии, реванш).

## 1. Цель

Дать двум друзьям встретиться в одной комнате через браузер, без консоли DevTools:

1. стартовый экран: имя + «Создать игру»;
2. после создания — экран ожидания со ссылкой-приглашением и кнопкой «Скопировать»;
3. друг открывает ссылку, вводит имя, жмёт «Войти» → оба попадают в комнату (сервер стартует раунд);
4. обновление вкладки / кратковременный обрыв связи не выкидывает игрока из комнаты (авто-`room:rejoin` по токену);
5. e2e-тест: две вкладки встречаются в одной комнате.

Клиент только отправляет намерения (`room:create`, `room:join`, `room:rejoin`) и рисует то, что пришло в `room:state` / `room:closed`. Никаких правил домино и решений «за сервер».

## 2. Контекст (что уже есть)

| Что                                                                                                                                                                                                                                     | Где                                                 | Использование в #5                                        |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- | --------------------------------------------------------- |
| Протокол комнат: `room:create/join/rejoin` (ack `AckResult<…>`), `room:state` (`RoomStatePayload`), `room:closed` (`RoomClosedPayload`), коды `RoomErrorCode`; payload-типы `RoomCreatePayload`, `RoomJoinPayload`, `RoomRejoinPayload` | `shared/src/protocol.ts`, `docs/specs/spec-4.md` §5 | использовать как есть, **протокол не меняется**           |
| Модель комнаты: `roomId` — 6 символов `[A-HJ-NP-Z2-9]`, регистр не важен (K2); имя 1–20 после `trim` (K7); seat 0 — создатель; grace 60 с (K8–K10); `replaced` при входе второй вкладкой по токену                                      | spec-4 §3                                           | валидация на клиенте — только UX-подсказка, сервер решает |
| `createSocket()` (типизированный `ClientSocket`, autoConnect, в dev — прокси Vite `/socket.io`)                                                                                                                                         | `client/src/socket.ts`                              | без изменений                                             |
| `useConnectionStatus(socket)` → `connecting/connected/disconnected` по `server:hello`/`disconnect`, проверка `PROTOCOL_VERSION`                                                                                                         | `client/src/useConnectionStatus.ts`                 | переиспользовать; статус остаётся на всех экранах         |
| `App({ socket? })` — заголовок «Domino» + `data-testid="connection-status"`                                                                                                                                                             | `client/src/App.tsx`                                | расширить роутингом экранов                               |
| Unit-тесты `App.test.tsx` U2–U6 с fake-сокетом (`EventEmitter`)                                                                                                                                                                         | `client/src/App.test.tsx`                           | не ломать; fake дополнить `timeout().emitWithAck`         |
| e2e E1–E2 (`connect.spec.ts`), Playwright сам поднимает `npm run dev` (`:5173` + `:3001`)                                                                                                                                               | `e2e/`, `playwright.config.ts`                      | добавить `e2e/lobby.spec.ts`                              |
| Роутера в клиенте нет; Vite dev отдаёт `index.html` на любой путь `/`                                                                                                                                                                   | —                                                   | роутер не добавляем (см. 4.3)                             |

Комментариев к карточке нет.

## 3. Поведение (нормативно)

### 3.1 Ссылка-приглашение

| #   | Правило                                                                                                                                                                           |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| L1  | Формат: `${window.location.origin}/?room=<ROOMID>` (например `http://localhost:5173/?room=ABC234`). Путь всегда `/`, код — в query-параметре `room`.                              |
| L2  | Чтение: `room` из `location.search` → `trim().toUpperCase()` → проверка `^[A-HJ-NP-Z2-9]{6}$`. Не прошёл → `bad-link-screen` (3.2). Параметра нет → стартовый экран.              |
| L3  | После успешного `room:create` URL вкладки создателя заменяется на ссылку-приглашение через `history.replaceState` (без перезагрузки). После «На главную» — `replaceState` на `/`. |

### 3.2 Экраны

Экран выбирается функцией `selectScreen(state)` из локального состояния лобби (4.3). Заголовок `Domino` и `connection-status` видны на всех экранах.

| Экран (`data-testid`) | Когда                                                                           | Содержимое                                                                                                                                                                                                       | Действия                                                |
| --------------------- | ------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| `home-screen`         | нет `?room`, не в комнате                                                       | поле «Ваше имя» (`name-input`), кнопка «Создать игру» (`create-button`)                                                                                                                                          | Enter в поле = клик по кнопке                           |
| `join-screen`         | валидный `?room`, не в комнате                                                  | текст «Вас пригласили в игру `ABC234`» (`join-room-code`), `name-input`, кнопка «Войти» (`join-button`)                                                                                                          | Enter = «Войти»                                         |
| `restoring-screen`    | есть сохранённая сессия и идёт `room:rejoin` (или ждём `server:hello` для него) | «Возвращаемся в игру…»                                                                                                                                                                                           | —                                                       |
| `waiting-screen`      | последний `room:state.phase === 'waiting'`                                      | «Ожидаем соперника…», код комнаты, поле только для чтения со ссылкой (`invite-link`, `readOnly`, value = ссылка L1), кнопка «Скопировать» (`copy-button`), строка статуса копирования (`copy-status`)            | копирование (L7)                                        |
| `game-screen`         | `phase` = `playing` или `finished`                                              | **заглушка до #6**: «Игра началась», список игроков (`player-name-0`, `player-name-1`) с пометкой «(вы)» у `you`; если соперник `connected:false` — `opponent-offline`: «Соперник отключился, ждём возвращения…» | —                                                       |
| `closed-screen`       | пришёл `room:closed`                                                            | `player_left` → «Соперник покинул игру»; `replaced` → «Игра открыта в другой вкладке»; кнопка «На главную» (`home-button`)                                                                                       | «На главную»: очистить сессию, URL → `/`, `home-screen` |
| `bad-link-screen`     | `?room` не прошёл L2, либо `room:join` вернул `ROOM_NOT_FOUND`                  | «Комната не найдена или ссылка устарела» + кнопка «Создать свою игру» (`home-button`)                                                                                                                            | как «На главную»                                        |

### 3.3 Правила взаимодействия

| #   | Правило                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| L4  | Имя: кнопка `create-button`/`join-button` **disabled**, пока `name.trim()` не 1–20 символов, или статус ≠ `connected`, или запрос в полёте (`pending`). `<input maxLength={20} autoFocus>`. Последнее введённое имя сохраняется в `localStorage['domino:name']` и подставляется при следующем открытии.                                                                                                                                                                                                       |
| L5  | Создание: `socket.timeout(ACK_TIMEOUT_MS).emitWithAck('room:create', { name: name.trim() })`. `ok:true` → сохранить сессию (L8), L3, дождаться `room:state` (экран определяется им). `ok:false` → сообщение по коду (таблица 3.4) под формой (`form-error`), форма доступна снова.                                                                                                                                                                                                                            |
| L6  | Вход: `emitWithAck('room:join', { roomId, name })`, `roomId` из L2. `ok:true` → сохранить сессию; экран определяет `room:state`. Ошибки — таблица 3.4.                                                                                                                                                                                                                                                                                                                                                        |
| L7  | Копирование: `navigator.clipboard.writeText(link)`. Успех → `copy-status` «Ссылка скопирована» на 2 с. Ошибка / API недоступен (http не-localhost, отказ в правах) → выделить текст в `invite-link` (`input.select()`), `copy-status` «Скопируйте ссылку вручную (Ctrl+C)». Исключения не всплывают.                                                                                                                                                                                                          |
| L8  | Сессия: `{ roomId, playerToken }` в `sessionStorage['domino:session']` (на вкладку, переживает F5). Пишется после успешного create/join; удаляется после `room:closed`, ошибок `ROOM_NOT_FOUND`/`INVALID_TOKEN` на rejoin и по «На главную». Чтение битого JSON → как отсутствие сессии (и удалить ключ). Все обращения к storage — в `try/catch`.                                                                                                                                                            |
| L9  | Авто-возврат: на **каждый** `server:hello` с верной версией протокола, если есть сохранённая сессия, клиент шлёт `room:rejoin { roomId, playerToken }` (это покрывает и F5, и переподключение сокета: сервер шлёт `hello` на каждое соединение). На время запроса — `restoring-screen`, если ещё нет `room:state`; если `room:state` уже был (обрыв во время игры) — остаётся текущий экран. `ok:false` → удалить сессию, показать экран по URL (`home`/`join`) с `form-error` «Не удалось вернуться в игру». |
| L10 | Приоритет при загрузке: сохранённая сессия важнее `?room`. Если `session.roomId` ≠ коду из URL — сессия удаляется, работает `join-screen` для кода из URL.                                                                                                                                                                                                                                                                                                                                                    |
| L11 | Ack-таймаут: `ACK_TIMEOUT_MS = 5000`. Таймаут (reject `emitWithAck`) → `form-error` «Сервер не отвечает, попробуйте ещё раз», `pending=false`.                                                                                                                                                                                                                                                                                                                                                                |
| L12 | `room:state` всегда заменяет локальную копию целиком; `room:closed` → экран `closed-screen`, сессия удаляется. События `room:state` до ack или после — оба порядка корректны (сервер шлёт ack раньше, но клиент на это не полагается).                                                                                                                                                                                                                                                                        |
| L13 | Все подписки (`room:state`, `room:closed`, `server:hello`, `disconnect`) снимаются при unmount (как U6). Таймер `copy-status` очищается при unmount.                                                                                                                                                                                                                                                                                                                                                          |

### 3.4 Сообщения об ошибках (`form-error`)

| Код                                         | Текст                                   |
| ------------------------------------------- | --------------------------------------- |
| `INVALID_NAME`                              | Имя — от 1 до 20 символов               |
| `ROOM_NOT_FOUND` (join)                     | → `bad-link-screen`                     |
| `ROOM_FULL`                                 | В этой игре уже два игрока              |
| `ALREADY_IN_ROOM`                           | Вы уже в игре — обновите страницу       |
| `INVALID_PAYLOAD`                           | Что-то пошло не так, попробуйте ещё раз |
| `INVALID_TOKEN` / `ROOM_NOT_FOUND` (rejoin) | Не удалось вернуться в игру             |
| таймаут                                     | Сервер не отвечает, попробуйте ещё раз  |

Маппинг — исчерпывающий `Record<RoomErrorCode, string>` (новый код в протоколе ломает `typecheck`).

## 4. Изменения по пакетам

### 4.1 shared

Без изменений. `PROTOCOL_VERSION` остаётся `1`.

### 4.2 server

Без изменений. (Если при реализации найдётся баг сервера — отдельный коммит с тестом в `server/`, упомянуть в PR.)

### 4.3 client

```
client/src/
├─ App.tsx                 # заголовок + connection-status + <Lobby socket={socket} />
├─ App.test.tsx            # U2–U6 без изменений (fake дополнен, см. 7)
├─ socket.ts               # без изменений
├─ useConnectionStatus.ts  # без изменений
└─ lobby/
   ├─ invite.ts            # buildInviteUrl(origin, roomId), parseRoomIdFromSearch(search): string | null | 'invalid'
   ├─ storage.ts           # loadSession/saveSession/clearSession, loadName/saveName (try/catch)
   ├─ errors.ts            # ROOM_ERROR_TEXT: Record<RoomErrorCode, string>, TIMEOUT_TEXT
   ├─ roomApi.ts           # createRoom/joinRoom/rejoinRoom(socket, payload) → Promise<AckResult|'timeout'>
   ├─ useLobby.ts          # состояние лобби + подписки + действия
   ├─ Lobby.tsx            # selectScreen → один из экранов
   ├─ screens/
   │  ├─ NameForm.tsx      # общий для home/join: input, кнопка, form-error
   │  ├─ HomeScreen.tsx
   │  ├─ JoinScreen.tsx
   │  ├─ WaitingScreen.tsx # ссылка + копирование
   │  ├─ GameScreen.tsx    # заглушка до #6
   │  ├─ ClosedScreen.tsx
   │  └─ BadLinkScreen.tsx
   └─ *.test.ts(x)
```

**`useLobby(socket, status)`** — единственное место с логикой; компоненты экранов — «глупые» (props + колбэки).

```ts
type LobbyState = {
  urlRoom: string | null | 'invalid'; // из L2 при монтировании и после navigateHome
  session: { roomId: string; playerToken: string } | null;
  room: RoomStatePayload | null; // последний room:state
  closed: RoomClosedReason | null;
  pending: 'create' | 'join' | 'rejoin' | null;
  error: string | null; // текст form-error
  badLink: boolean; // ROOM_NOT_FOUND на join
};

function useLobby(
  socket: ClientSocket,
  status: ConnectionStatus,
): {
  state: LobbyState;
  create(name: string): Promise<void>;
  join(name: string): Promise<void>;
  goHome(): void; // clearSession, replaceState('/'), сброс state
};

// чистая функция, unit-тестируется отдельно
function selectScreen(
  s: LobbyState,
): 'closed' | 'game' | 'waiting' | 'restoring' | 'bad-link' | 'join' | 'home';
// порядок: closed → room?.phase (playing|finished → game, waiting → waiting)
//        → pending==='rejoin' || (session && !room) → restoring
//        → badLink || urlRoom==='invalid' → bad-link → urlRoom → join → home
```

- `App` передаёт `status` из `useConnectionStatus` в `Lobby` (один источник статуса, второй подписки на `server:hello` для статуса не делать; для авто-rejoin `useLobby` подписывается на `server:hello` сам).
- `roomApi.ts`: обёртка над `socket.timeout(ACK_TIMEOUT_MS).emitWithAck(...)`; reject (таймаут/обрыв) → `'timeout'`. Без `as any`: типы ack выводятся из `ClientToServerEvents`.
- Стили — минимальные (inline или один `lobby.css`), без UI-библиотек и без роутера (`react-router` не добавлять). Новых npm-зависимостей нет.
- Тексты — на русском, как в таблицах выше (e2e и unit ищут по `data-testid`, не по тексту, кроме явно указанных проверок).

### 4.4 e2e / конфиги

- Новый `e2e/lobby.spec.ts` (кейсы раздела 6).
- `playwright.config.ts`: в `use` добавить `permissions: ['clipboard-read', 'clipboard-write']` (нужно для E4 в Chromium). Остальное без изменений.
- README: раздел «Как сыграть с другом» (3–5 строк: создать игру → скопировать ссылку → друг открывает → игра стартует; отметить, что `localhost`-ссылка работает только на этой машине, для игры по сети — открыть клиент по IP/хосту, доступному другу) и ссылка на `docs/specs/spec-5.md`.

## 5. Протокол (Socket.IO)

Не меняется. Клиент использует (spec-4 §5):

| Событие                             | Направление | Когда клиент шлёт / как обрабатывает        |
| ----------------------------------- | ----------- | ------------------------------------------- |
| `room:create {name}`                | C → S       | L5; ack `{ok, roomId, seat:0, playerToken}` |
| `room:join {roomId, name}`          | C → S       | L6; ack `{ok, roomId, seat:1, playerToken}` |
| `room:rejoin {roomId, playerToken}` | C → S       | L9; ack `{ok, roomId, seat}`                |
| `room:state`                        | S → C       | L12: заменить `room`; экран по `phase`      |
| `room:closed {roomId, reason}`      | S → C       | L12: `closed-screen`, очистка сессии        |
| `server:hello`                      | S → C       | статус соединения (как сейчас) + триггер L9 |

Последовательность «две вкладки»:

```
A → room:create {name:'Аня'}        S → A ack {ok, roomId:'ABC234', seat:0, playerToken:tA}
                                     S → A room:state {phase:'waiting', players:[Аня]}
A: sessionStorage ← {ABC234,tA}; URL ← /?room=ABC234; экран waiting, ссылка в invite-link
B открывает /?room=ABC234 → join-screen
B → room:join {roomId:'ABC234', name:'Боб'}   S → B ack {ok, seat:1, playerToken:tB}
                                     S → A room:state {phase:'playing', you:0, players:[Аня,Боб]}
                                     S → B room:state {phase:'playing', you:1, players:[Аня,Боб]}
A, B: game-screen
```

## 6. Критерии готовности

1. `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`, `npm run test:e2e` — зелёные; существующие U2–U6, E1–E2 и все тесты server/shared проходят без изменений своих ожиданий.
2. Сценарий из карточки руками (`npm run dev`, две вкладки): A вводит имя → «Создать игру» → видит ссылку `http://localhost:5173/?room=XXXXXX` и «Ожидаем соперника…»; «Скопировать» кладёт ровно эту ссылку в буфер; B открывает ссылку, вводит имя → «Войти» → обе вкладки показывают `game-screen` с обоими именами.
3. F5 во вкладке A на экране ожидания → после перезагрузки снова `waiting-screen` с той же ссылкой (rejoin), B по-прежнему может войти.
4. F5 во вкладке B во время игры → B возвращается на `game-screen`; у A на время обрыва виден `opponent-offline`, после возврата — пропадает.
5. Неверный/устаревший код в ссылке → `bad-link-screen`; третья вкладка по ссылке полной комнаты → `form-error` «В этой игре уже два игрока».
6. Кнопки создания/входа недоступны при пустом/длинном имени, без соединения и во время запроса; двойной клик шлёт один запрос.
7. Клиент не содержит правил: в `client/src/lobby` нет импортов из `@domino/shared` кроме типов протокола (`RoomStatePayload`, `RoomErrorCode`, …) и `PROTOCOL_VERSION`; решения о фазе/местах берутся только из `room:state`.
8. Токен не попадает в URL, `localStorage`, логи консоли и DOM (проверка: `rg playerToken client/src` — только `storage.ts`, `roomApi.ts`/`useLobby.ts` и тесты).
9. Нет новых runtime-зависимостей в `client/package.json`.
10. `docs/specs/spec-5.md` и раздел README в PR.

## 7. Тест-кейсы

Fake-сокет из `App.test.tsx` выносится в `client/src/test/fakeSocket.ts` и дополняется:
`timeout(ms)` → `{ emitWithAck: vi.fn<(event, payload) => Promise<unknown>>() }` (ответ задаётся в тесте: `resolve` ack / `reject(new Error('timeout'))`), `serverEmit(event, payload)` — эмит серверного события внутри `act`. `sessionStorage`/`localStorage` очищаются в `afterEach`; `history.replaceState(null, '', '/')` в `beforeEach`; `navigator.clipboard` подменяется через `Object.defineProperty`.

### Unit — `lobby/*.test.ts`

| ID  | Кейс                                                                                                                                           | Ожидание                                                                       |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| C1  | `buildInviteUrl('http://h:5173', 'ABC234')`                                                                                                    | `'http://h:5173/?room=ABC234'`                                                 |
| C2  | `parseRoomIdFromSearch`: `''`, `'?room=abc234'`, `'?room=%20ABC234%20'`, `'?room=ABC23'`, `'?room=ABCI01'`, `'?x=1'`                           | `null`, `'ABC234'`, `'ABC234'`, `'invalid'`, `'invalid'`, `null`               |
| C3  | `saveSession` → `loadSession`; битый JSON в ключе; `sessionStorage.getItem` бросает                                                            | объект; `null` + ключ удалён; `null` без исключения                            |
| C4  | `ROOM_ERROR_TEXT`                                                                                                                              | ключи = все `RoomErrorCode` (проверка типом + `Object.keys(...).length === 6`) |
| C5  | `selectScreen` — таблица из ≥ 8 состояний (closed поверх room; waiting; playing; finished → game; restoring; invalid url; badLink; join; home) | ожидаемый экран для каждого                                                    |
| C6  | `roomApi.createRoom`: ack ok / ack error / reject                                                                                              | возвращает ack как есть / как есть / `'timeout'`                               |

### Unit/компонентные — `lobby/Lobby.test.tsx` (`render(<App socket={fake} />)`)

| ID   | Кейс                                                                                                            | Ожидание                                                                                                                                                                                                                                                                                 |
| ---- | --------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| L-1  | старт без `?room`, статус `connecting`                                                                          | `home-screen`; `create-button` disabled                                                                                                                                                                                                                                                  |
| L-2  | `hello` пришёл; имя `'  '` → `'Аня'` → 21 символ                                                                | disabled → enabled → disabled                                                                                                                                                                                                                                                            |
| L-3  | имя `'  Аня '`, клик «Создать», ack ok `{roomId:'ABC234', seat:0, playerToken:'t'}`, затем `room:state waiting` | `emitWithAck('room:create', {name:'Аня'})` ровно 1 раз (двойной клик); `sessionStorage` = `{roomId:'ABC234', playerToken:'t'}`; `location.search === '?room=ABC234'`; `waiting-screen`; `invite-link` value = `${location.origin}/?room=ABC234`; `localStorage['domino:name'] === 'Аня'` |
| L-4  | `copy-button`, `clipboard.writeText` резолвится                                                                 | вызван со ссылкой; `copy-status` «Ссылка скопирована»; через 2 с (`vi.useFakeTimers`) текст исчез                                                                                                                                                                                        |
| L-5  | `copy-button`, `writeText` реджектится / `navigator.clipboard` undefined                                        | `copy-status` «Скопируйте ссылку вручную…», без необработанных ошибок                                                                                                                                                                                                                    |
| L-6  | URL `/?room=abc234`                                                                                             | `join-screen`, `join-room-code` = `ABC234`; «Войти» → `room:join {roomId:'ABC234', name}`; ack ok + `room:state playing` → `game-screen` с `player-name-0/1` и «(вы)» у `you`                                                                                                            |
| L-7  | join → ack `ROOM_FULL` / `INVALID_NAME` / `ROOM_NOT_FOUND`                                                      | `form-error` с текстом из 3.4 / то же / `bad-link-screen`; сессия не сохранена                                                                                                                                                                                                           |
| L-8  | URL `/?room=BAD`                                                                                                | `bad-link-screen`; `home-button` → `home-screen`, `location.search === ''`                                                                                                                                                                                                               |
| L-9  | сессия в storage, URL `/?room=ABC234`, `hello`                                                                  | `restoring-screen`; `room:rejoin {roomId:'ABC234', playerToken}`; ack ok + `room:state` → соответствующий экран                                                                                                                                                                          |
| L-10 | то же, ack `INVALID_TOKEN`                                                                                      | сессия удалена; `join-screen` + `form-error` «Не удалось вернуться в игру»                                                                                                                                                                                                               |
| L-11 | в `game-screen`: `disconnect`, затем `hello`                                                                    | `room:rejoin` отправлен повторно; экран не сменился на `restoring`                                                                                                                                                                                                                       |
| L-12 | сессия с `roomId:'AAAAAA'`, URL `/?room=ABC234`                                                                 | сессия удалена, rejoin не отправлен, `join-screen`                                                                                                                                                                                                                                       |
| L-13 | `room:state playing`, у соперника `connected:false`                                                             | `opponent-offline` виден; следующий state с `true` — скрыт                                                                                                                                                                                                                               |
| L-14 | `room:closed {reason:'player_left'}` / `'replaced'`                                                             | `closed-screen` с текстом из 3.2; сессия удалена; `home-button` → `home-screen`                                                                                                                                                                                                          |
| L-15 | ack-таймаут на create                                                                                           | `form-error` «Сервер не отвечает…», кнопка снова enabled                                                                                                                                                                                                                                 |
| L-16 | unmount                                                                                                         | `listenerCount` всех событий = 0; таймеров нет                                                                                                                                                                                                                                           |

### E2E — `e2e/lobby.spec.ts` (Playwright, Chromium; две вкладки = `context.newPage()` в одном `BrowserContext`)

| ID  | Кейс                                                                                                                        | Ожидание                                                                                                                                  |
| --- | --------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| E3  | **две вкладки встречаются**: A `/` → имя «Аня» → «Создать игру»; читает `invite-link`; B `goto(link)` → имя «Боб» → «Войти» | обе: `game-screen`; у A `player-name-1` = «Боб», у B `player-name-0` = «Аня»; `invite-link` соответствует `/\/\?room=[A-HJ-NP-Z2-9]{6}$/` |
| E4  | A создал игру, клик «Скопировать»                                                                                           | `page.evaluate(() => navigator.clipboard.readText())` === значение `invite-link`; `copy-status` виден                                     |
| E5  | A создал игру, `page.reload()`                                                                                              | `waiting-screen` с тем же `invite-link` (≤ 10 с); затем B входит по ссылке → обе `game-screen`                                            |
| E6  | E3, затем третья вкладка C открывает ссылку и входит                                                                        | `form-error` «В этой игре уже два игрока»; A и B остаются на `game-screen`                                                                |
| E7  | `goto('/?room=ZZZZZZ')`, имя, «Войти»                                                                                       | `bad-link-screen`                                                                                                                         |

Таймауты ожиданий в e2e ≤ 10 с; имена/коды не захардкожены (код читается из `invite-link`). E1–E2 не меняются.

## 8. Порядок реализации (рекомендация)

1. `invite.ts`, `storage.ts`, `errors.ts`, `roomApi.ts` + C1–C4, C6.
2. `useLobby` + `selectScreen` + C5.
3. Экраны и `Lobby.tsx`, подключение в `App`; вынести fake-сокет; L-1…L-16; U2–U6 зелёные.
4. `e2e/lobby.spec.ts` + `permissions` в `playwright.config.ts`; E3–E7.
5. README, `docs/specs/spec-5.md`.

## 9. Вне рамок

- Игровой стол: кости, цепочка, ходы (`game:move`), подсветка допустимых ходов — #6. Здесь `game-screen` — заглушка с именами игроков.
- Экран итогов раунда, счёт матча, реванш/новый раунд — #7.
- Кнопка «Выйти из комнаты» с уведомлением сервера (`room:leave` в протоколе нет), зрители, чат, больше двух игроков.
- Изменения протокола и сервера (кроме исправления найденных багов отдельным коммитом).
- Роутер, i18n, дизайн-система, адаптивная вёрстка сверх «читаемо на телефоне», PWA, Web Share API.
- Публичный деплой и настройка хоста для ссылки (ссылка строится из текущего `origin`).
- Аккаунты, восстановление сессии между разными браузерами/устройствами.

## 10. Допущения

1. **Формат ссылки — `/?room=CODE`**, а не `/room/CODE` или `#/CODE`: работает на любом статическом хостинге без SPA-fallback и без роутера; путь не меняется.
2. **Сессия в `sessionStorage`, а не в `localStorage`**: вкладки одного браузера (e2e E3 и типичная проверка «на себе») не должны делить токен — иначе вкладка B по ссылке «вернулась» бы на место A (`replaced`). Цена: «Дублировать вкладку» копирует sessionStorage, и дубликат займёт место оригинала (оригинал увидит «Игра открыта в другой вкладке») — приемлемо. После закрытия вкладки вернуться нельзя — комната закроется по grace (spec-4 K9).
3. Авто-`rejoin` (F5, обрыв) включён в #5: spec-4 §9 явно отнёс хранение токена и авто-rejoin на клиенте к этой карточке, а без него F5 на экране ожидания ломает приглашение.
4. Имя хранится в `localStorage` только для удобства подстановки; на безопасность не влияет.
5. Клиентская проверка имени и кода — лишь подсказка UX (дублирует K2/K7 spec-4); источник истины — ответы сервера.
6. `ACK_TIMEOUT_MS = 5000`, `copy-status` — 2 с; значения не конфигурируются.
7. Экран игры до #6 — заглушка; #6 заменит содержимое `GameScreen.tsx`, сохранив `data-testid="game-screen"` (на него опираются E3–E6).
8. `ROOM_NOT_FOUND` при входе показывается отдельным экраном (ссылка «мёртвая» — повторный ввод имени не поможет), остальные ошибки — под формой.
