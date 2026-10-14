# ОРБИТА 2 — этап 1.5 «Галактика под заказ»: план реализации

**Goal:** перед стартом — экран с ползунками и зерном, по которым строится галактика; во время игры — ползунок «юнитов на карте ≤ N», под который симуляция режет мирный трафик.

**Основание:** `docs/ROADMAP.md`, этап 1.5; `docs/vision.md` («Галактика под заказ [В]»); спека 2А §15 (лимит юнитов — константа в 2А, ползунок и срез трафика — 1.5). Отдельной спеки нет: этап маленький, решения — в этом плане.

**Global Constraints:** все из плана этапа 1 и 2А: `src/sim/` без DOM/Pixi/React, без `Math.random()`/`Date.now()`; деньги только через `earn`/`spend`/`buy`; каждый корабль — сущность; тексты на русском; `npm run codemap` перед коммитом; коммит без упоминаний Claude/ИИ; ветка `galaxy`; без `git push`.

**Главное правило совместимости:** `createWorld(seed)` и `generateGalaxy(rng)` **без настроек дают ровно ту же галактику и историю, что сейчас** — ни одного лишнего броска `rng`. Поле настройки, которое не задано, берётся старым случайным способом (тем же броском в том же месте). Все старые тесты зелёные без правок.

**Решения оркестратора (владелец может поменять потом одним словом):**
- ползунки: число систем 4–12; число держав 2–24; держав в одной системе 1–3 (обитаемых систем выходит `ceil(держав / в системе)`); «рудных» систем 0–4; пиратских «Ям» 0–4 (пираты появятся в 2Б, пока Яма — бедная система с поясами); остальные — туманные; плотность коридоров 0–1 (0 — как сейчас); размер галактики ×0.6–×1.6 (расстояния и время перелёта); стартовая казна 20–300; лимит юнитов 500 / 1 000 / 2 000 / 5 000;
- «смесь характеров» и «агрессивность мира» — не делаем: характеров ещё нет (этап 3);
- лимит юнитов режет только мирный трафик (караваны, шахтёры); колонисты не списываются никогда; боевые корабли (2А) лимит учитывают через военного бота (задача 16 плана 2А читает `w.unitCap`).

---

### Task 1: Настройки генерации: `GalaxyOptions`, `generateGalaxy(rng, opts)`, `createWorld(seed, opts)`

**Files:** Create `src/sim/setup.ts`. Modify `src/sim/galaxy.ts`, `src/sim/world.ts`, `src/sim/types.ts` (`World.settings`, `World.unitCap`), `src/sim/civ.ts` (стартовая казна). Test `tests/sim/setup.test.ts`.

**Interfaces:**
- `setup.ts`:
  - `interface GalaxyOptions { systems?: number; civs?: number; perSystem?: number; ore?: number; pits?: number; links?: number; size?: number; treasury?: number; unitCap?: number }` — всё необязательно.
  - `SETUP` — все числа этапа в одном месте: `systems {min 4, max 12}`, `civs {min 2, max 24}`, `perSystem {min 1, max 3, def 3}`, `ore {min 0, max 4, def 1}`, `pits {min 0, max 4, def 1}`, `links {min 0, max 1, def 0}`, `size {min 0.6, max 1.6, def 1}`, `treasury {min 20, max 300, def: CIVS.startTreasury}`, `unitCap {options [500, 1000, 2000, 5000], def 2000}`, `inhabitedShare 0.6`, `retireMin 20`, `retireShare 0.2` (последние два — задача 2).
  - `clampOptions(o: GalaxyOptions): GalaxyOptions` — заданные поля в пределы `SETUP` (целые — округлить), незаданные не трогать, `NaN` → не задано.
  - `interface Setup { systems; inhabited; civs; ore; pits; nebulae; links; size; treasury; unitCap }` (все `number`) и `setupOf(g: Galaxy, opts): Setup` — что **вышло** (считается по готовой галактике: роли, `civSlots`, `corridors.length`), для экрана и карточек.
- `galaxy.ts` (сигнатуры расширяются необязательными параметрами, старые вызовы в тестах не меняются):
  - `placeSystems(rng, n, scale = 1)` — эллипс и `minDist` × `scale`;
  - `buildCorridorEdges(pts, extra = 0)` — после нынешнего алгоритма добавить до `extra` рёбер: кратчайшие, не пересекающие существующие коридоры и не проходящие через систему, степень ≤ `GALAXY.maxDegree`; сколько влезло;
  - `assignRoles(rng, n, edges, inhabited?, ore = 1, pits = 1)` — `inhabited` по умолчанию прежнее `n === 5 ? 3 : 4`; Ямы — по убыванию степени (как сейчас), затем рудные, остальные `nebula`; не хватает систем — сначала урезаются рудные, потом Ямы;
  - `civSlots(rng, inhabited, civs?, perSystem = 3)` — `civs` не задано → прежний бросок `rng.int(CIVS.min, CIVS.max)`; итог зажат в `[inhabited · min(2, perSystem), inhabited · perSystem]`; раскладка по системам — прежняя (по `min(2, perSystem)`, добор случайно до `perSystem`);
  - `generateGalaxy(rng, opts: GalaxyOptions = {})`: `n = opts.systems ?? rng.pick([5, 6, 6, 7])`; обитаемых — если задано `civs`: `ceil(civs / perSystem)`, иначе если задано `systems`: `round(n · SETUP.inhabitedShare)`, иначе прежнее правило; всегда зажать в `[1, n − 1]`; `links` → `extra = round(links · n / 2)`; `size` → `placeSystems(..., size)` и `transitMin/Max × size`.
- `world.ts`: `createWorld(seed, opts: GalaxyOptions = {})` → `generateGalaxy(root.fork('galaxy'), clampOptions(opts))`; `w.settings = setupOf(galaxy, opts)`; `w.unitCap = opts.unitCap ?? SETUP.unitCap.def`.
- `civ.ts`: стартовая казна — `w.settings.treasury` (по умолчанию `CIVS.startTreasury`, т. е. как сейчас).

**Тесты** (`tests/sim/setup.test.ts`):
- `it('без настроек и с {} — побайтно та же галактика и тот же мир через 600 шагов')` — `JSON.stringify(generateGalaxy(createRng(s)))` против `generateGalaxy(createRng(s), {})` на 20 зёрнах; `snapshot(run(createWorld(7), 600))` против `createWorld(7, {})`.
- `it('крайние значения строятся на 30 зёрнах: 4 и 12 систем, 2 и 24 державы, в системе 1 и 3, ore/pits 0 и 4, links 0 и 1, size 0.6 и 1.6')` — связность, степень ≤ maxDegree, уникальные имена, в каждой обитаемой ≥ `civSlots + 1` пригодных, без исключений.
- `it('systems: 9 → 9 систем; civs: 12, perSystem 2 → 6 обитаемых и 12 держав')`.
- `it('держав больше, чем влезает (24 при 4 системах) — урезано до (n−1)·perSystem, setupOf показывает, что вышло')`.
- `it('links 1 даёт больше коридоров, чем links 0, на тех же точках; коридоры не пересекаются')`.
- `it('size 1.6 — галактика шире и перелёты дольше, чем size 0.6')`.
- `it('treasury 200 — у всех держав 200 на старте, журнал сходится')`.
- `it('clampOptions: 99 систем → 12, NaN → не задано, 2.6 → 3')`.

**Приёмка:** все старые тесты зелёные **без правок**; `npm run typecheck`.
**Коммит:** `sim: galaxy options (systems, civs, roles, links, size, treasury), createWorld(seed, opts)`

---

### Task 2: Лимит юнитов в симуляции: `w.unitCap`, запрет покупки трафика, списание лишнего

**Files:** Create `src/sim/cap.ts`. Modify `src/sim/options.ts` (караван и шахтёр — только под лимитом), `src/sim/world.ts` (фаза `stepUnitCap` после `stepBots`, перед `stepShips`). Test `tests/sim/cap.test.ts`.

**Interfaces:**
- `cap.ts`:
  - `liveShips(w): number` — живые в `w.ships`;
  - `civShare(w): number` = `ceil(w.unitCap / max(1, w.civs.length))`;
  - `trafficAllowed(w, civ): boolean` — `liveShips(w) < w.unitCap` и у державы живых караванов + шахтёров < `civShare(w)`;
  - `stepUnitCap(w)` — раз в секунду (`w.tick % 10 === 0`): `excess = liveShips − unitCap`; если > 0 — списать `min(excess, max(SETUP.retireMin, ceil(excess · SETUP.retireShare)))` кораблей. Кандидаты — только `caravan` и `miner` (в том числе патрульные стресс-корабли), **никогда** `colony` и боевые классы. Порядок детерминированный: каждый раз — держава с наибольшим числом кандидатов (равенство — меньший id), у неё — корабль с наибольшим id. Списанный: `alive = false`, `earn(civ, ship.price · ECON.decommissionRefund, 'refund')`. Одно событие на вызов `pushEvent` P2 «Лимит юнитов: списано N кораблей» (группируется `textMany`), без `at`.
- `options.ts`: в `listOptions` варианты `caravan` и `miner` добавляются только при `trafficAllowed(w, civ)`.

**Правила:** лимит меняется в любой момент (`w.unitCap = n`), симуляция догоняет за несколько секунд; колонистов не трогаем (везут людей); детерминизм: одно зерно + одна и та же последовательность смен лимита → одна история.

**Тесты** (`tests/sim/cap.test.ts`):
- `it('лимит 2000 по умолчанию ничего не меняет в обычной игре за 30 минут')` — тот же `snapshot`, что без `stepUnitCap` (сравнить с `w.unitCap = Infinity`).
- `it('стресс 2000 кораблей, лимит 500 — через 20 с живых ≤ 500, колонисты целы')`.
- `it('списание возвращает 25 % цены через earn, журнал сходится')`.
- `it('над лимитом держава не покупает караван и шахтёра; под лимитом — покупает')`.
- `it('доля державы: при 10 державах и лимите 50 у державы не больше 5 караванов + шахтёров')`.
- `it('лимит подняли обратно — списание прекращается, покупки возобновляются')`.
- `it('детерминизм: два мира, одна последовательность смен лимита — одинаковый snapshot')`.

**Приёмка:** все старые тесты зелёные; `npm run stress` не медленнее (фаза раз в секунду).
**Коммит:** `sim: unit cap — no traffic over the cap, retire excess caravans and miners`

---

### Task 3: Экран «Галактика под заказ», параметры в адресе, ползунок лимита в игре

**Files:** Create `src/app/setup.ts`, `src/ui/SetupScreen.tsx`. Modify `src/app/main.tsx`, `src/app/controller.ts` (`setUnitCap`), `src/ui/ViewMenu.tsx`, `src/ui/styles.css`, `scripts/smoke.ts` (снимок экрана настроек). Test `tests/app/setup.test.ts`, правка `tests/app/controller.test.ts`.

**Interfaces:**
- `app/setup.ts`:
  - `parseSetup(search: string): { seed: number | null; opts: GalaxyOptions; stress: number }` — параметры адреса `seed, systems, civs, per, ore, pits, links, size, money, cap, stress`; мусор → не задано; через `clampOptions`; `stress=1` → 2000, `stress=N` (N > 1) → N, нет → 0;
  - `setupQuery(seed, opts): string` — обратное (`parseSetup(setupQuery(s, o))` даёт то же);
  - `UI_DEFAULTS: Required<GalaxyOptions>` — начальные положения ползунков (6 систем, 9 держав, по 3 в системе, 1 рудная, 1 Яма, связи 0, размер 1, казна 60, лимит 2 000);
  - `loadUnitCap(): number | null` / `saveUnitCap(n)` — `localStorage` `orbita.unitCap` в `try/catch`.
- `main.tsx`: нет `seed` в адресе → показать `SetupScreen` (в `#hud`, без Pixi), не строить мир и выставить `window.__orbita = { setup: true }` (иначе `npm run shot` ждёт `__orbita` 30 с и падает); есть → `createWorld(seed, opts)`; лимит: `cap` из адреса, иначе `loadUnitCap()`, иначе по умолчанию; стресс — `spawnStressShips(world, stress, round(stress · 0.3))`.
- `SetupScreen.tsx`: ползунки по `SETUP` с подписью текущего значения, поле зерна и кнопка «другое зерно», **превью** — SVG галактики `generateGalaxy(createRng(seed).fork('galaxy'), clampOptions(opts))` (ровно то, что построит `createWorld`): точки систем цветом роли (обитаемая / рудная / Яма / туманность), линии коридоров; строка «вышло» из `setupOf` («7 систем · 4 обитаемых · 10 держав · 9 коридоров»); кнопка «Создать» → `location.search = setupQuery(...)`. Значения ползунков запоминаются в `localStorage` (`orbita.setup`, `try/catch`). Превью пересчитывается не чаще раза в 100 мс при движении ползунка.
- `ViewMenu.tsx`: раздел «Игра»: ряд «Юнитов на карте» 500 / 1 000 / 2 000 / 5 000 → `controller.setUnitCap(n)`; кнопка «Новая галактика» → `location.search = ''`.
- `controller.ts`: `setUnitCap(n)` → `world.unitCap = n`, `saveUnitCap(n)`; текущее значение — в снимке интерфейса (`snapshot.unitCap`) для подсветки кнопки.

**Тесты:**
- `tests/app/setup.test.ts`: `it('parseSetup ↔ setupQuery туда-обратно')`, `it('мусор и выход за пределы — зажаты или не заданы')`, `it('stress=1 → 2000, stress=5000 → 5000')`, `it('нет seed → seed: null')`.
- `tests/app/controller.test.ts`: `it('setUnitCap меняет world.unitCap')`.

**Проверка глазами (оркестратор):** `npm run shot -- "" artifacts/setup/screen.png` (экран настроек с превью); `npm run shot -- "seed=4815&stress=5000&fps=1" artifacts/setup/cap.png "__orbita.controller.setUnitCap(1000); __orbita.fastForward(300)"` — в счётчике кораблей ≤ 1 000.
**Приёмка:** `npm run typecheck`, весь `npm test`; `npm run smoke` проходит (адреса с `seed` грузят игру как раньше).
**Коммит:** `ui: galaxy setup screen with sliders and preview, unit cap in view menu, setup URL params`
