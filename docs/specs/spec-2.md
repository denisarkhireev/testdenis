# Spec #2 — Каркас монорепо: сборка, тесты, CI

> Карточка: #2 (id 8065), тег `setup`, приоритет high.
> Файл в репозитории после PR: `docs/specs/spec-2.md` (кладёт разработчик).

## 1. Цель

Создать пустой, но рабочий TypeScript-монорепо (npm workspaces) с тремя пакетами `shared/`, `server/`, `client/`, единым набором команд (`dev`, `test`, `lint`, `typecheck`, `build`, `test:e2e`), CI на GitHub Actions и сквозным hello-world: клиент подключается к серверу по Socket.IO и показывает «connected». Это фундамент для всех следующих карточек (правила домино, лобби, игровой стол).

## 2. Контекст (что уже есть)

- Репозиторий `testdenis` на момент написания спеки **пуст**: нет кода, `README`, `docs/`, прошлых спек в `docs/specs/`. Всё создаётся с нуля.
- Целевой стек задан в карточке и в описании проекта: Node.js + Socket.IO (server), React + Vite (client), общие типы/правила (shared), Vitest, Playwright, ESLint + Prettier.
- Принцип проекта: сервер — источник истины; клиент только отображает состояние и шлёт намерения. В этой карточке игровой логики нет, но контракт событий уже живёт в `shared` и типизирует обе стороны.

## 3. Целевая структура репозитория

```
/
├─ .github/workflows/ci.yml
├─ .editorconfig
├─ .gitignore              # node_modules, dist, coverage, playwright-report, test-results, .env
├─ .nvmrc                  # 22
├─ .prettierrc.json
├─ .prettierignore         # dist, coverage, playwright-report, package-lock.json
├─ eslint.config.js        # ESLint 9 flat config
├─ package.json            # workspaces + корневые скрипты
├─ package-lock.json       # коммитится
├─ playwright.config.ts
├─ tsconfig.base.json
├─ vitest.config.ts        # test.projects: shared, server, client
├─ README.md
├─ docs/specs/spec-2.md
├─ e2e/
│  └─ connect.spec.ts
├─ shared/
│  ├─ package.json         # name: @domino/shared
│  ├─ tsconfig.json
│  ├─ vitest.config.ts
│  └─ src/
│     ├─ index.ts
│     ├─ protocol.ts
│     └─ protocol.test.ts
├─ server/
│  ├─ package.json         # name: @domino/server
│  ├─ tsconfig.json
│  ├─ vitest.config.ts
│  └─ src/
│     ├─ index.ts          # точка входа: читает env, вызывает startServer
│     ├─ app.ts            # startServer(): фабрика http + Socket.IO
│     └─ app.test.ts
└─ client/
   ├─ package.json         # name: @domino/client
   ├─ tsconfig.json
   ├─ vite.config.ts
   ├─ vitest.config.ts
   ├─ index.html
   └─ src/
      ├─ main.tsx
      ├─ App.tsx
      ├─ App.test.tsx
      ├─ socket.ts         # createSocket(): типизированный клиент
      └─ useConnectionStatus.ts
```

## 4. Изменения по пакетам

### 4.1 Корень

**Версии/окружение**

- Node.js **22 LTS** (`.nvmrc` = `22`, `"engines": { "node": ">=22" }`), npm ≥ 10.
- `"private": true`, `"type": "module"` во всех `package.json`.
- `"workspaces": ["shared", "server", "client"]`.

**devDependencies (корень)**: `typescript` (5.x), `eslint` (9.x), `@eslint/js`, `typescript-eslint`, `eslint-plugin-react-hooks`, `eslint-plugin-react-refresh`, `eslint-config-prettier`, `globals`, `prettier` (3.x), `vitest` (3.2+), `@playwright/test`, `concurrently`.

**Скрипты корневого `package.json`** (точные имена — контракт для README и CI):

| Скрипт       | Что делает                                                                                                                                          |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `dev`        | `concurrently -k -n server,client -c blue,green "npm:dev -w @domino/server" "npm:dev -w @domino/client"` — сервер и клиент вместе, Ctrl+C гасит оба |
| `build`      | `npm run build -w @domino/server && npm run build -w @domino/client`                                                                                |
| `start`      | `npm run start -w @domino/server` (прод-запуск собранного сервера)                                                                                  |
| `test`       | `vitest run` (все unit + integration во всех пакетах)                                                                                               |
| `test:watch` | `vitest`                                                                                                                                            |
| `test:e2e`   | `playwright test`                                                                                                                                   |
| `lint`       | `eslint . --max-warnings=0 && prettier --check .`                                                                                                   |
| `format`     | `prettier --write .`                                                                                                                                |
| `typecheck`  | `npm run typecheck --workspaces`                                                                                                                    |

**`tsconfig.base.json`**: `strict: true`, `target: ES2022`, `module: ESNext`, `moduleResolution: Bundler`, `isolatedModules: true`, `esModuleInterop: true`, `skipLibCheck: true`, `noUncheckedIndexedAccess: true`, `forceConsistentCasingInFileNames: true`, `resolveJsonModule: true`. Каждый пакет `extends` его.

**ESLint (`eslint.config.js`)**: `@eslint/js` recommended + `typescript-eslint` recommended для `**/*.{ts,tsx}`; для `client/**` — `react-hooks` (recommended) и `react-refresh/only-export-components` (warn); последним — `eslint-config-prettier`. Игнор: `**/dist`, `coverage`, `playwright-report`, `test-results`.

**Prettier**: `{ "singleQuote": true, "semi": true, "trailingComma": "all", "printWidth": 100 }`.

**Vitest (`vitest.config.ts` в корне)**: `test.projects: ['shared', 'server', 'client']` — каждый пакет со своим `vitest.config.ts`. Тестовые файлы — `src/**/*.test.ts(x)` рядом с кодом. `e2e/` Vitest не подхватывает.

### 4.2 shared (`@domino/shared`)

- Без сборки: потребляется исходником. `package.json`: `"exports": { ".": "./src/index.ts" }`, `"types": "./src/index.ts"`. Зависимостей runtime — нет.
- Скрипты: `typecheck` = `tsc --noEmit`.
- `src/protocol.ts` — единый контракт Socket.IO (см. раздел 5):
  ```ts
  export const PROTOCOL_VERSION = 1;

  export interface ServerHelloPayload {
    protocolVersion: number;
    serverTime: string; // ISO-8601
  }

  export interface ServerToClientEvents {
    'server:hello': (payload: ServerHelloPayload) => void;
  }

  // пока пусто; игровые намерения добавят следующие карточки
  export interface ClientToServerEvents {}

  export interface InterServerEvents {}
  export interface SocketData {}
  ```
  (пустые интерфейсы допускаются: отключить `@typescript-eslint/no-empty-object-type` точечно `eslint-disable-next-line` или через `type X = Record<string, never>` — на выбор разработчика, главное `lint` зелёный.)
- `src/index.ts` реэкспортирует `protocol.ts`.
- Правила домино здесь **не** реализуются (отдельная карточка).

### 4.3 server (`@domino/server`)

- Зависимости: `socket.io` (4.x), `@domino/shared` (`"*"`, workspace). Dev: `tsx`, `tsup`, `socket.io-client`, `@types/node`.
- HTTP-сервер — встроенный `node:http` (Express не нужен).
- `src/app.ts` экспортирует фабрику:
  ```ts
  export interface StartServerOptions {
    port: number;
    host?: string;
    corsOrigin?: string | string[];
  }
  export interface RunningServer {
    port: number;
    close(): Promise<void>;
  }
  export function startServer(opts: StartServerOptions): Promise<RunningServer>;
  ```
  - `port: 0` → случайный свободный порт; фактический возвращается в `RunningServer.port` (нужно для тестов).
  - Socket.IO типизирован: `new Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>(httpServer, { cors: { origin: corsOrigin } })`.
  - На `connection` сервер сразу эмитит `server:hello` с `{ protocolVersion: PROTOCOL_VERSION, serverTime: new Date().toISOString() }` и логирует `connected <socket.id>` / `disconnected <socket.id> <reason>` через `console.info`.
  - HTTP `GET /health` → `200`, `Content-Type: application/json`, тело `{"status":"ok"}`. Любой другой путь (кроме `/socket.io/*`, который обслуживает Socket.IO) → `404`.
  - `close()` закрывает `io` и http-сервер, резолвится после полного закрытия.
- `src/index.ts`: читает env, вызывает `startServer`, пишет `Server listening on http://<host>:<port>`, на `SIGINT`/`SIGTERM` вызывает `close()`.
- Переменные окружения:

  | Переменная    | По умолчанию            | Назначение                                                                                                           |
  | ------------- | ----------------------- | -------------------------------------------------------------------------------------------------------------------- |
  | `PORT`        | `3001`                  | порт сервера                                                                                                         |
  | `HOST`        | `0.0.0.0`               | интерфейс                                                                                                            |
  | `CORS_ORIGIN` | `http://localhost:5173` | разрешённый origin клиента (в dev клиент ходит через прокси Vite, CORS нужен для прямого подключения/прод-сценариев) |

- Скрипты пакета: `dev` = `tsx watch src/index.ts`; `build` = `tsup src/index.ts --format esm --target node22 --out-dir dist --clean --noExternal @domino/shared` (shared вшивается в бандл, т.к. экспортирует `.ts`); `start` = `node dist/index.js`; `typecheck` = `tsc --noEmit`.
- Vitest-окружение: `node`.

### 4.4 client (`@domino/client`)

- Зависимости: `react` (19.x), `react-dom`, `socket.io-client` (4.x), `@domino/shared`. Dev: `vite` (6.x+), `@vitejs/plugin-react`, `@types/react`, `@types/react-dom`, `jsdom`, `@testing-library/react`, `@testing-library/jest-dom`.
- `vite.config.ts`: `server.port = 5173`, `strictPort: true`; прокси `'/socket.io': { target: 'http://localhost:3001', ws: true }`. Клиент всегда подключается к **своему же origin** (`io()` без URL), так одинаково работает dev (через прокси) и будущий прод (статика с того же хоста).
- `index.html`: `<title>Domino</title>`, `<div id="root">`, подключает `/src/main.tsx`.
- `src/socket.ts`:
  ```ts
  export type ClientSocket = Socket<ServerToClientEvents, ClientToServerEvents>;
  export function createSocket(url?: string): ClientSocket; // io(url ?? undefined, { autoConnect: true })
  ```
- `src/useConnectionStatus.ts` — хук `useConnectionStatus(socket: ClientSocket): ConnectionStatus`, где `type ConnectionStatus = 'connecting' | 'connected' | 'disconnected'`:
  - старт — `'connecting'`;
  - получение `server:hello` с `protocolVersion === PROTOCOL_VERSION` → `'connected'`;
  - `server:hello` с другой версией → `'disconnected'` + `console.error('Protocol version mismatch')`;
  - событие `disconnect` → `'disconnected'`; при повторном подключении Socket.IO снова придёт `server:hello` → `'connected'`;
  - подписки снимаются в cleanup эффекта.
- `src/App.tsx`: принимает опциональный проп `socket?: ClientSocket` (для тестов; по умолчанию — singleton из `createSocket()`, созданный в `main.tsx`). Рендерит:
  ```html
  <main>
    <h1>Domino</h1>
    <p data-testid="connection-status">connected</p>
    <!-- текст = значение статуса -->
  </main>
  ```
  Текст статуса — ровно `connecting…` / `connected` / `disconnected` (строчными, «connecting…» с многоточием U+2026).
- Скрипты пакета: `dev` = `vite`; `build` = `tsc --noEmit && vite build`; `preview` = `vite preview`; `typecheck` = `tsc --noEmit`.
- Vitest-окружение: `jsdom`, `setupFiles` подключает `@testing-library/jest-dom/vitest`.

### 4.5 E2E (Playwright, корень)

- `playwright.config.ts`: `testDir: 'e2e'`, один проект `chromium`, `baseURL: 'http://localhost:5173'`, `webServer: { command: 'npm run dev', url: 'http://localhost:5173', reuseExistingServer: !process.env.CI, timeout: 60_000 }`, `retries: process.env.CI ? 1 : 0`, `reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list'`.
- Сервер в e2e поднимается тем же `npm run dev` (оба процесса). Готовность сервера Playwright напрямую не ждёт — достаточно ожидания текста в UI (Socket.IO сам переподключается).

### 4.6 CI (`.github/workflows/ci.yml`)

- Триггеры: `pull_request` (любая ветка) и `push` в `main`.
- `concurrency: { group: ci-${{ github.ref }}, cancel-in-progress: true }`.
- `permissions: contents: read`.
- Job `checks` (ubuntu-latest): `actions/checkout@v4` → `actions/setup-node@v4` (`node-version-file: .nvmrc`, `cache: npm`) → `npm ci` → `npm run lint` → `npm run typecheck` → `npm test` → `npm run build`.
- Job `e2e` (ubuntu-latest, `needs: checks`): checkout → setup-node → `npm ci` → `npx playwright install --with-deps chromium` → `npm run test:e2e`; при падении — `actions/upload-artifact@v4` с `playwright-report/` (retention 7 дней).
- Обе job'ы должны быть обязательными для merge (настройка branch protection — вне рамок, см. раздел 9, но в README указать имена job'ов).

### 4.7 README.md

Разделы (на русском):

1. Что это (1–2 предложения).
2. Требования: Node 22 (`nvm use`), npm ≥ 10.
3. Быстрый старт: `npm ci` → `npm run dev` → открыть `http://localhost:5173`, увидеть «connected».
4. Таблица команд (как в 4.1) + `npx playwright install chromium` перед первым `test:e2e`.
5. Структура пакетов (shared/server/client — по строке) и принцип «сервер — источник истины, контракт событий в `shared/src/protocol.ts`».
6. Переменные окружения сервера (таблица из 4.3).
7. CI: что проверяется, имена job'ов `checks`, `e2e`.
8. Где спеки: `docs/specs/`.

## 5. Протокол (Socket.IO)

Транспорт: Socket.IO 4, путь по умолчанию `/socket.io`, namespace `/`. Все типы — в `@domino/shared` (`protocol.ts`); и сервер, и клиент обязаны использовать их как generic-параметры `Server`/`Socket`.

| Событие        | Направление     | Payload                                                          | Когда                                                      |
| -------------- | --------------- | ---------------------------------------------------------------- | ---------------------------------------------------------- |
| `server:hello` | server → client | `{ protocolVersion: number; serverTime: string /* ISO-8601 */ }` | сразу после каждого `connection` (в т.ч. после реконнекта) |

Клиент → сервер событий в этой карточке нет. Встроенные `connect`/`disconnect` используются клиентом для статуса.

Соглашение на будущее (зафиксировать в комментарии `protocol.ts`): имена событий `<домен>:<действие>` (`server:hello`, далее `room:join`, `game:move` …); при несовместимом изменении контракта увеличивать `PROTOCOL_VERSION`.

## 6. Критерии готовности

1. Чистый клон, Node 22: `npm ci` завершается без ошибок; `package-lock.json` в репозитории.
2. `npm run dev` поднимает сервер на `:3001` и клиент на `:5173` одной командой; вывод с префиксами `[server]`/`[client]`; Ctrl+C завершает оба процесса.
3. Открытие `http://localhost:5173` при запущенном `dev` в течение ≤ 5 с показывает в `[data-testid="connection-status"]` текст `connected`; в логе сервера появляется `connected <id>`.
4. Остановка сервера при открытой странице → статус `disconnected`; повторный запуск сервера → снова `connected` без перезагрузки страницы.
5. `curl -s localhost:3001/health` → `{"status":"ok"}` c кодом 200.
6. `npm run lint` — 0 ошибок и 0 предупреждений, `prettier --check` проходит.
7. `npm run typecheck` проходит во всех трёх пакетах; намеренная ошибка типа в любом пакете (напр. `const x: number = 'a'` в `shared`) роняет команду с ненулевым кодом.
8. `npm test` запускает тесты всех трёх пакетов (в выводе видны проекты `shared`, `server`, `client`), все зелёные.
9. `npm run test:e2e` (после `npx playwright install chromium`) зелёный локально.
10. `npm run build` создаёт `server/dist/index.js` и `client/dist/index.html`; `PORT=3101 npm start` поднимает сервер, `/health` отвечает 200.
11. Тип события используется сквозным образом: если в `ServerToClientEvents` переименовать `server:hello`, `typecheck` падает и в `server`, и в `client`.
12. GitHub Actions: на PR запускаются job'ы `checks` и `e2e`, обе зелёные на ветке с этой задачей; при падении e2e доступен артефакт `playwright-report`.
13. README содержит разделы из 4.7, команды в нём совпадают с `package.json`.
14. Спека лежит в `docs/specs/spec-2.md`.

## 7. Тест-кейсы

### Unit

| ID  | Пакет  | Кейс                                                                     | Ожидание                                                                      |
| --- | ------ | ------------------------------------------------------------------------ | ----------------------------------------------------------------------------- |
| U1  | shared | `PROTOCOL_VERSION`                                                       | целое число ≥ 1                                                               |
| U2  | client | `App` с фейковым сокетом, событий не было                                | статус `connecting…`                                                          |
| U3  | client | фейковый сокет эмитит `server:hello {protocolVersion: PROTOCOL_VERSION}` | статус `connected`                                                            |
| U4  | client | `server:hello` с `protocolVersion: PROTOCOL_VERSION + 1`                 | статус `disconnected`, вызван `console.error`                                 |
| U5  | client | после `connected` эмитится `disconnect`, затем снова `server:hello`      | `disconnected` → `connected`                                                  |
| U6  | client | unmount `App`                                                            | все обработчики сняты (`socket.off` вызван для `server:hello` и `disconnect`) |

Фейковый сокет — минимальный объект на `EventEmitter` с `on/off/emit`, приведённый к `ClientSocket`; реальная сеть в unit-тестах клиента не используется.

### Integration (server, Vitest, реальная сеть на localhost)

| ID  | Кейс                                                                                   | Ожидание                                                                                                                     |
| --- | -------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| I1  | `startServer({ port: 0 })`, подключение `socket.io-client` к `http://localhost:<port>` | в течение 2 с получено `server:hello`, `protocolVersion === PROTOCOL_VERSION`, `serverTime` парсится `Date.parse` (не `NaN`) |
| I2  | два клиента подключаются одновременно                                                  | каждый получает свой `server:hello`                                                                                          |
| I3  | клиент отключается и переподключается (`socket.disconnect(); socket.connect()`)        | `server:hello` приходит повторно                                                                                             |
| I4  | `fetch('/health')`                                                                     | 200, JSON `{status:'ok'}`                                                                                                    |
| I5  | `fetch('/unknown')`                                                                    | 404                                                                                                                          |
| I6  | `close()`                                                                              | промис резолвится; повторное подключение к порту не удаётся                                                                  |

Каждый тест в `afterEach` закрывает клиентов и сервер (нет висящих хэндлов — Vitest завершается сам).

### E2E (Playwright, `e2e/connect.spec.ts`)

| ID  | Кейс               | Ожидание                                                                  |
| --- | ------------------ | ------------------------------------------------------------------------- |
| E1  | `page.goto('/')`   | `getByTestId('connection-status')` имеет текст `connected` (timeout 10 с) |
| E2  | заголовок страницы | `<title>` = `Domino`                                                      |

Сценарий «сервер упал → disconnected» проверяется вручную (критерий 4) и unit-тестом U5; в e2e не автоматизируется (управление процессом из `webServer` неудобно).

## 8. Порядок реализации (рекомендация)

1. Корень: `package.json`, `tsconfig.base.json`, Prettier, `.gitignore`, `.nvmrc`, `.editorconfig`.
2. `shared` с `protocol.ts` + U1.
3. `server` с `startServer` + I1–I6.
4. `client` (Vite, прокси, хук, App) + U2–U6.
5. `npm run dev` через `concurrently`, ручная проверка критериев 2–5.
6. ESLint, Vitest projects, Playwright + E1–E2.
7. CI, README, `docs/specs/spec-2.md`.

## 9. Вне рамок

- Любая игровая логика: кости, раздача, ходы, подсчёт очков (базовые правила — следующие карточки, в `shared`).
- Комнаты/лобби, идентификация игроков, реконнект к партии.
- Стили/дизайн UI, i18n, роутинг (react-router).
- Docker, деплой, хостинг, раздача клиентской статики сервером в проде.
- Настройка branch protection в GitHub (делает владелец репозитория).
- Husky / lint-staged / commitlint, Renovate/Dependabot, покрытие кода и пороги coverage.
- Логирование через библиотеки (pino и пр.), конфиг через `.env`-файлы/dotenv.

## 10. Допущения

1. Репозиторий пуст — структура, имена пакетов (`@domino/*`) и порты (3001/5173) выбраны в этой спеке.
2. Node 22 LTS и актуальные мажоры: TypeScript 5, ESLint 9 (flat config), Vitest ≥ 3.2 (`test.projects`), Vite ≥ 6, React 19, Socket.IO 4. Если на момент реализации мажор сменился — брать последний стабильный при условии, что все критерии готовности выполняются.
3. `shared` без шага сборки (экспорт `.ts`): Vite, Vitest и tsx понимают TS-исходники; для прод-бандла сервера `tsup` вшивает `shared`. Это проще project references и достаточно для проекта на двоих.
4. Клиент всегда подключается к своему origin (`io()`), в dev — через прокси Vite. Отдельная переменная `VITE_SERVER_URL` не вводится до появления деплоя.
5. «connected» показывается после `server:hello` с совпадающей версией протокола, а не по голому `connect` — чтобы hello-world проверял именно типизированный контракт из `shared`.
6. `npm test` = только Vitest (быстро, без браузера); e2e — отдельной командой `npm run test:e2e` и отдельной job'ой CI. Карточка требует «тесты на PR» — в CI запускаются оба вида.
7. В CI e2e гоняется только в Chromium — достаточно для каркаса; другие браузеры при необходимости добавит отдельная карточка.
8. `npm run build` добавлен сверх карточки (заголовок упоминает «сборку») и проверяется в CI, чтобы не накопить сломанную прод-сборку.
