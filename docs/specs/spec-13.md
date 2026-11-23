# Spec #13 — Полировка UI по итогам QA и мобильная вёрстка

> Карточка: #13 (id 10166), тег `client`, приоритет medium.
> Файл в репозитории после PR: `docs/specs/spec-13.md` (кладёт разработчик).
> Зависит от: #5 (лобби), #6 (стол), #7 (итоги, `RoundSummary`), #9 (`ConnectionStatus`, `reconnecting`), #10 (звук), #11 (`TurnTimer`, `turn-seconds-label`), #12 (реакции). PR #8 → … → #12 идут стеком и на момент написания **в `main` не смержены**. **Ветку `task-13-ui-polish` создавать от `main` после merge PR #12 (GitHub PR 11)**; если он ещё открыт — от `origin/task-12-reactions`, потом rebase. Все ссылки на код ниже — по состоянию `task-12-reactions` (`eb33c49`).

## 1. Цель

Довести интерфейс до «чистого» состояния без новой функциональности:

1. Исправить текст итога матча: «Матч выиграл Боб · Счёт 4 : 42».
2. Все экраны (лобби, стол, итоги раунда, итоги матча) корректно выглядят на ширинах **360, 390, 768, 1280 px**: ничего не обрезается, нет горизонтального скролла, интерактивные элементы ≥ 44 px по высоте, длинная цепочка костей переносится.
3. Закрыть UI-«пожелания» из QA-отчётов #7–#12 (список и решение по каждому — §3).
4. Автоматические проверки вёрстки в e2e + Playwright-скриншоты ключевых экранов на 360 и 1280 px в PR.

Только `client/` и `e2e/` (+ конфиг Playwright, README). `shared/` и `server/` не меняются, протокол не меняется.

## 2. Контекст (что уже есть)

| Что                                                                                                                                                                                                                          | Где                                                                         | Что делаем в #13                               |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- | ---------------------------------------------- |
| `RoundSummary`: блок `match-finished` = заголовок + `` ` Счёт ${a} : ${b}` `` (без разделителя)                                                                                                                              | `client/src/game/RoundSummary.tsx:112–117`                                  | UI1                                            |
| `MatchScore`: «Аня 34 : 12 Боб · до 101 · Раунд 3», `turn-seconds-label` = `" · ход 30 с"` (ведущий пробел)                                                                                                                  | `client/src/game/MatchScore.tsx`                                            | UI7                                            |
| `TurnTimer` на паузе: `⏸ 00:15`                                                                                                                                                                                              | `client/src/game/TurnTimer.tsx`                                             | UI8                                            |
| `useGameTable.interactive` уже требует `status === 'connected'`; но `turn-indicator--mine` (зелёный «Ваш ход») зависит только от `myTurn`                                                                                    | `client/src/game/useGameTable.ts:54`, `GameTable.tsx`                       | UI6                                            |
| Облачка реакций: якоря нулевой высоты, `reaction-bubble--opponent { top: .5rem }` — налезает на стол; на итогах `OpponentHand` не рисуется → облачко соперника ложится на цепочку                                            | `client/src/reactions/ReactionBubble.tsx`, `reactions.css`, `GameTable.tsx` | UI9                                            |
| Звук: буферы декодируются лениво при `unlock()`; `play()` до готовности буфера молча ничего не делает                                                                                                                        | `client/src/sound/sounds.ts`                                                | UI10                                           |
| Глобальных стилей нет: `body { margin: 8px }` по умолчанию, `box-sizing` задан только внутри `.game-screen`                                                                                                                  | `client/src/app.css`, `game.css`                                            | UI2                                            |
| Высоты кнопок: `.controls button` 40 px, `.end-button` 40 px, кнопки лобби (`create-button`, `join-button`, `copy-button`, `home-button`) — браузерные ~21 px; 44 px уже у `continue-button`, `sound-toggle`, кнопок реакций | `game.css`, `lobby.css`, `app.css`, `reactions.css`                         | UI3                                            |
| Цепочка `.board` — `flex-wrap: wrap`; на ≤ 480 px `--pip-unit: 3.7px`                                                                                                                                                        | `game.css`                                                                  | UI5 — только проверка + защита от переполнения |
| e2e-проверки ширины: E10 (стол 375/360), E14 (итоги 360), E16 (звук 360), E26 (реакции 360); хелпер `noHorizontalScroll` продублирован в `game.spec.ts`/`match.spec.ts`                                                      | `e2e/*.spec.ts`                                                             | Вынести в `helpers.ts`, расширить на 4 ширины  |
| `MATCH_TARGET` из env сервера (`server/src/config.ts`), README предлагает `MATCH_TARGET=20 npm run dev`                                                                                                                      | —                                                                           | Скриншот экрана конца матча (§4.3)             |
| `NAME_MAX_LENGTH = 20`                                                                                                                                                                                                       | `client/src/lobby/useLobby.ts:50`                                           | Длинные имена в тестах вёрстки                 |

## 3. Требования (нормативно)

ID `UI*` используются в именах тестов (`'UI1: …'`).

| ID   | Требование                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | Источник            |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------- |
| UI1  | Текст `match-finished`: `«Вы выиграли матч! · Счёт A : B»` / `«Матч выиграл <имя> · Счёт A : B»`, где A : B = `match.scores[0] : match.scores[1]` (место 0 : место 1, как в табло). Разделитель — `" · "` (пробел, U+00B7, пробел), ровно один, без точки после «!». `textContent` элемента совпадает со строкой посимвольно.                                                                                                                                                                                                                                                                                                                                                                        | карточка, QA #7 п.1 |
| UI2  | Базовые стили приложения: `*, *::before, *::after { box-sizing: border-box }`; `body { margin: 0 }`; `main` — `padding: 0 16px 16px` (на ≥ 768 px — `0 24px 24px`), `max-width: 48rem; margin: 0 auto`. Запрещено «лечить» скролл через `overflow-x: hidden`/`clip` на `html`, `body`, `main`, `#root`.                                                                                                                                                                                                                                                                                                                                                                                              | карточка            |
| UI3  | Каждый видимый `button`, `input[type=text]` и `label` варианта времени хода (`.turn-seconds-option`) на всех экранах имеет высоту ≥ 44 px (`getBoundingClientRect().height`), в т.ч. `disabled`. Исключений нет: кнопки `hand-tile-*` уже выше 44 px; `end-left`/`end-right` поднимаются с 40 до 44 px; `draw-button`/`pass-button` — с 40 до 44 px; кнопки лобби и `home-button` — `min-height: 44px; padding: 0 1rem`. Ширина кнопок с иконкой (`sound-toggle`, `reaction-toggle`, эмодзи) ≥ 44 px — уже так, не ломать.                                                                                                                                                                           | карточка            |
| UI4  | На 360, 390, 768, 1280 px на каждом экране §4.4: `document.documentElement.scrollWidth <= clientWidth`; каждый видимый элемент из списка ключевых (§4.4) целиком внутри `[0, viewport.width]` по горизонтали. Имена длиной 20 символов (`NAME_MAX_LENGTH`) без пробелов (`"АнастасияАлександров"`) переносятся (`overflow-wrap: anywhere`) — в табло, списке игроков, `round-finished`, `match-finished`, подписях рук. Ссылка-приглашение не раздвигает экран (`input` сжимается, `min-width: 0`); на ≤ 480 px `lobby-invite` — колонкой (поле над кнопкой, кнопка на всю ширину). Код комнаты в заголовке `join-screen` переносится.                                                               | карточка            |
| UI5  | Цепочка: при любой длине (до 28 костей) `.board` не шире своего контейнера, кости переносятся по строкам (`flex-wrap` — уже есть), `board.scrollWidth <= board.clientWidth`; кнопки `end-left`/`end-right` видимы целиком. Вертикальной прокрутки внутри `.board` нет (растёт по высоте, прокручивается страница).                                                                                                                                                                                                                                                                                                                                                                                   | карточка            |
| UI6  | Пока `status !== 'connected'`: у `turn-indicator` нет класса `turn-indicator--mine` и добавлен `data-offline="true"` (текст не меняется: «Ваш ход»/«Ход соперника: …»; `data-my-turn` как раньше — его читают e2e); рука `.hand--idle`, ни одна кость не `data-playable="true"`; `draw-button`, `pass-button`, `continue-button`, `end-*` неактивны/не показаны. После возврата `connected` — всё как до обрыва без перезагрузки.                                                                                                                                                                                                                                                                    | QA #9 п.1           |
| UI7  | В `MatchScore` части метаданных — отдельные элементы `.match-score-item` («до 101», «Раунд 3», «ход 30 с»), разделитель « · » рисуется CSS (`.match-score-item + .match-score-item::before`, а перед первым — после имён — тоже через CSS). `turn-seconds-label` текст = `"ход 30 с"` без ведущих/хвостовых пробелов и точки. Визуально строка табло не меняется.                                                                                                                                                                                                                                                                                                                                    | QA #11 п.1          |
| UI8  | `TurnTimer` на паузе: текст `"пауза 00:15"` (слово «пауза» + пробел + mm:ss), без эмодзи `⏸`; `aria-label` — «Таймер на паузе: 00:15». Класс `turn-timer--paused` и `data-paused` — как раньше.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | QA #11 п.3          |
| UI9  | Облачко реакции соперника не перекрывает цепочку и кнопки: bbox `reaction-bubble-opponent` не пересекается с bbox `board`, `continue-button`, `controls` — во время раунда и на экране итогов, на 360 и 1280 px. Во время раунда: облачко соперника позиционируется поверх строки `opponent-hand` (якорь — внутри `.opponent-hand`, `position: relative`; облачко прижато к правому краю строки, вертикально по центру строки, без «хвоста»). На итогах: якорь соперника рендерится внутри `summary-hand-<seat соперника>` (рядом с подписью руки, тот же стиль). Своё облачко — без изменений по месту, но так же не пересекает `board`. Появление облачка по-прежнему не двигает раскладку (RX10). | QA #12 п.1–2        |
| UI10 | Если `play(name)` вызван, когда контекст разблокирован, а буфер `name` ещё декодируется, звук ставится в очередь и проигрывается, как только буфер готов, **если** с момента вызова прошло ≤ 150 мс (`PENDING_PLAY_MAX_MS = 150`); иначе отбрасывается. В очереди не более одного ожидающего звука на `name` (повторный вызов заменяет время ожидания). Выключенный звук (`enabled === false`) — ничего не ставится.                                                                                                                                                                                                                                                                                 | QA #10 п.1          |

Решения по остальным пожеланиям QA — §7 «Вне рамок».

## 4. Изменения по пакетам

### 4.1 shared

Без изменений.

### 4.2 server

Без изменений. (`MATCH_TARGET` из env уже есть — используется только конфигом скриншотов.)

### 4.3 client

**Стили**

- `client/src/app.css` — блок «Базовые стили» (UI2) в начале файла; общий класс `.button` не вводить — правила на `button` в пределах `main` (`main button { min-height: 44px; font: inherit; }`), `main input[type='text'], main input:not([type]) { min-height: 44px; font: inherit; padding: 0 .5rem }`.
- `client/src/game/game.css`:
  - удалить дублирующий `box-sizing` в `.game-screen` (теперь глобально);
  - `.controls button`, `.end-button` — `min-height: 44px` (UI3);
  - `.board` — `max-width: 100%; min-width: 0` (UI5);
  - `.players li`, `.match-score`, `.round-finished`, `.match-finished`, `.summary-hand-label` — `overflow-wrap: anywhere; min-width: 0` (UI4);
  - `.match-score-item + .match-score-item::before, .match-score-names + .match-score-meta .match-score-item:first-child::before { content: '·'; margin: 0 .35em; }` (UI7; точный селектор — на усмотрение, критерий — визуально « · » между всеми частями);
  - `.turn-indicator[data-offline='true']` — нейтральный вид (как не свой ход) (UI6);
  - `.opponent-hand { position: relative }`.
- `client/src/lobby/lobby.css`: `.lobby-form input { min-width: 0; width: 100% }` внутри `label` с `flex: 1 1 12rem`; `@media (max-width: 480px) { .lobby-invite { flex-direction: column } .lobby-invite button { width: 100% } }`; `.turn-seconds-option { min-height: 44px }`; `h2 code { overflow-wrap: anywhere }` (UI3, UI4).
- `client/src/reactions/reactions.css`: модификатор `.reaction-bubble--opponent` → `top: 50%; right: 0; left: auto; transform: translateY(-50%)`, убрать `::after` у соперника; анимация `reaction-pop` для соперника — без `translateX(-50%)` (отдельный keyframes `reaction-pop-side`). `max-width: min(70vw, 20rem)` (UI9).

**Компоненты**

| Файл                                                                                                         | Изменение                                                                                                                                                                                                                                                                                                                                                                                     |
| ------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `game/RoundSummary.tsx`                                                                                      | UI1: ``{` · Счёт ${match.scores[0]} : ${match.scores[1]}`}``. UI9: новый проп `opponentBubble?: ReactNode` (и `mineBubble?: ReactNode`), рендерится внутри соответствующего `SummaryHand` после подписи.                                                                                                                                                                                      |
| `game/GameTable.tsx`                                                                                         | UI6: `turn-indicator--mine` только при `myTurn && status === 'connected'`, `data-offline={status !== 'connected' ? 'true' : undefined}`. UI9: во время раунда `<ReactionBubble who="opponent">` передаётся в `OpponentHand` (проп `bubble?: ReactNode`, рендер внутри `.opponent-hand`); на итогах оба облачка — в `RoundSummary` (проп выше), отдельные якоря над/под `RoundSummary` убрать. |
| `game/OpponentHand.tsx`                                                                                      | Проп `bubble?: ReactNode`, рендер последним ребёнком `.opponent-hand`.                                                                                                                                                                                                                                                                                                                        |
| `game/MatchScore.tsx`                                                                                        | UI7: `<span className="match-score-item">до <span data-testid="match-target">…</span></span>`, `<span className="match-score-item">Раунд <span data-testid="match-round">…</span></span>`, `<span className="match-score-item" data-testid="turn-seconds-label">ход {turnSeconds} с</span>`. testid `match-target`/`match-round`/`match-score-0/1` сохраняются.                               |
| `game/TurnTimer.tsx`                                                                                         | UI8: `timer.paused ? \`пауза ${text}\` : text`; `aria-label` по UI8.                                                                                                                                                                                                                                                                                                                          |
| `sound/sounds.ts`                                                                                            | UI10: `pendingPlays: Map<SoundName, number>` (время вызова по `now()` — инъекция для тестов, по умолчанию `performance.now`); после `buffers.set(name, …)` — если есть ожидание и `now() − t ≤ PENDING_PLAY_MAX_MS` и `enabled` → проиграть; удалить ожидание. Экспорт `PENDING_PLAY_MAX_MS`.                                                                                                 |
| `lobby/screens/WaitingScreen.tsx`, `JoinScreen.tsx`, `NameForm.tsx`, `BadLinkScreen.tsx`, `ClosedScreen.tsx` | Разметку не менять (только CSS), кроме случаев, когда без обёртки не добиться UI4 — тогда только добавление `className`. testid не трогать.                                                                                                                                                                                                                                                   |

Никаких изменений логики игры, событий сокета и `useLobby`.

### 4.4 e2e и скриншоты

**Хелперы (`e2e/helpers.ts`)**

- `export const WIDTHS = [360, 390, 768, 1280] as const;` и `viewportFor(width)` → высота: 360→740, 390→844, 768→1024, 1280→800.
- `export async function noHorizontalScroll(page)` — переносится сюда, локальные копии в `game.spec.ts`/`match.spec.ts` удалить.
- `export async function checkLayout(page, keyTestIds: string[])` — в одном `evaluate`: (1) нет горизонтального скролла; (2) каждый видимый (`offsetParent !== null` или `position: fixed`) `button`, `input[type=text]`, `input:not([type])`, `.turn-seconds-option` в `main` — `height >= 44` (UI3); (3) каждый элемент из `keyTestIds`, если существует, — `left >= 0 && right <= innerWidth` (UI4). Возвращает список нарушений `{ testId|selector, rule, value }[]`; тест ожидает `[]` (сообщение об ошибке — сам список).

**Новый `e2e/layout.spec.ts`** (в основном прогоне, MATCH_TARGET по умолчанию). Для каждой ширины из `WIDTHS` (параметризованные тесты, имя содержит ширину):

| Тест | Экран                                                                                                                                                                                     | Ключевые testid                                                                                                                                                                    |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| E27  | `home-screen` (имя 20 символов введено), `bad-link-screen` (`/?room=ZZZZZZ`)                                                                                                              | `name-input`, `create-button`, `turn-seconds`, `sound-toggle`, `home-button`                                                                                                       |
| E28  | `waiting-screen` у A, `join-screen` у B                                                                                                                                                   | `invite-link`, `copy-button`, `join-room-code`, `join-button`                                                                                                                      |
| E29  | стол: после `startGame` (имена `"АнастасияАлександров"` / `"Бобби-Длинноимённый1"` — новый опциональный параметр `names` у `startGame`), затем после 6 `playStep`; открыть панель реакций | `match-score`, `players`, `turn-indicator`, `opponent-hand`, `board`, `boneyard`, `draw-button`, `pass-button`, `reaction-toggle`, `my-hand`, все `hand-tile-*`                    |
| E30  | итоги раунда после `playRoundToEnd` (цепочка длинная)                                                                                                                                     | `round-summary`, `round-finished`, `summary-hand-0`, `summary-hand-1`, `board`, `continue-button`, все `board-tile-*`; дополнительно UI5: `board.scrollWidth <= board.clientWidth` |

Для 360 и 1280 дополнительно UI9 (E31): на столе A отправляет 😂 (`sendReaction`), у B bbox `reaction-bubble-opponent` не пересекает `board`/`controls`; то же на итогах раунда — не пересекает `board`/`continue-button`.

E32 (UI6, одна ширина 360): B `context.setOffline(true)` → у B `turn-indicator` получает `data-offline="true"`, не имеет класса `turn-indicator--mine`, `[data-playable="true"]` = 0; `setOffline(false)` → `data-offline` пропадает, если ход B — снова есть `data-playable="true"`. (По образцу X19 из `reconnect.spec.ts`.)

Тесты, проверяющие изменённые тексты, обновить: `e2e/turn-timer.spec.ts:35` → `toHaveText('ход 3 с')`, `:94` → `/^пауза 00:0[0-3]$/`.

**Скриншоты (`e2e/screens.spec.ts` + `playwright.screens.config.ts`)**

- Отдельный конфиг: импортирует базовый `playwright.config.ts`, `testMatch: 'screens.spec.ts'`, `workers: 1`, `webServer.env` += `MATCH_TARGET: '30'`, `reuseExistingServer: false`. Базовый конфиг: `testIgnore: 'screens.spec.ts'` (в основном прогоне его нет).
- Скрипт в корневом `package.json`: `"screens": "playwright test -c playwright.screens.config.ts"`.
- Для `width` ∈ {360, 1280} сохраняет `fullPage: true` PNG в `docs/screens/<width>/`:
  `01-home.png`, `02-waiting.png`, `03-join.png`, `04-table-start.png`, `05-table-mid.png` (после 6 ходов), `06-round-summary.png` (первые итоги **без** `match-finished`), `07-match-finished.png` (итоги с `match-finished`).
  Алгоритм для 06/07: играть раунды `playRoundToEnd` + `continue-button` у обоих; первый экран итогов без `match-finished` → 06, первый с `match-finished` → 07; лимит 15 раундов; если матч закончился до появления 06 — «Реванш» и продолжать (в пределах лимита). Не уложились — тест падает с понятным сообщением.
- На каждом снимке перед сохранением вызывается `checkLayout` (тот же список, что в E27–E30) — так покрыт экран конца матча (UI1, UI4).
- `reducedMotion: 'reduce'`, звук выключен (`localStorage["domino:sound"] = "off"` через `addInitScript` в `newPlayer`), чтобы снимки были стабильны. Сравнение со снимками-эталонами (`toHaveScreenshot`) **не** вводим.
- PNG коммитятся в PR в `docs/screens/` (14 файлов) и вставляются в описание PR ссылками на файлы ветки — это и есть «скриншоты приложены к PR». Дополнительно разработчик прикладывает их к карточке #13.

### 4.5 README

- Раздел «Команды»: строка `npm run screens` — «скриншоты ключевых экранов 360/1280 px в `docs/screens/` (Playwright, свой сервер с `MATCH_TARGET=30`; остановите `npm run dev` перед запуском)».
- Раздел «Структура → e2e»: `layout.spec.ts` — E27–E32, `screens.spec.ts`.
- Ссылка на спеку `docs/specs/spec-13.md`.

## 5. Протокол

Не меняется. События Socket.IO, payload и `PROTOCOL_VERSION` — как в `task-12-reactions`.

## 6. Критерии готовности

1. `match-finished` на экране и в unit-тесте: ровно `«Матч выиграл Боб · Счёт 4 : 42»` / `«Вы выиграли матч! · Счёт 104 : 40»` (UI1).
2. E27–E30 зелёные на 360, 390, 768, 1280 px: `checkLayout` возвращает `[]` на всех экранах (UI2–UI5).
3. E31 зелёный на 360 и 1280: облачко соперника не пересекает стол и кнопки (UI9).
4. E32 зелёный: при офлайне нет зелёного «Ваш ход» и подсвеченных костей, после возврата — есть (UI6).
5. `turn-seconds-label` = `"ход 30 с"`; таймер на паузе = `"пауза 00:15"`; визуально табло с « · » между всеми частями (UI7, UI8).
6. UI10 покрыт unit-тестами (§8), звук не играет при выключенном звуке (`enabled === false`).
7. `npm run screens` создаёт 14 PNG в `docs/screens/{360,1280}/`; файлы закоммичены и вставлены в описание PR; на каждом снимке `checkLayout` = `[]`.
8. Нет `overflow-x: hidden|clip` на `html/body/main/#root` (проверка ревью: `rg "overflow-x" client/src`).
9. Все существующие тесты зелёные: `npm test`, `npm run test:e2e` (E1–E26, X16–X19 — с поправками текстов из §4.4), `npm run lint`, `npm run typecheck`, CI.
10. testid из прошлых спек не переименованы и не удалены.
11. README обновлён (§4.5), `docs/specs/spec-13.md` в PR.

## 7. Вне рамок

| Пункт                                                                         | Источник    | Почему вне рамок                                                                                           |
| ----------------------------------------------------------------------------- | ----------- | ---------------------------------------------------------------------------------------------------------- |
| Dev-способ задать seed раунда (env) для ручной проверки ничьей                | QA #7 п.2   | Сервер; отдельная карточка, если понадобится                                                               |
| Размер Docker-образа, ожидание `healthy` в CI, stack trace при невалидном env | QA #8 п.1–3 | Инфраструктура/сервер, не UI                                                                               |
| e2e звука `pass` с детерминированной раздачей                                 | QA #10 п.2  | Требует seed (см. выше)                                                                                    |
| Блокировать ход на паузе таймера                                              | QA #11 п.2  | Противоречит T9 (spec-11): ход на паузе разрешён сознательно. Делаем только UI8 (понятная подпись «пауза») |
| Установка Chromium в QA-окружении                                             | QA #11 п.4  | Уже описано в README («Перед первым запуском e2e…»)                                                        |
| Ландшафтная ориентация телефона, ширины < 360 px, планшет в альбомной > 1280  | —           | Не требуются карточкой                                                                                     |
| Редизайн, тёмная тема, новые цвета/шрифты, иконки SVG                         | —           | Только полировка                                                                                           |
| Визуальная регрессия (`toHaveScreenshot`, эталоны)                            | —           | Снимки — артефакт для ревью, не тест                                                                       |
| Изменения протокола, правил, сервера                                          | —           | Тег карточки — `client`                                                                                    |

## 8. Тест-кейсы

### Unit (Vitest, `client`)

| ID  | Файл                                                                  | Проверка                                                                                                                                                                                                   |
| --- | --------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| U1  | `RoundSummary.test.tsx` (обновить существующие)                       | `UI1: …` матч выигран мной: `textContent` `match-finished` === `'Вы выиграли матч! · Счёт 104 : 40'`; соперником — `'Матч выиграл Боб · Счёт 4 : 42'`                                                      |
| U2  | `RoundSummary.test.tsx`                                               | `UI9: …` переданный `opponentBubble` рендерится внутри `summary-hand-<seat соперника>`, `mineBubble` — внутри своего                                                                                       |
| U3  | `TurnTimer.test.tsx` (TC4 и `turn-seconds-label`)                     | `UI8: …` пауза → `'пауза 00:15'`, нет `⏸`, `aria-label` «Таймер на паузе: 00:15»; `UI7: …` `turn-seconds-label` `textContent` === `'ход 60 с'`                                                             |
| U4  | `MatchScore` (в `TurnTimer.test.tsx` или новый `MatchScore.test.tsx`) | `UI7: …` три `.match-score-item`; `match-target`, `match-round` — только числа; при `turnSeconds = 0` элементов два                                                                                        |
| U5  | `GameTable.test.tsx`                                                  | `UI6: …` `status='reconnecting'`, мой ход → `turn-indicator` без класса `--mine`, `data-offline="true"`, `data-my-turn="true"`, нет `[data-playable="true"]`; `connected` → класс есть, `data-offline` нет |
| U6  | `GameTable.test.tsx`                                                  | `UI9: …` во время раунда `reaction-anchor-opponent` — потомок `opponent-hand`; на итогах — потомок `summary-hand-<opp>`                                                                                    |
| U7  | `sounds.test.ts`                                                      | `UI10: …` `play('tile')` до готовности буфера, буфер готов через 100 мс (фейковое `now`) → `source.start` вызван 1 раз                                                                                     |
| U8  | `sounds.test.ts`                                                      | `UI10: …` буфер готов через 200 мс → не играет; ожидание удалено                                                                                                                                           |
| U9  | `sounds.test.ts`                                                      | `UI10: …` два `play('tile')` до готовности → играет 1 раз; `enabled: false` → 0 раз                                                                                                                        |

### Integration

Не требуется: сервер и протокол не меняются. Серверные тесты должны остаться зелёными без правок.

### e2e (Playwright)

| ID     | Файл                                  | Сценарий                                                                                                            |
| ------ | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| E27 ×4 | `layout.spec.ts`                      | `UI3/UI4: home & bad link @<w>` — §4.4                                                                              |
| E28 ×4 | `layout.spec.ts`                      | `UI3/UI4: waiting & join @<w>`                                                                                      |
| E29 ×4 | `layout.spec.ts`                      | `UI3/UI4: table with long names @<w>` (начало + после 6 ходов + открытая панель реакций)                            |
| E30 ×4 | `layout.spec.ts`                      | `UI4/UI5: round summary with long chain @<w>`                                                                       |
| E31 ×2 | `layout.spec.ts`                      | `UI9: opponent bubble does not cover the board @<360                                                                | 1280>` (стол и итоги) |
| E32    | `layout.spec.ts`                      | `UI6: offline → no "your turn" highlight`                                                                           |
| S1     | `screens.spec.ts` (`npm run screens`) | 14 снимков + `checkLayout` на каждом, в т.ч. `07-match-finished` с текстом UI1 (`toHaveText(/ · Счёт \d+ : \d+$/)`) |
| —      | существующие E1–E26, X16–X19          | зелёные; правки только `turn-timer.spec.ts` (тексты UI7/UI8) и импорт `noHorizontalScroll` из `helpers.ts`          |

`layout.spec.ts`: `test.describe.configure({ timeout: 120_000 })` (E30 доигрывает раунд).

## 9. Допущения

1. Разделитель — « · » (как в карточке и в табло матча), а не точка, предложенная в QA #7.
2. Высота 44 px применяется ко всем кнопкам, включая неактивные и `end-*` (на столе это добавит ~4 px строке выбора конца — приемлемо).
3. «Длинная цепочка переносится/прокручивается» — выбираем **перенос** (уже реализован): внутренний горизонтальный скролл цепочки не вводим, страница прокручивается вертикально.
4. Высоты вьюпортов для ширин (740/844/1024/800) взяты как типичные; на результат проверок по горизонтали не влияют.
5. «Скриншоты приложены к PR» = PNG закоммичены в `docs/screens/` и показаны в описании PR (агент/CI не может загрузить картинку в комментарий GitHub). Размер ~14 × 30–60 КБ допустим.
6. `MATCH_TARGET=30` для скриншотов: с ним за ≤ 15 раундов практически гарантированно встречаются оба экрана (итог без конца матча и конец матча); при неудаче тест падает явно, а не молча.
7. QA-отчётов у карточек #2–#6 нет; пожелания взяты из `qa-report-7…12.md`. В них только «пожелания», багов нет.
8. Ветка от `task-12-reactions`: без неё нет `TurnTimer`, реакций и звука, к которым относятся UI6–UI10.
