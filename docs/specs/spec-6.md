# Spec #6 — Клиент: игровой стол и ходы

> Карточка: #6 (id 8069), тег `client`, приоритет medium.
> Файл в репозитории после PR: `docs/specs/spec-6.md` (кладёт разработчик).
> Зависит от: #3 (правила, `PlayerView.legalMoves`), #4 (`game:move`, `room:state`), #5 (лобби, `GameScreen`-заглушка) — все в `main` (`8b1850f`).
> Используют: #7 (конец партии, подсчёт очков, реванш — заменит баннер итога раунда).

## 1. Цель

Заменить заглушку `game-screen` настоящим столом, за которым два игрока доигрывают раунд мышью или пальцем:

1. в центре цепочка костей, своя рука снизу, рука соперника рубашкой сверху, счётчик базара;
2. индикатор, чей ход;
3. допустимые кости подсвечены, остальные неактивны; если кость подходит к обоим концам — игрок выбирает конец;
4. кнопки «Взять из базара» / «Пропустить» активны, только когда сервер разрешил такой ход;
5. всё работает на десктопе и на ширине телефона (360 px) без горизонтальной прокрутки страницы;
6. e2e-тест: два игрока делают несколько ходов.

**Клиент правил не знает.** Что подсвечивать и что можно нажать, определяет только `room.game.legalMoves` из последнего `room:state` (сервер считает его через `getLegalMoves`). Клиент шлёт намерение `game:move` и рисует следующий `room:state`. Оптимистичных обновлений нет.

## 2. Контекст (что уже есть)

| Что                                                                                                                                                                                                                                    | Где                                        | Использование в #6                                                           |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ | ---------------------------------------------------------------------------- |
| `PlayerView`: `you`, `hand`, `opponentHandCount`, `boneyardCount`, `board: PlacedTile[]` (`board[0]` — левый край, `left/right` уже в ориентации цепочки), `currentPlayer`, `status`, `result`, `legalMoves` (у не ходящего `[]`)      | `shared/src/rules/view.ts`, spec-3         | **единственный** источник данных стола                                       |
| `Move = play{tile,end} \| draw \| pass`, `Tile = [low, high]`, `End = 'left'\|'right'`                                                                                                                                                 | `shared/src/rules/types.ts`                | payload `game:move`                                                          |
| Особенности `getLegalMoves`: пустой стол → ровно `[{play, openingTile, end:'right'}]`; концы цепочки равны → только `end:'right'`; нет play → `[draw]` (базар не пуст) или `[pass]`; `draw` ход **не передаёт** (R7)                   | `shared/src/rules/round.ts`                | клиент обрабатывает это общим алгоритмом G3, без частных случаев             |
| Протокол: `game:move {move}` → ack `AckResult<object, GameErrorCode>`; после успешного хода `room:state` обоим; при ошибке `room:state` не приходит                                                                                    | `shared/src/protocol.ts`, spec-4 §5, G2–G3 | **протокол не меняется**                                                     |
| `RoomStatePayload` (`phase`, `players[].name/connected`, `game: PlayerView \| null`)                                                                                                                                                   | `shared/src/protocol.ts`                   | как есть                                                                     |
| Лобби: `useLobby` хранит последний `room:state` (L12), `selectScreen` → `'game'` при `playing`/`finished`; авто-rejoin при F5/обрыве (L9); `roomApi.ts` с `ACK_TIMEOUT_MS = 5000` и шаблоном `orTimeout`; `errors.ts` с `TIMEOUT_TEXT` | `client/src/lobby/*`, spec-5               | переиспользовать; `useLobby`/`selectScreen` не менять                        |
| `GameScreen({ room })` — заглушка с `game-screen`, `player-name-0/1` «(вы)», `opponent-offline`                                                                                                                                        | `client/src/lobby/screens/GameScreen.tsx`  | заменить содержимое, **сохранив эти `data-testid`** (на них опираются E3–E6) |
| Fake-сокет (`serverEmit`, `timeout().emitWithAck`, `deferred`, `hello`)                                                                                                                                                                | `client/src/test/fakeSocket.ts`            | использовать в компонентных тестах                                           |
| e2e-хелперы `createGame`/`joinByLink` (локальные функции)                                                                                                                                                                              | `e2e/lobby.spec.ts`                        | вынести в `e2e/helpers.ts`, переиспользовать                                 |
| Сервер раздаёт со случайным seed (`roundSeed` настраивается только в тестах `startServer`)                                                                                                                                             | `server/src/app.ts`                        | e2e не зависит от раздачи (см. 7.3), сервер не трогаем                       |

Комментариев к карточке нет.

## 3. Поведение (нормативно)

### 3.1 Раскладка `game-screen`

Сверху вниз, одна колонка (и на десктопе, и на мобильном):

| Зона (`data-testid`) | Содержимое                                                                                                                                                                                                                      |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `players`            | `player-name-0`, `player-name-1` (как в #5, «(вы)» у `you`); `opponent-offline` — «Соперник отключился, ждём возвращения…», если соперник `connected:false`                                                                     |
| `turn-indicator`     | `playing`: «Ваш ход» / «Ход соперника: <имя>». Атрибут `data-my-turn="true\|false"` (`currentPlayer === you`). В свой ход зона визуально выделена (цвет фона/рамка). `finished`: зона скрыта, вместо неё `round-finished` (3.5) |
| `opponent-hand`      | `opponentHandCount` рубашек (`opponent-tile`, одинаковые прямоугольники без очков) + подпись числом (`opponent-hand-count`, например «7»)                                                                                       |
| `board`              | цепочка `board-tile-<i>` в порядке `board[0..n-1]`; пустой стол — подсказка «Стол пуст — первый ход старшим дублем» (`board-empty`). Маркеры концов `end-left` / `end-right` — только в режиме выбора конца (3.3)               |
| `boneyard`           | «Базар: N» (`boneyard-count` содержит только число N)                                                                                                                                                                           |
| `controls`           | `draw-button` «Взять из базара», `pass-button` «Пропустить», строка ошибки `move-error`                                                                                                                                         |
| `my-hand`            | свои кости `hand-tile-<low>-<high>` в порядке `game.hand` (без сортировки — добранная кость появляется последней)                                                                                                               |

### 3.2 Отрисовка костей

| #   | Правило                                                                                                                                                                                                                                                                                                           |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T1  | Компонент `<TileFace a b orientation />`: две половины, разделитель, очки точками (CSS-grid 3×3, раскладка как на настоящей кости 0–6). `aria-label="a-b"`, `role="img"`. Без картинок и новых зависимостей.                                                                                                      |
| T2  | Цепочка: каждая `PlacedTile` рисуется **горизонтально** с левой половиной `left` и правой `right` (как пришло с сервера, клиент не поворачивает). Дубль (`left === right`) — **вертикально** (поперёк цепочки). Атрибуты `data-left`, `data-right` на `board-tile-<i>`.                                           |
| T3  | Цепочка переносится по строкам (`flex-wrap: wrap`, `gap`), читается слева направо, сверху вниз; первый элемент — левый конец, последний — правый. «Змейку» и повороты на краях не делаем.                                                                                                                         |
| T4  | Рука: кости **вертикально** (`a` сверху, `b` снизу, `a ≤ b` как в `Tile`), каждая — `<button>`; ряд переносится по строкам.                                                                                                                                                                                       |
| T5  | Размеры через CSS-переменную `--pip-unit`: десктоп — кость руки ≈ 44×88 px, на столе ≈ 64×32 px; при `max-width: 480px` уменьшаются так, чтобы 7 костей руки помещались в одну строку на 360 px, но кость руки ≥ 40 px по ширине (tap target). Горизонтальной прокрутки страницы нет ни на одной ширине ≥ 320 px. |

### 3.3 Ход игрока

Состояние стола — только последний `room.game` + локальный UI-стейт `{ selected: Tile | null, pending: boolean, error: string | null }`.

| #   | Правило                                                                                                                                                                                                                                                                                                                                                                                                  |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| G1  | **Подсветка.** Кость руки «играбельна», если в `legalMoves` есть `play` с этой костью (сравнение по `tileKey`). Играбельная: `data-playable="true"`, выделена (рамка/подъём), кликабельна. Остальные: `data-playable="false"`, `disabled`, приглушены. Не в свой ход / `finished` / `pending` — все кости `disabled` (подсветки нет, приглушения тоже нет — рука просто «спокойная»).                    |
| G2  | **Кнопки.** `draw-button` enabled ⇔ `legalMoves` содержит `{type:'draw'}` и не `pending`; `pass-button` — то же для `pass`. Кнопки видны всегда (стабильная раскладка), неактивные — `disabled`.                                                                                                                                                                                                         |
| G3  | **Клик по играбельной кости.** `ends` = различные `end` среди `play`-ходов этой кости в `legalMoves`. Один конец → сразу отправить `play {tile, end}` (сюда попадают первый ход, кость к одному концу, равные концы). Два конца → режим выбора: `selected = tile`, кость в руке помечена `data-selected="true"`, на столе по краям цепочки появляются кнопки `end-left` «◀ сюда» и `end-right` «сюда ▶». |
| G4  | **Выбор конца.** Клик `end-left`/`end-right` → отправить `play {tile: selected, end}`. Выход из режима без хода: повторный клик по той же кости, клик по другой играбельной кости (переключение по G3), клавиша `Escape`.                                                                                                                                                                                |
| G5  | **Отправка.** `sendMove(socket, move)` = `socket.timeout(ACK_TIMEOUT_MS).emitWithAck('game:move', { move })`; на время запроса `pending = true` — всё управление `disabled`, повторный клик не шлёт второй запрос (ref-флаг, как L4 в #5). Кость отправляется в том виде, как пришла в `hand`/`legalMoves` (канонический `[low, high]`).                                                                 |
| G6  | **Ответ.** `ok:true` → `pending=false`, `selected=null`; экран обновит пришедший `room:state` (порядок ack/`room:state` любой). `ok:false` → `move-error` по таблице 3.4, `selected=null`, `pending=false`. Таймаут → `TIMEOUT_TEXT`.                                                                                                                                                                    |
| G7  | **Новый `room:state`** всегда сбрасывает `selected` и `move-error` (стейт стола устарел). Сброс по смене ссылки на `room.game` (`useEffect`/ключ), не по сравнению содержимого.                                                                                                                                                                                                                          |
| G8  | **Добор.** После `draw` ход остаётся у игрока (R7): приходит `room:state` с новой костью в конце руки и новым `legalMoves` — снова действуют G1–G3 (можно добирать подряд, пока сервер даёт `draw`). Клиент ничего не «досчитывает».                                                                                                                                                                     |
| G9  | **Обрыв связи.** При `status !== 'connected'` всё управление `disabled` (стол остаётся видимым). После авто-rejoin (#5 L9) приходит свежий `room:state` → G7.                                                                                                                                                                                                                                            |

### 3.4 Сообщения об ошибках хода (`move-error`)

Исчерпывающий `GAME_ERROR_TEXT: Record<GameErrorCode, string>` (новый код ломает `typecheck`). В нормальной игре ошибки не возникают (клиент шлёт только ходы из `legalMoves`) — это защита от рассинхрона.

| Код                                                                                                                    | Текст                                   |
| ---------------------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| `NOT_YOUR_TURN`                                                                                                        | Сейчас ход соперника                    |
| `TILE_DOES_NOT_FIT`, `MUST_PLAY_OPENING_TILE`, `TILE_NOT_IN_HAND`, `MUST_PLAY`, `BONEYARD_EMPTY`, `BONEYARD_NOT_EMPTY` | Так сходить нельзя — обновляем стол     |
| `ROUND_FINISHED`                                                                                                       | Раунд уже окончен                       |
| `GAME_NOT_STARTED`, `NOT_IN_ROOM`, `INVALID_PAYLOAD`                                                                   | Что-то пошло не так, попробуйте ещё раз |
| таймаут                                                                                                                | `TIMEOUT_TEXT` из `lobby/errors.ts`     |

### 3.5 Конец раунда (минимум до #7)

При `phase === 'finished'` (`game.status === 'finished'`, `game.result != null`): стол и руки остаются видимыми, всё управление `disabled`, вместо `turn-indicator` показывается баннер `round-finished`:

- `winner === you` → «Вы выиграли раунд: +<points>»;
- `winner` — соперник → «Раунд выиграл <имя>: +<points>»;
- `winner === null` → «Рыба — ничья».

Подпись причины: `reason === 'fish'` → « (рыба)». Больше ничего (раскрытые руки, счёт матча, кнопки «Ещё раз») — #7.

## 4. Изменения по пакетам

### 4.1 shared

Без изменений. `PROTOCOL_VERSION` остаётся `1`.

### 4.2 server

Без изменений. (Найденный баг сервера — отдельный коммит с тестом в `server/`, упомянуть в PR.)

### 4.3 client

```
client/src/
├─ lobby/
│  ├─ Lobby.tsx              # case 'game': <GameScreen room={…} socket={socket} status={status} />
│  └─ screens/GameScreen.tsx # players + offline-баннер (как было) + <GameTable …/>
└─ game/
   ├─ gameApi.ts             # sendMove(socket, move): Promise<AckResult<object, GameErrorCode> | 'timeout'>
   ├─ errors.ts              # GAME_ERROR_TEXT: Record<GameErrorCode, string>
   ├─ moves.ts               # чистые функции над legalMoves (см. ниже)
   ├─ useGameTable.ts        # UI-стейт G3–G9: selected, pending, error; play/draw/pass/cancel
   ├─ GameTable.tsx          # раскладка 3.1, Escape-хендлер
   ├─ TileFace.tsx           # T1
   ├─ BoardView.tsx          # T2–T3 + end-left/end-right
   ├─ HandView.tsx           # T4, G1
   ├─ OpponentHand.tsx       # рубашки + счётчик
   ├─ RoundResultBanner.tsx  # 3.5
   ├─ game.css               # стили + @media (max-width: 480px)
   └─ *.test.ts(x)
```

**`moves.ts`** — вся «логика» клиента, только поверх `legalMoves`:

```ts
export function isPlayable(legalMoves: readonly Move[], tile: Tile): boolean;
export function playEnds(legalMoves: readonly Move[], tile: Tile): End[]; // уникальные, порядок ['left','right']
export function canDraw(legalMoves: readonly Move[]): boolean;
export function canPass(legalMoves: readonly Move[]): boolean;
export function tileTestId(tile: Tile): string; // `hand-tile-${low}-${high}`
```

**`useGameTable(socket, game: PlayerView, status)`**:

```ts
{
  selected: Tile | null;
  pending: boolean;
  error: string | null;
  interactive: boolean;            // status==='connected' && game.status==='playing' && currentPlayer===you && !pending
  clickTile(tile: Tile): void;     // G3/G4 (переключение/отмена)
  chooseEnd(end: End): void;       // G4
  draw(): void; pass(): void;      // G2
  cancel(): void;                  // Escape
}
```

- Импорты из `@domino/shared` в `client/src/game` — только типы (`PlayerView`, `Move`, `Tile`, `End`, `PlacedTile`, `GameErrorCode`, `AckResult`, `RoomStatePayload`) и чистые хелперы представления `tileKey`, `sameTile`, `isDouble`. **Запрещено**: `getLegalMoves`, `canPlace`, `applyMove`, `boardEnds`, `placeTile`, `startRound`, `toPlayerView`.
- `GameScreen` получает `socket` и `status` через `Lobby` (`useLobby` не меняется). Тексты — на русском, как в таблицах.
- Стили — `game.css`, без UI-библиотек; новых npm-зависимостей нет. `<meta name="viewport">` в `client/index.html` уже есть.
- Анимаций нет (допустим `transition` на подсветку).

### 4.4 e2e / конфиги / docs

- `e2e/helpers.ts`: вынести `createGame`, `joinByLink`, `TIMEOUT` из `lobby.spec.ts` (E3–E7 не меняют ожиданий); добавить `startGame(context)` → `{ a, b }` (обе на `game-screen`) и `readTable(page)` (7.3).
- Новый `e2e/game.spec.ts` (кейсы 7.3). `playwright.config.ts` — без изменений (мобильная ширина — через `page.setViewportSize` в тесте).
- README: в «Как сыграть с другом» убрать «стол — в следующих задачах», добавить 2–3 строки «как ходить» (подсвеченные кости, выбор конца, базар/пропуск) и ссылку на `docs/specs/spec-6.md`.

## 5. Протокол (Socket.IO)

Не меняется. Клиент дополнительно использует:

| Событие            | Направление | Когда / как                                                                                         |
| ------------------ | ----------- | --------------------------------------------------------------------------------------------------- |
| `game:move {move}` | C → S       | G3–G5, G2; только ходы, совпадающие с элементом `legalMoves`; ack `{ok:true}` / `{ok:false, error}` |
| `room:state`       | S → C       | после каждого хода обоим; `game` полностью заменяет стол (G7)                                       |

Пример (кость `[3,5]` подходит к обоим концам `3…5`):

```
A: клик hand-tile-3-5 → playEnds = ['left','right'] → режим выбора, видны end-left/end-right
A: клик end-left → game:move { move: { type:'play', tile:[3,5], end:'left' } }
S → A ack {ok:true};  S → A, B room:state (board длиннее на 1, currentPlayer = B)
B: turn-indicator «Ваш ход», подсветка по своим legalMoves; у A — «Ход соперника: Боб»
B: legalMoves = [draw] → только draw-button активна → game:move {move:{type:'draw'}}
S → B ack {ok:true}; room:state: у B +1 кость, boneyardCount −1, ход всё ещё у B
```

## 6. Критерии готовности

1. `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`, `npm run test:e2e` — зелёные; существующие тесты (U2–U6, C1–C6, L-1…L-16, E1–E7, server/shared) проходят без изменения ожиданий.
2. Руками (`npm run dev`, две вкладки): после входа второго игрока обе видят стол; у ходящего подсвечен только старший дубль, клик кладёт его на стол; у обоих обновились цепочка, счётчики рук и индикатор хода.
3. Кость, подходящая к двум разным концам, требует выбора конца, и ложится именно на выбранный край; кость к одному концу кладётся одним кликом.
4. «Взять из базара» активна только когда нет хода костью и базар не пуст; после добора кость появляется в руке, `boneyard-count` уменьшается на 1, ход остаётся у игрока. «Пропустить» активна только при пустом базаре и отсутствии хода.
5. Не в свой ход ни одна кость и ни одна кнопка не нажимается; за один клик уходит ровно один `game:move`.
6. На каждой странице в любой момент: `hand + opponentHandCount + boneyardCount + board = 28` по тому, что нарисовано (проверяется в e2e).
7. На ширине 375×667 и 360×640: стол, обе руки, счётчик базара, индикатор и кнопки видны без горизонтальной прокрутки (`scrollWidth ≤ innerWidth`); кости руки ≥ 40 px по ширине. На 1280×800 — то же.
8. F5 во время игры возвращает тот же стол (rejoin из #5).
9. При `finished` виден `round-finished` с текстом по 3.5, управление неактивно.
10. Клиент не содержит правил: `rg "getLegalMoves|canPlace|applyMove|boardEnds|placeTile" client/src` — пусто; подсветка/кнопки выводятся только из `legalMoves`.
11. Нет новых зависимостей в `client/package.json`; `data-testid` из #5 (`game-screen`, `player-name-*`, `opponent-offline`) сохранены.
12. `docs/specs/spec-6.md` и правка README в PR.

## 7. Тест-кейсы

Фикстуры: `makeView(partial): PlayerView` и `makeRoom(view, overrides)` в `client/src/test/fixtures.ts`; виды для тестов можно строить реальными `startRound({seed})` + `applyMove` + `toPlayerView` **только в тестах** (это не нарушает критерий 10 — он про не-тестовый код; в `rg` исключить `*.test.*` и `src/test/`).

### 7.1 Unit — `game/*.test.ts`

| ID  | Кейс                                                                                       | Ожидание                                                          |
| --- | ------------------------------------------------------------------------------------------ | ----------------------------------------------------------------- |
| T-1 | `isPlayable`: `legalMoves` с `play [3,5] left`, кость `[3,5]` / `[1,2]`; `legalMoves = []` | `true` / `false`; `false`                                         |
| T-2 | `playEnds`: только `right`; `left`+`right`; дубликаты `right`,`right`; кость без play      | `['right']`; `['left','right']`; `['right']`; `[]`                |
| T-3 | `canDraw`/`canPass`: `[draw]`, `[pass]`, `[play…]`, `[]`                                   | `true/false`, `false/true`, `false/false`, `false/false`          |
| T-4 | `GAME_ERROR_TEXT`                                                                          | ключей ровно 11 (все `GameErrorCode`), тип `Record` проверяет тс  |
| T-5 | `sendMove`: ack ok / ack error / reject                                                    | ack как есть ×2 / `'timeout'`; `emitWithAck('game:move', {move})` |
| T-6 | `TileFace` для 0…6: число точек в половине = значению; `aria-label`                        | 0–6 точек; `"a-b"`                                                |

### 7.2 Компонентные — `game/GameTable.test.tsx` (`render(<App socket={fake} />)` → `hello` → сессия/`room:state playing`)

| ID    | Кейс                                                                                                   | Ожидание                                                                                                                                        |
| ----- | ------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| GT-1  | `room:state` начала раунда, ход `you`, `legalMoves=[play 6-6 right]`                                   | 7 `hand-tile-*`, у `6-6` `data-playable=true`, остальные `disabled`; `board-empty`; `opponent-tile`×7; `boneyard-count`=14; `data-my-turn=true` |
| GT-2  | клик по `hand-tile-6-6`                                                                                | `emitWithAck('game:move', {move:{type:'play',tile:[6,6],end:'right'}})` ровно 1 раз (двойной клик); во время `pending` всё `disabled`           |
| GT-3  | ход соперника (`currentPlayer ≠ you`, `legalMoves=[]`)                                                 | «Ход соперника: <имя>», `data-my-turn=false`; все кости и обе кнопки `disabled`; клик не шлёт событий                                           |
| GT-4  | доска `[3                                                                                              | 6][6                                                                                                                                            | 5]`(концы 3 и 5), кость`[3,5]`с двумя`play` | клик → `data-selected=true`, видны `end-left`/`end-right`, событий нет; `end-left` → `play [3,5] left` |
| GT-5  | режим выбора: повторный клик / `Escape` / клик по другой кости с одним концом                          | выход без события / выход без события / сразу `play` другой костью                                                                              |
| GT-6  | `legalMoves=[draw]`                                                                                    | все кости `disabled`, `draw-button` enabled, `pass-button` disabled; клик → `{type:'draw'}`                                                     |
| GT-7  | `legalMoves=[pass]`, `boneyardCount=0`                                                                 | `pass-button` enabled, `draw-button` disabled; клик → `{type:'pass'}`                                                                           |
| GT-8  | ack `{ok:false, error:'TILE_DOES_NOT_FIT'}` / reject                                                   | `move-error` «Так сходить нельзя — обновляем стол» / `TIMEOUT_TEXT`; управление снова активно                                                   |
| GT-9  | `move-error` показан / режим выбора включён, затем новый `room:state`                                  | ошибка и `selected` сброшены (G7)                                                                                                               |
| GT-10 | доска из 3 костей: `[1                                                                                 | 1]`(дубль),`[1                                                                                                                                  | 4]`, `[4                                    | 2]`                                                                                                    | `board-tile-0..2` в этом порядке, `data-left/right` как в payload; у `board-tile-0` класс/атрибут вертикальной ориентации |
| GT-11 | `disconnect` во время своего хода                                                                      | стол виден, всё `disabled`                                                                                                                      |
| GT-12 | `phase:'finished'`, `result {winner: you, points: 17, reason:'domino'}`; соперник; `winner:null, fish` | `round-finished`: «Вы выиграли раунд: +17» / «Раунд выиграл Боб: +…» / «Рыба — ничья»; `turn-indicator` нет; всё `disabled`                     |
| GT-13 | `opponent-offline` (как L-13 #5)                                                                       | по-прежнему работает внутри нового стола                                                                                                        |
| GT-14 | unmount во время `pending`                                                                             | нет предупреждений `act`/setState после unmount; `keydown`-слушатель снят                                                                       |

### 7.3 E2E — `e2e/game.spec.ts` (Playwright, Chromium, две вкладки в одном `BrowserContext`)

Раздача случайна, поэтому тесты **не зависят от seed**: на каждом шаге ходящая вкладка определяется по `turn-indicator[data-my-turn="true"]`, ход выбирается по подсветке. `readTable(page)` → `{ hand: число hand-tile-*, opp: число opponent-tile, boneyard: число из boneyard-count, board: число board-tile-*, myTurn }`.

Стратегия хода `makeMove(page)`: если есть `[data-playable="true"]` — клик по первой; если появился `end-right` — клик по нему; иначе клик по enabled-кнопке из `draw-button`/`pass-button`. После хода — дождаться изменения `readTable` на **обеих** вкладках.

| ID  | Кейс                                                                                                                     | Ожидание                                                                                                                                                                                                                                                                   |
| --- | ------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| E8  | **два игрока делают несколько ходов**: `startGame`, затем `makeMove` у ходящего, пока `board ≥ 4` (не более 40 действий) | ровно одна вкладка с `data-my-turn=true` на каждом шаге; после каждого `play` `board` одинаков на обеих и вырос на 1, ход перешёл; после `draw` у ходящего `hand+1`, `boneyard−1`, ход остался; на обеих всегда `hand+opp+boneyard+board = 28`; у A `opp` = `hand` у B     |
| E9  | первый ход                                                                                                               | у ходящего ровно одна `data-playable=true` кость (обязательная первая, R4), кнопки `draw`/`pass` disabled; у второго — ни одной подсвеченной; после клика `board-tile-0` виден на обеих, ход перешёл                                                                       |
| E10 | мобильная ширина: `setViewportSize({width:375,height:667})` и `360×640` у обеих, затем E8-цикл на 2 хода                 | `page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)` — `true` до и после ходов; `turn-indicator`, `boneyard-count`, `draw-button`, `pass-button` и первая `hand-tile-*` — `toBeVisible()`; ширина каждой `hand-tile-*` ≥ 40 px (`boundingBox`) |
| E11 | после 2 ходов `reload()` вкладки B                                                                                       | B снова на `game-screen`, `readTable(B)` совпадает с состоянием до F5 (board, hand, boneyard); ход продолжается                                                                                                                                                            |

Таймауты ожиданий ≤ 10 с, тест целиком ≤ 60 с. Тексты в e2e не проверяются, кроме `turn-indicator` «Ваш ход».

## 8. Порядок реализации (рекомендация)

1. `moves.ts`, `errors.ts`, `gameApi.ts` + T-1…T-5.
2. `TileFace`, `BoardView`, `HandView`, `OpponentHand`, `game.css` + T-6; проверка вёрстки руками на 360/1280.
3. `useGameTable`, `GameTable`, `RoundResultBanner`, подключение в `GameScreen`/`Lobby` + GT-1…GT-14; L-_, U_ зелёные.
4. `e2e/helpers.ts` (рефактор без изменения E3–E7), `e2e/game.spec.ts` E8–E11.
5. README, `docs/specs/spec-6.md`.

## 9. Вне рамок

- Экран итогов с раскрытыми руками, счёт матча, игра до N очков, новый раунд/реванш — #7 (здесь только баннер 3.5).
- Изменения протокола, сервера и правил; таймер хода, автоход/автопропуск за отключённого.
- Drag-and-drop костей, анимации полёта/переворота, звуки, вибрация.
- «Змейка»/повороты цепочки по краям стола, масштабирование/зум стола, ландшафтная раскладка для телефона.
- Сортировка руки, подсказки «лучший ход», история ходов, чат.
- Оптимистичные обновления (кость «улетает» до ответа сервера).
- Тёмная тема, дизайн-система, i18n, PWA.

## 10. Допущения

1. **Подсветка и доступность кнопок — только из `legalMoves`**, который уже отдаёт сервер в `PlayerView` (spec-3/spec-4). Это держит принцип «клиент без правил» и автоматически покрывает особые случаи (обязательный первый дубль, равные концы → только `right`, обязательный ход костью вместо добора).
2. Выбор конца — **кнопками на краях цепочки**, а не drag-and-drop: одинаково работает мышью, пальцем и с клавиатуры; кость к одному концу кладётся без лишнего клика.
3. Рука не сортируется — порядок как на сервере, добранная кость в конце (её легко найти после добора).
4. Цепочка переносится по строкам вместо «змейки»: читаемо на 360 px без горизонтальной прокрутки и без вычисления геометрии; при 28 костях стол просто становится выше (вертикальная прокрутка страницы допустима).
5. Конец раунда показывается минимальным баннером, чтобы раунд был доигрываем в #6; полноценный экран итогов заменит его в #7 (сохранить `data-testid="round-finished"` или заменить — решение #7).
6. e2e не фиксирует раздачу (сервер не трогаем, `roundSeed` в dev не настраивается): тесты используют seed-независимую стратегию и инварианты (сумма 28, синхронность вкладок). Если понадобится детерминизм — env `ROUND_SEED` на сервере отдельной задачей.
7. Текст ошибок хода сгруппирован (3.4): при игре через UI они возможны только при рассинхроне, и следующий `room:state` всё равно перерисует стол.
8. Ack-таймаут хода — тот же `ACK_TIMEOUT_MS = 5000` из `lobby/roomApi.ts` (импортировать, не дублировать).
