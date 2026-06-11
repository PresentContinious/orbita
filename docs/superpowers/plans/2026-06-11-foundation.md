# Этап 1 «Фундамент» — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Симуляция, идентичная на всех скоростях; скорости ×1/×2/×5/×10; civ.js разбит на модули без изменения поведения; 4 багфикса; карточка планеты и дипломатия видны одновременно.

**Architecture:** Логика цивилизаций переводится с «один вызов на кадр с переменным h» на фиксированные тики 0.05 с через аккумулятор в `Engine._update`. `src/solar/civ.js` (1754 строки) становится каталогом `src/solar/civ/` — класс `Civ` в `index.js` хранит всё состояние и делегирует в модули-функции вида `fn(civ, ...)`; публичный API для `engine.js`/`App.jsx` не меняется.

**Tech Stack:** React 18 + Vite 5, canvas 2D, без тестовой инфраструктуры — проверка каждой задачи: `npx vite build` (ожидаем `✓ built`) + смоук в dev-сервере по необходимости. Спека: `docs/superpowers/specs/2026-06-11-foundation-design.md`.

**Важно для исполнителя:**
- Номера строк даны по состоянию файлов на момент написания плана и сдвигаются после каждой задачи — ищи по имени функции/фрагменту, номер — только ориентир.
- Поведение игры меняться не должно нигде, кроме явно описанных фиксов. При переносе кода в модули — только механические замены `this.` → `civ.`.
- Коммит после каждой задачи.

---

### Task 1: Скорости ×1/×2/×5/×10

**Files:**
- Modify: `src/App.jsx:31-35`

- [ ] **Step 1: Заменить массив скоростей**

Было:
```jsx
const SPEEDS = [
  { label: '×1', value: 1 },
  { label: '×10', value: 10 },
  { label: '×50', value: 50 },
]
```

Стало:
```jsx
const SPEEDS = [
  { label: '×1', value: 1 },
  { label: '×2', value: 2 },
  { label: '×5', value: 5 },
  { label: '×10', value: 10 },
]
```

- [ ] **Step 2: Сборка**

Run: `npx vite build` — Expected: `✓ built`

- [ ] **Step 3: Commit**

```bash
git add src/App.jsx
git commit -m "Скорости симуляции ×1/×2/×5/×10 вместо ×1/×10/×50"
```

---

### Task 2: Фиксированный тик логики цивилизаций

**Files:**
- Modify: `src/solar/engine.js` (константы вверху файла; конструктор ~:64; `newGame()` ~:159; `resetSystem()` ~:186; `_update()` ~:1030)
- Modify: `src/solar/civ.js:163-186` (метод `update`)

- [ ] **Step 1: Константа тика в engine.js**

После строки `const LOST_DIST = 3600` (engine.js:23) добавить:

```js
// Логика цивилизаций тикает фиксированным шагом — поведение не зависит от скорости и FPS
const CIV_TICK = 0.05
```

- [ ] **Step 2: Аккумулятор в конструкторе**

В конструкторе `Engine` рядом с `this.simT = 0` (engine.js:66) добавить:

```js
this.civAcc = 0
```

- [ ] **Step 3: Сброс аккумулятора при перезапусках**

В `newGame()` после `this.civ.reset()` и в `resetSystem()` после `this.civ?.reset()` добавить строку:

```js
this.civAcc = 0
```

- [ ] **Step 4: Заменить вызов civ.update в `_update`**

Было (engine.js:1030):
```js
this.civ?.update(h, dt)
```

Стало:
```js
// затухание визуальных эффектов — каждый кадр, даже на паузе
this.civ?.updateVisual(dt)
// логика — фиксированными тиками; потолок = бюджет максимальной скорости,
// излишек сбрасывается (защита от спирали смерти на слабом железе)
this.civAcc = Math.min(this.civAcc + h, CIV_TICK * 10)
while (this.civAcc >= CIV_TICK) {
  this.civ?.tick(CIV_TICK)
  this.civAcc -= CIV_TICK
}
```

- [ ] **Step 5: Разделить `update(h, dt)` в civ.js на `tick(h)` и `updateVisual(dt)`**

Было (civ.js:163-177):
```js
update(h, dt) {
  // визуальные эффекты гаснут и на паузе
  for (const b of this.beams) b.life -= dt * 2
  this.beams = this.beams.filter((b) => b.life > 0)
  if (h <= 0) return
  this.t += h
  ...
}
```

Стало:
```js
updateVisual(dt) {
  // визуальные эффекты гаснут и на паузе
  for (const b of this.beams) b.life -= dt * 2
  this.beams = this.beams.filter((b) => b.life > 0)
}

tick(h) {
  this.t += h
  ...
}
```

(тело `tick` — всё, что шло после `if (h <= 0) return`, без изменений: `battleLogT`, `_populations`, `_decisions`, `_diplomacyDrift`, `_ships`, `_planetDefense`, `_pvoIntercept`, `_asteroidsTick`, фильтр умерших государств.)

- [ ] **Step 6: Сборка**

Run: `npx vite build` — Expected: `✓ built`

- [ ] **Step 7: Смоук в dev-сервере**

Run: `npm run dev`, открыть http://localhost:5173 — игра живёт на ×1; переключить на ×10 — корабли летают плавно (не скачками), ПВО перехватывает ракеты, бои выглядят как на ×1, только быстрее.

- [ ] **Step 8: Commit**

```bash
git add src/solar/engine.js src/solar/civ.js
git commit -m "Фиксированный тик логики цивилизаций: одинаковое поведение на всех скоростях"
```

---

### Task 3: Карточка планеты и дипломатия — рядом

**Files:**
- Modify: `src/App.jsx:347-348`
- Modify: `src/styles.css` (после блока `.panel`, ~:502)

- [ ] **Step 1: Убрать взаимоисключение панелей в App.jsx**

Было (App.jsx:347-348):
```jsx
{sel && !showDiplo && (
  <aside className="panel glass" key={sel.id}>
```

Стало:
```jsx
{sel && (
  <aside className={`panel glass ${showDiplo ? 'with-diplo' : ''}`} key={sel.id}>
```

- [ ] **Step 2: CSS-сдвиг карточки при открытой дипломатии**

В `styles.css` после правила `.panel { ... }` (заканчивается на :502) добавить:

```css
/* дипломатия открыта: карточка планеты встаёт левее неё (340px + 10px зазор) */
.panel.with-diplo {
  right: 366px;
}

@media (max-width: 900px) {
  /* на узких экранах — карточка поверх дипломатии */
  .panel.with-diplo {
    right: 16px;
    z-index: 25;
  }
}
```

- [ ] **Step 3: Сборка**

Run: `npx vite build` — Expected: `✓ built`

- [ ] **Step 4: Смоук**

В dev-сервере: открыть дипломатию (D), кликнуть планету — карточка появляется слева от дипломатии; обе закрываются независимо (✕). Без дипломатии карточка на старом месте.

- [ ] **Step 5: Commit**

```bash
git add src/App.jsx src/styles.css
git commit -m "Карточка планеты и панель дипломатии видны одновременно"
```

---

### Task 4: Багфикс — корабль-призрак (и колонизация от столицы)

При 130+ кораблях `_spawnShip` не добавляет корабль в список, но возвращает объект — деньги/население уже списаны, миссии вешаются на «призрака». Фикс: `_spawnShip` возвращает `null` при переполнении; все вызывающие сначала спавнят, потом списывают. Заодно (багфикс №4 спеки): колонизация считается от столицы `home`, а не от `myPlanets[0]`.

**Files:**
- Modify: `src/solar/civ.js` — `_spawnShip` (~:645) и все 12 мест вызова

- [ ] **Step 1: `_spawnShip` возвращает null при переполнении**

Было (конец `_spawnShip`, civ.js:669-670):
```js
if (this.ships.length < 130) this.ships.push(sh)
return sh
```

Стало — в начале функции, первой строкой:
```js
if (this.ships.length >= 130) return null
```
и в конце:
```js
this.ships.push(sh)
return sh
```

- [ ] **Step 2: Шахтёр с конвоем (в `_stateDecide`, ~:279)**

Было:
```js
if (this.asteroids.some((a) => a.res > 0) && myShips.filter((s) => s.kind === 'miner').length < 2 && st.credits >= SHIP.miner.cost) {
  st.credits -= SHIP.miner.cost
  const mn = this._spawnShip('miner', st, myPlanets[0])
  if (st.pirateLosses >= 80 && st.credits >= SHIP.escort.cost * 2) {
    st.credits -= SHIP.escort.cost * 2
    for (let i = 0; i < 2; i++) {
      const es = this._spawnShip('escort', st, myPlanets[0])
      es.mission = { type: 'escort', ship: mn.id }
    }
    if (Math.random() < 0.5) this.log(`🛡 ${st.name} пускает шахтёров только конвоями`)
  }
}
```

Стало:
```js
if (this.asteroids.some((a) => a.res > 0) && myShips.filter((s) => s.kind === 'miner').length < 2 && st.credits >= SHIP.miner.cost) {
  const mn = this._spawnShip('miner', st, myPlanets[0])
  if (mn) {
    st.credits -= SHIP.miner.cost
    if (st.pirateLosses >= 80 && st.credits >= SHIP.escort.cost * 2) {
      for (let i = 0; i < 2; i++) {
        const es = this._spawnShip('escort', st, myPlanets[0])
        if (!es) break
        st.credits -= SHIP.escort.cost
        es.mission = { type: 'escort', ship: mn.id }
      }
      if (Math.random() < 0.5) this.log(`🛡 ${st.name} пускает шахтёров только конвоями`)
    }
  }
}
```

- [ ] **Step 3: Военный дредноут (~:351)**

Было:
```js
if (st.credits >= SHIP.dread.cost && myDreads.length < 3) {
  st.credits -= SHIP.dread.cost
  this._spawnShip('dread', st, myPlanets[0])
  this.log(`⚓ ${st.name} спустило на воду дредноут`)
}
```

Стало:
```js
if (st.credits >= SHIP.dread.cost && myDreads.length < 3) {
  const d = this._spawnShip('dread', st, myPlanets[0])
  if (d) {
    st.credits -= SHIP.dread.cost
    this.log(`⚓ ${st.name} спустило на воду дредноут`)
  }
}
```

- [ ] **Step 4: Десантная волна (~:373)**

Было (внутри `while`):
```js
while (needed > 0 && sent < 3 && st.credits >= SHIP.transport.cost && myPop > 0.8) {
  st.credits -= SHIP.transport.cost
  // борт берёт от 1 до 10 тысяч — крупный десант, а не сотня лодок
  const troops = Math.min(clamp(needed, 1, 10), Math.max(myPlanets[0].pop * 0.5, 0.3))
  myPlanets[0].pop = Math.max(myPlanets[0].pop - troops * 0.4, 0.05)
  const sh = this._spawnShip('transport', st, myPlanets[0])
  sh.mission = { type: 'invade', planet: broken.id, troops }
  needed -= troops
  sent++
}
```

Стало:
```js
while (needed > 0 && sent < 3 && st.credits >= SHIP.transport.cost && myPop > 0.8) {
  const sh = this._spawnShip('transport', st, myPlanets[0])
  if (!sh) break
  st.credits -= SHIP.transport.cost
  // борт берёт от 1 до 10 тысяч — крупный десант, а не сотня лодок
  const troops = Math.min(clamp(needed, 1, 10), Math.max(myPlanets[0].pop * 0.5, 0.3))
  myPlanets[0].pop = Math.max(myPlanets[0].pop - troops * 0.4, 0.05)
  sh.mission = { type: 'invade', planet: broken.id, troops }
  needed -= troops
  sent++
}
```

- [ ] **Step 5: Внутренний караван (~:424)**

Было:
```js
if (!internal && st.credits >= SHIP.transport.cost) {
  st.credits -= SHIP.transport.cost
  const sh = this._spawnShip('transport', st, myPlanets[0])
  sh.mission = { type: 'trade', a: st.id, b: st.id, from: myPlanets[0].id, to: myPlanets[1].id, leg: 0, boost: 1 }
  this.log(`🚚 ${st.name} запустило внутренний караван`)
}
```

Стало:
```js
if (!internal && st.credits >= SHIP.transport.cost) {
  const sh = this._spawnShip('transport', st, myPlanets[0])
  if (sh) {
    st.credits -= SHIP.transport.cost
    sh.mission = { type: 'trade', a: st.id, b: st.id, from: myPlanets[0].id, to: myPlanets[1].id, leg: 0, boost: 1 }
    this.log(`🚚 ${st.name} запустило внутренний караван`)
  }
}
```

- [ ] **Step 6: Внешний караван (~:438)**

Было:
```js
if (!route && st.credits >= SHIP.transport.cost) {
  st.credits -= SHIP.transport.cost
  const sh = this._spawnShip('transport', st, myPlanets[0])
  const alHome = this.planetsOf(al)[0]
  if (alHome) {
    sh.mission = { type: 'trade', a: st.id, b: al.id, from: myPlanets[0].id, to: alHome.id, leg: 0, boost: 1 }
    this.log(`🚚 караван ${st.name} ↔ ${al.name} вышел на маршрут`)
  }
  break
}
```

Стало (заодно не платим, если у друга нет планеты):
```js
if (!route && st.credits >= SHIP.transport.cost) {
  const alHome = this.planetsOf(al)[0]
  if (alHome) {
    const sh = this._spawnShip('transport', st, myPlanets[0])
    if (sh) {
      st.credits -= SHIP.transport.cost
      sh.mission = { type: 'trade', a: st.id, b: al.id, from: myPlanets[0].id, to: alHome.id, leg: 0, boost: 1 }
      this.log(`🚚 караван ${st.name} ↔ ${al.name} вышел на маршрут`)
    }
  }
  break
}
```

- [ ] **Step 7: Колонизация — от столицы и без призрака (~:456)**

Было:
```js
if (free.length && homeMature && st.credits >= COLONY_COST + SHIP.transport.cost) {
  free.sort((a, b) => dist(a, myPlanets[0]) - dist(b, myPlanets[0]))
  st.credits -= COLONY_COST + SHIP.transport.cost
  const settlers = 0.18
  myPlanets[0].pop = Math.max(myPlanets[0].pop - settlers, 0.05)
  const sh = this._spawnShip('transport', st, myPlanets[0])
  sh.mission = { type: 'colonize', planet: free[0].id, settlers }
  this.log(`🚀 ${st.name} снарядило экспедицию к ${free[0].name} (−${COLONY_COST + SHIP.transport.cost} кр)`)
}
```

Стало (`home` уже объявлен выше в этой же функции — `const home = this.planetById(st.home) || myPlanets[0]`; добавлена проверка `home &&`, т.к. при `homeMature === true` home существует, но проверка делает код устойчивым):
```js
if (free.length && homeMature && home && st.credits >= COLONY_COST + SHIP.transport.cost) {
  free.sort((a, b) => dist(a, home) - dist(b, home))
  const sh = this._spawnShip('transport', st, home)
  if (sh) {
    st.credits -= COLONY_COST + SHIP.transport.cost
    const settlers = 0.18
    home.pop = Math.max(home.pop - settlers, 0.05)
    sh.mission = { type: 'colonize', planet: free[0].id, settlers }
    this.log(`🚀 ${st.name} снарядило экспедицию к ${free[0].name} (−${COLONY_COST + SHIP.transport.cost} кр)`)
  }
}
```

- [ ] **Step 8: Мирный дредноут (~:475)**

Было:
```js
if (st.credits >= SHIP.dread.cost && myDreads.length < 1 && this.states.length > 2) {
  st.credits -= SHIP.dread.cost
  this._spawnShip('dread', st, myPlanets[0])
}
```

Стало:
```js
if (st.credits >= SHIP.dread.cost && myDreads.length < 1 && this.states.length > 2) {
  if (this._spawnShip('dread', st, myPlanets[0])) st.credits -= SHIP.dread.cost
}
```

- [ ] **Step 9: Эвакуация пиратов (~:522, в `_pirateDecide`)**

Было:
```js
if (dest) {
  const sh = this._spawnShip('transport', st, den)
  sh.hp = sh.maxHp = 110 // боевой транспорт с усиленным корпусом
  sh.mission = { type: 'pirateMove', planet: dest.id, popLoad: Math.max(den.pop, 0.2) }
  den.owner = null
  ...
}
```

Стало (база бросается только если транспорт реально создан):
```js
if (dest) {
  const sh = this._spawnShip('transport', st, den)
  if (sh) {
    sh.hp = sh.maxHp = 110 // боевой транспорт с усиленным корпусом
    sh.mission = { type: 'pirateMove', planet: dest.id, popLoad: Math.max(den.pop, 0.2) }
    den.owner = null
    den.pop = 0
    den.pvoUnits = 0
    den.pvoReady = 0
    st.evacAt = null
    this.log('🏴‍☠️ пираты бросили базу и ушли в туман — преследователи найдут пустые скалы')
    return
  }
}
```

- [ ] **Step 10: Пиратский рейдер (~:541)**

Было:
```js
if (raiders.length < 10 && st.credits >= SHIP.raider.cost) {
  st.credits -= SHIP.raider.cost
  this._spawnShip('raider', st, den)
}
```

Стало:
```js
if (raiders.length < 10 && st.credits >= SHIP.raider.cost) {
  if (this._spawnShip('raider', st, den)) st.credits -= SHIP.raider.cost
}
```

- [ ] **Step 11: Палубные истребители — два места (~:934 и ~:970, в `_ships`)**

Было (первое место):
```js
if (wing.length < 3 && (foe || (m && m.type !== 'escort')) && sh.cd <= 0) {
  sh.cd = 5
  const f = this._spawnShip('fighter', st, { x: sh.x, y: sh.y, r: 4, id: sh.home })
  f.carrier = sh.id
  f.home = sh.home
}
```

Стало:
```js
if (wing.length < 3 && (foe || (m && m.type !== 'escort')) && sh.cd <= 0) {
  sh.cd = 5
  const f = this._spawnShip('fighter', st, { x: sh.x, y: sh.y, r: 4, id: sh.home })
  if (f) {
    f.carrier = sh.id
    f.home = sh.home
  }
}
```

Второе место (`sh.cd = 2.5`, в блоке генерального сражения) — точно такая же обёртка `if (f) { ... }`.

- [ ] **Step 12: Ополчение (~:1430, в `_planetDefense`)**

Было:
```js
p.defT = 1.6
const st = this.stateById(p.owner)
if (!st) continue
p.pop = Math.max(p.pop - 0.004, 0.01)
const f = this._spawnShip('fighter', st, p)
f.militia = true
f.hp = f.maxHp = 12
```

Стало (население тратится только на реально взлетевший истребитель):
```js
p.defT = 1.6
const st = this.stateById(p.owner)
if (!st) continue
const f = this._spawnShip('fighter', st, p)
if (!f) continue
p.pop = Math.max(p.pop - 0.004, 0.01)
f.militia = true
f.hp = f.maxHp = 12
```

- [ ] **Step 13: Сборка**

Run: `npx vite build` — Expected: `✓ built`

- [ ] **Step 14: Commit**

```bash
git add src/solar/civ.js
git commit -m "Багфикс: при лимите кораблей деньги и население не списываются за неспавнившийся корабль; колонизация меряется от столицы"
```

---

### Task 5: Багфикс — цвета государств не повторяются

**Files:**
- Modify: `src/solar/civ.js` — `_makeState` (~:101) и сецессия (~:489)

- [ ] **Step 1: Выбор наименее занятого цвета в `_makeState`**

Было:
```js
color: opts.pirate ? PIRATE_COLOR : STATE_COLORS[this.states.length % STATE_COLORS.length],
```

Стало — перед созданием объекта `st` добавить:
```js
const usedColors = new Set(this.states.filter((s) => !s.pirate).map((s) => s.color))
const freeColor = STATE_COLORS.find((c) => !usedColors.has(c)) ?? STATE_COLORS[this.states.length % STATE_COLORS.length]
```
а в объекте:
```js
color: opts.pirate ? PIRATE_COLOR : freeColor,
```

- [ ] **Step 2: Убрать ручной подбор цвета при сецессии**

В блоке сецессии удалить строку:
```js
ns.color = STATE_COLORS[(this.states.length * 3 + 1) % STATE_COLORS.length]
```
(теперь `_makeState` сам выдаёт свободный цвет.)

- [ ] **Step 3: Сборка**

Run: `npx vite build` — Expected: `✓ built`

- [ ] **Step 4: Commit**

```bash
git add src/solar/civ.js
git commit -m "Багфикс: новые государства получают незанятый цвет"
```

---

### Task 6: Багфикс — чистка отношений умерших государств

**Files:**
- Modify: `src/solar/civ.js` — фильтр государств в `tick` (~:179) + новый метод

- [ ] **Step 1: Метод `_purgeRelations`**

Добавить рядом с `setRel` (после :135):

```js
// при смерти государства вычищаем его дипломатические следы
_purgeRelations(id) {
  for (const key of Object.keys(this.rel)) {
    const [a, b] = key.split(':')
    if (+a === id || +b === id) delete this.rel[key]
  }
  for (const key of Object.keys(this.warSince)) {
    const [a, b] = key.split(':')
    if (+a === id || +b === id) delete this.warSince[key]
  }
}
```

- [ ] **Step 2: Вызов при смерти государства**

Было (в `tick`):
```js
this.states = this.states.filter((s) => {
  if (this.planetsOf(s).length === 0 && !this.ships.some((sh) => sh.owner === s.id)) {
    this.log(`☠️ ${s.name} прекратило существование`)
    return false
  }
  return true
})
```

Стало:
```js
this.states = this.states.filter((s) => {
  if (this.planetsOf(s).length === 0 && !this.ships.some((sh) => sh.owner === s.id)) {
    this.log(`☠️ ${s.name} прекратило существование`)
    this._purgeRelations(s.id)
    return false
  }
  return true
})
```

- [ ] **Step 3: Сборка**

Run: `npx vite build` — Expected: `✓ built`

- [ ] **Step 4: Commit**

```bash
git add src/solar/civ.js
git commit -m "Багфикс: отношения и таймеры войн умерших государств вычищаются"
```

---

### Task 7: Разбивка — каталог `civ/`, constants.js, перенос файла

Дальше четыре задачи переносят civ.js в `src/solar/civ/` по модулям. Правила переноса: тело функции копируется как есть; `this.` → `civ.`; `this.e` → `civ.e`; модульные функции получают `civ` первым аргументом; класс `Civ` сохраняет методы-делегаты со старыми именами — ни один вызов в других местах не меняется.

**Files:**
- Create: `src/solar/civ/constants.js`
- Create: `src/solar/civ/index.js` (перенос всего `civ.js`)
- Delete: `src/solar/civ.js`
- Modify: `src/solar/engine.js:2` (путь импорта)

- [ ] **Step 1: Создать `src/solar/civ/constants.js`** (полное содержимое)

```js
// Общие константы и хелперы цивилизаций

export const TAU = Math.PI * 2
export const SQ = 0.74

export const clamp = (v, a, b) => Math.min(b, Math.max(a, v))
export const rand = (a, b) => a + Math.random() * (b - a)
export const pick = (arr) => arr[(Math.random() * arr.length) | 0]
export const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y)

export const STATE_COLORS = ['#5da8ff', '#ff8a5c', '#7dd87d', '#e0c060', '#c98bff', '#5ce0d8', '#ff8fc8', '#a8c84d', '#8aa0ff', '#ffd07a']
export const PIRATE_COLOR = '#ff5555'

// Война при отношениях ниже, союз — выше
export const WAR_AT = -45
export const ALLY_AT = 55

export const SHIP = {
  transport: { hp: 60, speed: 60, cost: 60, label: 'транспорт' },
  dread: { hp: 420, speed: 30, cost: 320, label: 'дредноут' },
  fighter: { hp: 14, speed: 115, cost: 0, label: 'истребитель' },
  raider: { hp: 16, speed: 100, cost: 28, label: 'рейдер' },
  miner: { hp: 30, speed: 52, cost: 45, label: 'шахтёр' },
  escort: { hp: 24, speed: 108, cost: 22, label: 'эскорт' },
}

// сквозной счётчик id — единый для всех модулей
let uid = 1
export const nextId = () => uid++
```

- [ ] **Step 2: Перенести `civ.js` → `civ/index.js`**

`git mv src/solar/civ.js src/solar/civ/index.js`, затем в `index.js`:
- импорты путей: `'./gen.js'` → `'../gen.js'`, `'./sprites.js'` → `'../sprites.js'`;
- удалить локальные объявления `TAU, SQ, clamp, rand, pick, dist, STATE_COLORS, PIRATE_COLOR, WAR_AT, ALLY_AT, SHIP, let uid = 1`;
- добавить импорт: `import { TAU, SQ, clamp, rand, pick, dist, STATE_COLORS, PIRATE_COLOR, WAR_AT, ALLY_AT, SHIP, nextId } from './constants.js'`;
- все четыре использования `uid++` (в `log`, `_makeState`, `_spawnShip`, `_spawnAsteroid`) заменить на `nextId()`.

- [ ] **Step 3: Поправить импорт в engine.js**

Было: `import { Civ } from './civ.js'` → Стало: `import { Civ } from './civ/index.js'`

- [ ] **Step 4: Сборка**

Run: `npx vite build` — Expected: `✓ built`

- [ ] **Step 5: Commit**

```bash
git add -A src/solar
git commit -m "Рефакторинг: civ.js переезжает в каталог civ/, общие константы в constants.js"
```

---

### Task 8: Разбивка — diplomacy.js

**Files:**
- Create: `src/solar/civ/diplomacy.js`
- Modify: `src/solar/civ/index.js`

- [ ] **Step 1: Создать `diplomacy.js` и перенести функции**

Переносятся из `index.js`: тела `getRel`, `setRel`, `isWar`, `isAlly`, `_purgeRelations`, `_diplomacyDrift`, `_maybeSpawnPirates`. Сигнатуры и шапка файла:

```js
// Дипломатия: отношения, дрейф, войны и союзы, появление пиратов

import { genName } from '../gen.js'
import { clamp, rand, pick, WAR_AT, ALLY_AT } from './constants.js'

export const relKey = (a, b) => (a < b ? `${a}:${b}` : `${b}:${a}`)

export function getRel(civ, a, b) { /* тело getRel: this. → civ. */ }
export function setRel(civ, a, b, v) { /* тело setRel */ }
export function isWar(civ, a, b) { /* тело isWar */ }
export function isAlly(civ, a, b) { /* тело isAlly */ }
export function purgeRelations(civ, id) { /* тело _purgeRelations */ }
export function diplomacyDrift(civ, h) { /* тело _diplomacyDrift */ }
export function maybeSpawnPirates(civ) { /* тело _maybeSpawnPirates */ }
```

Внутри перенесённых тел обращения вида `this.relKey(...)` заменяются на локальный `relKey(...)`, `this.getRel(...)` → `getRel(civ, ...)`, `this.setRel(...)` → `setRel(civ, ...)`, `this.isAlly(...)` → `isAlly(civ, ...)`, `this.isWar(...)` → `isWar(civ, ...)`, остальные `this.` → `civ.` (например `civ.states`, `civ.rel`, `civ.warSince`, `civ.log(...)`, `civ._makeState(...)`, `civ.t`, `civ.e.planets`, `civ.popOf(...)`, `civ.ships`).

- [ ] **Step 2: Делегаты в классе `Civ`**

В `index.js` добавить импорт и заменить методы на делегаты (старые тела удалить):

```js
import * as diplomacy from './diplomacy.js'

relKey(a, b) { return diplomacy.relKey(a, b) }
getRel(a, b) { return diplomacy.getRel(this, a, b) }
setRel(a, b, v) { diplomacy.setRel(this, a, b, v) }
isWar(a, b) { return diplomacy.isWar(this, a, b) }
isAlly(a, b) { return diplomacy.isAlly(this, a, b) }
_purgeRelations(id) { diplomacy.purgeRelations(this, id) }
_diplomacyDrift(h) { diplomacy.diplomacyDrift(this, h) }
_maybeSpawnPirates() { diplomacy.maybeSpawnPirates(this) }
```

- [ ] **Step 3: Сборка и смоук**

Run: `npx vite build` — Expected: `✓ built`. В dev: войны объявляются, союзы заключаются, лента живёт.

- [ ] **Step 4: Commit**

```bash
git add src/solar/civ
git commit -m "Рефакторинг: дипломатия в civ/diplomacy.js"
```

---

### Task 9: Разбивка — economy.js

**Files:**
- Create: `src/solar/civ/economy.js`
- Modify: `src/solar/civ/index.js`

- [ ] **Step 1: Создать `economy.js`**

Переносятся: `_populations`, `_spawnAsteroid`, `_asteroidsTick`, плюс из `_stateDecide` выделяются две функции — блок шахтёров (начало функции до `if (enemies.length)`) и вся мирная ветка (всё после `return` военной ветки, начиная с `st.tactic = null`).

```js
// Экономика: население, ПВО-стройка, караваны, колонизация, шахтёры, астероиды

import { clamp, rand, pick, dist, SHIP, STATE_COLORS, nextId } from './constants.js'

export function populations(civ, h) { /* тело _populations: this. → civ. */ }

// шахтёры и конвои — закупаются и в мире, и в войне
export function minersDecide(civ, st, myPlanets, myShips) { /* блок шахтёров из _stateDecide */ }

// мирная ветка решений: ПВО мирного времени, караваны, колонизация,
// охота на пиратов, мирный дредноут, сецессии
export function peacetimeDecide(civ, st, myPlanets, myShips, myDreads) {
  st.tactic = null
  /* остальная мирная ветка из _stateDecide: this. → civ. */
}

export function spawnAsteroid(civ, orbitR, ang = Math.random() * TAU, res = Math.round(rand(40, 110))) { /* тело _spawnAsteroid */ }
export function asteroidsTick(civ, h) { /* тело _asteroidsTick */ }
```

(также импортировать `TAU` из constants.js — он нужен `spawnAsteroid`.)

- [ ] **Step 2: `_stateDecide` в index.js становится диспетчером**

```js
import * as economy from './economy.js'

_stateDecide(st) {
  const myPlanets = this.planetsOf(st)
  if (!myPlanets.length) return
  const myShips = this.ships.filter((s) => s.owner === st.id)
  const myDreads = myShips.filter((s) => s.kind === 'dread')

  economy.minersDecide(this, st, myPlanets, myShips)
  if (this._warDecide(st, myPlanets, myShips, myDreads)) return
  economy.peacetimeDecide(this, st, myPlanets, myShips, myDreads)
}
```

Военная ветка (всё внутри `if (enemies.length) { ... return }` плюс вычисление `myPop`/`enemies`) временно становится методом `_warDecide(st, myPlanets, myShips, myDreads)` в `index.js`, возвращающим `true`, если государство в войне (переносится в warfare.js следующей задачей):

```js
_warDecide(st, myPlanets, myShips, myDreads) {
  const myPop = this.popOf(st)
  const enemies = this.states.filter((o) => o.id !== st.id && !o.pirate && this.isWar(st.id, o.id))
  if (!enemies.length) return false
  /* ... вся военная ветка из старого _stateDecide без изменений ... */
  return true
}
```

Обрати внимание: в старом коде `myPop` объявлялся до блока шахтёров, но используется только военной веткой и мирной (`broken && myPop > 0.9` — военная; мирная не использует) — перенос внутрь `_warDecide` поведения не меняет. Мирная ветка использует `myPlanets`, `myDreads`, `st` — они передаются параметрами.

- [ ] **Step 3: Делегаты остальных перенесённых методов**

```js
_populations(h) { economy.populations(this, h) }
_spawnAsteroid(orbitR, ang, res) { economy.spawnAsteroid(this, orbitR, ang, res) }
_asteroidsTick(h) { economy.asteroidsTick(this, h) }
```

Внимание: `_spawnAsteroid` вызывается в `reset()` в двух местах с разным числом аргументов — делегат с параметрами по умолчанию в `economy.spawnAsteroid` это сохраняет (вызов `this._spawnAsteroid(beltR + rand(-50, 50))` передаст `ang`/`res` как `undefined` — поэтому в делегате передавать аргументы явно только если они заданы:

```js
_spawnAsteroid(...args) { economy.spawnAsteroid(this, ...args) }
```

— используем вариант со спредом, он точно сохраняет дефолты.)

- [ ] **Step 4: Сборка и смоук**

Run: `npx vite build` — Expected: `✓ built`. В dev: население растёт, караваны летают, колонии основываются, шахтёры возят руду.

- [ ] **Step 5: Commit**

```bash
git add src/solar/civ
git commit -m "Рефакторинг: экономика в civ/economy.js, _stateDecide стал диспетчером"
```

---

### Task 10: Разбивка — warfare.js

**Files:**
- Create: `src/solar/civ/warfare.js`
- Modify: `src/solar/civ/index.js`

- [ ] **Step 1: Создать `warfare.js`**

Переносятся: `_warDecide` (из Task 9), `pvoCap`, `damagePvo`, `_launchWarhead`, логика `onWarheadHit` (хук остаётся в классе), `_planetDefense`, `_pvoIntercept`, `_planetFalls`.

```js
// Война: тактики, осады, десанты, баллистика, ПВО, ополчение, захват планет

import { clamp, rand, pick, dist, SHIP } from './constants.js'

export function warDecide(civ, st, myPlanets, myShips, myDreads) { /* тело _warDecide, this. → civ. */ }
export function pvoCap(p) { /* тело pvoCap (civ не нужен) */ }
export function damagePvo(civ, p, amount) { /* тело damagePvo */ }
export function launchWarhead(civ, from, to, st, kind = 'warhead') { /* тело _launchWarhead */ }
export function applyWarheadHit(civ, p, m) { /* тело onWarheadHit */ }
export function planetDefense(civ, h) { /* тело _planetDefense */ }
export function pvoIntercept(civ) { /* тело _pvoIntercept */ }
export function planetFalls(civ, p, conqueror, newPop) { /* тело _planetFalls */ }
```

Внутри `warDecide`: `this.pvoCap(...)` → локальный `pvoCap(...)`, `this._launchWarhead(...)` → `launchWarhead(civ, ...)`, прочие `this.` → `civ.`.

- [ ] **Step 2: Делегаты в классе**

```js
import * as warfare from './warfare.js'

_warDecide(st, myPlanets, myShips, myDreads) { return warfare.warDecide(this, st, myPlanets, myShips, myDreads) }
pvoCap(p) { return warfare.pvoCap(p) }
damagePvo(p, amount) { warfare.damagePvo(this, p, amount) }
_launchWarhead(from, to, st, kind) { warfare.launchWarhead(this, from, to, st, kind ?? 'warhead') }
onWarheadHit(p, m) { warfare.applyWarheadHit(this, p, m) }
_planetDefense(h) { warfare.planetDefense(this, h) }
_pvoIntercept() { warfare.pvoIntercept(this) }
_planetFalls(p, conqueror, newPop) { warfare.planetFalls(this, p, conqueror, newPop) }
```

- [ ] **Step 3: Сборка и смоук**

Run: `npx vite build` — Expected: `✓ built`. В dev: дождаться войны — залпы ракет летят, ПВО перехватывает, осады идут, десант захватывает планету.

- [ ] **Step 4: Commit**

```bash
git add src/solar/civ
git commit -m "Рефакторинг: война в civ/warfare.js"
```

---

### Task 11: Разбивка — ships.js и pirates.js

**Files:**
- Create: `src/solar/civ/ships.js`
- Create: `src/solar/civ/pirates.js`
- Modify: `src/solar/civ/index.js`

- [ ] **Step 1: Создать `pirates.js`**

Переносятся: `_pirateDecide` целиком и пиратская часть обработчика гибели (захват дредноута + грабёж транспорта/шахтёра — блок из цикла «гибель и трофеи» в `_ships`).

```js
// Пираты: решения вольницы, эвакуация базы, трофеи

import { rand, dist, SHIP } from './constants.js'

export function pirateDecide(civ, st) { /* тело _pirateDecide, this. → civ. */ }

// пиратские трофеи при гибели корабля; true — корабль обработан (захвачен/ограблен)
export function handlePirateLoot(civ, sh, killer) {
  if (!killer?.pirate) return false
  if (sh.kind === 'dread') {
    // пираты захватывают дредноут с половиной хп
    sh.owner = killer.id
    sh.hp = sh.maxHp / 2
    sh.mission = null
    sh.home = civ.planetsOf(killer)[0]?.id ?? sh.home
    civ.log(`🏴‍☠️ пираты захватили дредноут! теперь он их`)
    return true
  }
  if (sh.kind === 'transport' || sh.kind === 'miner') {
    const loot = sh.kind === 'transport' ? 45 : 20 + (sh.mission?.haul || 0)
    killer.credits += loot
    const victim = civ.stateById(sh.owner)
    if (victim) victim.pirateLosses += loot
    civ.log(`🏴‍☠️ пираты ограбили ${sh.kind === 'transport' ? 'караван' : 'шахтёра'} (+${loot} кр)`)
    return false // корабль погиб — взрыв рисуем как обычно
  }
  return false
}
```

- [ ] **Step 2: Создать `ships.js`**

Переносятся: `_spawnShip`, `_leadPoint`, `_steerPlanet`, `_formationSlot`, `_holdOrbit`, `_steer`, `_ships`, `_damageShip`, `_attackRun`, `_fire`.

```js
// Корабли: спавн, рулёжка, миссии, бой, гибель и трофеи

import { TAU, clamp, rand, dist, SHIP, nextId } from './constants.js'
import { handlePirateLoot } from './pirates.js'

export function spawnShip(civ, kind, st, fromPlanet) { /* тело _spawnShip */ }
export function leadPoint(sh, p) { /* тело _leadPoint (civ не нужен) */ }
export function steerPlanet(civ, sh, p, h) { /* тело _steerPlanet */ }
export function formationSlot(sh, group) { /* тело _formationSlot (civ не нужен) */ }
export function holdOrbit(civ, sh, p, R, h) { /* тело _holdOrbit */ }
export function steer(civ, sh, tx, ty, h, ignore = null) { /* тело _steer */ }
export function shipsTick(civ, h) { /* тело _ships */ }
export function damageShip(civ, sh, dmg, attacker) { /* тело _damageShip */ }
export function attackRun(civ, sh, target, h, power) { /* тело _attackRun */ }
export function fire(civ, from, to, dmg, heavy = false) { /* тело _fire */ }
```

В цикле «гибель и трофеи» внутри `shipsTick` пиратские ветки заменяются на:

```js
for (const sh of civ.ships) {
  if (sh.hp > 0 || sh.gone) continue
  const killer = sh.killer ? civ.stateById(sh.killer) : null
  if (handlePirateLoot(civ, sh, killer)) continue
  if (sh.kind === 'transport' && killer && !killer.pirate) {
    if (sh.mission?.type === 'trade') {
      /* ... существующий блок перехвата каравана без изменений ... */
    }
  }
  /* ... существующие взрывы дредноута/мелочи без изменений ... */
}
```

(Логика идентична старой: пиратский захват дредноута выходил из итерации через `continue`; грабёж транспорта/шахтёра НЕ выходил и падал в общий взрыв — `handlePirateLoot` возвращает `true` только для захваченного дредноута. Ветка перехвата каравана государством в старом коде шла после пиратской ветки с `else if (sh.kind === 'transport' && killer)`: пираты туда не попадали, поэтому добавляем условие `!killer.pirate`.)

- [ ] **Step 3: Делегаты в классе**

```js
import * as shipsMod from './ships.js'
import * as piratesMod from './pirates.js'

_spawnShip(kind, st, fromPlanet) { return shipsMod.spawnShip(this, kind, st, fromPlanet) }
_leadPoint(sh, p) { return shipsMod.leadPoint(sh, p) }
_steerPlanet(sh, p, h) { shipsMod.steerPlanet(this, sh, p, h) }
_formationSlot(sh, group) { return shipsMod.formationSlot(sh, group) }
_holdOrbit(sh, p, R, h) { shipsMod.holdOrbit(this, sh, p, R, h) }
_steer(sh, tx, ty, h, ignore = null) { shipsMod.steer(this, sh, tx, ty, h, ignore) }
_ships(h) { shipsMod.shipsTick(this, h) }
_damageShip(sh, dmg, attacker) { shipsMod.damageShip(this, sh, dmg, attacker) }
_attackRun(sh, target, h, power) { shipsMod.attackRun(this, sh, target, h, power) }
_fire(from, to, dmg, heavy = false) { shipsMod.fire(this, from, to, dmg, heavy) }
_pirateDecide(st) { piratesMod.pirateDecide(this, st) }
```

- [ ] **Step 4: Финальное состояние index.js**

В `index.js` остаются: импорты, класс `Civ` (конструктор, `reset`, `log`, `tick`, `updateVisual`, `_decisions`, `_stateDecide`-диспетчер, `_makeState`, `stateById`, `planetById`, `shipById`, `hostile`, `planetsOf`, `popOf`, делегаты, UI-справки `shipAt`/`astAt`/`shipLabel`/`missionText`/`summary`, хуки `onPlanetHurt`/`onPlanetLost`/`onWarheadHit`, отрисовка `drawUnder`/`drawOver`). Проверить, что в нём не осталось перенесённых тел.

- [ ] **Step 5: Сборка и смоук**

Run: `npx vite build` — Expected: `✓ built`. В dev: корабли летают, пираты грабят караваны, бои идут, ничего не падает в консоли.

- [ ] **Step 6: Commit**

```bash
git add src/solar/civ
git commit -m "Рефакторинг: корабли в civ/ships.js, пираты в civ/pirates.js"
```

---

### Task 12: Финальная приёмка этапа

**Files:** нет изменений кода (если приёмка не выявит регрессий).

- [ ] **Step 1: Полная сборка**

Run: `npx vite build` — Expected: `✓ built`, без предупреждений об импортах.

- [ ] **Step 2: Приёмка по спеке (dev-сервер, наблюдение)**

1. ×1: игра выглядит как до этапа (колонии, караваны, войны, пираты).
2. ×10 в течение ~2 минут реального времени: войны не учащаются аномально, ПВО перехватывает залпы, корабли не телепортируются, FPS приемлемый.
3. Скорости ×1/×2/×5/×10 и пауза переключаются.
4. Дипломатия (D) + клик по планете: обе панели рядом, закрываются независимо.
5. Лента событий не содержит «прекратило существование» с последующими войнами мёртвых государств; цвета живых государств различимы.

- [ ] **Step 3: Заметки**

Любые замеченные странности записать в `docs/superpowers/specs/2026-06-11-foundation-design.md` в раздел «Замечания приёмки» (создать в конце файла) — даже если они вне объёма этапа: это вход для этапа 2.

- [ ] **Step 4: Commit (если были заметки)**

```bash
git add docs/
git commit -m "Заметки приёмки этапа 1"
```

---

## Self-review план↔спека

- Спека §1 фикс-тик → Task 2. §2 скорости → Task 1. §3 модули → Tasks 7–11 (структура совпадает с таблицей спеки; `relKey` экспортируется из diplomacy.js, «части обработчика гибели» пиратов — `handlePirateLoot`). §4 багфиксы → Tasks 4 (призрак + колонизация), 5 (цвета), 6 (rel/warSince). §5 UI → Task 3. Критерии приёмки → Task 12.
- Типы/сигнатуры сверены: `_spawnShip` возвращает `ship | null` (Task 4) — все вызовы проверяют null до списания; делегаты сохраняют старые имена и арность (вариант со спредом для `_spawnAsteroid`).
- Плейсхолдеров вида «TBD» нет; комментарии `/* тело X */` — указание перенести существующее тело функции по правилу `this. → civ.`, исходник в репозитории.
