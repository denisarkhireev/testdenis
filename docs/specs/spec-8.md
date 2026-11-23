# Spec #8 — Деплой в интернет

> Карточка: #8 (id 10161), теги `infra`, `deploy`, приоритет high.
> Файл в репозитории после PR: `docs/specs/spec-8.md` (кладёт разработчик).
> Зависит от: #2 (CI, сборка), #4 (`startServer`, `/health`), #5 (ссылка-приглашение), #7 (`MATCH_TARGET`) — всё в `main` (`2b6e634`).

## 1. Цель

Игра доступна по публичной ссылке (`https://<app>.fly.dev`), друг заходит без локального запуска:

1. один production-образ Docker: Node.js-сервер раздаёт собранный клиент **и** Socket.IO на одном origin и порту (CORS не нужен);
2. конфиг через env: `PORT`, `MATCH_TARGET`, `PUBLIC_URL` (база ссылок-приглашений);
3. `fly.toml` — одна машина Fly.io, WebSocket, healthcheck `/healthz`;
4. GitHub Actions: после зелёных проверок на `main` — job `deploy`; без секрета `FLY_API_TOKEN` он **пропускается с понятным сообщением**, а не падает;
5. README: раздел «Деплой».

Правила игры, протокол комнат и UI не меняются.

## 2. Контекст (что уже есть)

| Что                                                                                                                                                              | Где                                                           | Использование в #8                                                               |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `startServer({ port, host, corsOrigin, reconnectGraceMs, matchTarget })`, голый `node:http` + Socket.IO; `GET /health` → `{"status":"ok"}`, остальное → 404 JSON | `server/src/app.ts`                                           | Добавить `/healthz`, раздачу статики (`staticDir`), `publicUrl` в `server:hello` |
| Чтение env (`PORT`=3001, `HOST`, `CORS_ORIGIN`, `RECONNECT_GRACE_MS`, `MATCH_TARGET` с валидацией `parseMatchTarget`), graceful shutdown по SIGINT/SIGTERM       | `server/src/index.ts`                                         | Добавить `PUBLIC_URL`, `STATIC_DIR`; вынести парсинг env в тестируемый модуль    |
| Сборка сервера tsup → `server/dist/index.js` (ESM, node22, `@domino/shared` вшит, `socket.io` — внешняя зависимость)                                             | `server/tsup.config.ts`                                       | Без изменений; в образе нужен `node_modules` только с prod-зависимостями сервера |
| Сборка клиента `tsc --noEmit && vite build` → `client/dist` (`index.html` + `assets/*` с хешами)                                                                 | `client/package.json`                                         | Раздаётся сервером                                                               |
| Клиент подключается к своему origin: `io({ autoConnect: false })`                                                                                                | `client/src/socket.ts`                                        | Без изменений — в проде origin = сервер                                          |
| `buildInviteUrl(origin, roomId)` (L1), вызов с `window.location.origin`                                                                                          | `client/src/lobby/invite.ts`, `Lobby.tsx:32`                  | Origin берётся из `publicUrl` сервера, fallback — `window.location.origin`       |
| `ServerHelloPayload { protocolVersion, serverTime }`, `useConnectionStatus`                                                                                      | `shared/src/protocol.ts`, `client/src/useConnectionStatus.ts` | Опциональное поле `publicUrl`                                                    |
| CI: `checks` (lint, typecheck, test, build), `e2e` (Playwright на `npm run dev`)                                                                                 | `.github/workflows/ci.yml`                                    | Новые job'ы `docker` и `deploy`                                                  |
| Playwright: `baseURL` `http://localhost:5173`, `webServer: npm run dev`                                                                                          | `playwright.config.ts`                                        | Режим «внешний сервер» через `E2E_BASE_URL`                                      |
| `.nvmrc` = 22, `.gitignore`/`.prettierignore`                                                                                                                    | корень                                                        | Добавить `.dockerignore`                                                         |

## 3. Требования к рантайму (нормативно)

| ID  | Требование                                                                                                                                                                                                                                                                                                                       |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | `GET /healthz` и `HEAD /healthz` → 200 `{"status":"ok"}`, `Content-Type: application/json`. `/health` остаётся (обратная совместимость, I4). Healthcheck не зависит от наличия статики.                                                                                                                                          |
| D2  | Если задан каталог статики (`staticDir`) — `GET`/`HEAD` отдают файлы из него. Приоритет маршрутов: `/socket.io/*` (Socket.IO) → `/healthz`, `/health` → статика → 404.                                                                                                                                                           |
| D3  | `/` и любой путь **без расширения** в последнем сегменте, которому нет файла (SPA-fallback, напр. `/?room=ABC234`, `/foo`) → `index.html`, 200. Путь с расширением, которого нет (`/assets/nope.js`) → 404.                                                                                                                      |
| D4  | Защита от path traversal: путь декодируется (`decodeURIComponent`, ошибка → 400), нормализуется и обязан оставаться внутри `staticDir` (иначе 404). Query-строка отбрасывается. Методы кроме GET/HEAD на статику → 404 (как сейчас).                                                                                             |
| D5  | `Content-Type` по расширению: `.html` `text/html; charset=utf-8`, `.js` `text/javascript; charset=utf-8`, `.css` `text/css; charset=utf-8`, `.json`, `.svg` `image/svg+xml`, `.png`, `.ico` `image/x-icon`, `.woff2` `font/woff2`, `.map`, `.txt`; прочее — `application/octet-stream`.                                          |
| D6  | Кэш: `/assets/*` → `Cache-Control: public, max-age=31536000, immutable`; `index.html` (включая fallback) → `Cache-Control: no-cache`.                                                                                                                                                                                            |
| D7  | `staticDir` не задан (dev, тесты) → поведение как сейчас: всё, кроме `/socket.io`, `/health(z)`, — 404 JSON (I5 не ломается).                                                                                                                                                                                                    |
| D8  | `PUBLIC_URL` — абсолютный `http:`/`https:` URL без пути (допускается завершающий `/`), напр. `https://domino-testdenis.fly.dev`. Нормализуется до `new URL(raw).origin`. Невалидный (не URL, другой протокол, есть путь/query/hash) → `throw` на старте с понятным текстом (как `MATCH_TARGET`). Пустая/не задана → `undefined`. |
| D9  | `publicUrl` (если задан) уходит клиенту в `server:hello`. Клиент строит ссылку-приглашение от `publicUrl`, если он есть, иначе от `window.location.origin` (dev не меняется).                                                                                                                                                    |
| D10 | В образе: `NODE_ENV=production`, `PORT=8080`, `HOST=0.0.0.0`, `STATIC_DIR=/app/client/dist`; процесс — не root (`USER node`); SIGTERM → graceful shutdown (уже есть).                                                                                                                                                            |
| D11 | Одна инстанция: состояние комнат в памяти, sticky sessions не нужны. Деплой с `--ha=false`; в `fly.toml` нет `[[vm]] count`/масштабирования.                                                                                                                                                                                     |

## 4. Изменения по пакетам

### 4.1 shared

`shared/src/protocol.ts`:

```ts
export interface ServerHelloPayload {
  protocolVersion: number;
  /** ISO-8601 */
  serverTime: string;
  /** spec-8 D9: публичный origin для ссылок-приглашений (`PUBLIC_URL`), без завершающего `/`. Нет — клиент берёт свой origin. */
  publicUrl?: string;
}
```

`PROTOCOL_VERSION` **не** меняется (поле опциональное, совместимое изменение).

### 4.2 server

1. **`server/src/config.ts`** (новый) — чистая функция чтения env, тестируемая без запуска процесса:

   ```ts
   export interface ServerConfig {
     port: number; // PORT, по умолчанию 3001
     host: string; // HOST, '0.0.0.0'
     corsOrigin: string; // CORS_ORIGIN, 'http://localhost:5173'
     reconnectGraceMs?: number;
     matchTarget?: number; // parseMatchTarget — переносится из index.ts без изменений
     publicUrl?: string; // parsePublicUrl (D8)
     staticDir?: string; // STATIC_DIR, абсолютный путь (path.resolve); см. ниже
   }
   export function loadConfig(env: NodeJS.ProcessEnv): ServerConfig;
   export function parsePublicUrl(raw: string | undefined): string | undefined;
   ```

   `staticDir`: если задан `STATIC_DIR` — `path.resolve(STATIC_DIR)`; каталог обязан существовать и содержать `index.html`, иначе `throw` на старте. Если не задан — `undefined` (статика выключена). Автопоиска `client/dist` нет — явно лучше неявного.

2. **`server/src/index.ts`** — `const config = loadConfig(process.env)`; `startServer(config)`. Лог старта дополнительно печатает `publicUrl` и `staticDir` (или `static: off`).

3. **`server/src/static.ts`** (новый) — `createStaticHandler(staticDir): (req, res) => Promise<boolean>` (true — ответ отправлен). Реализация на `node:fs/promises` + `node:path`, **без новых зависимостей** (express/serve-static не добавлять). Правила D2–D6. Файлы читаются с диска на запрос (`fs.stat` + `createReadStream`), `Content-Length` из `stat.size`, `HEAD` — без тела.

4. **`server/src/app.ts`**:
   - `StartServerOptions` += `publicUrl?: string`, `staticDir?: string`;
   - HTTP-обработчик: `/healthz` и `/health` (GET/HEAD) → D1; затем, если `staticDir`, — static handler; иначе/не обработано — текущий 404 JSON. Сравнение пути — по `pathname` (`new URL(req.url, 'http://x')`), а не по сырому `req.url`, чтобы `/healthz?x=1` тоже работал;
   - `server:hello` += `publicUrl` (только если задан — поле не отправляется вовсе, если `undefined`);
   - CORS: без изменений. В образе клиент и сервер на одном origin, CORS-заголовки не нужны; `CORS_ORIGIN` в образе не задаётся.

### 4.3 client

1. **`client/src/useConnectionStatus.ts`** — хук возвращает `{ status, publicUrl }`; `publicUrl` берётся из последнего `server:hello` с совпавшей версией протокола (`undefined`, пока hello не пришёл или поле не прислано). Существующие тесты U2–U6 адаптировать под новую форму результата.
2. **`client/src/App.tsx`** — передаёт `publicUrl` в `<Lobby publicUrl={publicUrl} … />`.
3. **`client/src/lobby/Lobby.tsx`** — `buildInviteUrl(publicUrl ?? window.location.origin, roomId)`. `invite.ts` не меняется.
4. Сборка Vite — без изменений (относительный `base` не нужен: всё отдаётся с `/`).

### 4.4 Инфраструктура (корень репозитория)

**`Dockerfile`** (multi-stage, базовый образ `node:22-bookworm-slim` или `node:22-alpine` — на выбор, версия Node = `.nvmrc`):

```dockerfile
# --- build ---
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY shared/package.json shared/
COPY server/package.json server/
COPY client/package.json client/
RUN npm ci
COPY . .
RUN npm run build

# --- runtime ---
FROM node:22-alpine AS runtime
ENV NODE_ENV=production PORT=8080 HOST=0.0.0.0 STATIC_DIR=/app/client/dist
WORKDIR /app
COPY package.json package-lock.json ./
COPY shared/package.json shared/
COPY server/package.json server/
COPY client/package.json client/
RUN npm ci --omit=dev --workspace @domino/server --ignore-scripts && npm cache clean --force
COPY --from=build /app/server/dist server/dist
COPY --from=build /app/client/dist client/dist
USER node
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s \
  CMD wget -qO- "http://127.0.0.1:${PORT}/healthz" || exit 1
CMD ["node", "server/dist/index.js"]
```

- Финальный образ не содержит исходников, devDependencies, Vite/React-тулчейна; проверка: `docker run --rm <img> ls node_modules` — нет `vite`, `vitest`, `react`.
- Если `npm ci --omit=dev --workspace` на практике тянет лишнее — допустима альтернатива (отдельный `npm install --omit=dev socket.io@<версия из lock>`), главное — критерий DoD-6.

**`.dockerignore`**: `node_modules`, `**/node_modules`, `**/dist`, `.git`, `.github`, `coverage`, `playwright-report`, `test-results`, `e2e`, `docs`, `.env*`, `*.md` (README в образе не нужен).

**`fly.toml`**:

```toml
app = "domino-testdenis"          # уникальное имя; если занято — поменять здесь и в PUBLIC_URL
primary_region = "fra"
kill_signal = "SIGTERM"
kill_timeout = 10

[build]
  dockerfile = "Dockerfile"

[env]
  PORT = "8080"
  MATCH_TARGET = "101"
  PUBLIC_URL = "https://domino-testdenis.fly.dev"

[http_service]
  internal_port = 8080
  force_https = true
  auto_stop_machines = "stop"
  auto_start_machines = true
  min_machines_running = 0

  [http_service.concurrency]
    type = "connections"
    soft_limit = 200
    hard_limit = 250

  [[http_service.checks]]
    method = "GET"
    path = "/healthz"
    interval = "15s"
    timeout = "2s"
    grace_period = "10s"

[[vm]]
  size = "shared-cpu-1x"
  memory = "256mb"
```

WebSocket на Fly работает через `http_service` без доп. настроек (Socket.IO сначала polling, затем upgrade — оба на одной машине, D11).

**`.github/workflows/ci.yml`** — две новые job'ы, существующие `checks`/`e2e` не меняются:

```yaml
docker:
  runs-on: ubuntu-latest
  needs: checks
  steps:
    - uses: actions/checkout@v4
    - uses: actions/setup-node@v4
      with: { node-version-file: .nvmrc, cache: npm }
    - run: npm ci
    - run: npx playwright install --with-deps chromium
    - run: docker build -t domino:ci .
    - run: |
        docker run -d --name domino -p 8080:8080 \
          -e PUBLIC_URL=http://localhost:8080 domino:ci
        for i in $(seq 1 30); do curl -fsS http://localhost:8080/healthz && exit 0; sleep 1; done
        docker logs domino; exit 1
    - run: npm run test:e2e -- --grep "E1:|E3:|E4:|E12"
      env:
        E2E_BASE_URL: http://localhost:8080
    - if: always()
      run: docker logs domino
    - if: failure()
      uses: actions/upload-artifact@v4
      with: { name: playwright-report-docker, path: playwright-report/, retention-days: 7 }

deploy:
  runs-on: ubuntu-latest
  needs: [checks, e2e, docker]
  if: github.event_name == 'push' && github.ref == 'refs/heads/main'
  concurrency:
    group: deploy-production
    cancel-in-progress: false
  env:
    FLY_API_TOKEN: ${{ secrets.FLY_API_TOKEN }}
  steps:
    - name: Check FLY_API_TOKEN
      id: token
      run: |
        if [ -z "$FLY_API_TOKEN" ]; then
          echo "::notice title=Deploy skipped::Секрет FLY_API_TOKEN не задан — деплой пропущен. Как настроить: README → «Деплой»."
          echo "present=false" >> "$GITHUB_OUTPUT"
        else
          echo "present=true" >> "$GITHUB_OUTPUT"
        fi
    - if: steps.token.outputs.present == 'true'
      uses: actions/checkout@v4
    - if: steps.token.outputs.present == 'true'
      uses: superfly/flyctl-actions/setup-flyctl@master
    - if: steps.token.outputs.present == 'true'
      run: flyctl deploy --remote-only --ha=false
```

- `secrets.*` нельзя использовать в `if:` уровня job — поэтому проверка шагом; при отсутствии секрета job **зелёная** (success), сообщение видно в Summary как notice.
- `flyctl deploy` ждёт прохождения health-check машины; не прошёл — job красная.
- `concurrency.group` верхнего уровня (`ci-${{ github.ref }}`, cancel-in-progress) остаётся; у `deploy` своя группа, чтобы два деплоя не шли параллельно.

**`playwright.config.ts`** — внешний сервер:

```ts
const externalBaseUrl = process.env.E2E_BASE_URL;
// use.baseURL = externalBaseUrl ?? 'http://localhost:5173'
// webServer = externalBaseUrl ? undefined : { …как сейчас… }
```

E2E-тесты не должны содержать захардкоженный `localhost:5173` (сейчас и не содержат — проверить при реализации).

**`package.json`** (корень) — скрипты-удобства:

| Скрипт         | Команда                                                                   |
| -------------- | ------------------------------------------------------------------------- |
| `docker:build` | `docker build -t domino .`                                                |
| `docker:run`   | `docker run --rm -p 8080:8080 -e PUBLIC_URL=http://localhost:8080 domino` |

### 4.5 docs

- **README**:
  - таблица «Переменные окружения сервера» += `PUBLIC_URL` (—; база ссылок-приглашений, напр. `https://domino-testdenis.fly.dev`), `STATIC_DIR` (—; каталог собранного клиента, в образе `/app/client/dist`); проверка здоровья — `/healthz` (и `/health`);
  - раздел «Запуск в Docker»: `npm run docker:build && npm run docker:run` → <http://localhost:8080>;
  - раздел **«Деплой»** (один раз):
    1. установить `flyctl`, `fly auth login`;
    2. `fly apps create domino-testdenis` (если имя занято — выбрать своё и заменить `app` и `PUBLIC_URL` в `fly.toml`);
    3. первый деплой вручную: `fly deploy --ha=false` → игра на `https://<app>.fly.dev`;
    4. `fly tokens create deploy -x 999999h` → в GitHub: Settings → Secrets and variables → Actions → New repository secret `FLY_API_TOKEN`;
    5. дальше каждый push в `main` с зелёными `checks`/`e2e`/`docker` деплоится автоматически; без секрета job `deploy` пропускается с notice.
    6. Ограничения: одна машина, комнаты в памяти — деплой/рестарт/авто-остановка машины обрывает текущие партии; `fly scale count` > 1 не делать.
  - «Как сыграть с другом»: ссылка-приглашение в проде строится от `PUBLIC_URL`;
  - CI: перечислить job'ы `docker`, `deploy`; `docker` тоже сделать обязательной.
- `docs/specs/spec-8.md` — этот файл.

## 5. Протокол (Socket.IO)

| Событие        | Направление | Payload                                       | Изменение                                                                                     |
| -------------- | ----------- | --------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `server:hello` | S → C       | `{ protocolVersion, serverTime, publicUrl? }` | + опциональное `publicUrl` (origin без `/` на конце); отсутствует, если `PUBLIC_URL` не задан |

Остальные события без изменений. `PROTOCOL_VERSION` = 1 (совместимое изменение).

HTTP (не Socket.IO):

| Метод, путь                                          | Ответ                                       |
| ---------------------------------------------------- | ------------------------------------------- |
| `GET/HEAD /healthz`, `/health`                       | 200 `{"status":"ok"}`                       |
| `GET/HEAD /`, путь без расширения (при `STATIC_DIR`) | 200 `index.html`, `Cache-Control: no-cache` |
| `GET/HEAD /assets/<file>` (при `STATIC_DIR`)         | 200 файл, `immutable`; нет файла — 404      |
| прочее                                               | 404 `{"error":"Not Found"}`                 |

## 6. Критерии готовности

1. `docker build -t domino .` проходит с чистого клона; `docker run --rm -p 8080:8080 -e PUBLIC_URL=http://localhost:8080 domino` → <http://localhost:8080> открывает игру со статусом `connected`.
2. В двух вкладках на `:8080` партия за двоих проходит: создать игру → войти по ссылке → доиграть раунд → итоги → следующий раунд (e2e E3, E12 зелёные против контейнера в job `docker`).
3. `curl -fsS localhost:8080/healthz` → `{"status":"ok"}`; Docker `HEALTHCHECK` контейнера — `healthy` (`docker inspect --format '{{.State.Health.Status}}' …`).
4. С `PUBLIC_URL=https://example.test` ссылка-приглашение на экране ожидания — `https://example.test/?room=XXXXXX`, а не `localhost`; без `PUBLIC_URL` — от `window.location.origin` (dev не изменился, E4 зелёный на `npm run dev`).
5. `MATCH_TARGET=20` в `docker run -e` меняет цель матча (видно в табло «до 20»); невалидный `PUBLIC_URL`/`MATCH_TARGET`/`STATIC_DIR` → контейнер падает на старте с понятной ошибкой.
6. Runtime-образ: процесс под пользователем `node`; нет devDependencies (`vite`, `vitest`, `react`, `typescript` отсутствуют в `/app/node_modules`); размер образа ≤ 250 МБ (ориентир, не блокер).
7. CI на PR: `checks`, `e2e`, `docker` зелёные; `deploy` не запускается (skipped).
8. CI на push в `main` **без** секрета: все job'ы зелёные, `deploy` — success с notice «Деплой пропущен…».
9. CI на push в `main` **с** секретом: `deploy` выкатывает приложение; `https://<app>.fly.dev/healthz` → 200; две разные сети (напр. ПК и телефон на мобильном интернете) играют партию по ссылке-приглашению. (Проверяется вручную владельцем после добавления секрета.)
10. `npm run lint`, `typecheck`, `test`, `test:e2e` зелёные; README содержит разделы «Запуск в Docker» и «Деплой».

## 7. Тест-кейсы

### 7.1 Unit — `server/src/config.test.ts` (имена `P*:`)

| ID  | Сценарий                                                                                | Ожидание                                                                           |
| --- | --------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| P1  | `loadConfig({})`                                                                        | `port 3001`, `host '0.0.0.0'`, `publicUrl`/`staticDir`/`matchTarget` — `undefined` |
| P2  | `PORT=8080`, `MATCH_TARGET=20`                                                          | `port 8080`, `matchTarget 20`                                                      |
| P3  | `parsePublicUrl('https://a.fly.dev/')`                                                  | `'https://a.fly.dev'`                                                              |
| P4  | `parsePublicUrl('http://localhost:8080')`                                               | `'http://localhost:8080'`                                                          |
| P5  | `parsePublicUrl` для `'a.fly.dev'`, `'ftp://x'`, `'https://x/path'`, `'https://x/?q=1'` | `throw` с текстом `PUBLIC_URL`                                                     |
| P6  | `parsePublicUrl('')`, `undefined`, `'  '`                                               | `undefined`                                                                        |
| P7  | `STATIC_DIR` на несуществующий каталог / каталог без `index.html`                       | `throw` с текстом `STATIC_DIR`                                                     |
| P8  | `MATCH_TARGET='0'`                                                                      | `throw` (поведение spec-7 сохранено)                                               |

### 7.2 Integration — `server/src/static.test.ts` и `server/src/app.test.ts` (сервер на порту 0, `staticDir` — временный каталог из `fs.mkdtemp` с `index.html`, `assets/app-abc.js`)

| ID  | Сценарий                                                                                | Ожидание                                                                        |
| --- | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| I7  | `GET /healthz`                                                                          | 200 `{"status":"ok"}`, JSON; то же с `?x=1` и `HEAD` (без тела)                 |
| I8  | `server:hello` при `publicUrl: 'https://a.fly.dev'`                                     | payload содержит `publicUrl: 'https://a.fly.dev'`                               |
| I9  | `server:hello` без `publicUrl`                                                          | ключа `publicUrl` нет в payload                                                 |
| S1  | `GET /`                                                                                 | 200, `text/html; charset=utf-8`, тело = `index.html`, `Cache-Control: no-cache` |
| S2  | `GET /?room=ABC234`, `GET /some/route`                                                  | 200, `index.html`                                                               |
| S3  | `GET /assets/app-abc.js`                                                                | 200, `text/javascript…`, `immutable`, `Content-Length` верный                   |
| S4  | `GET /assets/missing.js`                                                                | 404                                                                             |
| S5  | `GET /../package.json`, `GET /%2e%2e/%2e%2e/etc/passwd`, `GET /assets/..%2f..%2fsecret` | 404 (файл вне `staticDir` не отдаётся)                                          |
| S6  | `GET /%E0%A4%A` (битый escape)                                                          | 400                                                                             |
| S7  | `POST /`                                                                                | 404                                                                             |
| S8  | `HEAD /assets/app-abc.js`                                                               | 200, заголовки как в S3, пустое тело                                            |
| S9  | Socket.IO-клиент подключается к серверу со `staticDir`                                  | `server:hello` приходит (статика не перехватывает `/socket.io`)                 |
| I5  | без `staticDir`: `GET /`                                                                | 404 JSON (существующий тест не меняется)                                        |

### 7.3 Client — компонентные (Vitest + фейковый сокет)

| ID    | Сценарий                                                                    | Ожидание                                                                    |
| ----- | --------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| C9    | `server:hello` с `publicUrl: 'https://a.fly.dev'`, создать комнату `ABC234` | поле `invite-link` = `https://a.fly.dev/?room=ABC234`                       |
| C10   | `server:hello` без `publicUrl`                                              | ссылка от `window.location.origin` (jsdom: `http://localhost:3000/?room=…`) |
| U2–U6 | существующие тесты статуса                                                  | зелёные с новой формой результата `useConnectionStatus`                     |

### 7.4 E2E (Playwright)

| ID              | Где                                                                                                | Сценарий                                    | Ожидание                                                   |
| --------------- | -------------------------------------------------------------------------------------------------- | ------------------------------------------- | ---------------------------------------------------------- |
| E1, E3, E4, E12 | job `docker`, `E2E_BASE_URL=http://localhost:8080`, контейнер с `PUBLIC_URL=http://localhost:8080` | существующие тесты против production-образа | зелёные; в E4 ссылка начинается с `http://localhost:8080/` |
| весь набор      | job `e2e` (`npm run dev`)                                                                          | без `E2E_BASE_URL`                          | зелёный, как раньше                                        |

### 7.5 Ручная проверка (после настройки Fly)

| ID  | Сценарий                                            | Ожидание                                                                                                 |
| --- | --------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| M1  | Push в `main` без секрета                           | `deploy` success, notice в Summary                                                                       |
| M2  | Добавить `FLY_API_TOKEN`, re-run                    | приложение выкачено, `/healthz` 200                                                                      |
| M3  | ПК + телефон (мобильная сеть) по ссылке-приглашению | партия проходит; в DevTools → Network видно WebSocket-соединение `/socket.io/?EIO=4&transport=websocket` |

## 8. Порядок реализации (рекомендация)

1. `config.ts` + P-тесты, перенос парсинга из `index.ts`.
2. `/healthz`, `static.ts`, `publicUrl` в hello + I/S-тесты.
3. Клиент: `publicUrl` → ссылка, C9–C10.
4. `Dockerfile`, `.dockerignore`, `E2E_BASE_URL` в Playwright, локальная проверка DoD 1–6.
5. CI `docker` + `deploy`, `fly.toml`, README.

## 9. Вне рамок

- Свой домен, TLS-сертификаты кроме `*.fly.dev`.
- Несколько инстансов, Redis-адаптер Socket.IO, sticky sessions, сохранение комнат между рестартами.
- Preview-деплои для PR, staging-окружение.
- Публикация образа в registry (GHCR/Docker Hub) — образ собирает Fly remote builder.
- Мониторинг, алерты, сбор логов вне `fly logs`; rate limiting.
- Сжатие ответов (gzip/brotli) на стороне Node — Fly proxy/браузер справляются, ассеты маленькие.
- Изменения правил игры, протокола комнат, UI.

## 10. Допущения

1. **Публичный URL передаётся клиенту в рантайме через `server:hello`**, а не вшивается при `vite build` (`VITE_*`): один образ работает с любым URL, смена `PUBLIC_URL` не требует пересборки. Поле опционально → `PROTOCOL_VERSION` не повышается.
2. В проде origin страницы и `PUBLIC_URL` обычно совпадают; `PUBLIC_URL` нужен на случай, если страницу открыли по другому адресу (внутренний hostname, `fly-local-6pn`, будущий кастомный домен).
3. Статику раздаём своим ~80-строчным обработчиком на `node:http` без новых зависимостей — сервер уже на голом `http`, express ради одного `serve-static` избыточен.
4. Fly.io: регион `fra` (ближе к игрокам в Европе), `shared-cpu-1x`/256 МБ. `auto_stop_machines = "stop"`, `min_machines_running = 0` — экономия; пока есть открытые WebSocket, машина не останавливается. Цена: при простое первая загрузка — холодный старт в несколько секунд, а комната, где оба игрока отключились дольше, чем Fly держит машину, может пропасть (grace 60 с обычно короче таймаута остановки). Если мешает — `auto_stop_machines = "off"`.
5. Имя приложения `domino-testdenis` — заглушка; владелец меняет в `fly.toml` (`app`, `PUBLIC_URL`) при занятом имени.
6. `superfly/flyctl-actions/setup-flyctl@master` — так рекомендует документация Fly; при желании разработчик пинит на SHA.
7. Деплой ждёт `checks`, `e2e` и `docker` — «зелёные проверки» = все job'ы CI.
8. `deploy` при отсутствии секрета завершается **success** (не `skipped` на уровне job), т.к. условие на секрет в `if:` job недоступно; сообщение — `::notice`.
9. Базовый образ `node:22-alpine` (меньше размер); если всплывут проблемы с musl — `node:22-bookworm-slim`, в healthcheck тогда `node -e "fetch(...)"` вместо `wget`.
10. `CORS_ORIGIN` в проде не задаётся: клиент на том же origin, браузер CORS не применяет; значение по умолчанию безвредно.
