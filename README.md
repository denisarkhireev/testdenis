# Domino

Сетевая браузерная игра в домино для двоих. TypeScript-монорепо: сервер на Node.js + Socket.IO — источник истины, клиент на React + Vite, общие типы и правила — в `shared`.

## Требования

- Node.js 22 (`nvm use` — версия берётся из `.nvmrc`)
- npm ≥ 10

## Быстрый старт

```bash
npm ci
npm run dev
```

Откройте <http://localhost:5173>: под заголовком «Domino» появится статус `connected`. Сервер слушает `:3001`, клиент — `:5173` (запросы `/socket.io` Vite проксирует на сервер). Ctrl+C останавливает оба процесса.

## Команды

| Команда              | Что делает                                                                          |
| -------------------- | ----------------------------------------------------------------------------------- |
| `npm run dev`        | сервер (`:3001`) и клиент (`:5173`) вместе, логи с префиксами `[server]`/`[client]` |
| `npm run build`      | сборка сервера (`server/dist`) и клиента (`client/dist`)                            |
| `npm start`          | запуск собранного сервера (`node server/dist/index.js`)                             |
| `npm test`           | все unit- и интеграционные тесты (Vitest, проекты `shared`, `server`, `client`)     |
| `npm run test:watch` | Vitest в watch-режиме                                                               |
| `npm run test:e2e`   | e2e-тесты (Playwright, Chromium); сам поднимает `npm run dev`                       |
| `npm run lint`       | ESLint (0 предупреждений) + `prettier --check`                                      |
| `npm run format`     | автоформатирование Prettier                                                         |
| `npm run typecheck`  | `tsc --noEmit` во всех пакетах                                                      |

Перед первым запуском e2e установите браузер:

```bash
npx playwright install chromium
```

## Структура

- `shared/` (`@domino/shared`) — общие типы и правила раунда (`shared/src/rules`). Без шага сборки: пакеты импортируют исходники.
- `server/` (`@domino/server`) — HTTP + Socket.IO сервер; проверяет каждое действие игрока.
- `client/` (`@domino/client`) — React-приложение; только отображает состояние и отправляет намерения.
- `e2e/` — сценарии Playwright.

Сервер — источник истины. Контракт событий Socket.IO описан в одном месте — `shared/src/protocol.ts` — и типизирует обе стороны: переименование события ломает `typecheck` и на сервере, и на клиенте.

## Правила раунда (`shared/src/rules`)

Чистые детерминированные функции без сети и UI; состояние раунда (`RoundState`) — plain JSON. Спека: [`docs/specs/spec-3.md`](docs/specs/spec-3.md).

```ts
import { startRound, getLegalMoves, applyMove, toPlayerView } from '@domino/shared';

let state = startRound({ seed: 42 }); // перемешивание mulberry32 + Fisher–Yates, раздача 7/7/14
const [move] = getLegalMoves(state); // первый ход — всегда старший дубль
const result = applyMove(state, state.currentPlayer, move!); // { ok: true, state } | { ok: false, error }
if (result.ok) state = result.state;
toPlayerView(state, 0); // то, что можно показать игроку 0: без костей соперника и базара
```

Тесты правил: `npx vitest run --project shared` (в названиях тестов — ID правил `R1:`…`R15:`).

## Протокол комнат

Сервер держит в памяти комнаты на двоих и один раунд в каждой. Типы событий — `shared/src/protocol.ts`, спека: [`docs/specs/spec-4.md`](docs/specs/spec-4.md). Ошибки приходят только в ack: `{ ok: false, error }`.

| Событие       | Направление | Payload                       | Ответ / смысл                                                                    |
| ------------- | ----------- | ----------------------------- | -------------------------------------------------------------------------------- |
| `room:create` | C → S       | `{ name }`                    | ack `{ ok, roomId, seat: 0, playerToken }`; комната ждёт второго игрока          |
| `room:join`   | C → S       | `{ roomId, name }`            | ack `{ ok, roomId, seat: 1, playerToken }`; раунд стартует сразу                 |
| `room:rejoin` | C → S       | `{ roomId, playerToken }`     | ack `{ ok, roomId, seat }`; возврат на место после отключения (grace-период)     |
| `game:move`   | C → S       | `{ move }` (`play/draw/pass`) | ack `{ ok }` или код ошибки правил (`NOT_YOUR_TURN`, `TILE_DOES_NOT_FIT`, …)     |
| `room:state`  | S → C       | `RoomStatePayload`            | после каждого изменения — каждому игроку свой вид: свои кости, у соперника число |
| `room:closed` | S → C       | `{ roomId, reason }`          | `player_left` — соперник не вернулся за grace; `replaced` — место заняла вкладка |

Код комнаты — 6 символов (`A–Z`, `2–9` без `I O 0 1`), регистр при входе не важен. Отключившемуся игроку место держится `RECONNECT_GRACE_MS`; если он не вернулся — комната закрывается. Комнаты живут только в памяти процесса.

Тесты: `npx vitest run --project server` (unit `U*`, комнаты `R*`, игра `G*`, отключения `D*`).

## Переменные окружения сервера

| Переменная           | По умолчанию            | Назначение                                      |
| -------------------- | ----------------------- | ----------------------------------------------- |
| `PORT`               | `3001`                  | порт сервера                                    |
| `HOST`               | `0.0.0.0`               | интерфейс                                       |
| `CORS_ORIGIN`        | `http://localhost:5173` | разрешённый origin клиента                      |
| `RECONNECT_GRACE_MS` | `60000`                 | сколько держать место отключившегося игрока, мс |

Проверка здоровья: `curl -s localhost:3001/health` → `{"status":"ok"}`.

## CI

GitHub Actions (`.github/workflows/ci.yml`) запускается на каждый pull request и на push в `main`:

- `checks` — `npm ci`, `lint`, `typecheck`, `test`, `build`;
- `e2e` — Playwright в Chromium (после `checks`); при падении отчёт сохраняется артефактом `playwright-report`.

Обе job'ы (`checks`, `e2e`) стоит сделать обязательными для merge в настройках branch protection.

## Спецификации

Спеки задач лежат в `docs/specs/` (`spec-<номер>.md`).
