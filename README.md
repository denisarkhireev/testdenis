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

- `shared/` (`@domino/shared`) — общие типы и (в следующих задачах) правила игры. Без шага сборки: пакеты импортируют исходники.
- `server/` (`@domino/server`) — HTTP + Socket.IO сервер; проверяет каждое действие игрока.
- `client/` (`@domino/client`) — React-приложение; только отображает состояние и отправляет намерения.
- `e2e/` — сценарии Playwright.

Сервер — источник истины. Контракт событий Socket.IO описан в одном месте — `shared/src/protocol.ts` — и типизирует обе стороны: переименование события ломает `typecheck` и на сервере, и на клиенте.

## Переменные окружения сервера

| Переменная    | По умолчанию            | Назначение                 |
| ------------- | ----------------------- | -------------------------- |
| `PORT`        | `3001`                  | порт сервера               |
| `HOST`        | `0.0.0.0`               | интерфейс                  |
| `CORS_ORIGIN` | `http://localhost:5173` | разрешённый origin клиента |

Проверка здоровья: `curl -s localhost:3001/health` → `{"status":"ok"}`.

## CI

GitHub Actions (`.github/workflows/ci.yml`) запускается на каждый pull request и на push в `main`:

- `checks` — `npm ci`, `lint`, `typecheck`, `test`, `build`;
- `e2e` — Playwright в Chromium (после `checks`); при падении отчёт сохраняется артефактом `playwright-report`.

Обе job'ы (`checks`, `e2e`) стоит сделать обязательными для merge в настройках branch protection.

## Спецификации

Спеки задач лежат в `docs/specs/` (`spec-<номер>.md`).
