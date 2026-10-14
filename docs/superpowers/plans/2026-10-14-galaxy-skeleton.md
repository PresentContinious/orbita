# ОРБИТА 2 — каркас галактики: план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Новая ОРБИТА с нуля: галактика из 5–7 звёздных систем, мирная жизнь 8–10 цивилизаций с экономикой (содержание, долги, инвестиции) и интерфейс наблюдателя с плавным зумом от созвездия до системы.

**Architecture:** Чистая детерминированная симуляция в `src/sim/` (фиксированный шаг 0.1 с, генератор случайных чисел с зерном, никаких DOM/Pixi) → отрисовка PixiJS в `src/render/` только читает состояние → React-панели в `src/ui/` получают снимки 5 раз в секунду → `src/app/` связывает цикл, камеру, ввод. Каждый корабль — отдельная сущность; на дальнем зуме он лишь рисуется значком.

**Tech Stack:** TypeScript 5.9.3, Vite 6.4.3, Vitest 3.2.7, React 19.3.0, PixiJS 8.21.0, tsx 4.23.15, playwright-core 1.63.0 (с установленным Chrome).

**Spec:** `docs/superpowers/specs/2026-10-14-galaxy-skeleton-design.md` (дизайн) и `docs/vision.md` (видение). Исполнитель читает оба.

## Global Constraints

- Версии зависимостей закреплены точно: `pixi.js 8.21.0`, `react 19.3.0`, `react-dom 19.3.0`, `typescript 5.9.3`, `vite 6.4.3`, `vitest 3.2.7`, `@vitejs/plugin-react 4.7.0`, `tsx 4.23.15`, `playwright-core 1.63.0`, `@types/react 19.3.0`, `@types/react-dom 19.3.0`, `@types/node 22.20.4`.
- `src/sim/` не импортирует `pixi.js`, `react`, DOM; внутри `src/sim/` запрещены `Math.random()` и `Date.now()` — всё случайное только из `Rng`.
- Шаг симуляции `SIM_DT = 0.1` с; не больше 60 шагов за кадр; кадр длиннее 0.25 с обрезается; 1 год = 20 с.
- Кредиты меняются только функциями `earn` / `spend` / `buy` из `src/sim/economy.ts`.
- Каждый корабль — отдельная сущность симуляции; никакой агрегации «флот = число».
- Тексты интерфейса на русском; шрифты Russo One (заголовки) и JetBrains Mono (данные).
- Перед каждым коммитом — `npm run codemap` (обновляет `docs/CODEMAP.md`, карту кода для агентов); `scripts/codemap.mjs` уже лежит в репозитории, задача 1 его не удаляет.
- Каждая задача: сначала падающий тест, потом код; весь `npm test` зелёный перед коммитом; коммит в конце задачи с трейлером `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Работа идёт в ветке `galaxy`. На GitHub ничего не отправлять (`git push` запрещён без согласия владельца).
- Файлы с кириллицей сохраняются в UTF-8. В репозитории включён autocrlf — предупреждения git про CRLF нормальны.

## Review Focus

1. **Размер экрана от 1280×720 до 2560×1440:** вся галактика в кадре должна оставаться уровнем «галактика», а не «подлёт»; панели не перекрывают центр. Тест — задача 15 (`lodOf` при `fitZoom` для обоих размеров), снимок 1280×720 — задача 23.
2. **Бесконечная партия (часы на ×50):** журнал событий ограничен 500 записями, мёртвые корабли удаляются из массива, визуальные подсказки `fx` чистятся, в экономике нет `NaN`. Тесты — задачи 7 (удаление кораблей), 10 (лимит журнала), 12 (чистка `fx`), 14 (долгий прогон без `NaN`).
3. **Неудачные зёрна:** системы на одной линии, обитаемая система без нужного числа пригодных планет. Тесты — задача 4 (повторная генерация системы), задача 5 (50 зёрен + точки на одной прямой).
4. **Держава без дохода, кораблей и станций в банкротстве:** отчёт без `NaN`/`Infinity` в запасе казны, списание не зацикливается. Тесты — задачи 9 и 10.
5. **Фоновая вкладка и пауза:** после возврата во вкладку кадр длиной 30 с не даёт рывка, при паузе шагов нет. Тест — задача 15.

## Файлы

```
src/
  sim/                       — симуляция, без DOM
    config.ts                — все числа и справочники
    math.ts                  — Vec, TAU, clamp, lerp, dist
    rng.ts                   — генератор с зерном
    names.ts                 — имена планет, систем, держав
    spatial.ts               — пространственная сетка
    types.ts                 — типы мира
    system.ts                — генерация звёздной системы, орбиты
    galaxy.ts                — генерация галактики, коридоры, роли
    query.ts                 — запросы к миру (чья планета, столица, досягаемость)
    civ.ts                   — создание держав, рост населения, выбор колоний
    economy.ts               — журнал, цены, содержание, долги, конверты, отчёт
    events.ts                — журнал событий
    invest.ts                — стройки и исследования
    nav.ts                   — руление, обход звезды, врата и коридоры
    routing.ts               — пути по графу коридоров
    missions.ts              — задачи кораблей
    ships.ts                 — создание и шаг кораблей
    belts.ts                 — астероиды
    options.ts               — варианты покупок и их оценка
    bot.ts                   — временный экономический бот
    stress.ts                — нагрузочные корабли
    world.ts                 — createWorld, stepWorld
  render/
    camera.ts                — камера, зум к курсору, перелёты, уровни детализации
    textures.ts              — свечение, планеты, атлас значков
    territory.ts             — доли держав в системе
    galaxyLayer.ts           — коридоры, звёзды-значки, кольца долей, торговые трассы
    systemLayer.ts           — орбиты, звезда, планеты, пояса, врата
    shipsLayer.ts            — корабли и всплывающие «+N кр»
    starfield.ts             — фон
    hit.ts                   — что под курсором
    renderer.ts              — сборка слоёв
  app/
    main.tsx                 — запуск
    loop.ts                  — часы симуляции
    controller.ts            — состояние интерфейса, перелёты камеры
    input.ts                 — мышь и клавиатура
    director.ts              — слежка 🎥
  ui/
    format.ts, cards.ts, model.ts, snapshot.ts, store.ts
    Hud.tsx, Breadcrumbs.tsx, TimeControls.tsx, Minimap.tsx, Card.tsx,
    Toasts.tsx, CivBar.tsx, FeedDrawer.tsx, Tooltip.tsx, styles.css
scripts/
  balance.ts, stress.ts, smoke.ts
tests/
  helpers.ts, sim/*.test.ts, render/*.test.ts, app/*.test.ts, ui/*.test.ts
```

---

### Task 1: Каркас проекта

Старая игра остаётся в `main`; в ветке `galaxy` её файлы удаляются, ставится новый стек.

**Files:**
- Delete: `src/solar/`, `src/App.jsx`, `src/main.jsx`, `src/styles.css`, `tests/`, `vite.config.js`, `package-lock.json`
- Keep: `src/assets/sprites/` (понадобятся в подпроекте войны)
- Create: `package.json` (заменить), `tsconfig.json`, `vite.config.ts`, `index.html` (заменить), `src/app/main.tsx`

**Interfaces:**
- Consumes: —
- Produces: команды `npm test`, `npm run typecheck`, `npm run build`, `npm run dev`; папки `src/sim`, `src/render`, `src/app`, `src/ui`, `tests`, `scripts`.

- [ ] **Step 1: Остановить старый dev-сервер, если он запущен**

Если в фоне работает `npm run dev` старой игры (порт 5173) — остановить его (например, закрыть процесс через диспетчер или `npx kill-port 5173`), иначе Vite будет перезагружать удалённые файлы.

- [ ] **Step 2: Удалить старую игру из ветки**

```bash
git rm -r -q src/solar src/App.jsx src/main.jsx src/styles.css tests vite.config.js package-lock.json
rm -rf dist
```

- [ ] **Step 3: Записать `package.json`**

```json
{
  "name": "orbita",
  "private": true,
  "version": "2.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc --noEmit && vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "typecheck": "tsc --noEmit",
    "balance": "tsx scripts/balance.ts",
    "stress": "tsx scripts/stress.ts",
    "smoke": "tsx scripts/smoke.ts",
    "codemap": "node scripts/codemap.mjs"
  },
  "dependencies": {
    "pixi.js": "8.21.0",
    "react": "19.3.0",
    "react-dom": "19.3.0"
  },
  "devDependencies": {
    "@types/node": "22.20.4",
    "@types/react": "19.3.0",
    "@types/react-dom": "19.3.0",
    "@vitejs/plugin-react": "4.7.0",
    "playwright-core": "1.63.0",
    "tsx": "4.23.15",
    "typescript": "5.9.3",
    "vite": "6.4.3",
    "vitest": "3.2.7"
  }
}
```

- [ ] **Step 4: Записать `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "skipLibCheck": true,
    "isolatedModules": true,
    "resolveJsonModule": true,
    "types": ["vite/client", "node"]
  },
  "include": ["src", "tests", "scripts", "vite.config.ts"]
}
```

- [ ] **Step 5: Записать `vite.config.ts`**

```ts
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [react()],
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    passWithNoTests: true,
  },
})
```

- [ ] **Step 6: Записать `index.html`**

```html
<!doctype html>
<html lang="ru">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>ОРБИТА</title>
    <link rel="icon" href="data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>🪐</text></svg>" />
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=Russo+One&family=JetBrains+Mono:wght@400;500;700&display=swap" rel="stylesheet" />
    <style>
      html, body { margin: 0; height: 100%; overflow: hidden; background: #04060c; }
      #stage { position: fixed; inset: 0; }
      #hud { position: fixed; inset: 0; pointer-events: none; }
    </style>
  </head>
  <body>
    <div id="stage"></div>
    <div id="hud"></div>
    <script type="module" src="/src/app/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 7: Записать заглушку `src/app/main.tsx`**

```ts
// Точка входа. Заполняется в задаче 16.
document.getElementById('hud')!.textContent = 'ОРБИТА 2'
```

- [ ] **Step 8: Установить зависимости и проверить сборку**

Run: `npm install && npm run typecheck && npm run build && npm test`
Expected: установка без ошибок; `tsc` без ошибок; `vite build` создаёт `dist/`; `vitest` пишет «No test files found» и завершается кодом 0.

- [ ] **Step 9: Commit**

```bash
rm -rf dist
git add -A
git commit -m "Scaffold ОРБИТА 2: TypeScript, Vite, Vitest, React, PixiJS

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Числа, математика, генератор случайностей, имена

**Files:**
- Create: `src/sim/config.ts`, `src/sim/math.ts`, `src/sim/rng.ts`, `src/sim/names.ts`
- Test: `tests/sim/rng.test.ts`, `tests/sim/names.test.ts`

**Interfaces:**
- Consumes: —
- Produces:
  - `config.ts`: все константы ниже; типы `StarType`, `PlanetKind`, `ShipKind`, `Envelope`, `ResearchBranch`.
  - `math.ts`: `type Vec = { x: number; y: number }`, `TAU`, `clamp(v, lo, hi)`, `lerp(a, b, t)`, `dist(a: Vec, b: Vec)`, `ZERO: Readonly<Vec>`.
  - `rng.ts`: `interface Rng { next(); float(a, b); int(a, b); chance(p); pick(items); shuffle(items); fork(label) }`, `createRng(seed: number): Rng`, `hashString(s: string): number`.
  - `names.ts`: `genName(rng: Rng): string`, `uniqueName(rng: Rng, used: Set<string>): string`.

- [ ] **Step 1: Write the failing tests**

`tests/sim/rng.test.ts`:

```ts
import { describe, expect, test } from 'vitest'
import { createRng, hashString } from '../../src/sim/rng'

describe('rng', () => {
  test('одно зерно — одна и та же последовательность', () => {
    const a = createRng(4815)
    const b = createRng(4815)
    const xs = Array.from({ length: 5 }, () => a.next())
    const ys = Array.from({ length: 5 }, () => b.next())
    expect(xs).toEqual(ys)
  })

  test('разные зёрна дают разные числа', () => {
    expect(createRng(1).next()).not.toBe(createRng(2).next())
  })

  test('int включает обе границы и не выходит за них', () => {
    const r = createRng(7)
    const seen = new Set<number>()
    for (let i = 0; i < 2000; i++) {
      const v = r.int(2, 4)
      expect(v).toBeGreaterThanOrEqual(2)
      expect(v).toBeLessThanOrEqual(4)
      seen.add(v)
    }
    expect([...seen].sort()).toEqual([2, 3, 4])
  })

  test('float лежит в полуинтервале [a, b)', () => {
    const r = createRng(9)
    for (let i = 0; i < 2000; i++) {
      const v = r.float(5, 6)
      expect(v).toBeGreaterThanOrEqual(5)
      expect(v).toBeLessThan(6)
    }
  })

  test('fork не зависит от того, сколько чисел уже взяли', () => {
    const a = createRng(42)
    const b = createRng(42)
    b.next()
    b.next()
    expect(a.fork('galaxy').next()).toBe(b.fork('galaxy').next())
    expect(a.fork('galaxy').next()).not.toBe(a.fork('civs').next())
  })

  test('pick из пустого списка — ошибка, а не undefined', () => {
    expect(() => createRng(1).pick([])).toThrow()
  })

  test('shuffle переставляет те же элементы', () => {
    expect(createRng(3).shuffle([1, 2, 3, 4, 5]).sort()).toEqual([1, 2, 3, 4, 5])
  })

  test('hashString различает строки и стабилен', () => {
    expect(hashString('galaxy')).toBe(hashString('galaxy'))
    expect(hashString('a')).not.toBe(hashString('b'))
  })
})
```

`tests/sim/names.test.ts`:

```ts
import { expect, test } from 'vitest'
import { uniqueName } from '../../src/sim/names'
import { createRng } from '../../src/sim/rng'

test('uniqueName не повторяется на 300 вызовах', () => {
  const r = createRng(5)
  const used = new Set<string>()
  const names = Array.from({ length: 300 }, () => uniqueName(r, used))
  expect(new Set(names).size).toBe(300)
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/sim`
Expected: FAIL — `Failed to resolve import "../../src/sim/rng"`.

- [ ] **Step 3: Write `src/sim/math.ts`**

```ts
export type Vec = { x: number; y: number }

export const TAU = Math.PI * 2
export const ZERO: Readonly<Vec> = Object.freeze({ x: 0, y: 0 })

export const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v))
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t
export const dist = (a: Vec, b: Vec): number => Math.hypot(a.x - b.x, a.y - b.y)
```

- [ ] **Step 4: Write `src/sim/rng.ts`**

```ts
// Генератор случайных чисел с зерном (mulberry32): одно зерно — одна и та же история.
// Внутри симуляции Math.random() запрещён — только Rng.

export interface Rng {
  /** [0, 1) */
  next(): number
  /** [a, b) */
  float(a: number, b: number): number
  /** целое в [a, b] включительно */
  int(a: number, b: number): number
  chance(p: number): boolean
  pick<T>(items: readonly T[]): T
  /** перемешивает массив на месте и возвращает его */
  shuffle<T>(items: T[]): T[]
  /** независимый поток: зависит только от исходного зерна и метки */
  fork(label: string): Rng
}

export function hashString(s: string): number {
  let h = 2166136261 >>> 0
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619) >>> 0
  }
  return h
}

export function createRng(seed: number): Rng {
  const origin = seed >>> 0
  let a = origin
  const next = (): number => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  return {
    next,
    float: (lo, hi) => lo + next() * (hi - lo),
    int: (lo, hi) => lo + Math.floor(next() * (hi - lo + 1)),
    chance: (p) => next() < p,
    pick: (items) => {
      if (items.length === 0) throw new Error('pick: пустой список')
      return items[Math.floor(next() * items.length)]
    },
    shuffle: (items) => {
      for (let i = items.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1))
        const tmp = items[i]
        items[i] = items[j]
        items[j] = tmp
      }
      return items
    },
    fork: (label) => createRng((origin ^ hashString(label)) >>> 0),
  }
}
```

- [ ] **Step 5: Write `src/sim/names.ts`**

```ts
import type { Rng } from './rng'

// Слоги из старой ОРБИТЫ
const SYL_A = ['Ал', 'Ве', 'Га', 'Дра', 'Зе', 'Ка', 'Ли', 'Ма', 'Не', 'Ор', 'Па', 'Ра', 'Се', 'Та', 'Фе', 'Эр', 'Юна', 'Ис']
const SYL_B = ['ра', 'но', 'ви', 'та', 'лу', 'ми', 'до', 'кс', 'ри', 'на', 'го', 'те', 'ла', 'зо']
const SYL_C = ['с', 'н', 'р', 'м', 'й', 'кс', 'нт', 'рий', 'дон', 'тис', 'лла', 'нда', 'ра', 'я']

export function genName(rng: Rng): string {
  let n = rng.pick(SYL_A) + rng.pick(SYL_B)
  if (rng.chance(0.6)) n += rng.pick(SYL_C)
  return n
}

/** имя, которого ещё нет в used; добавляет его туда */
export function uniqueName(rng: Rng, used: Set<string>): string {
  for (let i = 0; i < 50; i++) {
    const n = genName(rng)
    if (!used.has(n)) {
      used.add(n)
      return n
    }
  }
  const n = `${genName(rng)}-${used.size + 1}`
  used.add(n)
  return n
}
```

- [ ] **Step 6: Write `src/sim/config.ts`**

```ts
import type { SystemRole } from './types'

// ---------- время ----------
export const SIM_DT = 0.1
export const YEAR_SECONDS = 20
export const MAX_STEPS_PER_FRAME = 60
export const MAX_FRAME_DT = 0.25
/** скорости времени: клавиши 1–4 */
export const SPEEDS = [1, 5, 20, 50] as const

// ---------- галактика ----------
export const GALAXY = {
  minSystems: 5,
  maxSystems: 7,
  ellipseW: 100_000,
  ellipseH: 60_000,
  minDist: 22_000,
  maxDegree: 4,
  transitMin: 60,
  transitMax: 120,
  placementAttempts: 4000,
}

export const CIVS = { min: 8, max: 10, startPopMin: 1.6, startPopMax: 2.4, startTreasury: 100 }

// ---------- звёзды и планеты ----------
export type StarType = 'G' | 'K' | 'F' | 'M' | 'B'
export const STAR_TYPES: Record<StarType, { radius: number; lum: number; color: number }> = {
  G: { radius: 60, lum: 1.0, color: 0xffe9a8 },
  K: { radius: 50, lum: 0.6, color: 0xffb27a },
  F: { radius: 66, lum: 1.6, color: 0xfff4e0 },
  M: { radius: 36, lum: 0.25, color: 0xff7a5c },
  B: { radius: 90, lum: 4.0, color: 0x9ec8ff },
}

export const ORBIT = {
  firstMul: 6,
  firstMin: 150,
  firstMax: 250,
  gapMin: 350,
  gapMax: 600,
  /** в зоне жизни обитаемых систем орбиты теснее — чтобы хватило пригодных планет */
  gapHzMax: 450,
  gapGrowth: 0.04,
  periodBase: 120,
  periodRef: 700,
  edgePad: 600,
  gatePad: 200,
}

/** зона жизни: [inner, outer] · √светимости */
export const HZ = { inner: 900, outer: 2800, tempRef: 1500 }

export type PlanetKind = 'rocky' | 'ice' | 'gas' | 'dwarf'
export const PLANET_KINDS: Record<PlanetKind, { rMin: number; rMax: number; hab: { hot: number; temperate: number; cold: number } }> = {
  rocky: { rMin: 14, rMax: 24, hab: { hot: 0.5, temperate: 1.3, cold: 0.6 } },
  ice: { rMin: 26, rMax: 36, hab: { hot: 0.6, temperate: 1.0, cold: 0.8 } },
  gas: { rMin: 36, rMax: 48, hab: { hot: 0.3, temperate: 0.45, cold: 0.4 } },
  dwarf: { rMin: 10, rMax: 14, hab: { hot: 0, temperate: 0, cold: 0 } },
}

export const ROLE_GEN: Record<
  SystemRole,
  { stars: StarType[]; planetsMin: number; planetsMax: number; beltsMin: number; beltsMax: number; kinds: Partial<Record<PlanetKind, number>> }
> = {
  inhabited: { stars: ['G', 'K', 'F'], planetsMin: 7, planetsMax: 10, beltsMin: 1, beltsMax: 2, kinds: { rocky: 0.45, ice: 0.25, gas: 0.2, dwarf: 0.1 } },
  ore: { stars: ['K', 'M', 'B', 'G'], planetsMin: 6, planetsMax: 8, beltsMin: 2, beltsMax: 3, kinds: { gas: 0.5, ice: 0.2, dwarf: 0.2, rocky: 0.1 } },
  pit: { stars: ['M', 'K'], planetsMin: 3, planetsMax: 5, beltsMin: 3, beltsMax: 3, kinds: { dwarf: 0.6, rocky: 0.4 } },
  nebula: { stars: ['B', 'F', 'M'], planetsMin: 2, planetsMax: 4, beltsMin: 1, beltsMax: 1, kinds: { gas: 0.4, ice: 0.3, dwarf: 0.3 } },
}

export const BELT = { asteroidsMin: 16, asteroidsMax: 30, oreMin: 40, oreMax: 120, sizeMin: 3, sizeMax: 7, width: 120, regrowEvery: 30, outerGap: 300 }

// ---------- население ----------
export const POP = { growth: 0.012, capPerRadius: 0.5, settlers: 0.5, capitalReserve: 3 }

// ---------- корабли и полёты ----------
export type ShipKind = 'colony' | 'caravan' | 'miner'
export const SHIP_KINDS: Record<ShipKind, { length: number; speed: number; accel: number; upkeep: number }> = {
  colony: { length: 6, speed: 70, accel: 40, upkeep: 0.05 },
  caravan: { length: 6, speed: 80, accel: 50, upkeep: 0.05 },
  miner: { length: 5, speed: 70, accel: 40, upkeep: 0.04 },
}

export const MOVE = {
  starSafetyMul: 3,
  waypointPush: 1.2,
  arriveRadius: 150,
  dockPad: 20,
  frameMatchMul: 3,
  frameMatchPad: 200,
  gateDock: 40,
  separation: 14,
  separationForce: 30,
  gateInset: 0.97,
  /** оценка времени пересечения промежуточной системы при поиске пути, с */
  crossingCost: 60,
}

// ---------- экономика ----------
export type Envelope = 'expand' | 'develop' | 'trade' | 'reserve'
export const ENVELOPE_SHARES: Record<Envelope, number> = { expand: 0.35, develop: 0.35, trade: 0.2, reserve: 0.1 }

export const ECON = {
  taxPerPop: 0.12,
  infraTax: 0.3,
  infraCap: 0.1,
  crisisTax: 0.9,
  colonyBase: 160,
  colonyPerPlanet: 50,
  colonyOtherSystem: 1.4,
  colonyRefund: 0.5,
  caravanPrice: 50,
  minerPrice: 45,
  stationPrice: 120,
  stationBuild: 40,
  stationUpkeep: 0.05,
  stationIncome: 0.25,
  stationOreMul: 2,
  /** станция ставится на свободную планету с пригодностью ниже этого порога */
  stationMaxHab: 0.5,
  infraPrice: [120, 200, 320],
  infraBuild: [40, 60, 80],
  portPrice: 200,
  portBuild: 60,
  portTradeMul: 1.4,
  shipyardPrice: 250,
  shipyardBuild: 80,
  shipyardPriceMul: 0.75,
  shipyardUpkeepMul: 0.7,
  researchPrice: [300, 500, 800],
  researchTime: [90, 120, 150],
  adminBase: 0.1,
  adminPerPlanet: 0.05,
  adminOtherSystem: 1.5,
  tradeBase: 6,
  tradeK: 0.6,
  tradeMax: 30,
  tradePartnerShare: 0.5,
  tradeMaxHops: 2,
  minerCargo: 20,
  orePrice: 0.8,
  emaWindow: 60,
  reserveMin: 0.5,
  runwayMin: 300,
  deficitToCrisis: 45,
  crisisReserve: -0.5,
  recoverAfter: 30,
  bankruptEvery: 15,
  decommissionRefund: 0.25,
  envelopeCapMul: 1.5,
}

export type ResearchBranch = 'logistics' | 'admin' | 'agro' | 'engines'
export const RESEARCH: Record<ResearchBranch, { label: string; perLevel: number }> = {
  logistics: { label: 'Логистика', perLevel: 0.1 },
  admin: { label: 'Администрация', perLevel: 0.15 },
  agro: { label: 'Агротех', perLevel: 0.05 },
  engines: { label: 'Двигатели', perLevel: 0.15 },
}
export const RESEARCH_BRANCHES: ResearchBranch[] = ['logistics', 'admin', 'agro', 'engines']

// ---------- бот ----------
export const BOT = { decideMin: 4, decideMax: 6, minerBase: 1, minerMax: 4, colonyMaturity: 0.55 }

// ---------- оформление и журнал ----------
export const PALETTE = [0x5da8ff, 0xff8a5c, 0x7dd87d, 0xe0c060, 0xc98bff, 0x5ce0d8, 0xff8fc8, 0xa8c84d, 0x8aa0ff, 0xffd07a]
export const EVENTS = { groupWindow: 20, maxLog: 500, fxLife: 5 }
```

`config.ts` ссылается на тип `SystemRole` из `types.ts`, который появится в задаче 4. Чтобы проект компилировался уже сейчас, создай временный `src/sim/types.ts`:

```ts
// Временный файл; полностью заменяется в задаче 4
export type SystemRole = 'inhabited' | 'ore' | 'pit' | 'nebula'
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `npx vitest run tests/sim && npm run typecheck`
Expected: PASS (9 тестов), `tsc` без ошибок.

- [ ] **Step 8: Commit**

```bash
git add src/sim tests/sim
git commit -m "sim: config, math, seeded rng, names

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Пространственная сетка

Нужна для поиска соседей без перебора всех кораблей (раздел 14 спеки: 2 000 кораблей).

**Files:**
- Create: `src/sim/spatial.ts`
- Test: `tests/sim/spatial.test.ts`

**Interfaces:**
- Consumes: —
- Produces: `class SpatialGrid { constructor(cellSize: number); clear(): void; insert(id: number, x: number, y: number): void; query(x: number, y: number, r: number, out: number[]): number[] }` — `query` возвращает кандидатов из клеток, пересекающих квадрат вокруг точки; точное расстояние проверяет вызывающий.

- [ ] **Step 1: Write the failing test**

`tests/sim/spatial.test.ts`:

```ts
import { describe, expect, test } from 'vitest'
import { createRng } from '../../src/sim/rng'
import { SpatialGrid } from '../../src/sim/spatial'

describe('SpatialGrid', () => {
  const rng = createRng(11)
  const pts = Array.from({ length: 300 }, () => ({ x: rng.float(-2000, 2000), y: rng.float(-2000, 2000) }))

  test('все точки в радиусе попадают в кандидаты, далёкие — нет', () => {
    const g = new SpatialGrid(50)
    pts.forEach((p, i) => g.insert(i, p.x, p.y))
    const out: number[] = []
    for (let q = 0; q < 20; q++) {
      const c = pts[q * 7]
      const r = 120
      const got = new Set(g.query(c.x, c.y, r, out))
      pts.forEach((p, i) => {
        const d = Math.hypot(p.x - c.x, p.y - c.y)
        if (d <= r) expect(got.has(i)).toBe(true)
        if (d > r + 2 * 50 * Math.SQRT2) expect(got.has(i)).toBe(false)
      })
    }
  })

  test('отрицательные координаты попадают в свои клетки', () => {
    const g = new SpatialGrid(50)
    g.insert(1, -10, -10)
    g.insert(2, 10, 10)
    expect(g.query(-10, -10, 5, []).sort()).toEqual([1, 2])
    expect(g.query(-500, -500, 5, [])).toEqual([])
  })

  test('clear очищает сетку, повторное заполнение работает', () => {
    const g = new SpatialGrid(50)
    g.insert(1, 0, 0)
    g.clear()
    expect(g.query(0, 0, 10, [])).toEqual([])
    g.insert(3, 0, 0)
    expect(g.query(0, 0, 10, [])).toEqual([3])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/sim/spatial.test.ts`
Expected: FAIL — cannot resolve `../../src/sim/spatial`.

- [ ] **Step 3: Write `src/sim/spatial.ts`**

```ts
// Пространственная сетка: поиск соседей без перебора всех кораблей.
// Массивы клеток переиспользуются между шагами — без лишних аллокаций.
export class SpatialGrid {
  private readonly cells = new Map<number, number[]>()
  private readonly used: number[][] = []

  constructor(readonly cellSize: number) {}

  private key(cx: number, cy: number): number {
    return (cx + 0x8000) * 0x10000 + (cy + 0x8000)
  }

  clear(): void {
    for (const c of this.used) c.length = 0
    this.used.length = 0
  }

  insert(id: number, x: number, y: number): void {
    const k = this.key(Math.floor(x / this.cellSize), Math.floor(y / this.cellSize))
    let c = this.cells.get(k)
    if (!c) {
      c = []
      this.cells.set(k, c)
    }
    if (c.length === 0) this.used.push(c)
    c.push(id)
  }

  /** кандидаты из клеток вокруг (x, y) в радиусе r; точное расстояние проверяет вызывающий */
  query(x: number, y: number, r: number, out: number[]): number[] {
    out.length = 0
    const s = this.cellSize
    const x0 = Math.floor((x - r) / s)
    const x1 = Math.floor((x + r) / s)
    const y0 = Math.floor((y - r) / s)
    const y1 = Math.floor((y + r) / s)
    for (let cx = x0; cx <= x1; cx++) {
      for (let cy = y0; cy <= y1; cy++) {
        const c = this.cells.get(this.key(cx, cy))
        if (c) for (const id of c) out.push(id)
      }
    }
    return out
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/sim/spatial.test.ts`
Expected: PASS (3 теста).

- [ ] **Step 5: Commit**

```bash
git add src/sim/spatial.ts tests/sim/spatial.test.ts
git commit -m "sim: spatial grid for neighbour queries

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Типы мира и генерация звёздной системы

**Files:**
- Create: `src/sim/types.ts` (заменить временный), `src/sim/system.ts`
- Test: `tests/sim/system.test.ts`

**Interfaces:**
- Consumes: `config.ts`, `math.ts`, `rng.ts`, `names.ts`, `spatial.ts` (только тип).
- Produces:
  - Типы: `Vec`, `Zone`, `SystemRole`, `PlanetLook`, `Build`, `Planet`, `Belt`, `Asteroid`, `Gate`, `Star`, `StarSystem`, `Corridor`, `Galaxy`, `Mission`, `Transit`, `Ship`, `Stage`, `IncomeSource`, `ExpenseCat`, `Ledger`, `CivEconomy`, `CivProject`, `ResearchJob`, `Civ`, `GameEvent`, `Fx`, `World` (точные поля — в коде шага 3).
  - `periodOf(orbit): number`, `zoneOf(orbit, lum): Zone`, `tempKOf(orbit, lum): number`, `planetPos(o: Orbiting, t): Vec`, `planetVel(o: Orbiting, t): Vec` где `Orbiting = { orbit: number; period: number; phase: number }`, `makeLook(rng, kind): PlanetLook`, `habitableCount(sys): number`, `makeAsteroid(rng, id, beltIndex, belt): Asteroid`, `generateSystem(rng, id, role, civSlots, pos, usedNames): StarSystem`.

- [ ] **Step 1: Write the failing test**

`tests/sim/system.test.ts`:

```ts
import { describe, expect, test } from 'vitest'
import { ORBIT, PLANET_KINDS, STAR_TYPES } from '../../src/sim/config'
import { createRng } from '../../src/sim/rng'
import { generateSystem, periodOf, planetPos, planetVel, tempKOf, zoneOf } from '../../src/sim/system'
import type { SystemRole } from '../../src/sim/types'

const ROLES: SystemRole[] = ['inhabited', 'ore', 'pit', 'nebula']

describe('орбиты', () => {
  test('период по Кеплеру: 700 → 120 с, 2800 → 960 с', () => {
    expect(periodOf(700)).toBeCloseTo(120)
    expect(periodOf(2800)).toBeCloseTo(960)
  })

  test('зоны: 900 и 2800 — границы зоны жизни при L=1, при L=4 вдвое дальше', () => {
    expect(zoneOf(899, 1)).toBe('hot')
    expect(zoneOf(900, 1)).toBe('temperate')
    expect(zoneOf(2800, 1)).toBe('temperate')
    expect(zoneOf(2801, 1)).toBe('cold')
    expect(zoneOf(1799, 4)).toBe('hot')
    expect(zoneOf(1800, 4)).toBe('temperate')
  })

  test('температура 288 K на опорной орбите и не ниже 3 K вдали', () => {
    expect(tempKOf(1500, 1)).toBeCloseTo(288)
    expect(tempKOf(1e12, 1)).toBe(3)
  })

  test('позиция — функция времени, через период возвращается', () => {
    const p = { orbit: 1000, period: 200, phase: 0.5 }
    const a = planetPos(p, 0)
    expect(a.x).toBeCloseTo(Math.cos(0.5) * 1000)
    expect(a.y).toBeCloseTo(Math.sin(0.5) * 1000)
    const b = planetPos(p, 200)
    expect(b.x).toBeCloseTo(a.x)
    expect(b.y).toBeCloseTo(a.y)
  })

  test('скорость перпендикулярна радиусу, модуль 2πr/T', () => {
    const p = { orbit: 1000, period: 200, phase: 1 }
    const pos = planetPos(p, 3)
    const v = planetVel(p, 3)
    expect(pos.x * v.x + pos.y * v.y).toBeCloseTo(0, 6)
    expect(Math.hypot(v.x, v.y)).toBeCloseTo((2 * Math.PI * 1000) / 200)
  })
})

describe('generateSystem', () => {
  test('обитаемой системе хватает пригодных планет на всех и ещё на одну', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const sys = generateSystem(createRng(seed), 0, 'inhabited', 3, { x: 0, y: 0 }, new Set())
      expect(sys.planets.filter((p) => p.habitability >= 1).length).toBeGreaterThanOrEqual(4)
    }
  })

  test('орбиты растут с зазором ≥ 350, первая не ближе 6 радиусов звезды', () => {
    for (const role of ROLES) {
      for (let seed = 1; seed <= 15; seed++) {
        const sys = generateSystem(createRng(seed), 1, role, role === 'inhabited' ? 2 : 0, { x: 0, y: 0 }, new Set())
        expect(sys.planets[0].orbit).toBeGreaterThanOrEqual(sys.star.radius * ORBIT.firstMul)
        for (let i = 1; i < sys.planets.length; i++) {
          expect(sys.planets[i].orbit - sys.planets[i - 1].orbit).toBeGreaterThanOrEqual(ORBIT.gapMin - 1)
        }
      }
    }
  })

  test('радиус и пригодность планеты — из таблицы её типа и зоны', () => {
    const sys = generateSystem(createRng(3), 2, 'ore', 0, { x: 0, y: 0 }, new Set())
    for (const p of sys.planets) {
      const k = PLANET_KINDS[p.kind]
      expect(p.radius).toBeGreaterThanOrEqual(k.rMin)
      expect(p.radius).toBeLessThanOrEqual(k.rMax)
      expect(p.habitability).toBe(k.hab[p.zone])
      expect(p.zone).toBe(zoneOf(p.orbit, STAR_TYPES[sys.star.type].lum))
    }
  })

  test('радиус системы — за последней орбитой и поясом с запасом 600', () => {
    for (let seed = 1; seed <= 15; seed++) {
      const sys = generateSystem(createRng(seed), 0, 'pit', 0, { x: 0, y: 0 }, new Set())
      const edge = Math.max(...sys.planets.map((p) => p.orbit), ...sys.belts.map((b) => b.orbit + b.width / 2))
      expect(sys.radius).toBe(Math.round(edge + ORBIT.edgePad))
    }
  })

  test('астероиды лежат в своих поясах, на старте у каждого есть руда', () => {
    const sys = generateSystem(createRng(8), 0, 'ore', 0, { x: 0, y: 0 }, new Set())
    expect(sys.asteroids.length).toBe(sys.asteroidTarget)
    for (const a of sys.asteroids) {
      const belt = sys.belts[a.belt]
      expect(Math.abs(a.orbit - belt.orbit)).toBeLessThanOrEqual(belt.width / 2)
      expect(a.ore).toBeGreaterThan(0)
    }
  })

  test('одно зерно — одна и та же система', () => {
    const a = generateSystem(createRng(77), 0, 'inhabited', 2, { x: 5, y: 6 }, new Set())
    const b = generateSystem(createRng(77), 0, 'inhabited', 2, { x: 5, y: 6 }, new Set())
    expect(JSON.stringify(a)).toBe(JSON.stringify(b))
  })

  test('если пригодных планет не хватает, систему перегенерируют, а не падают', () => {
    // 3 цивилизации требуют 4 пригодных; на 200 зёрнах генерация ни разу не бросает исключение
    for (let seed = 100; seed < 300; seed++) {
      expect(() => generateSystem(createRng(seed), 0, 'inhabited', 3, { x: 0, y: 0 }, new Set())).not.toThrow()
    }
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/sim/system.test.ts`
Expected: FAIL — cannot resolve `../../src/sim/system`.

- [ ] **Step 3: Write `src/sim/types.ts`**

```ts
import type { Envelope, PlanetKind, ResearchBranch, ShipKind, StarType } from './config'
import type { Vec } from './math'
import type { Rng } from './rng'
import type { SpatialGrid } from './spatial'

export type { Vec }
export type Zone = 'hot' | 'temperate' | 'cold'
export type SystemRole = 'inhabited' | 'ore' | 'pit' | 'nebula'

export interface PlanetLook {
  colors: [string, string, string]
  glow: string
  banded: boolean
  rings: boolean
}

export interface Build {
  kind: 'infra' | 'station'
  level: number
  remaining: number
  total: number
}

export interface Planet {
  id: string
  systemId: number
  name: string
  kind: PlanetKind
  radius: number
  orbit: number
  period: number
  phase: number
  zone: Zone
  habitability: number
  tempK: number
  owner: number | null
  /** тысячи жителей */
  pop: number
  infra: number
  station: boolean
  build: Build | null
  look: PlanetLook
}

export interface Belt {
  orbit: number
  width: number
}

export interface Asteroid {
  id: number
  belt: number
  orbit: number
  period: number
  phase: number
  ore: number
  size: number
}

export interface Gate {
  corridorId: number
  toSystem: number
  /** относительно звезды своей системы */
  pos: Vec
}

export interface Star {
  type: StarType
  radius: number
  lum: number
  color: number
}

export interface StarSystem {
  id: number
  name: string
  role: SystemRole
  civSlots: number
  /** положение звезды в галактике */
  pos: Vec
  star: Star
  radius: number
  planets: Planet[]
  belts: Belt[]
  asteroids: Asteroid[]
  asteroidTarget: number
  nextAsteroid: number
  regrowT: number
  gates: Gate[]
}

export interface Corridor {
  id: number
  a: number
  b: number
  /** расстояние между вратами */
  length: number
  /** время перелёта, с */
  transit: number
}

export interface Galaxy {
  systems: StarSystem[]
  corridors: Corridor[]
}

export type Mission =
  | { type: 'colonize'; planetId: string; settlers: number; price: number }
  | { type: 'trade'; a: string; b: string; leg: 0 | 1 }
  | { type: 'mine'; phase: 'out' | 'back'; asteroidId: number | null; cargo: number; idleT: number }
  | { type: 'return'; planetId: string }

export interface Transit {
  corridorId: number
  from: number
  to: number
  elapsed: number
  duration: number
}

export interface Ship {
  id: number
  kind: ShipKind
  owner: number
  price: number
  systemId: number
  /** относительно звезды текущей системы */
  pos: Vec
  prevPos: Vec
  vel: Vec
  /** системы, которые ещё предстоит пройти; следующая — route[0] */
  route: number[]
  transit: Transit | null
  mission: Mission
  alive: boolean
}

export type Stage = 'ok' | 'deficit' | 'crisis' | 'bankrupt'
export type IncomeSource = 'tax' | 'trade' | 'tradePartner' | 'mining' | 'station' | 'refund'
export type ExpenseCat = 'colony' | 'caravan' | 'miner' | 'station' | 'infra' | 'port' | 'shipyard' | 'research' | 'upkeep' | 'admin'

export interface Ledger {
  start: number
  income: Record<IncomeSource, number>
  expense: Record<ExpenseCat, number>
}

export interface CivEconomy {
  ledger: Ledger
  envelopes: Record<Envelope, number>
  stage: Stage
  /** скользящие средние за минуту, кр/с */
  grossEma: number
  upkeepEma: number
  tradeEma: number
  /** суммы за текущий шаг */
  earnedStep: number
  upkeepStep: number
  tradeStep: number
  deficitSince: number | null
  positiveSince: number | null
  lastDecommission: number
}

export interface CivProject {
  kind: 'port' | 'shipyard'
  remaining: number
  total: number
}

export interface ResearchJob {
  branch: ResearchBranch
  level: number
  remaining: number
  total: number
}

export interface Civ {
  id: number
  name: string
  color: number
  capital: string
  homeSystem: number
  treasury: number
  eco: CivEconomy
  research: Record<ResearchBranch, number>
  researchJob: ResearchJob | null
  port: boolean
  shipyard: boolean
  project: CivProject | null
  nextDecision: number
}

export interface GameEvent {
  id: number
  t: number
  kind: string
  pri: 0 | 1 | 2
  text: string
  civs: number[]
  at: { system: number; planet?: string }
  count: number
}

/** подсказка для отрисовки: «+N кр» над местом доставки */
export interface Fx {
  kind: 'income'
  t: number
  systemId: number
  x: number
  y: number
  amount: number
}

export interface World {
  seed: number
  t: number
  tick: number
  galaxy: Galaxy
  civs: Civ[]
  ships: Ship[]
  events: GameEvent[]
  fx: Fx[]
  /** по сетке на систему, индексы — позиции в ships */
  grids: SpatialGrid[]
  rng: Rng
  nextId: number
  planets: Map<string, Planet>
}
```

- [ ] **Step 4: Write `src/sim/system.ts`**

```ts
import { BELT, HZ, ORBIT, PLANET_KINDS, ROLE_GEN, STAR_TYPES, type PlanetKind } from './config'
import { TAU } from './math'
import { uniqueName } from './names'
import type { Rng } from './rng'
import type { Asteroid, Belt, Planet, PlanetLook, StarSystem, SystemRole, Vec, Zone } from './types'

export type Orbiting = { orbit: number; period: number; phase: number }

export function periodOf(orbit: number): number {
  return ORBIT.periodBase * Math.pow(orbit / ORBIT.periodRef, 1.5)
}

export function zoneOf(orbit: number, lum: number): Zone {
  const s = Math.sqrt(lum)
  if (orbit < HZ.inner * s) return 'hot'
  if (orbit > HZ.outer * s) return 'cold'
  return 'temperate'
}

export function tempKOf(orbit: number, lum: number): number {
  return Math.max(3, 288 * Math.sqrt((HZ.tempRef * Math.sqrt(lum)) / orbit))
}

export function planetPos(o: Orbiting, t: number): Vec {
  const a = o.phase + (TAU * t) / o.period
  return { x: Math.cos(a) * o.orbit, y: Math.sin(a) * o.orbit }
}

export function planetVel(o: Orbiting, t: number): Vec {
  const w = TAU / o.period
  const a = o.phase + w * t
  return { x: -Math.sin(a) * o.orbit * w, y: Math.cos(a) * o.orbit * w }
}

function pickWeighted(rng: Rng, weights: Partial<Record<PlanetKind, number>>): PlanetKind {
  const entries = Object.entries(weights) as [PlanetKind, number][]
  let r = rng.next() * entries.reduce((s, [, w]) => s + w, 0)
  for (const [k, w] of entries) {
    r -= w
    if (r < 0) return k
  }
  return entries[entries.length - 1][0]
}

function hsl(h: number, s: number, l: number): string {
  return `hsl(${Math.round(h)}, ${Math.round(s)}%, ${Math.round(l)}%)`
}

/** палитра планеты — перенесена из старой ОРБИТЫ */
export function makeLook(rng: Rng, kind: PlanetKind): PlanetLook {
  if (kind === 'rocky') {
    const h = rng.chance(0.5) ? rng.float(10, 50) : rng.float(180, 260)
    const s = rng.float(18, 55)
    return { colors: [hsl(h, s, 78), hsl(h, s + 8, 48), hsl(h, s, 20)], glow: `hsla(${Math.round(h)}, 70%, 65%, 0.55)`, banded: false, rings: false }
  }
  if (kind === 'ice') {
    const h = rng.float(165, 230)
    return { colors: [hsl(h, 65, 85), hsl(h, 55, 55), hsl(h, 60, 22)], glow: `hsla(${Math.round(h)}, 75%, 65%, 0.5)`, banded: rng.chance(0.3), rings: false }
  }
  if (kind === 'gas') {
    const h = rng.chance(0.7) ? rng.float(20, 55) : rng.float(260, 320)
    return { colors: [hsl(h, 55, 82), hsl(h, 50, 55), hsl(h, 55, 24)], glow: `hsla(${Math.round(h)}, 65%, 62%, 0.5)`, banded: true, rings: rng.chance(0.4) }
  }
  const h = rng.float(20, 40)
  return { colors: [hsl(h, 10, 62), hsl(h, 12, 38), hsl(h, 10, 16)], glow: 'hsla(35, 20%, 60%, 0.35)', banded: false, rings: false }
}

export function habitableCount(sys: StarSystem): number {
  return sys.planets.filter((p) => p.habitability >= 1).length
}

export function makeAsteroid(rng: Rng, id: number, belt: number, b: Belt): Asteroid {
  const orbit = b.orbit + rng.float(-b.width / 2, b.width / 2)
  return {
    id,
    belt,
    orbit,
    period: periodOf(orbit),
    phase: rng.float(0, TAU),
    ore: rng.float(BELT.oreMin, BELT.oreMax),
    size: rng.float(BELT.sizeMin, BELT.sizeMax),
  }
}

/** обитаемой системе нужно пригодных планет (≥ 1.0) на всех цивилизаций и ещё одну — иначе перегенерируем */
export function generateSystem(rng: Rng, id: number, role: SystemRole, civSlots: number, pos: Vec, usedNames: Set<string>): StarSystem {
  for (let attempt = 0; attempt < 50; attempt++) {
    const sys = buildSystem(rng, id, role, civSlots, pos, usedNames)
    if (role !== 'inhabited' || habitableCount(sys) >= civSlots + 1) return sys
  }
  throw new Error(`система ${id}: за 50 попыток не набралось пригодных планет`)
}

function buildSystem(rng: Rng, id: number, role: SystemRole, civSlots: number, pos: Vec, usedNames: Set<string>): StarSystem {
  const gen = ROLE_GEN[role]
  const type = rng.pick(gen.stars)
  const st = STAR_TYPES[type]
  const planets: Planet[] = []
  const count = rng.int(gen.planetsMin, gen.planetsMax)
  let orbit = st.radius * ORBIT.firstMul + rng.float(ORBIT.firstMin, ORBIT.firstMax)
  for (let i = 0; i < count; i++) {
    if (i > 0) {
      const tight = role === 'inhabited' && zoneOf(orbit, st.lum) === 'temperate'
      orbit += rng.float(ORBIT.gapMin, tight ? ORBIT.gapHzMax : ORBIT.gapMax) + ORBIT.gapGrowth * orbit
    }
    const r = Math.round(orbit)
    const zone = zoneOf(r, st.lum)
    let kind = pickWeighted(rng, gen.kinds)
    if (role === 'inhabited' && zone === 'temperate') kind = rng.chance(0.6) ? 'rocky' : 'ice'
    const k = PLANET_KINDS[kind]
    planets.push({
      id: `${id}:${i}`,
      systemId: id,
      name: uniqueName(rng, usedNames),
      kind,
      radius: Math.round(rng.float(k.rMin, k.rMax)),
      orbit: r,
      period: periodOf(r),
      phase: rng.float(0, TAU),
      zone,
      habitability: k.hab[zone],
      tempK: Math.round(tempKOf(r, st.lum)),
      owner: null,
      pop: 0,
      infra: 0,
      station: false,
      build: null,
      look: makeLook(rng, kind),
    })
  }

  // пояса — между соседними орбитами; если пар не хватает — за последней планетой
  const beltCount = rng.int(gen.beltsMin, gen.beltsMax)
  const gaps = rng.shuffle(planets.slice(1).map((_, i) => i))
  const belts: Belt[] = []
  let outer = planets[planets.length - 1].orbit
  for (let b = 0; b < beltCount; b++) {
    if (b < gaps.length) {
      const i = gaps[b]
      belts.push({ orbit: Math.round((planets[i].orbit + planets[i + 1].orbit) / 2), width: BELT.width })
    } else {
      outer += BELT.outerGap
      belts.push({ orbit: outer, width: BELT.width })
    }
  }

  const asteroids: Asteroid[] = []
  let nextAsteroid = id * 100_000
  belts.forEach((belt, bi) => {
    const n = rng.int(BELT.asteroidsMin, BELT.asteroidsMax)
    for (let k = 0; k < n; k++) asteroids.push(makeAsteroid(rng, nextAsteroid++, bi, belt))
  })

  const edge = Math.max(planets[planets.length - 1].orbit, ...belts.map((b) => b.orbit + b.width / 2))
  return {
    id,
    name: uniqueName(rng, usedNames),
    role,
    civSlots,
    pos,
    star: { type, radius: st.radius, lum: st.lum, color: st.color },
    radius: Math.round(edge + ORBIT.edgePad),
    planets,
    belts,
    asteroids,
    asteroidTarget: asteroids.length,
    nextAsteroid,
    regrowT: 0,
    gates: [],
  }
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run tests/sim && npm run typecheck`
Expected: PASS (все тесты задач 2–4), `tsc` без ошибок.

- [ ] **Step 6: Commit**

```bash
git add src/sim/types.ts src/sim/system.ts tests/sim/system.test.ts
git commit -m "sim: world types and star system generation

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Генерация галактики

**Files:**
- Create: `src/sim/galaxy.ts`
- Test: `tests/sim/galaxy.test.ts`

**Interfaces:**
- Consumes: `generateSystem` (задача 4), `createRng`, `config.ts`.
- Produces: `placeSystems(rng, n): Vec[]`, `isConnected(n, edges): boolean`, `buildCorridorEdges(pts: Vec[]): [number, number][]`, `hopMatrix(n, edges): number[][]`, `assignRoles(rng, n, edges): SystemRole[]`, `civSlots(rng, inhabited): number[]`, `generateGalaxy(rng): Galaxy` (врата заполнены, `transit` посчитан).

- [ ] **Step 1: Write the failing test**

`tests/sim/galaxy.test.ts`:

```ts
import { describe, expect, test } from 'vitest'
import { GALAXY, ORBIT } from '../../src/sim/config'
import { assignRoles, buildCorridorEdges, generateGalaxy, isConnected } from '../../src/sim/galaxy'
import { createRng } from '../../src/sim/rng'

describe('buildCorridorEdges', () => {
  test('квадрат: четыре стороны без диагоналей', () => {
    const pts = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }]
    const edges = buildCorridorEdges(pts).map(([a, b]) => `${a}-${b}`).sort()
    expect(edges).toEqual(['0-1', '0-3', '1-2', '2-3'])
  })

  test('точки на одной прямой: цепочка, без лишних рёбер', () => {
    const pts = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }]
    expect(buildCorridorEdges(pts).map(([a, b]) => `${a}-${b}`).sort()).toEqual(['0-1', '1-2'])
  })
})

describe('assignRoles', () => {
  test('цепочка из 5: обитаемые 0, 2, 4 — максимально далеко друг от друга', () => {
    const edges: [number, number][] = [[0, 1], [1, 2], [2, 3], [3, 4]]
    const roles = assignRoles(createRng(1), 5, edges)
    expect(roles[0]).toBe('inhabited')
    expect(roles[2]).toBe('inhabited')
    expect(roles[4]).toBe('inhabited')
    expect([roles[1], roles[3]].sort()).toEqual(['ore', 'pit'])
  })
})

describe('generateGalaxy на 50 зёрнах', () => {
  const galaxies = Array.from({ length: 50 }, (_, i) => generateGalaxy(createRng(1000 + i)))

  test('5–7 систем, центры не ближе 22 000', () => {
    for (const g of galaxies) {
      expect(g.systems.length).toBeGreaterThanOrEqual(5)
      expect(g.systems.length).toBeLessThanOrEqual(7)
      for (const a of g.systems) for (const b of g.systems) {
        if (a.id < b.id) expect(Math.hypot(a.pos.x - b.pos.x, a.pos.y - b.pos.y)).toBeGreaterThanOrEqual(GALAXY.minDist)
      }
    }
  })

  test('граф коридоров связный, степень ≤ 4', () => {
    for (const g of galaxies) {
      const edges = g.corridors.map((c) => [c.a, c.b] as [number, number])
      expect(isConnected(g.systems.length, edges)).toBe(true)
      for (const s of g.systems) expect(s.gates.length).toBeLessThanOrEqual(GALAXY.maxDegree)
    }
  })

  test('роли: одна рудная, одна «Яма», 3 обитаемые при 5 системах, иначе 4', () => {
    for (const g of galaxies) {
      const count = (r: string) => g.systems.filter((s) => s.role === r).length
      expect(count('ore')).toBe(1)
      expect(count('pit')).toBe(1)
      expect(count('inhabited')).toBe(g.systems.length === 5 ? 3 : 4)
      expect(count('nebula')).toBe(g.systems.length === 7 ? 1 : 0)
    }
  })

  test('мест для цивилизаций 8–10, по 2–3 на обитаемую систему', () => {
    for (const g of galaxies) {
      const slots = g.systems.filter((s) => s.role === 'inhabited').map((s) => s.civSlots)
      for (const n of slots) expect(n === 2 || n === 3).toBe(true)
      const total = slots.reduce((a, b) => a + b, 0)
      expect(total).toBeGreaterThanOrEqual(8)
      expect(total).toBeLessThanOrEqual(10)
    }
  })

  test('транзит 60–120 с; самый короткий коридор — 60, самый длинный — 120', () => {
    for (const g of galaxies) {
      const ts = g.corridors.map((c) => c.transit)
      for (const t of ts) {
        expect(t).toBeGreaterThanOrEqual(GALAXY.transitMin - 1e-9)
        expect(t).toBeLessThanOrEqual(GALAXY.transitMax + 1e-9)
      }
      const shortest = g.corridors.reduce((a, b) => (b.length < a.length ? b : a))
      const longest = g.corridors.reduce((a, b) => (b.length > a.length ? b : a))
      if (shortest !== longest) {
        expect(shortest.transit).toBeCloseTo(60)
        expect(longest.transit).toBeCloseTo(120)
      }
    }
  })

  test('врата на краю системы, смотрят на соседа', () => {
    for (const g of galaxies) {
      for (const s of g.systems) {
        for (const gate of s.gates) {
          const to = g.systems[gate.toSystem]
          expect(Math.hypot(gate.pos.x, gate.pos.y)).toBeCloseTo(s.radius + ORBIT.gatePad, 3)
          const dx = to.pos.x - s.pos.x
          const dy = to.pos.y - s.pos.y
          const cos = (gate.pos.x * dx + gate.pos.y * dy) / (Math.hypot(gate.pos.x, gate.pos.y) * Math.hypot(dx, dy))
          expect(cos).toBeGreaterThan(0.999)
        }
      }
    }
  })

  test('одно зерно — одна галактика', () => {
    expect(JSON.stringify(generateGalaxy(createRng(5)))).toBe(JSON.stringify(generateGalaxy(createRng(5))))
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/sim/galaxy.test.ts`
Expected: FAIL — cannot resolve `../../src/sim/galaxy`.

- [ ] **Step 3: Write `src/sim/galaxy.ts`**

```ts
import { CIVS, GALAXY, ORBIT } from './config'
import { dist, TAU, type Vec } from './math'
import type { Rng } from './rng'
import { generateSystem } from './system'
import type { Corridor, Galaxy, StarSystem, SystemRole } from './types'

/** точки в эллипсе с минимальной дистанцией; если не влезли — эллипс +10% */
export function placeSystems(rng: Rng, n: number): Vec[] {
  let w = GALAXY.ellipseW
  let h = GALAXY.ellipseH
  for (let round = 0; round < 30; round++) {
    const pts: Vec[] = []
    for (let i = 0; i < GALAXY.placementAttempts && pts.length < n; i++) {
      const a = rng.float(0, TAU)
      const r = Math.sqrt(rng.next())
      const p = { x: (Math.cos(a) * r * w) / 2, y: (Math.sin(a) * r * h) / 2 }
      if (pts.every((q) => dist(p, q) >= GALAXY.minDist)) pts.push(p)
    }
    if (pts.length === n) return pts
    w *= 1.1
    h *= 1.1
  }
  throw new Error('не удалось разместить системы')
}

export function isConnected(n: number, edges: [number, number][]): boolean {
  if (n === 0) return true
  const seen = new Set<number>([0])
  const stack = [0]
  while (stack.length) {
    const u = stack.pop()!
    for (const [a, b] of edges) {
      const v = a === u ? b : b === u ? a : -1
      if (v >= 0 && !seen.has(v)) {
        seen.add(v)
        stack.push(v)
      }
    }
  }
  return seen.size === n
}

/** граф относительного соседства + одна петля, если вышло дерево; степень ≤ 4 */
export function buildCorridorEdges(pts: Vec[]): [number, number][] {
  const n = pts.length
  let edges: [number, number][] = []
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const d = dist(pts[i], pts[j])
      let ok = true
      for (let k = 0; k < n && ok; k++) {
        if (k !== i && k !== j && Math.max(dist(pts[i], pts[k]), dist(pts[j], pts[k])) < d) ok = false
      }
      if (ok) edges.push([i, j])
    }
  }
  if (edges.length === n - 1) {
    const has = new Set(edges.map(([a, b]) => `${a}-${b}`))
    let best: [number, number] | null = null
    let bestLen = Infinity
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        if (has.has(`${i}-${j}`)) continue
        const mid = { x: (pts[i].x + pts[j].x) / 2, y: (pts[i].y + pts[j].y) / 2 }
        const half = dist(pts[i], pts[j]) / 2
        let gabriel = true
        for (let k = 0; k < n && gabriel; k++) if (k !== i && k !== j && dist(pts[k], mid) < half) gabriel = false
        if (gabriel && half * 2 < bestLen) {
          best = [i, j]
          bestLen = half * 2
        }
      }
    }
    if (best) edges.push(best)
  }
  for (;;) {
    const deg = new Array(n).fill(0)
    for (const [a, b] of edges) {
      deg[a]++
      deg[b]++
    }
    const v = deg.findIndex((d) => d > GALAXY.maxDegree)
    if (v < 0) break
    const mine = edges.filter(([a, b]) => a === v || b === v).sort((e1, e2) => dist(pts[e2[0]], pts[e2[1]]) - dist(pts[e1[0]], pts[e1[1]]))
    let removed = false
    for (const e of mine) {
      const rest = edges.filter((x) => x !== e)
      if (isConnected(n, rest)) {
        edges = rest
        removed = true
        break
      }
    }
    if (!removed) break
  }
  return edges
}

export function hopMatrix(n: number, edges: [number, number][]): number[][] {
  const m: number[][] = []
  for (let s = 0; s < n; s++) {
    const d = new Array(n).fill(Infinity)
    d[s] = 0
    const queue = [s]
    while (queue.length) {
      const u = queue.shift()!
      for (const [a, b] of edges) {
        const v = a === u ? b : b === u ? a : -1
        if (v >= 0 && d[v] === Infinity) {
          d[v] = d[u] + 1
          queue.push(v)
        }
      }
    }
    m.push(d)
  }
  return m
}

function combinations(n: number, k: number): number[][] {
  const out: number[][] = []
  const rec = (start: number, acc: number[]) => {
    if (acc.length === k) {
      out.push([...acc])
      return
    }
    for (let i = start; i < n; i++) {
      acc.push(i)
      rec(i + 1, acc)
      acc.pop()
    }
  }
  rec(0, [])
  return out
}

/** обитаемые — как можно дальше друг от друга; «Яма» — на развилке; рудная — из оставшихся */
export function assignRoles(rng: Rng, n: number, edges: [number, number][]): SystemRole[] {
  const k = n === 5 ? 3 : 4
  const hop = hopMatrix(n, edges)
  let best: number[] = []
  let bestMin = -1
  let bestSum = -1
  for (const c of rng.shuffle(combinations(n, k))) {
    let mn = Infinity
    let sum = 0
    for (let i = 0; i < c.length; i++) {
      for (let j = i + 1; j < c.length; j++) {
        mn = Math.min(mn, hop[c[i]][c[j]])
        sum += hop[c[i]][c[j]]
      }
    }
    if (mn > bestMin || (mn === bestMin && sum > bestSum)) {
      best = c
      bestMin = mn
      bestSum = sum
    }
  }
  const roles: SystemRole[] = new Array(n).fill('nebula')
  for (const i of best) roles[i] = 'inhabited'
  const deg = new Array(n).fill(0)
  for (const [a, b] of edges) {
    deg[a]++
    deg[b]++
  }
  const rest = rng.shuffle([...Array(n).keys()].filter((i) => roles[i] !== 'inhabited'))
  const pit = rest.reduce((b, i) => (deg[i] > deg[b] ? i : b), rest[0])
  roles[pit] = 'pit'
  roles[rest.find((i) => i !== pit)!] = 'ore'
  return roles
}

/** сколько цивилизаций в каждой обитаемой системе: по 2–3, всего 8–10 */
export function civSlots(rng: Rng, inhabited: number): number[] {
  const total = Math.min(Math.max(rng.int(CIVS.min, CIVS.max), inhabited * 2), inhabited * 3)
  const slots = new Array(inhabited).fill(2)
  let extra = total - inhabited * 2
  while (extra > 0) {
    const i = rng.int(0, inhabited - 1)
    if (slots[i] < 3) {
      slots[i]++
      extra--
    }
  }
  return slots
}

function gatePos(from: StarSystem, to: StarSystem): Vec {
  const dx = to.pos.x - from.pos.x
  const dy = to.pos.y - from.pos.y
  const d = Math.hypot(dx, dy)
  const r = from.radius + ORBIT.gatePad
  return { x: (dx / d) * r, y: (dy / d) * r }
}

export function generateGalaxy(rng: Rng): Galaxy {
  const n = rng.int(GALAXY.minSystems, GALAXY.maxSystems)
  const pts = placeSystems(rng, n)
  const edges = buildCorridorEdges(pts)
  const roles = assignRoles(rng, n, edges)
  const inhabited = roles.flatMap((r, i) => (r === 'inhabited' ? [i] : []))
  const slots = civSlots(rng, inhabited.length)
  const used = new Set<string>()
  const systems = pts.map((p, i) =>
    generateSystem(rng, i, roles[i], roles[i] === 'inhabited' ? slots[inhabited.indexOf(i)] : 0, p, used),
  )
  const corridors: Corridor[] = edges.map(([a, b], id) => {
    const A = systems[a]
    const B = systems[b]
    return { id, a, b, length: dist(A.pos, B.pos) - A.radius - B.radius - 2 * ORBIT.gatePad, transit: 0 }
  })
  const lens = corridors.map((c) => c.length)
  const lo = Math.min(...lens)
  const hi = Math.max(...lens)
  for (const c of corridors) {
    c.transit =
      hi - lo < 1e-6
        ? (GALAXY.transitMin + GALAXY.transitMax) / 2
        : GALAXY.transitMin + ((GALAXY.transitMax - GALAXY.transitMin) * (c.length - lo)) / (hi - lo)
    const A = systems[c.a]
    const B = systems[c.b]
    A.gates.push({ corridorId: c.id, toSystem: c.b, pos: gatePos(A, B) })
    B.gates.push({ corridorId: c.id, toSystem: c.a, pos: gatePos(B, A) })
  }
  return { systems, corridors }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/sim && npm run typecheck`
Expected: PASS, `tsc` без ошибок.

- [ ] **Step 5: Commit**

```bash
git add src/sim/galaxy.ts tests/sim/galaxy.test.ts
git commit -m "sim: galaxy generation with corridors, roles and gates

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Мир, державы, население

**Files:**
- Create: `src/sim/query.ts`, `src/sim/civ.ts`, `src/sim/economy.ts` (пока только `newEconomy`), `src/sim/world.ts`, `src/sim/routing.ts` (пока только `hops`)
- Create: `tests/helpers.ts`
- Test: `tests/sim/world.test.ts`

**Interfaces:**
- Consumes: `generateGalaxy`, `SpatialGrid`, `uniqueName`, `config.ts`.
- Produces:
  - `routing.ts`: `hops(g: Galaxy, from: number, to: number): number` (`Infinity`, если пути нет).
  - `query.ts`: `civById(w, id): Civ | undefined`, `planetsOf(w, civ): Planet[]` (все свои, включая станции), `populatedOf(w, civ): Planet[]` (население > 0), `capOf(p, civ): number`, `capitalOf(w, civ): Planet | null`, `capitalSystem(w, civ): number`, `reachableSystems(w, civ): number[]`, `claimedTargets(w, civ): Set<string>`, `colonyTargets(w, civ): Planet[]`, `stationTargets(w, civ): Planet[]`.
  - `economy.ts`: `newEconomy(start: number): CivEconomy`.
  - `civ.ts`: `createCivs(w, rng): void`, `stepPopulation(w): void`.
  - `world.ts`: `createWorld(seed: number): World`, `stepWorld(w: World): void`.
  - `tests/helpers.ts`: `run(w, seconds)`, `snapshot(w): string`, `quietWorld(seed): World` (боты выключены).

- [ ] **Step 1: Write the failing test**

`tests/helpers.ts`:

```ts
import { SIM_DT } from '../src/sim/config'
import type { World } from '../src/sim/types'
import { createWorld, stepWorld } from '../src/sim/world'

export function run(w: World, seconds: number): void {
  const n = Math.round(seconds / SIM_DT)
  for (let i = 0; i < n; i++) stepWorld(w)
}

/** состояние, по которому сравниваем два прогона */
export function snapshot(w: World): string {
  return JSON.stringify({
    t: w.t,
    civs: w.civs.map((c) => [c.id, c.treasury, c.capital, c.eco.stage]),
    planets: [...w.planets.values()].map((p) => [p.id, p.owner, p.pop, p.infra, p.station]),
    ships: w.ships.map((s) => [s.id, s.kind, s.owner, s.systemId, s.pos.x, s.pos.y]),
    events: w.events.length,
  })
}

/** мир, в котором боты ничего не покупают — для проверки одной механики */
export function quietWorld(seed: number): World {
  const w = createWorld(seed)
  for (const c of w.civs) c.nextDecision = Infinity
  return w
}
```

`tests/sim/world.test.ts`:

```ts
import { describe, expect, test } from 'vitest'
import { capitalOf, capOf } from '../../src/sim/query'
import { createWorld } from '../../src/sim/world'
import { quietWorld, run, snapshot } from '../helpers'

describe('createWorld', () => {
  test('8–10 держав на пригодных планетах обитаемых систем', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const w = createWorld(seed)
      expect(w.civs.length).toBeGreaterThanOrEqual(8)
      expect(w.civs.length).toBeLessThanOrEqual(10)
      for (const c of w.civs) {
        const home = w.planets.get(c.capital)!
        expect(home.owner).toBe(c.id)
        expect(home.habitability).toBeGreaterThanOrEqual(1)
        expect(home.pop).toBeGreaterThanOrEqual(1.6)
        expect(home.pop).toBeLessThan(2.4)
        expect(c.treasury).toBe(100)
        expect(w.galaxy.systems[home.systemId].role).toBe('inhabited')
      }
      expect(new Set(w.civs.map((c) => c.name)).size).toBe(w.civs.length)
      expect(new Set(w.civs.map((c) => c.color)).size).toBe(w.civs.length)
      for (const s of w.galaxy.systems) {
        const here = w.civs.filter((c) => w.planets.get(c.capital)!.systemId === s.id).length
        expect(here).toBe(s.civSlots)
      }
    }
  })

  test('одно зерно — одна история', () => {
    const a = createWorld(31)
    const b = createWorld(31)
    run(a, 30)
    run(b, 30)
    expect(snapshot(a)).toBe(snapshot(b))
  })
})

describe('население', () => {
  test('растёт по логистической кривой', () => {
    const w = quietWorld(2)
    const civ = w.civs[0]
    const home = capitalOf(w, civ)!
    const K = capOf(home, civ)
    const P0 = 2
    home.pop = P0
    run(w, 300)
    const expected = K / (1 + ((K - P0) / P0) * Math.exp(-0.012 * 300))
    expect(home.pop).toBeGreaterThan(expected * 0.99)
    expect(home.pop).toBeLessThan(expected * 1.01)
  })

  test('потолок населения: 0.5 · радиус · пригодность', () => {
    const w = quietWorld(2)
    const civ = w.civs[0]
    const home = capitalOf(w, civ)!
    expect(capOf(home, civ)).toBeCloseTo(0.5 * home.radius * home.habitability)
  })

  test('потерянная столица переезжает на самую населённую планету', () => {
    const w = quietWorld(3)
    const civ = w.civs[0]
    const old = capitalOf(w, civ)!
    const other = w.galaxy.systems[old.systemId].planets.find((p) => p.owner === null)!
    other.owner = civ.id
    other.pop = 1
    old.owner = null
    old.pop = 0
    expect(capitalOf(w, civ)!.id).toBe(other.id)
    expect(civ.capital).toBe(other.id)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/sim/world.test.ts`
Expected: FAIL — cannot resolve `../../src/sim/query`.

- [ ] **Step 3: Write `src/sim/routing.ts` (первая часть)**

```ts
import type { Galaxy } from './types'

/** число коридоров между системами; Infinity — пути нет */
export function hops(g: Galaxy, from: number, to: number): number {
  if (from === to) return 0
  const d = new Array(g.systems.length).fill(Infinity)
  d[from] = 0
  const queue = [from]
  while (queue.length) {
    const u = queue.shift()!
    for (const c of g.corridors) {
      const v = c.a === u ? c.b : c.b === u ? c.a : -1
      if (v >= 0 && d[v] === Infinity) {
        d[v] = d[u] + 1
        if (v === to) return d[v]
        queue.push(v)
      }
    }
  }
  return Infinity
}
```

- [ ] **Step 4: Write `src/sim/economy.ts` (первая часть)**

```ts
import { ECON, ENVELOPE_SHARES } from './config'
import type { CivEconomy } from './types'

export function newEconomy(start: number): CivEconomy {
  return {
    ledger: {
      start,
      income: { tax: 0, trade: 0, tradePartner: 0, mining: 0, station: 0, refund: 0 },
      expense: { colony: 0, caravan: 0, miner: 0, station: 0, infra: 0, port: 0, shipyard: 0, research: 0, upkeep: 0, admin: 0 },
    },
    envelopes: {
      expand: start * ENVELOPE_SHARES.expand,
      develop: start * ENVELOPE_SHARES.develop,
      trade: start * ENVELOPE_SHARES.trade,
      reserve: start * ENVELOPE_SHARES.reserve,
    },
    stage: 'ok',
    grossEma: 0,
    upkeepEma: 0,
    tradeEma: 0,
    earnedStep: 0,
    upkeepStep: 0,
    tradeStep: 0,
    deficitSince: null,
    positiveSince: null,
    lastDecommission: -ECON.bankruptEvery,
  }
}
```

- [ ] **Step 5: Write `src/sim/query.ts`**

```ts
import { ECON, POP, RESEARCH } from './config'
import { hops } from './routing'
import type { Civ, Planet, World } from './types'

export function civById(w: World, id: number): Civ | undefined {
  for (const c of w.civs) if (c.id === id) return c
  return undefined
}

export function planetsOf(w: World, civ: Civ): Planet[] {
  const out: Planet[] = []
  for (const s of w.galaxy.systems) for (const p of s.planets) if (p.owner === civ.id) out.push(p)
  return out
}

export function populatedOf(w: World, civ: Civ): Planet[] {
  return planetsOf(w, civ).filter((p) => p.pop > 0)
}

export function capOf(p: Planet, civ: Civ): number {
  return POP.capPerRadius * p.radius * p.habitability * (1 + ECON.infraCap * p.infra) * (1 + RESEARCH.agro.perLevel * civ.research.agro)
}

/** столица: родная планета, пока она своя и населена; иначе — самая населённая */
export function capitalOf(w: World, civ: Civ): Planet | null {
  const home = w.planets.get(civ.capital)
  if (home && home.owner === civ.id && home.pop > 0) return home
  const mine = populatedOf(w, civ)
  if (!mine.length) return null
  const cap = mine.reduce((b, p) => (p.pop > b.pop ? p : b), mine[0])
  civ.capital = cap.id
  return cap
}

export function capitalSystem(w: World, civ: Civ): number {
  return capitalOf(w, civ)?.systemId ?? civ.homeSystem
}

/** системы не дальше ECON.tradeMaxHops коридоров от столицы */
export function reachableSystems(w: World, civ: Civ): number[] {
  const from = capitalSystem(w, civ)
  return w.galaxy.systems.filter((s) => hops(w.galaxy, from, s.id) <= ECON.tradeMaxHops).map((s) => s.id)
}

/** куда уже летят свои колонисты */
export function claimedTargets(w: World, civ: Civ): Set<string> {
  const out = new Set<string>()
  for (const s of w.ships) if (s.alive && s.owner === civ.id && s.mission.type === 'colonize') out.add(s.mission.planetId)
  return out
}

/** свободные пригодные планеты в досягаемых системах, куда ещё не летят свои */
export function colonyTargets(w: World, civ: Civ): Planet[] {
  const claimed = claimedTargets(w, civ)
  const out: Planet[] = []
  for (const sid of reachableSystems(w, civ)) {
    for (const p of w.galaxy.systems[sid].planets) {
      if (p.owner === null && p.habitability > 0 && !claimed.has(p.id)) out.push(p)
    }
  }
  return out
}

/** свободные непригодные (пригодность ниже порога) планеты в досягаемых системах */
export function stationTargets(w: World, civ: Civ): Planet[] {
  const out: Planet[] = []
  for (const sid of reachableSystems(w, civ)) {
    for (const p of w.galaxy.systems[sid].planets) {
      if (p.owner === null && p.habitability < ECON.stationMaxHab) out.push(p)
    }
  }
  return out
}
```

- [ ] **Step 6: Write `src/sim/civ.ts`**

```ts
import { CIVS, PALETTE, POP, SIM_DT } from './config'
import { newEconomy } from './economy'
import { uniqueName } from './names'
import { capOf, civById } from './query'
import type { Rng } from './rng'
import type { Civ, World } from './types'

export function createCivs(w: World, rng: Rng): void {
  const used = new Set<string>()
  let color = 0
  for (const sys of w.galaxy.systems) {
    if (sys.role !== 'inhabited') continue
    const homes = rng.shuffle(sys.planets.filter((p) => p.habitability >= 1))
    for (let i = 0; i < sys.civSlots; i++) {
      const home = homes[i]
      const civ: Civ = {
        id: w.nextId++,
        name: uniqueName(rng, used),
        color: PALETTE[color++ % PALETTE.length],
        capital: home.id,
        homeSystem: sys.id,
        treasury: CIVS.startTreasury,
        eco: newEconomy(CIVS.startTreasury),
        research: { logistics: 0, admin: 0, agro: 0, engines: 0 },
        researchJob: null,
        port: false,
        shipyard: false,
        project: null,
        nextDecision: rng.float(1, 4),
      }
      home.owner = civ.id
      home.pop = rng.float(CIVS.startPopMin, CIVS.startPopMax)
      w.civs.push(civ)
    }
  }
}

export function stepPopulation(w: World): void {
  for (const sys of w.galaxy.systems) {
    for (const p of sys.planets) {
      if (p.owner === null || p.pop <= 0) continue
      const civ = civById(w, p.owner)
      if (!civ) continue
      const cap = capOf(p, civ)
      if (cap <= 0) continue
      p.pop += POP.growth * p.pop * (1 - p.pop / cap) * SIM_DT
    }
  }
}
```

- [ ] **Step 7: Write `src/sim/world.ts`**

```ts
import { createCivs, stepPopulation } from './civ'
import { SIM_DT } from './config'
import { generateGalaxy } from './galaxy'
import { createRng } from './rng'
import { SpatialGrid } from './spatial'
import type { Planet, World } from './types'

export function createWorld(seed: number): World {
  const root = createRng(seed)
  const galaxy = generateGalaxy(root.fork('galaxy'))
  const planets = new Map<string, Planet>()
  for (const s of galaxy.systems) for (const p of s.planets) planets.set(p.id, p)
  const w: World = {
    seed,
    t: 0,
    tick: 0,
    galaxy,
    civs: [],
    ships: [],
    events: [],
    fx: [],
    grids: galaxy.systems.map(() => new SpatialGrid(50)),
    rng: root.fork('sim'),
    nextId: 1,
    planets,
  }
  createCivs(w, root.fork('civs'))
  return w
}

export function stepWorld(w: World): void {
  w.t += SIM_DT
  w.tick++
  stepPopulation(w)
}
```

- [ ] **Step 8: Run tests to verify they pass**

Run: `npm test && npm run typecheck`
Expected: PASS (все тесты), `tsc` без ошибок.

- [ ] **Step 9: Commit**

```bash
git add src/sim tests
git commit -m "sim: world creation, civilizations, population growth

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Полёты внутри системы

**Files:**
- Create: `src/sim/nav.ts`, `src/sim/missions.ts`, `src/sim/ships.ts`
- Modify: `src/sim/world.ts` (`stepWorld`)
- Test: `tests/sim/ships.test.ts`

**Interfaces:**
- Consumes: `planetPos`, `planetVel`, `civById`, `SpatialGrid`, `config.ts`.
- Produces:
  - `nav.ts`: `interface Goal { pos: Vec; vel: Vec; frameR: number; dockR: number; onReach: (w: World, ship: Ship) => void }`, `type Body = { pos: Vec; vel: Vec }`, `avoidStar(pos: Vec, target: Vec, starR: number): Vec`, `steer(body: Body, waypoint: Vec, maxSpeed: number, accel: number, frameVel: Readonly<Vec>, dt: number): void`, `shipSpeed(w, ship): number`, `planetGoal(w, ship, planetId, onReach): Goal | null`.
  - `missions.ts`: `missionGoal(w, ship): Goal | null` (пока только `return`).
  - `ships.ts`: `spawnShip(w, civ, kind, from: Planet, mission: Mission, price: number): Ship`, `stepShips(w): void` (мёртвые корабли удаляются из `w.ships` в конце шага).

- [ ] **Step 1: Write the failing test**

`tests/sim/ships.test.ts`:

```ts
import { describe, expect, test } from 'vitest'
import { avoidStar, steer } from '../../src/sim/nav'
import { capitalOf } from '../../src/sim/query'
import { spawnShip } from '../../src/sim/ships'
import { stepWorld } from '../../src/sim/world'
import { quietWorld } from '../helpers'

describe('avoidStar', () => {
  test('путь через звезду уводит в обход на 1.2 · 3 радиуса', () => {
    const wp = avoidStar({ x: -1000, y: 10 }, { x: 1000, y: 10 }, 60)
    expect(wp).not.toEqual({ x: 1000, y: 10 })
    expect(Math.hypot(wp.x, wp.y)).toBeCloseTo(216, 6)
  })

  test('путь мимо звезды не меняется', () => {
    expect(avoidStar({ x: -1000, y: 500 }, { x: 1000, y: 500 }, 60)).toEqual({ x: 1000, y: 500 })
  })

  test('корабль внутри опасной зоны выталкивается наружу', () => {
    const wp = avoidStar({ x: 100, y: 0 }, { x: -1000, y: 0 }, 60)
    expect(wp.x).toBeCloseTo(216)
    expect(wp.y).toBeCloseTo(0)
  })

  test('путь точно через центр — обход по перпендикуляру', () => {
    const wp = avoidStar({ x: -1000, y: 0 }, { x: 1000, y: 0 }, 60)
    expect(Math.hypot(wp.x, wp.y)).toBeCloseTo(216)
    expect(Math.abs(wp.x)).toBeLessThan(1e-6)
  })
})

describe('steer', () => {
  test('за шаг 0.1 с при ускорении 40 скорость растёт не больше чем на 4', () => {
    const body = { pos: { x: 0, y: 0 }, vel: { x: 0, y: 0 } }
    steer(body, { x: 1000, y: 0 }, 80, 40, { x: 0, y: 0 }, 0.1)
    expect(Math.hypot(body.vel.x, body.vel.y)).toBeCloseTo(4)
    expect(body.pos.x).toBeCloseTo(0.4)
  })
})

describe('полёты внутри системы', () => {
  test('корабль долетает до любой планеты своей системы и не залетает в звезду', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const w = quietWorld(seed)
      const civ = w.civs[0]
      const home = capitalOf(w, civ)!
      const sys = w.galaxy.systems[home.systemId]
      const n = sys.planets.length
      const target = sys.planets[seed % n] === home ? sys.planets[(seed + 1) % n] : sys.planets[seed % n]
      const ship = spawnShip(w, civ, 'caravan', home, { type: 'return', planetId: target.id }, 50)
      let docked = false
      for (let i = 0; i < 6000 && !docked; i++) {
        stepWorld(w)
        if (!ship.alive) docked = true
        else expect(Math.hypot(ship.pos.x, ship.pos.y)).toBeGreaterThan(sys.star.radius)
      }
      expect(docked).toBe(true)
      expect(w.ships.includes(ship)).toBe(false)
    }
  })

  test('два корабля из одной точки к одной цели расходятся', () => {
    const w = quietWorld(4)
    const civ = w.civs[0]
    const home = capitalOf(w, civ)!
    const sys = w.galaxy.systems[home.systemId]
    const far = sys.planets.reduce((a, b) => (Math.abs(b.orbit - home.orbit) > Math.abs(a.orbit - home.orbit) ? b : a))
    const a = spawnShip(w, civ, 'caravan', home, { type: 'return', planetId: far.id }, 50)
    const b = spawnShip(w, civ, 'caravan', home, { type: 'return', planetId: far.id }, 50)
    b.pos.x = a.pos.x + 1
    b.pos.y = a.pos.y
    b.vel = { ...a.vel }
    for (let i = 0; i < 30; i++) stepWorld(w)
    expect(Math.hypot(a.pos.x - b.pos.x, a.pos.y - b.pos.y)).toBeGreaterThan(4)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/sim/ships.test.ts`
Expected: FAIL — cannot resolve `../../src/sim/nav`.

- [ ] **Step 3: Write `src/sim/nav.ts`**

```ts
import { MOVE, RESEARCH, SHIP_KINDS } from './config'
import { clamp, type Vec } from './math'
import { civById } from './query'
import { planetPos, planetVel } from './system'
import type { Ship, World } from './types'

/** куда лететь и что делать по прибытии */
export interface Goal {
  pos: Vec
  /** скорость цели: вблизи корабль летит в её системе отсчёта */
  vel: Vec
  frameR: number
  dockR: number
  onReach: (w: World, ship: Ship) => void
}

export type Body = { pos: Vec; vel: Vec }

/** путевая точка, которая уводит путь от звезды (звезда — в начале координат системы) */
export function avoidStar(pos: Vec, target: Vec, starR: number): Vec {
  const safe = starR * MOVE.starSafetyMul
  const push = safe * MOVE.waypointPush
  const d = Math.hypot(pos.x, pos.y)
  if (d < safe) {
    if (d < 1e-9) return { x: push, y: 0 }
    return { x: (pos.x / d) * push, y: (pos.y / d) * push }
  }
  const dx = target.x - pos.x
  const dy = target.y - pos.y
  const len2 = dx * dx + dy * dy || 1
  const u = clamp(-(pos.x * dx + pos.y * dy) / len2, 0, 1)
  const cx = pos.x + dx * u
  const cy = pos.y + dy * u
  const cd = Math.hypot(cx, cy)
  if (cd >= safe) return target
  if (cd < 1e-6) {
    const nl = Math.hypot(dx, dy) || 1
    return { x: (-dy / nl) * push, y: (dx / nl) * push }
  }
  return { x: (cx / cd) * push, y: (cy / cd) * push }
}

/** руление с ограниченным ускорением; у цели — торможение до её скорости */
export function steer(body: Body, waypoint: Vec, maxSpeed: number, accel: number, frameVel: Readonly<Vec>, dt: number): void {
  const dx = waypoint.x - body.pos.x
  const dy = waypoint.y - body.pos.y
  const d = Math.hypot(dx, dy)
  const k = d > 1e-6 ? (maxSpeed * Math.min(1, d / MOVE.arriveRadius)) / d : 0
  let ax = frameVel.x + dx * k - body.vel.x
  let ay = frameVel.y + dy * k - body.vel.y
  const al = Math.hypot(ax, ay)
  const lim = accel * dt
  if (al > lim) {
    ax *= lim / al
    ay *= lim / al
  }
  body.vel.x += ax
  body.vel.y += ay
  body.pos.x += body.vel.x * dt
  body.pos.y += body.vel.y * dt
}

export function shipSpeed(w: World, ship: Ship): number {
  const civ = civById(w, ship.owner)
  return SHIP_KINDS[ship.kind].speed * (1 + RESEARCH.engines.perLevel * (civ?.research.engines ?? 0))
}

export function planetGoal(w: World, ship: Ship, planetId: string, onReach: Goal['onReach']): Goal | null {
  const p = w.planets.get(planetId)
  if (!p || p.systemId !== ship.systemId) return null
  return {
    pos: planetPos(p, w.t),
    vel: planetVel(p, w.t),
    frameR: p.radius * MOVE.frameMatchMul + MOVE.frameMatchPad,
    dockR: p.radius + MOVE.dockPad,
    onReach,
  }
}
```

- [ ] **Step 4: Write `src/sim/missions.ts`**

```ts
import { planetGoal, type Goal } from './nav'
import type { Ship, World } from './types'

export function missionGoal(w: World, ship: Ship): Goal | null {
  const m = ship.mission
  switch (m.type) {
    case 'return':
      return planetGoal(w, ship, m.planetId, dock)
    default:
      return null
  }
}

/** пристыковался к своей планете — корабль уходит в док */
function dock(_w: World, ship: Ship): void {
  ship.alive = false
}
```

- [ ] **Step 5: Write `src/sim/ships.ts`**

```ts
import { MOVE, SHIP_KINDS, SIM_DT, type ShipKind } from './config'
import { TAU, ZERO } from './math'
import { missionGoal } from './missions'
import { avoidStar, shipSpeed, steer } from './nav'
import { planetPos, planetVel } from './system'
import type { Civ, Mission, Planet, Ship, World } from './types'

export function spawnShip(w: World, civ: Civ, kind: ShipKind, from: Planet, mission: Mission, price: number): Ship {
  const p = planetPos(from, w.t)
  const a = w.rng.float(0, TAU)
  const off = from.radius + MOVE.dockPad + 10
  const pos = { x: p.x + Math.cos(a) * off, y: p.y + Math.sin(a) * off }
  const ship: Ship = {
    id: w.nextId++,
    kind,
    owner: civ.id,
    price,
    systemId: from.systemId,
    pos,
    prevPos: { ...pos },
    vel: planetVel(from, w.t),
    route: [],
    transit: null,
    mission,
    alive: true,
  }
  w.ships.push(ship)
  return ship
}

const scratch: number[] = []

export function stepShips(w: World): void {
  for (const g of w.grids) g.clear()
  for (let i = 0; i < w.ships.length; i++) {
    const s = w.ships[i]
    if (s.alive && !s.transit) w.grids[s.systemId].insert(i, s.pos.x, s.pos.y)
  }
  for (let i = 0; i < w.ships.length; i++) {
    const ship = w.ships[i]
    if (!ship.alive) continue
    ship.prevPos.x = ship.pos.x
    ship.prevPos.y = ship.pos.y
    const goal = missionGoal(w, ship)
    if (!goal) continue
    const sys = w.galaxy.systems[ship.systemId]
    const near = Math.hypot(goal.pos.x - ship.pos.x, goal.pos.y - ship.pos.y)
    const frame = near < goal.frameR ? goal.vel : ZERO
    steer(ship, avoidStar(ship.pos, goal.pos, sys.star.radius), shipSpeed(w, ship), SHIP_KINDS[ship.kind].accel, frame, SIM_DT)
    separate(w, ship, i)
    if (Math.hypot(goal.pos.x - ship.pos.x, goal.pos.y - ship.pos.y) < goal.dockR) goal.onReach(w, ship)
  }
  let j = 0
  for (let i = 0; i < w.ships.length; i++) if (w.ships[i].alive) w.ships[j++] = w.ships[i]
  w.ships.length = j
}

/** корабли не слипаются: лёгкое отталкивание от соседей */
function separate(w: World, ship: Ship, self: number): void {
  const r = MOVE.separation
  for (const j of w.grids[ship.systemId].query(ship.pos.x, ship.pos.y, r, scratch)) {
    if (j === self) continue
    const o = w.ships[j]
    if (!o.alive || o.transit || o.systemId !== ship.systemId) continue
    const dx = ship.pos.x - o.pos.x
    const dy = ship.pos.y - o.pos.y
    const d = Math.hypot(dx, dy)
    if (d > 1e-6 && d < r) {
      const k = (((r - d) / r) * MOVE.separationForce * SIM_DT) / d
      ship.vel.x += dx * k
      ship.vel.y += dy * k
    }
  }
}
```

- [ ] **Step 6: Modify `src/sim/world.ts` — добавить корабли в шаг**

Заменить импорты и `stepWorld`:

```ts
import { createCivs, stepPopulation } from './civ'
import { SIM_DT } from './config'
import { generateGalaxy } from './galaxy'
import { createRng } from './rng'
import { stepShips } from './ships'
import { SpatialGrid } from './spatial'
import type { Planet, World } from './types'
```

```ts
export function stepWorld(w: World): void {
  w.t += SIM_DT
  w.tick++
  stepPopulation(w)
  stepShips(w)
}
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `npm test && npm run typecheck`
Expected: PASS. Если какой-то корабль из 20 не пристыковался за 600 с — сначала посмотреть, где он кружит (вывести `ship.pos` и позицию цели), затем подстроить `MOVE.arriveRadius` или `MOVE.frameMatchPad`; не ослаблять тест.

- [ ] **Step 8: Commit**

```bash
git add src/sim tests
git commit -m "sim: in-system steering, star avoidance, ship separation

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Врата, коридоры и маршруты

**Files:**
- Modify: `src/sim/routing.ts` (добавить функции), `src/sim/nav.ts` (межсистемные перелёты), `src/sim/ships.ts` (транзит в шаге)
- Test: `tests/sim/routing.test.ts`

**Interfaces:**
- Consumes: `Galaxy`, `Gate`, `Transit`, `Goal`, `config.ts`.
- Produces:
  - `routing.ts`: `findPath(g, from, to): number[] | null` (системы после `from` до `to` включительно; `[]`, если `from === to`), `gateTo(sys, toSystem): Gate | undefined`, `gateGalaxyPos(sys, gate): Vec`, `transitGalaxyPos(g, tr: Transit, alpha = 1): Vec`.
  - `nav.ts`: `setDestination(w, ship, systemId): void`, `gateGoal(w, ship): Goal | null`, `transitDuration(w, ship, corridorTransit: number): number`, `advanceTransit(w, ship): void`; `planetGoal` теперь сам прокладывает маршрут, если планета в другой системе.

- [ ] **Step 1: Write the failing test**

`tests/sim/routing.test.ts`:

```ts
import { describe, expect, test } from 'vitest'
import { advanceTransit, setDestination, transitDuration } from '../../src/sim/nav'
import { capitalOf } from '../../src/sim/query'
import { findPath, gateTo, hops, transitGalaxyPos } from '../../src/sim/routing'
import { spawnShip } from '../../src/sim/ships'
import type { Galaxy, StarSystem } from '../../src/sim/types'
import { stepWorld } from '../../src/sim/world'
import { quietWorld } from '../helpers'

function sys(id: number, x: number): StarSystem {
  return { id, pos: { x, y: 0 }, gates: [], radius: 100 } as unknown as StarSystem
}

// 0 —60— 1 —60— 2 —60— 3, напрямую 0 —200— 2; система 4 ни с кем не связана
const g: Galaxy = {
  systems: [sys(0, 0), sys(1, 1000), sys(2, 2000), sys(3, 3000), sys(4, 9000)],
  corridors: [
    { id: 0, a: 0, b: 1, length: 1, transit: 60 },
    { id: 1, a: 1, b: 2, length: 1, transit: 60 },
    { id: 2, a: 0, b: 2, length: 1, transit: 200 },
    { id: 3, a: 2, b: 3, length: 1, transit: 60 },
  ],
}

describe('findPath и hops', () => {
  test('выбирает быстрый путь через 1, а не прямой длинный коридор', () => {
    expect(findPath(g, 0, 3)).toEqual([1, 2, 3])
  })
  test('в ту же систему — пустой путь; в несвязанную — null', () => {
    expect(findPath(g, 2, 2)).toEqual([])
    expect(findPath(g, 0, 4)).toBeNull()
  })
  test('hops считает коридоры, а не время', () => {
    expect(hops(g, 0, 3)).toBe(2)
    expect(hops(g, 0, 4)).toBe(Infinity)
  })
})

describe('транзит', () => {
  test('позиция в коридоре: от врат до врат', () => {
    const A = sys(0, 0)
    const B = sys(1, 1000)
    A.gates.push({ corridorId: 0, toSystem: 1, pos: { x: 300, y: 0 } })
    B.gates.push({ corridorId: 0, toSystem: 0, pos: { x: -300, y: 0 } })
    const gal: Galaxy = { systems: [A, B], corridors: [{ id: 0, a: 0, b: 1, length: 400, transit: 80 }] }
    expect(transitGalaxyPos(gal, { corridorId: 0, from: 0, to: 1, elapsed: 0, duration: 80 })).toEqual({ x: 300, y: 0 })
    expect(transitGalaxyPos(gal, { corridorId: 0, from: 0, to: 1, elapsed: 40, duration: 80 })).toEqual({ x: 500, y: 0 })
    expect(transitGalaxyPos(gal, { corridorId: 0, from: 0, to: 1, elapsed: 80, duration: 80 })).toEqual({ x: 700, y: 0 })
  })

  test('Двигатели сокращают транзит на 15% за уровень', () => {
    const w = quietWorld(1)
    const civ = w.civs[0]
    const ship = spawnShip(w, civ, 'caravan', capitalOf(w, civ)!, { type: 'return', planetId: civ.capital }, 50)
    expect(transitDuration(w, ship, 100)).toBeCloseTo(100)
    civ.research.engines = 2
    expect(transitDuration(w, ship, 100)).toBeCloseTo(70)
  })

  test('по окончании транзита корабль выходит из ответных врат в новой системе', () => {
    const w = quietWorld(2)
    const civ = w.civs[0]
    const home = capitalOf(w, civ)!
    const from = w.galaxy.systems[home.systemId]
    const gate = from.gates[0]
    const ship = spawnShip(w, civ, 'caravan', home, { type: 'return', planetId: home.id }, 50)
    ship.route = [gate.toSystem]
    ship.transit = { corridorId: gate.corridorId, from: from.id, to: gate.toSystem, elapsed: 0, duration: 0.25 }
    for (let i = 0; i < 3; i++) advanceTransit(w, ship)
    const back = gateTo(w.galaxy.systems[gate.toSystem], from.id)!
    expect(ship.transit).toBeNull()
    expect(ship.systemId).toBe(gate.toSystem)
    expect(ship.route).toEqual([])
    expect(ship.pos.x).toBeCloseTo(back.pos.x * 0.97)
    expect(ship.pos.y).toBeCloseTo(back.pos.y * 0.97)
  })
})

describe('перелёт через два коридора', () => {
  test('корабль долетает до планеты в системе через 2 коридора, проходя каждый коридор маршрута', () => {
    // первое зерно, где у столицы первой державы есть система в двух коридорах
    let w = quietWorld(9)
    for (let seed = 9; seed < 60; seed++) {
      w = quietWorld(seed)
      const h = capitalOf(w, w.civs[0])!.systemId
      if (w.galaxy.systems.some((s) => hops(w.galaxy, h, s.id) === 2)) break
    }
    const civ = w.civs[0]
    const home = capitalOf(w, civ)!
    const dest = w.galaxy.systems.find((s) => hops(w.galaxy, home.systemId, s.id) === 2)!
    const target = dest.planets[0]
    const ship = spawnShip(w, civ, 'caravan', home, { type: 'return', planetId: target.id }, 50)
    setDestination(w, ship, dest.id)
    const corridors = ship.route.length
    let transits = 0
    let inTransit = false
    for (let i = 0; i < 20_000 && ship.alive; i++) {
      stepWorld(w)
      if (ship.transit && !inTransit) transits++
      inTransit = !!ship.transit
      if (!ship.transit && ship.alive) {
        const s = w.galaxy.systems[ship.systemId]
        expect(Math.hypot(ship.pos.x, ship.pos.y)).toBeGreaterThan(s.star.radius)
      }
    }
    expect(ship.alive).toBe(false)
    expect(corridors).toBeGreaterThanOrEqual(2)
    expect(transits).toBe(corridors)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/sim/routing.test.ts`
Expected: FAIL — `findPath` is not exported.

- [ ] **Step 3: Add to `src/sim/routing.ts`**

Заменить файл целиком:

```ts
import { MOVE, SIM_DT } from './config'
import { clamp, lerp, type Vec } from './math'
import type { Galaxy, Gate, StarSystem, Transit } from './types'

/** число коридоров между системами; Infinity — пути нет */
export function hops(g: Galaxy, from: number, to: number): number {
  if (from === to) return 0
  const d = new Array(g.systems.length).fill(Infinity)
  d[from] = 0
  const queue = [from]
  while (queue.length) {
    const u = queue.shift()!
    for (const c of g.corridors) {
      const v = c.a === u ? c.b : c.b === u ? c.a : -1
      if (v >= 0 && d[v] === Infinity) {
        d[v] = d[u] + 1
        if (v === to) return d[v]
        queue.push(v)
      }
    }
  }
  return Infinity
}

/** самый быстрый путь (транзит + пересечение систем); системы после from до to включительно */
export function findPath(g: Galaxy, from: number, to: number): number[] | null {
  if (from === to) return []
  const n = g.systems.length
  const cost = new Array(n).fill(Infinity)
  const prev = new Array(n).fill(-1)
  const done = new Array(n).fill(false)
  cost[from] = 0
  for (;;) {
    let u = -1
    for (let i = 0; i < n; i++) if (!done[i] && cost[i] < Infinity && (u < 0 || cost[i] < cost[u])) u = i
    if (u < 0) return null
    if (u === to) break
    done[u] = true
    for (const c of g.corridors) {
      const v = c.a === u ? c.b : c.b === u ? c.a : -1
      if (v < 0 || done[v]) continue
      const next = cost[u] + c.transit + MOVE.crossingCost
      if (next < cost[v]) {
        cost[v] = next
        prev[v] = u
      }
    }
  }
  const path: number[] = []
  for (let v = to; v !== from; v = prev[v]) path.push(v)
  return path.reverse()
}

export function gateTo(sys: StarSystem, toSystem: number): Gate | undefined {
  return sys.gates.find((x) => x.toSystem === toSystem)
}

export function gateGalaxyPos(sys: StarSystem, gate: Gate): Vec {
  return { x: sys.pos.x + gate.pos.x, y: sys.pos.y + gate.pos.y }
}

/** точка в галактике для корабля в коридоре; alpha — доля шага для плавной отрисовки (1 = текущий шаг) */
export function transitGalaxyPos(g: Galaxy, tr: Transit, alpha = 1): Vec {
  const A = g.systems[tr.from]
  const B = g.systems[tr.to]
  const ga = gateGalaxyPos(A, gateTo(A, tr.to)!)
  const gb = gateGalaxyPos(B, gateTo(B, tr.from)!)
  const u = clamp((tr.elapsed - SIM_DT * (1 - alpha)) / tr.duration, 0, 1)
  return { x: lerp(ga.x, gb.x, u), y: lerp(ga.y, gb.y, u) }
}
```

- [ ] **Step 4: Add to `src/sim/nav.ts`**

Добавить импорты и функции; `planetGoal` заменить:

```ts
import { MOVE, RESEARCH, SHIP_KINDS, SIM_DT } from './config'
import { clamp, ZERO, type Vec } from './math'
import { civById } from './query'
import { findPath, gateTo } from './routing'
import { planetPos, planetVel } from './system'
import type { Ship, World } from './types'
```

```ts
export function planetGoal(w: World, ship: Ship, planetId: string, onReach: Goal['onReach']): Goal | null {
  const p = w.planets.get(planetId)
  if (!p) return null
  if (p.systemId !== ship.systemId) {
    setDestination(w, ship, p.systemId)
    return null
  }
  return {
    pos: planetPos(p, w.t),
    vel: planetVel(p, w.t),
    frameR: p.radius * MOVE.frameMatchMul + MOVE.frameMatchPad,
    dockR: p.radius + MOVE.dockPad,
    onReach,
  }
}

export function setDestination(w: World, ship: Ship, systemId: number): void {
  ship.route = systemId === ship.systemId ? [] : (findPath(w.galaxy, ship.systemId, systemId) ?? [])
}

/** следующая точка маршрута — врата в сторону route[0] */
export function gateGoal(w: World, ship: Ship): Goal | null {
  const gate = gateTo(w.galaxy.systems[ship.systemId], ship.route[0])
  if (!gate) {
    ship.route = []
    return null
  }
  return { pos: gate.pos, vel: ZERO, frameR: 0, dockR: MOVE.gateDock, onReach: enterCorridor }
}

export function transitDuration(w: World, ship: Ship, corridorTransit: number): number {
  const civ = civById(w, ship.owner)
  return corridorTransit * Math.max(0.4, 1 - RESEARCH.engines.perLevel * (civ?.research.engines ?? 0))
}

function enterCorridor(w: World, ship: Ship): void {
  const gate = gateTo(w.galaxy.systems[ship.systemId], ship.route[0])!
  const c = w.galaxy.corridors[gate.corridorId]
  ship.transit = { corridorId: c.id, from: ship.systemId, to: gate.toSystem, elapsed: 0, duration: transitDuration(w, ship, c.transit) }
  ship.vel.x = 0
  ship.vel.y = 0
}

export function advanceTransit(w: World, ship: Ship): void {
  const tr = ship.transit!
  tr.elapsed += SIM_DT
  if (tr.elapsed < tr.duration) return
  const back = gateTo(w.galaxy.systems[tr.to], tr.from)!
  ship.systemId = tr.to
  ship.pos.x = back.pos.x * MOVE.gateInset
  ship.pos.y = back.pos.y * MOVE.gateInset
  ship.prevPos.x = ship.pos.x
  ship.prevPos.y = ship.pos.y
  ship.transit = null
  if (ship.route[0] === tr.to) ship.route.shift()
}
```

`clamp` по-прежнему нужен в `avoidStar`.

- [ ] **Step 5: Modify `src/sim/ships.ts` — транзит и врата в шаге**

Импорт:

```ts
import { advanceTransit, avoidStar, gateGoal, shipSpeed, steer } from './nav'
```

В `stepShips` после строк с `prevPos` заменить получение цели:

```ts
    if (ship.transit) {
      advanceTransit(w, ship)
      continue
    }
    const goal = ship.route.length ? gateGoal(w, ship) : missionGoal(w, ship)
    if (!goal) continue
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npm test && npm run typecheck`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/sim tests
git commit -m "sim: gates, corridor transit, galaxy pathfinding

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Экономика — журнал, покупка, формулы

**Files:**
- Modify: `src/sim/economy.ts` (дописать функции)
- Test: `tests/sim/economy.test.ts`

**Interfaces:**
- Consumes: `newEconomy`, `populatedOf`, `capitalSystem`, `config.ts`.
- Produces:
  - `earn(civ, amount, source: IncomeSource): void`, `spend(civ, amount, cat: ExpenseCat): void`, `ledgerBalance(civ): number`
  - `creditLine(civ): number`, `netPerSec(civ): number`, `canAfford(civ, price, dUpkeep = 0): boolean`, `buy(civ, cat, price, envelope, dUpkeep = 0): boolean`
  - `interface EconomyReport { grossPerMin; upkeepPerMin; netPerMin; treasury; reserveMin; runwaySec; stage }`, `report(civ): EconomyReport`
  - Формулы: `shipPrice(civ, kind: 'caravan' | 'miner'): number`, `shipUpkeep(civ, kind: ShipKind): number`, `taxOf(p, civ): number`, `stationIncome(sys): number`, `adminTotal(w, civ, extra?: Planet): number`, `colonyPrice(w, civ, target): number`, `tradeIncome(owner, a, b): number`.

- [ ] **Step 1: Write the failing test**

`tests/sim/economy.test.ts`:

```ts
import { describe, expect, test } from 'vitest'
import {
  adminTotal, buy, canAfford, colonyPrice, earn, ledgerBalance, report, shipPrice, shipUpkeep, spend, stationIncome, taxOf, tradeIncome,
} from '../../src/sim/economy'
import { capitalOf } from '../../src/sim/query'
import type { Planet, StarSystem } from '../../src/sim/types'
import { quietWorld } from '../helpers'

function freshCiv() {
  const w = quietWorld(1)
  return { w, civ: w.civs[0] }
}

describe('журнал денег', () => {
  test('доходы и расходы меняют казну и пишутся по статьям', () => {
    const { civ } = freshCiv()
    earn(civ, 30, 'tax')
    spend(civ, 20, 'infra')
    expect(civ.treasury).toBe(110)
    expect(civ.eco.ledger.income.tax).toBe(30)
    expect(civ.eco.ledger.expense.infra).toBe(20)
    expect(ledgerBalance(civ)).toBe(110)
  })

  test('отрицательные и NaN-суммы игнорируются', () => {
    const { civ } = freshCiv()
    earn(civ, -5, 'tax')
    earn(civ, Number.NaN, 'tax')
    spend(civ, -5, 'infra')
    expect(civ.treasury).toBe(100)
  })
})

describe('buy', () => {
  test('покупка списывает казну, конверт и пишет расход', () => {
    const { civ } = freshCiv()
    civ.eco.grossEma = 1
    civ.treasury = 200
    civ.eco.envelopes.develop = 150
    expect(buy(civ, 'infra', 120, 'develop')).toBe(true)
    expect(civ.treasury).toBe(80)
    expect(civ.eco.envelopes.develop).toBe(30)
    expect(civ.eco.ledger.expense.infra).toBe(120)
  })

  test('не в нормальной стадии — отказ', () => {
    const { civ } = freshCiv()
    civ.eco.envelopes.develop = 1000
    civ.eco.stage = 'deficit'
    expect(buy(civ, 'infra', 10, 'develop')).toBe(false)
  })

  test('в конверте не хватает — отказ', () => {
    const { civ } = freshCiv()
    civ.eco.envelopes.develop = 50
    expect(buy(civ, 'infra', 60, 'develop')).toBe(false)
  })

  test('после покупки должно остаться полминуты дохода', () => {
    const { civ } = freshCiv()
    civ.eco.grossEma = 1
    civ.treasury = 140
    civ.eco.envelopes.develop = 1000
    expect(canAfford(civ, 120)).toBe(false)
    civ.treasury = 150
    expect(canAfford(civ, 120)).toBe(true)
  })

  test('при минусовом чистом доходе денег должно хватить на 300 с', () => {
    const { civ } = freshCiv()
    civ.eco.grossEma = 1
    civ.eco.upkeepEma = 1.5
    civ.treasury = 200
    expect(canAfford(civ, 120)).toBe(false)
    civ.treasury = 300
    expect(canAfford(civ, 120)).toBe(true)
  })

  test('содержание покупки учитывается в правиле запаса', () => {
    const { civ } = freshCiv()
    civ.eco.grossEma = 1
    civ.eco.upkeepEma = 0.9
    civ.treasury = 160
    expect(canAfford(civ, 120, 0.2)).toBe(true)
    expect(canAfford(civ, 120, 0.3)).toBe(false)
  })
})

describe('report', () => {
  test('без дохода — нули и бесконечный запас, без NaN', () => {
    const { civ } = freshCiv()
    const r = report(civ)
    expect(r.grossPerMin).toBe(0)
    expect(r.reserveMin).toBe(0)
    expect(r.runwaySec).toBe(Infinity)
    expect(Object.values(r).some((v) => typeof v === 'number' && Number.isNaN(v))).toBe(false)
  })

  test('при минусе показывает, на сколько секунд хватит казны с учётом кредитной линии', () => {
    const { civ } = freshCiv()
    civ.eco.grossEma = 1
    civ.eco.upkeepEma = 2
    civ.treasury = 40
    expect(report(civ).runwaySec).toBeCloseTo(100)
  })
})

describe('формулы', () => {
  function ownPlanets(n: number, otherSystem = 0) {
    const { w, civ } = freshCiv()
    const home = capitalOf(w, civ)!
    const sys = w.galaxy.systems[home.systemId]
    const free = sys.planets.filter((p) => p.owner === null)
    const others = w.galaxy.systems.filter((s) => s.id !== sys.id).flatMap((s) => s.planets.filter((p) => p.owner === null))
    const picked: Planet[] = [...free.slice(0, n - 1 - otherSystem), ...others.slice(0, otherSystem)]
    for (const p of picked) {
      p.owner = civ.id
      p.pop = 1
    }
    return { w, civ }
  }

  test('администрация: 3 планеты — 0.30, 5 — 1.00 кр/с', () => {
    const a = ownPlanets(3)
    expect(adminTotal(a.w, a.civ)).toBeCloseTo(0.3)
    const b = ownPlanets(5)
    expect(adminTotal(b.w, b.civ)).toBeCloseTo(1.0)
  })

  test('колония в чужой системе дороже в администрации в 1.5 раза, исследование снижает на 15%', () => {
    const { w, civ } = ownPlanets(3, 1)
    expect(adminTotal(w, civ)).toBeCloseTo(0.15 + 0.15 * 1.5)
    civ.research.admin = 1
    expect(adminTotal(w, civ)).toBeCloseTo((0.15 + 0.15 * 1.5) * 0.85)
  })

  test('цена колонии: 160, в чужую систему ×1.4, с верфью ×0.75, растёт на 50 за планету', () => {
    const { w, civ } = freshCiv()
    const home = capitalOf(w, civ)!
    const near = w.galaxy.systems[home.systemId].planets.find((p) => p.owner === null)!
    const far = w.galaxy.systems.find((s) => s.id !== home.systemId)!.planets[0]
    expect(colonyPrice(w, civ, near)).toBe(160)
    expect(colonyPrice(w, civ, far)).toBeCloseTo(224)
    civ.shipyard = true
    expect(colonyPrice(w, civ, near)).toBeCloseTo(120)
    const b = ownPlanets(3)
    const bHome = capitalOf(b.w, b.civ)!
    const t2 = b.w.galaxy.systems[bHome.systemId].planets.find((p) => p.owner === null)!
    expect(colonyPrice(b.w, b.civ, t2)).toBe(260)
  })

  test('выручка каравана: 6 + 0.6·√(popA·popB), не больше 30, порт ×1.4', () => {
    const { civ } = freshCiv()
    const a = { pop: 9 } as Planet
    const b = { pop: 16 } as Planet
    expect(tradeIncome(civ, a, b)).toBeCloseTo(13.2)
    civ.port = true
    expect(tradeIncome(civ, a, b)).toBeCloseTo(18.48)
    expect(tradeIncome(civ, { pop: 10_000 } as Planet, { pop: 10_000 } as Planet)).toBeCloseTo(42)
  })

  test('содержание и цена кораблей: верфь и логистика', () => {
    const { civ } = freshCiv()
    expect(shipUpkeep(civ, 'caravan')).toBeCloseTo(0.05)
    expect(shipPrice(civ, 'caravan')).toBe(50)
    civ.shipyard = true
    expect(shipUpkeep(civ, 'caravan')).toBeCloseTo(0.035)
    expect(shipPrice(civ, 'miner')).toBeCloseTo(33.75)
    civ.research.logistics = 2
    expect(shipUpkeep(civ, 'caravan')).toBeCloseTo(0.028)
  })

  test('налог: 0.12 за тысячу × (1 + 0.3·инфраструктура), в кризисе ×0.9', () => {
    const { civ } = freshCiv()
    const p = { pop: 10, infra: 2 } as Planet
    expect(taxOf(p, civ)).toBeCloseTo(1.92)
    civ.eco.stage = 'crisis'
    expect(taxOf(p, civ)).toBeCloseTo(1.728)
  })

  test('станция в рудной системе приносит вдвое больше', () => {
    expect(stationIncome({ role: 'ore' } as StarSystem)).toBeCloseTo(0.5)
    expect(stationIncome({ role: 'pit' } as StarSystem)).toBeCloseTo(0.25)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/sim/economy.test.ts`
Expected: FAIL — `earn` is not exported.

- [ ] **Step 3: Replace `src/sim/economy.ts`**

```ts
import { ECON, ENVELOPE_SHARES, RESEARCH, SHIP_KINDS, type Envelope, type ShipKind } from './config'
import { capitalSystem, populatedOf } from './query'
import type { Civ, CivEconomy, ExpenseCat, IncomeSource, Planet, Stage, StarSystem, World } from './types'

export function newEconomy(start: number): CivEconomy {
  return {
    ledger: {
      start,
      income: { tax: 0, trade: 0, tradePartner: 0, mining: 0, station: 0, refund: 0 },
      expense: { colony: 0, caravan: 0, miner: 0, station: 0, infra: 0, port: 0, shipyard: 0, research: 0, upkeep: 0, admin: 0 },
    },
    envelopes: {
      expand: start * ENVELOPE_SHARES.expand,
      develop: start * ENVELOPE_SHARES.develop,
      trade: start * ENVELOPE_SHARES.trade,
      reserve: start * ENVELOPE_SHARES.reserve,
    },
    stage: 'ok',
    grossEma: 0,
    upkeepEma: 0,
    tradeEma: 0,
    earnedStep: 0,
    upkeepStep: 0,
    tradeStep: 0,
    deficitSince: null,
    positiveSince: null,
    lastDecommission: -ECON.bankruptEvery,
  }
}

// ---------- журнал: единственное место, где меняется казна ----------

export function earn(civ: Civ, amount: number, source: IncomeSource): void {
  if (!(amount > 0)) return
  civ.treasury += amount
  civ.eco.ledger.income[source] += amount
  // разовые возвраты (списание, отменённая экспедиция) не считаются доходом в средних
  if (source !== 'refund') civ.eco.earnedStep += amount
  if (source === 'trade') civ.eco.tradeStep += amount
}

export function spend(civ: Civ, amount: number, cat: ExpenseCat): void {
  if (!(amount > 0)) return
  civ.treasury -= amount
  civ.eco.ledger.expense[cat] += amount
  if (cat === 'upkeep' || cat === 'admin') civ.eco.upkeepStep += amount
}

export function ledgerBalance(civ: Civ): number {
  const l = civ.eco.ledger
  let b = l.start
  for (const v of Object.values(l.income)) b += v
  for (const v of Object.values(l.expense)) b -= v
  return b
}

export const creditLine = (civ: Civ): number => civ.eco.grossEma * 60
export const netPerSec = (civ: Civ): number => civ.eco.grossEma - civ.eco.upkeepEma

/** правило запаса: после покупки остаётся ≥ 0.5 мин дохода, а при минусе денег хватает на 300 с */
export function canAfford(civ: Civ, price: number, dUpkeep = 0): boolean {
  const after = civ.treasury - price
  if (after < ECON.reserveMin * civ.eco.grossEma * 60) return false
  const net = netPerSec(civ) - dUpkeep
  if (net < 0 && after / -net < ECON.runwayMin) return false
  return true
}

export function buy(civ: Civ, cat: ExpenseCat, price: number, envelope: Envelope, dUpkeep = 0): boolean {
  if (civ.eco.stage !== 'ok') return false
  if (civ.eco.envelopes[envelope] < price) return false
  if (!canAfford(civ, price, dUpkeep)) return false
  spend(civ, price, cat)
  civ.eco.envelopes[envelope] -= price
  return true
}

export interface EconomyReport {
  grossPerMin: number
  upkeepPerMin: number
  netPerMin: number
  treasury: number
  /** казна в минутах валового дохода */
  reserveMin: number
  /** на сколько секунд хватит казны с кредитной линией; Infinity при плюсе */
  runwaySec: number
  stage: Stage
}

export function report(civ: Civ): EconomyReport {
  const g = civ.eco.grossEma * 60
  const u = civ.eco.upkeepEma * 60
  const n = g - u
  return {
    grossPerMin: g,
    upkeepPerMin: u,
    netPerMin: n,
    treasury: civ.treasury,
    reserveMin: g > 0 ? civ.treasury / g : 0,
    runwaySec: n >= 0 ? Infinity : Math.max(0, (civ.treasury + creditLine(civ)) / (-n / 60)),
    stage: civ.eco.stage,
  }
}

// ---------- формулы ----------

export function shipPrice(civ: Civ, kind: 'caravan' | 'miner'): number {
  const base = kind === 'caravan' ? ECON.caravanPrice : ECON.minerPrice
  return base * (civ.shipyard ? ECON.shipyardPriceMul : 1)
}

export function shipUpkeep(civ: Civ, kind: ShipKind): number {
  return SHIP_KINDS[kind].upkeep * (civ.shipyard ? ECON.shipyardUpkeepMul : 1) * (1 - RESEARCH.logistics.perLevel * civ.research.logistics)
}

export function taxOf(p: Planet, civ: Civ): number {
  const hard = civ.eco.stage === 'crisis' || civ.eco.stage === 'bankrupt'
  return ECON.taxPerPop * p.pop * (1 + ECON.infraTax * p.infra) * (hard ? ECON.crisisTax : 1)
}

export function stationIncome(sys: StarSystem): number {
  return ECON.stationIncome * (sys.role === 'ore' ? ECON.stationOreMul : 1)
}

/** администрация некапитальных населённых планет; extra — «а если колонизировать ещё и эту» */
export function adminTotal(w: World, civ: Civ, extra?: Planet): number {
  const planets = populatedOf(w, civ)
  if (extra) planets.push(extra)
  const n = planets.length
  const capSys = capitalSystem(w, civ)
  let sum = 0
  for (const p of planets) {
    if (p.id === civ.capital) continue
    sum += (ECON.adminBase + ECON.adminPerPlanet * (n - 2)) * (p.systemId !== capSys ? ECON.adminOtherSystem : 1)
  }
  return sum * (1 - RESEARCH.admin.perLevel * civ.research.admin)
}

export function colonyPrice(w: World, civ: Civ, target: Planet): number {
  const n = populatedOf(w, civ).length
  const base = ECON.colonyBase + ECON.colonyPerPlanet * Math.max(0, n - 1)
  const other = target.systemId !== capitalSystem(w, civ)
  return base * (other ? ECON.colonyOtherSystem : 1) * (civ.shipyard ? ECON.shipyardPriceMul : 1)
}

export function tradeIncome(owner: Civ, a: Planet, b: Planet): number {
  const raw = ECON.tradeBase + ECON.tradeK * Math.sqrt(Math.max(0, a.pop) * Math.max(0, b.pop))
  return Math.min(ECON.tradeMax, raw) * (owner.port ? ECON.portTradeMul : 1)
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/sim/economy.ts tests/sim/economy.test.ts
git commit -m "sim: economy ledger, purchase rule, price and income formulas

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Экономика по шагам, долги и журнал событий

**Files:**
- Create: `src/sim/events.ts`
- Modify: `src/sim/economy.ts` (добавить `stepEconomy`), `src/sim/world.ts` (`stepWorld`)
- Test: `tests/sim/events.test.ts`, `tests/sim/stepEconomy.test.ts`

**Interfaces:**
- Consumes: формулы задачи 9, `colonyTargets`, `civById`, `planetsOf`.
- Produces:
  - `events.ts`: `interface EventInput { kind: string; pri: 0 | 1 | 2; text: string; textMany?: (n: number) => string; civs: number[]; at: { system: number; planet?: string } }`, `pushEvent(w, e: EventInput): GameEvent` — склеивает P2 одного вида и участников за 20 с, журнал ≤ 500.
  - `economy.ts`: `stepEconomy(w): void` — налоги, станции, содержание, администрация, скользящие средние, конверты, стадии долгов, списание при банкротстве.
  - Виды событий: `deficit` (P1), `crisis` (P1), `bankrupt` (P0), `recovered` (P1), `decommission` (P2), `station-sold` (P2).

- [ ] **Step 1: Write the failing tests**

`tests/sim/events.test.ts`:

```ts
import { describe, expect, test } from 'vitest'
import { pushEvent } from '../../src/sim/events'
import { quietWorld } from '../helpers'

describe('pushEvent', () => {
  test('P2 одного вида и участников за 20 с склеиваются', () => {
    const w = quietWorld(1)
    pushEvent(w, { kind: 'x', pri: 2, text: 'одна', textMany: (n) => `всего ${n}`, civs: [1], at: { system: 0 } })
    w.t = 10
    const ev = pushEvent(w, { kind: 'x', pri: 2, text: 'одна', textMany: (n) => `всего ${n}`, civs: [1], at: { system: 0 } })
    expect(w.events.length).toBe(1)
    expect(ev.count).toBe(2)
    expect(ev.text).toBe('всего 2')
  })

  test('другие участники, P0 и старые события не склеиваются', () => {
    const w = quietWorld(1)
    const many = (n: number) => `${n}`
    pushEvent(w, { kind: 'x', pri: 2, text: 'a', textMany: many, civs: [1], at: { system: 0 } })
    pushEvent(w, { kind: 'x', pri: 2, text: 'b', textMany: many, civs: [2], at: { system: 0 } })
    pushEvent(w, { kind: 'x', pri: 0, text: 'c', civs: [1], at: { system: 0 } })
    pushEvent(w, { kind: 'x', pri: 0, text: 'd', civs: [1], at: { system: 0 } })
    w.t = 25
    pushEvent(w, { kind: 'x', pri: 2, text: 'e', textMany: many, civs: [1], at: { system: 0 } })
    expect(w.events.map((e) => e.text)).toEqual(['a', 'b', 'c', 'd', 'e'])
  })

  test('журнал не длиннее 500', () => {
    const w = quietWorld(1)
    for (let i = 0; i < 700; i++) pushEvent(w, { kind: 'x', pri: 1, text: String(i), civs: [], at: { system: 0 } })
    expect(w.events.length).toBe(500)
    expect(w.events[0].text).toBe('200')
  })
})
```

`tests/sim/stepEconomy.test.ts`:

```ts
import { describe, expect, test } from 'vitest'
import { ledgerBalance, stepEconomy } from '../../src/sim/economy'
import { capOf, capitalOf } from '../../src/sim/query'
import { spawnShip } from '../../src/sim/ships'
import type { Civ, World } from '../../src/sim/types'
import { quietWorld, run } from '../helpers'

/** держава с одной планетой на потолке населения — доход постоянен; астероидов в системе нет */
function steadyCiv(seed = 1): { w: World; civ: Civ; tax: number } {
  const w = quietWorld(seed)
  const civ = w.civs[0]
  const home = capitalOf(w, civ)!
  home.pop = capOf(home, civ)
  const sys = w.galaxy.systems[home.systemId]
  sys.asteroids = []
  sys.asteroidTarget = 0
  return { w, civ, tax: 0.12 * home.pop }
}

/** корабли, которые ничего не зарабатывают: «шахтёры» в системе без астероидов */
function idleShips(w: World, civ: Civ, n: number, kind: 'caravan' | 'colony' = 'caravan') {
  const home = capitalOf(w, civ)!
  const out = []
  for (let i = 0; i < n; i++) {
    const s = spawnShip(w, civ, kind, home, { type: 'mine', phase: 'out', asteroidId: null, cargo: 0, idleT: 0 }, 50)
    out.push(s)
  }
  return out
}

describe('доходы и расходы по шагам', () => {
  test('налог за 10 с = 0.12 · население · 10', () => {
    const { w, civ, tax } = steadyCiv()
    const before = civ.treasury
    run(w, 10)
    expect(civ.treasury - before).toBeCloseTo(tax * 10, 6)
    expect(civ.eco.grossEma).toBeCloseTo(tax, 6)
  })

  test('караван стоит 0.05 кр/с', () => {
    const { w, civ, tax } = steadyCiv()
    idleShips(w, civ, 1)
    const before = civ.treasury
    run(w, 10)
    expect(civ.treasury - before).toBeCloseTo((tax - 0.05) * 10, 6)
  })

  test('станция в рудной системе: +0.5 и −0.05 кр/с', () => {
    const { w, civ, tax } = steadyCiv()
    const ore = w.galaxy.systems.find((s) => s.role === 'ore')!
    const p = ore.planets.find((x) => x.owner === null)!
    p.owner = civ.id
    p.station = true
    const before = civ.treasury
    run(w, 10)
    expect(civ.treasury - before).toBeCloseTo((tax + 0.5 - 0.05) * 10, 6)
  })

  test('журнал сходится с казной', () => {
    const { w, civ } = steadyCiv()
    idleShips(w, civ, 3)
    run(w, 60)
    expect(Math.abs(ledgerBalance(civ) - civ.treasury)).toBeLessThan(1e-9)
  })
})

describe('конверты', () => {
  test('чистый доход раскладывается 35/35/20/10', () => {
    const { w, civ, tax } = steadyCiv()
    civ.eco.envelopes = { expand: 0, develop: 0, trade: 0, reserve: 0 }
    civ.treasury = 10_000
    run(w, 10)
    expect(civ.eco.envelopes.expand).toBeCloseTo(tax * 10 * 0.35, 6)
    expect(civ.eco.envelopes.develop).toBeCloseTo(tax * 10 * 0.35, 6)
    expect(civ.eco.envelopes.trade).toBeCloseTo(tax * 10 * 0.2, 6)
    expect(civ.eco.envelopes.reserve).toBeCloseTo(tax * 10 * 0.1, 6)
  })

  test('без целей для колоний доля расширения идёт в развитие', () => {
    const { w, civ, tax } = steadyCiv()
    for (const s of w.galaxy.systems) for (const p of s.planets) if (p.owner === null && p.habitability > 0) p.owner = 999
    civ.eco.envelopes = { expand: 0, develop: 0, trade: 0, reserve: 0 }
    civ.treasury = 10_000
    run(w, 10)
    expect(civ.eco.envelopes.expand).toBe(0)
    expect(civ.eco.envelopes.develop).toBeCloseTo(tax * 10 * 0.7, 6)
  })

  test('конверт развития не растёт выше 1200, излишек уходит в резерв', () => {
    const { w, civ } = steadyCiv()
    civ.eco.envelopes = { expand: 0, develop: 1199, trade: 0, reserve: 0 }
    civ.treasury = 10_000
    run(w, 10)
    expect(civ.eco.envelopes.develop).toBeCloseTo(1200, 6)
    expect(civ.eco.envelopes.reserve).toBeGreaterThan(0)
  })

  test('сумма конвертов не больше казны', () => {
    const { w, civ } = steadyCiv()
    civ.eco.envelopes = { expand: 100, develop: 100, trade: 100, reserve: 100 }
    civ.treasury = 50
    stepEconomy(w)
    const e = civ.eco.envelopes
    expect(e.expand + e.develop + e.trade + e.reserve).toBeLessThanOrEqual(civ.treasury + 1e-9)
  })
})

describe('долги', () => {
  test('дефицит → кризис → банкротство; списываются корабли, но не колонисты', () => {
    const { w, civ } = steadyCiv()
    const colonists = idleShips(w, civ, 1, 'colony')[0]
    idleShips(w, civ, 100)
    const stages: string[] = []
    for (let i = 0; i < 1500; i++) {
      run(w, 0.1)
      if (stages[stages.length - 1] !== civ.eco.stage) stages.push(civ.eco.stage)
    }
    expect(stages).toEqual(['ok', 'deficit', 'crisis', 'bankrupt'])
    expect(colonists.alive).toBe(true)
    expect(civ.eco.ledger.income.refund).toBeGreaterThan(0)
    expect(w.events.some((e) => e.kind === 'bankrupt' && e.pri === 0)).toBe(true)
    expect(w.events.some((e) => e.kind === 'decommission')).toBe(true)
  })

  test('банкрот без кораблей продаёт станцию, а без станций — ничего не ломается', () => {
    const { w, civ } = steadyCiv()
    const p = w.galaxy.systems.find((s) => s.role === 'pit')!.planets[0]
    p.owner = civ.id
    p.station = true
    civ.treasury = -1e6
    civ.eco.grossEma = 1
    stepEconomy(w)
    expect(civ.eco.stage).toBe('bankrupt')
    expect(p.station).toBe(false)
    expect(p.owner).toBeNull()
    expect(() => run(w, 30)).not.toThrow()
    expect(Number.isFinite(civ.treasury)).toBe(true)
  })

  test('30 с плюса при неотрицательной казне — выход из долгов', () => {
    const { w, civ } = steadyCiv()
    civ.eco.stage = 'deficit'
    civ.eco.deficitSince = 0
    civ.treasury = 10
    run(w, 29)
    expect(civ.eco.stage).toBe('deficit')
    run(w, 2)
    expect(civ.eco.stage).toBe('ok')
    expect(w.events.some((e) => e.kind === 'recovered')).toBe(true)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/sim/events.test.ts tests/sim/stepEconomy.test.ts`
Expected: FAIL — cannot resolve `../../src/sim/events`.

- [ ] **Step 3: Write `src/sim/events.ts`**

```ts
import { EVENTS } from './config'
import type { GameEvent, World } from './types'

export interface EventInput {
  kind: string
  pri: 0 | 1 | 2
  text: string
  /** текст для склеенной пачки из n однотипных P2-событий */
  textMany?: (n: number) => string
  civs: number[]
  at: { system: number; planet?: string }
}

export function pushEvent(w: World, e: EventInput): GameEvent {
  if (e.pri === 2 && e.textMany) {
    const key = `${e.kind}|${e.civs.join(',')}`
    for (let i = w.events.length - 1; i >= 0; i--) {
      const ev = w.events[i]
      if (w.t - ev.t > EVENTS.groupWindow) break
      if (ev.pri === 2 && `${ev.kind}|${ev.civs.join(',')}` === key) {
        ev.count++
        ev.text = e.textMany(ev.count)
        ev.t = w.t
        return ev
      }
    }
  }
  const ev: GameEvent = { id: w.nextId++, t: w.t, kind: e.kind, pri: e.pri, text: e.text, civs: e.civs, at: e.at, count: 1 }
  w.events.push(ev)
  if (w.events.length > EVENTS.maxLog) w.events.splice(0, w.events.length - EVENTS.maxLog)
  return ev
}
```

- [ ] **Step 4: Add `stepEconomy` to `src/sim/economy.ts`**

Дополнить импорты:

```ts
import { ECON, ENVELOPE_SHARES, RESEARCH, SHIP_KINDS, SIM_DT, type Envelope, type ShipKind } from './config'
import { pushEvent } from './events'
import { capitalSystem, civById, colonyTargets, planetsOf, populatedOf } from './query'
import type { Civ, CivEconomy, ExpenseCat, IncomeSource, Planet, Ship, Stage, StarSystem, World } from './types'
```

Дописать в конец файла:

```ts
// ---------- шаг экономики ----------

const ENVELOPES: Envelope[] = ['expand', 'develop', 'trade', 'reserve']
const BADNESS: Record<Stage, number> = { ok: 0, deficit: 1, crisis: 2, bankrupt: 3 }

export function stepEconomy(w: World): void {
  const dt = SIM_DT
  // доходы планет и станций; торговля и добыча уже пришли от кораблей в прошлом шаге
  for (const sys of w.galaxy.systems) {
    for (const p of sys.planets) {
      if (p.owner === null) continue
      const civ = civById(w, p.owner)
      if (!civ) continue
      if (p.pop > 0) earn(civ, taxOf(p, civ) * dt, 'tax')
      if (p.station) {
        if (!p.build) earn(civ, stationIncome(sys) * dt, 'station')
        spend(civ, ECON.stationUpkeep * dt, 'upkeep')
      }
    }
  }
  for (const ship of w.ships) {
    if (!ship.alive) continue
    const civ = civById(w, ship.owner)
    if (civ) spend(civ, shipUpkeep(civ, ship.kind) * dt, 'upkeep')
  }
  for (const civ of w.civs) {
    spend(civ, adminTotal(w, civ) * dt, 'admin')
    updateEma(civ, dt)
    fillEnvelopes(w, civ)
    updateStage(w, civ)
    civ.eco.earnedStep = 0
    civ.eco.upkeepStep = 0
    civ.eco.tradeStep = 0
  }
}

function updateEma(civ: Civ, dt: number): void {
  const e = civ.eco
  const a = dt / ECON.emaWindow
  const gross = e.earnedStep / dt
  const upkeep = e.upkeepStep / dt
  e.grossEma = e.grossEma === 0 ? gross : e.grossEma + a * (gross - e.grossEma)
  e.upkeepEma = e.upkeepEma === 0 ? upkeep : e.upkeepEma + a * (upkeep - e.upkeepEma)
  e.tradeEma += a * (e.tradeStep / dt - e.tradeEma)
}

function maxColonyPrice(w: World, civ: Civ): number {
  const n = populatedOf(w, civ).length
  return (ECON.colonyBase + ECON.colonyPerPlanet * Math.max(0, n - 1)) * ECON.colonyOtherSystem * (civ.shipyard ? ECON.shipyardPriceMul : 1)
}

function fillEnvelopes(w: World, civ: Civ): void {
  const e = civ.eco
  const net = e.earnedStep - e.upkeepStep
  if (net > 0) {
    const hasTargets = colonyTargets(w, civ).length > 0
    const caps: Record<Envelope, number> = {
      expand: ECON.envelopeCapMul * maxColonyPrice(w, civ),
      develop: ECON.envelopeCapMul * ECON.researchPrice[2],
      trade: ECON.envelopeCapMul * ECON.stationPrice,
      reserve: Infinity,
    }
    let overflow = 0
    const add = (k: Envelope, v: number) => {
      const put = Math.max(0, Math.min(v, caps[k] - e.envelopes[k]))
      e.envelopes[k] += put
      overflow += v - put
    }
    add('expand', hasTargets ? net * ENVELOPE_SHARES.expand : 0)
    add('develop', net * (ENVELOPE_SHARES.develop + (hasTargets ? 0 : ENVELOPE_SHARES.expand)))
    add('trade', net * ENVELOPE_SHARES.trade)
    add('reserve', net * ENVELOPE_SHARES.reserve)
    // излишек — в развитие, а если и там полно — в резерв
    const spill = overflow
    overflow = 0
    add('develop', spill)
    e.envelopes.reserve += overflow
  }
  const total = ENVELOPES.reduce((s, k) => s + e.envelopes[k], 0)
  if (civ.treasury <= 0) {
    for (const k of ENVELOPES) e.envelopes[k] = 0
  } else if (total > civ.treasury) {
    const k = civ.treasury / total
    for (const key of ENVELOPES) e.envelopes[key] *= k
  }
}

function updateStage(w: World, civ: Civ): void {
  const e = civ.eco
  const line = creditLine(civ)
  const net = e.earnedStep - e.upkeepStep
  const was = e.stage
  if (civ.treasury < 0) {
    e.positiveSince = null
    if (e.deficitSince === null) e.deficitSince = w.t
    // стадии в минусе только ухудшаются: банкрот остаётся банкротом, пока казна не выйдет в плюс
    if (civ.treasury <= -line || e.stage === 'bankrupt') e.stage = 'bankrupt'
    else if (e.stage === 'crisis') e.stage = 'crisis'
    else if (w.t - e.deficitSince > ECON.deficitToCrisis || civ.treasury < ECON.crisisReserve * line) e.stage = 'crisis'
    else e.stage = 'deficit'
  } else if (e.stage !== 'ok') {
    if (net > 0) {
      if (e.positiveSince === null) e.positiveSince = w.t
      if (w.t - e.positiveSince >= ECON.recoverAfter) {
        e.stage = 'ok'
        e.deficitSince = null
        e.positiveSince = null
      }
    } else {
      e.positiveSince = null
    }
  }
  if (e.stage !== was) stageEvent(w, civ, was)
  if (e.stage === 'bankrupt' && w.t - e.lastDecommission >= ECON.bankruptEvery) {
    e.lastDecommission = w.t
    decommission(w, civ)
  }
}

function stageEvent(w: World, civ: Civ, was: Stage): void {
  const now = civ.eco.stage
  const at = { system: capitalSystem(w, civ), planet: civ.capital }
  if (now === 'ok') {
    pushEvent(w, { kind: 'recovered', pri: 1, text: `💰 ${civ.name} выбралось из долгов`, civs: [civ.id], at })
    return
  }
  if (BADNESS[now] <= BADNESS[was]) return
  if (now === 'deficit') pushEvent(w, { kind: 'deficit', pri: 1, text: `💸 ${civ.name} не сводит бюджет`, civs: [civ.id], at })
  if (now === 'crisis') pushEvent(w, { kind: 'crisis', pri: 1, text: `📉 ${civ.name}: финансовый кризис — стройки встали`, civs: [civ.id], at })
  if (now === 'bankrupt') pushEvent(w, { kind: 'bankrupt', pri: 0, text: `🏚 ${civ.name} обанкротилось — корабли идут на слом`, civs: [civ.id], at })
}

/** банкрот списывает самый дорогой в содержании корабль (кроме колонистов), а без кораблей — продаёт станцию */
function decommission(w: World, civ: Civ): void {
  let victim: Ship | null = null
  for (const s of w.ships) {
    if (!s.alive || s.owner !== civ.id || s.kind === 'colony') continue
    if (!victim) {
      victim = s
      continue
    }
    const a = shipUpkeep(civ, s.kind)
    const b = shipUpkeep(civ, victim.kind)
    if (a > b || (a === b && s.id > victim.id)) victim = s
  }
  if (victim) {
    victim.alive = false
    earn(civ, victim.price * ECON.decommissionRefund, 'refund')
    pushEvent(w, {
      kind: 'decommission',
      pri: 2,
      text: `✂️ ${civ.name} списывает корабль за долги`,
      textMany: (n) => `✂️ ${civ.name} списало ${n} кораблей за долги`,
      civs: [civ.id],
      at: { system: victim.systemId },
    })
    return
  }
  const station = planetsOf(w, civ).find((p) => p.station)
  if (!station) return
  station.station = false
  station.owner = null
  station.build = null
  earn(civ, ECON.stationPrice * ECON.decommissionRefund, 'refund')
  pushEvent(w, {
    kind: 'station-sold',
    pri: 2,
    text: `✂️ ${civ.name} продаёт станцию на ${station.name}`,
    textMany: (n) => `✂️ ${civ.name} продало ${n} станций за долги`,
    civs: [civ.id],
    at: { system: station.systemId, planet: station.id },
  })
}
```

`Ship` нужен в импорте типов для `decommission`. `CivEconomy`, `IncomeSource`, `ExpenseCat`, `Planet`, `StarSystem` уже используются выше.

- [ ] **Step 5: Modify `src/sim/world.ts` — экономика в шаге**

```ts
import { stepEconomy } from './economy'
```

```ts
export function stepWorld(w: World): void {
  w.t += SIM_DT
  w.tick++
  stepPopulation(w)
  stepEconomy(w)
  stepShips(w)
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npm test && npm run typecheck`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/sim tests
git commit -m "sim: per-step economy, envelopes, debt stages, event log

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: Стройки и исследования

**Files:**
- Create: `src/sim/invest.ts`
- Modify: `src/sim/economy.ts` (`stepEconomy` вызывает `advanceJobs`)
- Test: `tests/sim/invest.test.ts`

**Interfaces:**
- Consumes: `buy`, `pushEvent`, `planetsOf`, `config.ts`.
- Produces: `tryInfra(civ, p): boolean`, `tryStation(civ, p): boolean`, `tryProject(civ, kind: 'port' | 'shipyard'): boolean`, `tryResearch(civ, branch): boolean`, `advanceJobs(w, civ): void`. Виды событий: `infra` (P2), `station` (P2), `port` (P1), `shipyard` (P1), `research` (P1).

- [ ] **Step 1: Write the failing test**

`tests/sim/invest.test.ts`:

```ts
import { describe, expect, test } from 'vitest'
import { shipPrice, shipUpkeep, taxOf } from '../../src/sim/economy'
import { tryInfra, tryProject, tryResearch, tryStation } from '../../src/sim/invest'
import { capOf, capitalOf } from '../../src/sim/query'
import type { Civ, World } from '../../src/sim/types'
import { quietWorld, run } from '../helpers'

function rich(seed = 1): { w: World; civ: Civ } {
  const w = quietWorld(seed)
  const civ = w.civs[0]
  civ.treasury = 10_000
  civ.eco.envelopes = { expand: 5000, develop: 5000, trade: 5000, reserve: 0 }
  return { w, civ }
}

describe('инфраструктура', () => {
  test('уровень I строится 40 с, даёт +30% налога и +10% потолка', () => {
    const { w, civ } = rich()
    const home = capitalOf(w, civ)!
    const cap0 = capOf(home, civ)
    expect(tryInfra(civ, home)).toBe(true)
    expect(civ.eco.ledger.expense.infra).toBe(120)
    run(w, 39.9)
    expect(home.infra).toBe(0)
    run(w, 0.2)
    expect(home.infra).toBe(1)
    expect(home.build).toBeNull()
    expect(capOf(home, civ)).toBeCloseTo(cap0 * 1.1)
    expect(taxOf(home, civ)).toBeCloseTo(0.12 * home.pop * 1.3)
  })

  test('нельзя: чужая планета, идёт стройка, уже уровень III', () => {
    const { w, civ } = rich()
    const home = capitalOf(w, civ)!
    const other = w.planets.get(w.civs[1].capital)!
    expect(tryInfra(civ, other)).toBe(false)
    expect(tryInfra(civ, home)).toBe(true)
    expect(tryInfra(civ, home)).toBe(false)
    home.build = null
    home.infra = 3
    expect(tryInfra(civ, home)).toBe(false)
  })
})

describe('станции', () => {
  test('на непригодной свободной планете; доход после 40 с стройки', () => {
    const { w, civ } = rich()
    const p = w.galaxy.systems.find((s) => s.role === 'pit')!.planets.find((x) => x.habitability < 0.5)!
    expect(tryStation(civ, p)).toBe(true)
    expect(p.owner).toBe(civ.id)
    expect(p.station).toBe(true)
    // стройка завершается в конце 400-го шага, доход — со следующего
    run(w, 40)
    expect(p.build).toBeNull()
    expect(civ.eco.ledger.income.station).toBe(0)
    run(w, 1)
    expect(civ.eco.ledger.income.station).toBeGreaterThan(0)
  })

  test('на пригодной или занятой — нельзя', () => {
    const { w, civ } = rich()
    const good = w.galaxy.systems.flatMap((s) => s.planets).find((p) => p.owner === null && p.habitability >= 0.5)!
    expect(tryStation(civ, good)).toBe(false)
    expect(tryStation(civ, w.planets.get(w.civs[1].capital)!)).toBe(false)
  })
})

describe('порт и верфь', () => {
  test('верфь за 80 с: корабли дешевле на 25%, содержание −30%', () => {
    const { w, civ } = rich()
    expect(tryProject(civ, 'shipyard')).toBe(true)
    expect(tryProject(civ, 'port')).toBe(false)
    run(w, 80.1)
    expect(civ.shipyard).toBe(true)
    expect(civ.project).toBeNull()
    expect(shipPrice(civ, 'caravan')).toBeCloseTo(37.5)
    expect(shipUpkeep(civ, 'caravan')).toBeCloseTo(0.035)
    expect(w.events.some((e) => e.kind === 'shipyard' && e.pri === 1)).toBe(true)
    expect(tryProject(civ, 'shipyard')).toBe(false)
  })
})

describe('исследования', () => {
  test('Логистика I за 90 с, II за 120 с; третий уровень — последний', () => {
    const { w, civ } = rich()
    expect(tryResearch(civ, 'logistics')).toBe(true)
    expect(tryResearch(civ, 'admin')).toBe(false)
    run(w, 90.1)
    expect(civ.research.logistics).toBe(1)
    expect(w.events.some((e) => e.kind === 'research' && e.text.includes('Логистика I'))).toBe(true)
    expect(tryResearch(civ, 'logistics')).toBe(true)
    expect(civ.eco.ledger.expense.research).toBe(300 + 500)
    civ.researchJob = null
    civ.research.logistics = 3
    expect(tryResearch(civ, 'logistics')).toBe(false)
  })
})

describe('кризис', () => {
  test('в кризисе стройки стоят', () => {
    const { w, civ } = rich()
    const home = capitalOf(w, civ)!
    tryInfra(civ, home)
    const left = home.build!.remaining
    civ.eco.stage = 'crisis'
    civ.treasury = -1
    civ.eco.deficitSince = w.t
    run(w, 5)
    expect(home.build!.remaining).toBeCloseTo(left)
  })
})
```

Второе ожидание в первом тесте проверяет формулу налога независимо: `0.12 · pop · 1.3` для уровня I.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/sim/invest.test.ts`
Expected: FAIL — cannot resolve `../../src/sim/invest`.

- [ ] **Step 3: Write `src/sim/invest.ts`**

```ts
import { ECON, RESEARCH, SIM_DT, type ResearchBranch } from './config'
import { buy } from './economy'
import { pushEvent } from './events'
import { capitalSystem, planetsOf } from './query'
import type { Civ, Planet, World } from './types'

const ROMAN = ['', 'I', 'II', 'III']

export function tryInfra(civ: Civ, p: Planet): boolean {
  if (p.owner !== civ.id || p.pop <= 0 || p.infra >= 3 || p.build) return false
  const level = p.infra + 1
  if (!buy(civ, 'infra', ECON.infraPrice[level - 1], 'develop')) return false
  p.build = { kind: 'infra', level, remaining: ECON.infraBuild[level - 1], total: ECON.infraBuild[level - 1] }
  return true
}

export function tryStation(civ: Civ, p: Planet): boolean {
  if (p.owner !== null || p.habitability >= ECON.stationMaxHab) return false
  if (!buy(civ, 'station', ECON.stationPrice, 'trade', ECON.stationUpkeep)) return false
  p.owner = civ.id
  p.station = true
  p.build = { kind: 'station', level: 1, remaining: ECON.stationBuild, total: ECON.stationBuild }
  return true
}

export function tryProject(civ: Civ, kind: 'port' | 'shipyard'): boolean {
  if (civ.project || civ[kind]) return false
  const price = kind === 'port' ? ECON.portPrice : ECON.shipyardPrice
  if (!buy(civ, kind, price, 'develop')) return false
  const time = kind === 'port' ? ECON.portBuild : ECON.shipyardBuild
  civ.project = { kind, remaining: time, total: time }
  return true
}

export function tryResearch(civ: Civ, branch: ResearchBranch): boolean {
  if (civ.researchJob) return false
  const level = civ.research[branch] + 1
  if (level > 3) return false
  if (!buy(civ, 'research', ECON.researchPrice[level - 1], 'develop')) return false
  civ.researchJob = { branch, level, remaining: ECON.researchTime[level - 1], total: ECON.researchTime[level - 1] }
  return true
}

/** стройки и исследования идут, пока держава не в кризисе */
export function advanceJobs(w: World, civ: Civ): void {
  if (civ.eco.stage === 'crisis' || civ.eco.stage === 'bankrupt') return
  const dt = SIM_DT
  for (const p of planetsOf(w, civ)) {
    if (!p.build) continue
    p.build.remaining -= dt
    if (p.build.remaining > 1e-9) continue
    const b = p.build
    p.build = null
    if (b.kind === 'infra') {
      p.infra = b.level
      pushEvent(w, {
        kind: 'infra',
        pri: 2,
        text: `🏗 ${civ.name} подняло инфраструктуру ${p.name} до ${ROMAN[b.level]}`,
        textMany: (n) => `🏗 ${civ.name} достроило инфраструктуру на ${n} планетах`,
        civs: [civ.id],
        at: { system: p.systemId, planet: p.id },
      })
    } else {
      pushEvent(w, {
        kind: 'station',
        pri: 2,
        text: `🛰 ${civ.name} построило станцию на ${p.name}`,
        textMany: (n) => `🛰 ${civ.name} построило ${n} станций`,
        civs: [civ.id],
        at: { system: p.systemId, planet: p.id },
      })
    }
  }
  if (civ.project) {
    civ.project.remaining -= dt
    if (civ.project.remaining <= 1e-9) {
      const kind = civ.project.kind
      civ.project = null
      civ[kind] = true
      const text = kind === 'port' ? `⚓ ${civ.name} открыло торговый порт` : `🛠 ${civ.name} построило верфь`
      pushEvent(w, { kind, pri: 1, text, civs: [civ.id], at: { system: capitalSystem(w, civ), planet: civ.capital } })
    }
  }
  if (civ.researchJob) {
    civ.researchJob.remaining -= dt
    if (civ.researchJob.remaining <= 1e-9) {
      const { branch, level } = civ.researchJob
      civ.researchJob = null
      civ.research[branch] = level
      pushEvent(w, {
        kind: 'research',
        pri: 1,
        text: `🔬 ${civ.name} открыло ${RESEARCH[branch].label} ${ROMAN[level]}`,
        civs: [civ.id],
        at: { system: capitalSystem(w, civ), planet: civ.capital },
      })
    }
  }
}
```

- [ ] **Step 4: Modify `src/sim/economy.ts` — вызвать стройки**

Импорт:

```ts
import { advanceJobs } from './invest'
```

В цикле по державам в `stepEconomy` после `updateStage(w, civ)`:

```ts
    advanceJobs(w, civ)
```

`invest.ts` импортирует `buy` из `economy.ts`, а `economy.ts` — `advanceJobs` из `invest.ts`. Это кольцо ES-модулей допустимо: обе стороны используют только функции и только во время выполнения, не при загрузке модуля.

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test && npm run typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/sim tests
git commit -m "sim: infrastructure, stations, port, shipyard, research

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 12: Задачи кораблей — колонизация, добыча, торговля

**Files:**
- Create: `src/sim/belts.ts`
- Modify: `src/sim/missions.ts` (все задачи), `src/sim/civ.ts` (`colonyValue`, `bestColonyTarget`), `src/sim/world.ts` (`stepWorld`)
- Test: `tests/sim/missions.test.ts`

**Interfaces:**
- Consumes: `planetGoal`, `setDestination`, `earn`, `tradeIncome`, `adminTotal`, `colonyPrice`, `pushEvent`, `makeAsteroid`, `query.ts`.
- Produces:
  - `belts.ts`: `asteroidPos(a, t): Vec`, `asteroidVel(a, t): Vec`, `nearestAsteroid(sys, pos, t): Asteroid | undefined`, `stepAsteroids(w): void`.
  - `civ.ts`: `colonyValue(w, civ, p): number`, `bestColonyTarget(w, civ, exclude: Set<string>): Planet | null`.
  - `missions.ts`: `missionGoal` обрабатывает `colonize`, `trade`, `mine`, `return`. Доставка торговли и добычи пишет `w.fx`. События: `colony` (P1 своя система, P0 чужая).

- [ ] **Step 1: Write the failing test**

`tests/sim/missions.test.ts`:

```ts
import { describe, expect, test } from 'vitest'
import { stepAsteroids } from '../../src/sim/belts'
import { capOf, capitalOf } from '../../src/sim/query'
import { hops } from '../../src/sim/routing'
import { spawnShip } from '../../src/sim/ships'
import type { Civ, Planet, Ship, World } from '../../src/sim/types'
import { stepWorld } from '../../src/sim/world'
import { quietWorld, run } from '../helpers'

function until(w: World, cond: () => boolean, maxSeconds: number): boolean {
  for (let i = 0; i < maxSeconds * 10; i++) {
    if (cond()) return true
    stepWorld(w)
  }
  return cond()
}

function colonist(w: World, civ: Civ, target: Planet): Ship {
  const home = capitalOf(w, civ)!
  return spawnShip(w, civ, 'colony', home, { type: 'colonize', planetId: target.id, settlers: 0.5, price: 160 }, 160)
}

describe('колонизация', () => {
  test('колонисты основывают колонию в своей системе: событие P1', () => {
    const w = quietWorld(1)
    const civ = w.civs[0]
    const home = capitalOf(w, civ)!
    const target = w.galaxy.systems[home.systemId].planets.find((p) => p.owner === null && p.habitability > 0)!
    const ship = colonist(w, civ, target)
    expect(until(w, () => !ship.alive, 900)).toBe(true)
    expect(target.owner).toBe(civ.id)
    expect(target.pop).toBeGreaterThanOrEqual(0.5)
    expect(w.events.some((e) => e.kind === 'colony' && e.pri === 1 && e.at.planet === target.id)).toBe(true)
  })

  test('колония в соседней системе — событие P0', () => {
    const w = quietWorld(2)
    const civ = w.civs[0]
    const home = capitalOf(w, civ)!
    const target = w.galaxy.systems
      .filter((s) => hops(w.galaxy, home.systemId, s.id) === 1)
      .flatMap((s) => s.planets)
      .find((p) => p.owner === null && p.habitability > 0)!
    const ship = colonist(w, civ, target)
    expect(until(w, () => !ship.alive, 1500)).toBe(true)
    expect(target.owner).toBe(civ.id)
    expect(w.events.some((e) => e.kind === 'colony' && e.pri === 0)).toBe(true)
  })

  test('цель заняли — колонисты летят к другой', () => {
    const w = quietWorld(3)
    const civ = w.civs[0]
    const home = capitalOf(w, civ)!
    const target = w.galaxy.systems[home.systemId].planets.find((p) => p.owner === null && p.habitability > 0)!
    const ship = colonist(w, civ, target)
    target.owner = w.civs[1].id
    target.pop = 1
    stepWorld(w)
    expect(ship.alive).toBe(true)
    expect(ship.mission.type).toBe('colonize')
    expect((ship.mission as { planetId: string }).planetId).not.toBe(target.id)
  })

  test('лететь больше некуда — половина цены возвращается, корабль идёт домой', () => {
    const w = quietWorld(4)
    const civ = w.civs[0]
    const home = capitalOf(w, civ)!
    const target = w.galaxy.systems[home.systemId].planets.find((p) => p.owner === null && p.habitability > 0)!
    const ship = colonist(w, civ, target)
    for (const s of w.galaxy.systems) for (const p of s.planets) if (p.owner === null && p.habitability > 0) p.owner = 999
    const before = civ.eco.ledger.income.refund
    stepWorld(w)
    expect(civ.eco.ledger.income.refund - before).toBeCloseTo(80)
    expect(ship.mission.type).toBe('return')
  })
})

describe('добыча', () => {
  test('шахтёр привозит 20 руды = 16 кр, астероид беднеет на 20', () => {
    const w = quietWorld(5)
    const civ = w.civs[0]
    const home = capitalOf(w, civ)!
    const sys = w.galaxy.systems[home.systemId]
    const oreBefore = sys.asteroids.reduce((s, a) => s + a.ore, 0)
    spawnShip(w, civ, 'miner', home, { type: 'mine', phase: 'out', asteroidId: null, cargo: 0, idleT: 0 }, 45)
    expect(until(w, () => civ.eco.ledger.income.mining > 0, 900)).toBe(true)
    expect(civ.eco.ledger.income.mining).toBeCloseTo(16)
    expect(oreBefore - sys.asteroids.reduce((s, a) => s + a.ore, 0)).toBeCloseTo(20)
  })

  test('без астероидов шахтёр ждёт у планеты, а не исчезает', () => {
    const w = quietWorld(5)
    const civ = w.civs[0]
    const home = capitalOf(w, civ)!
    const sys = w.galaxy.systems[home.systemId]
    sys.asteroids = []
    sys.asteroidTarget = 0
    const ship = spawnShip(w, civ, 'miner', home, { type: 'mine', phase: 'out', asteroidId: null, cargo: 0, idleT: 0 }, 45)
    run(w, 60)
    expect(ship.alive).toBe(true)
    expect((ship.mission as { idleT: number }).idleT).toBeGreaterThan(50)
  })

  test('выработанные астероиды отрастают по одному раз в 30 с', () => {
    const w = quietWorld(6)
    const sys = w.galaxy.systems[0]
    const full = sys.asteroids.length
    sys.asteroids.splice(0, 3)
    for (let i = 0; i < 300; i++) {
      w.t += 0.1
      stepAsteroids(w)
    }
    expect(sys.asteroids.length).toBe(full - 2)
    for (let i = 0; i < 600; i++) {
      w.t += 0.1
      stepAsteroids(w)
    }
    expect(sys.asteroids.length).toBe(full)
  })
})

describe('торговля', () => {
  function tradeSetup(seed: number, partnerCiv: boolean) {
    const w = quietWorld(seed)
    const civ = w.civs[0]
    const a = capitalOf(w, civ)!
    a.pop = capOf(a, civ)
    let b: Planet
    if (partnerCiv) {
      const other = w.civs.find((c) => c.id !== civ.id && w.planets.get(c.capital)!.systemId === a.systemId) ?? w.civs[1]
      b = capitalOf(w, other)!
      b.pop = capOf(b, other)
    } else {
      b = w.galaxy.systems[a.systemId].planets.find((p) => p.owner === null && p.habitability >= 1)!
      b.owner = civ.id
      b.pop = capOf(b, civ)
    }
    const ship = spawnShip(w, civ, 'caravan', a, { type: 'trade', a: a.id, b: b.id, leg: 0 }, 50)
    return { w, civ, a, b, ship }
  }

  test('доставка приносит 6 + 0.6·√(popA·popB) и рисует «+N»', () => {
    const { w, civ, a, b } = tradeSetup(7, false)
    const expected = Math.min(30, 6 + 0.6 * Math.sqrt(a.pop * b.pop))
    expect(until(w, () => civ.eco.ledger.income.trade > 0, 900)).toBe(true)
    expect(civ.eco.ledger.income.trade).toBeCloseTo(expected, 3)
    expect(w.fx.some((f) => f.kind === 'income' && Math.abs(f.amount - expected) < 1e-3)).toBe(true)
  })

  test('партнёр-держава получает половину выручки', () => {
    const { w, civ, b } = tradeSetup(8, true)
    expect(until(w, () => civ.eco.ledger.income.trade > 0, 1500)).toBe(true)
    const partner = w.civs.find((c) => c.id === b.owner)!
    expect(partner.eco.ledger.income.tradePartner).toBeCloseTo(civ.eco.ledger.income.trade * 0.5, 6)
    expect(w.civs.filter((c) => c.eco.ledger.income.tradePartner > 0).length).toBe(1)
  })

  test('подсказки «+N кр» живут не дольше 5 с', () => {
    const { w, civ } = tradeSetup(7, false)
    until(w, () => civ.eco.ledger.income.trade > 0, 900)
    run(w, 6)
    expect(w.fx.every((f) => w.t - f.t <= 5)).toBe(true)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/sim/missions.test.ts`
Expected: FAIL — cannot resolve `../../src/sim/belts`.

- [ ] **Step 3: Write `src/sim/belts.ts`**

```ts
import { BELT, SIM_DT } from './config'
import type { Vec } from './math'
import { makeAsteroid, planetPos, planetVel } from './system'
import type { Asteroid, StarSystem, World } from './types'

export const asteroidPos = (a: Asteroid, t: number): Vec => planetPos(a, t)
export const asteroidVel = (a: Asteroid, t: number): Vec => planetVel(a, t)

export function nearestAsteroid(sys: StarSystem, pos: Vec, t: number): Asteroid | undefined {
  let best: Asteroid | undefined
  let bd = Infinity
  for (const a of sys.asteroids) {
    if (a.ore <= 0) continue
    const p = asteroidPos(a, t)
    const d = Math.hypot(p.x - pos.x, p.y - pos.y)
    if (d < bd) {
      bd = d
      best = a
    }
  }
  return best
}

/** выработанные пояса медленно зарастают до исходного числа астероидов */
export function stepAsteroids(w: World): void {
  for (const sys of w.galaxy.systems) {
    if (sys.asteroids.length >= sys.asteroidTarget || sys.belts.length === 0) continue
    sys.regrowT += SIM_DT
    if (sys.regrowT + 1e-9 < BELT.regrowEvery) continue
    sys.regrowT = 0
    const bi = w.rng.int(0, sys.belts.length - 1)
    sys.asteroids.push(makeAsteroid(w.rng, sys.nextAsteroid++, bi, sys.belts[bi]))
  }
}
```

- [ ] **Step 4: Add to `src/sim/civ.ts`**

Импорты:

```ts
import { BOT, CIVS, ECON, PALETTE, POP, SIM_DT } from './config'
import { adminTotal, colonyPrice, newEconomy } from './economy'
import { uniqueName } from './names'
import { capOf, civById, colonyTargets } from './query'
import type { Rng } from './rng'
import type { Civ, Planet, World } from './types'
```

В конец файла:

```ts
/** выгода колонии: налог при «зрелой» колонии минус прирост администрации, на кредит цены */
export function colonyValue(w: World, civ: Civ, p: Planet): number {
  const income = ECON.taxPerPop * BOT.colonyMaturity * capOf(p, civ)
  const dAdmin = adminTotal(w, civ, p) - adminTotal(w, civ)
  return (income - dAdmin) / colonyPrice(w, civ, p)
}

export function bestColonyTarget(w: World, civ: Civ, exclude: Set<string>): Planet | null {
  let best: Planet | null = null
  let bestV = -Infinity
  for (const p of colonyTargets(w, civ)) {
    if (exclude.has(p.id)) continue
    const v = colonyValue(w, civ, p)
    if (v > bestV) {
      best = p
      bestV = v
    }
  }
  return best
}
```

- [ ] **Step 5: Replace `src/sim/missions.ts`**

```ts
import { asteroidPos, asteroidVel, nearestAsteroid } from './belts'
import { bestColonyTarget } from './civ'
import { ECON, MOVE, SIM_DT } from './config'
import { earn, tradeIncome } from './economy'
import { pushEvent } from './events'
import type { Vec } from './math'
import { planetGoal, type Goal } from './nav'
import { capitalOf, civById, claimedTargets, populatedOf } from './query'
import { planetPos, planetVel } from './system'
import type { Civ, Mission, Planet, Ship, World } from './types'

type Of<T extends Mission['type']> = Extract<Mission, { type: T }>

export function missionGoal(w: World, ship: Ship): Goal | null {
  switch (ship.mission.type) {
    case 'return':
      return planetGoal(w, ship, ship.mission.planetId, dock)
    case 'colonize':
      return colonizeGoal(w, ship)
    case 'trade':
      return tradeGoal(w, ship)
    case 'mine':
      return mineGoal(w, ship)
  }
}

function dock(_w: World, ship: Ship): void {
  ship.alive = false
}

function goHome(w: World, ship: Ship): void {
  const civ = civById(w, ship.owner)
  const home = civ ? capitalOf(w, civ) : null
  if (!home) {
    ship.alive = false
    return
  }
  ship.mission = { type: 'return', planetId: home.id }
  ship.route = []
}

function fx(w: World, p: Planet, amount: number): void {
  const pos = planetPos(p, w.t)
  w.fx.push({ kind: 'income', t: w.t, systemId: p.systemId, x: pos.x, y: pos.y, amount })
}

// ---------- колонизация ----------

function colonizeGoal(w: World, ship: Ship): Goal | null {
  const m = ship.mission as Of<'colonize'>
  const target = w.planets.get(m.planetId)
  if (!target || target.owner !== null) {
    retarget(w, ship)
    return null
  }
  return planetGoal(w, ship, target.id, settle)
}

function retarget(w: World, ship: Ship): void {
  const m = ship.mission as Of<'colonize'>
  const civ = civById(w, ship.owner)
  if (!civ) {
    ship.alive = false
    return
  }
  const next = bestColonyTarget(w, civ, claimedTargets(w, civ))
  if (next) {
    m.planetId = next.id
    ship.route = []
    return
  }
  earn(civ, m.price * ECON.colonyRefund, 'refund')
  goHome(w, ship)
}

function settle(w: World, ship: Ship): void {
  const m = ship.mission as Of<'colonize'>
  const p = w.planets.get(m.planetId)!
  const civ = civById(w, ship.owner)
  ship.alive = false
  if (!civ || p.owner !== null) return
  p.owner = civ.id
  p.pop = m.settlers
  p.infra = 0
  p.station = false
  const sys = w.galaxy.systems[p.systemId]
  const at = { system: p.systemId, planet: p.id }
  if (p.systemId !== civ.homeSystem) {
    pushEvent(w, { kind: 'colony', pri: 0, text: `🌌 ${civ.name} основало колонию в системе ${sys.name}: ${p.name}`, civs: [civ.id], at })
  } else {
    pushEvent(w, { kind: 'colony', pri: 1, text: `🏙 ${civ.name} основало колонию на ${p.name}`, civs: [civ.id], at })
  }
}

// ---------- торговля ----------

function tradeGoal(w: World, ship: Ship): Goal | null {
  const m = ship.mission as Of<'trade'>
  const a = w.planets.get(m.a)
  const b = w.planets.get(m.b)
  if (!a || !b || a.pop <= 0 || b.pop <= 0 || a.owner === null || b.owner === null) {
    goHome(w, ship)
    return null
  }
  return planetGoal(w, ship, m.leg === 0 ? b.id : a.id, deliver)
}

function deliver(w: World, ship: Ship): void {
  const m = ship.mission as Of<'trade'>
  const civ = civById(w, ship.owner)
  if (!civ) return
  const a = w.planets.get(m.a)!
  const b = w.planets.get(m.b)!
  const amount = tradeIncome(civ, a, b)
  earn(civ, amount, 'trade')
  const partnerId = a.owner !== civ.id ? a.owner : b.owner !== civ.id ? b.owner : null
  if (partnerId !== null) {
    const partner = civById(w, partnerId)
    if (partner) earn(partner, amount * ECON.tradePartnerShare, 'tradePartner')
  }
  fx(w, m.leg === 0 ? b : a, amount)
  m.leg = m.leg === 0 ? 1 : 0
}

// ---------- добыча ----------

function nearestOwn(w: World, civ: Civ, systemId: number, pos: Vec): Planet | null {
  let best: Planet | null = null
  let bd = Infinity
  for (const p of populatedOf(w, civ)) {
    if (p.systemId !== systemId) continue
    const q = planetPos(p, w.t)
    const d = Math.hypot(q.x - pos.x, q.y - pos.y)
    if (d < bd) {
      bd = d
      best = p
    }
  }
  return best
}

function mineGoal(w: World, ship: Ship): Goal | null {
  const m = ship.mission as Of<'mine'>
  const civ = civById(w, ship.owner)
  if (!civ) {
    ship.alive = false
    return null
  }
  const sys = w.galaxy.systems[ship.systemId]
  if (m.phase === 'out') {
    let ast = m.asteroidId === null ? undefined : sys.asteroids.find((a) => a.id === m.asteroidId && a.ore > 0)
    if (!ast) {
      ast = nearestAsteroid(sys, ship.pos, w.t)
      m.asteroidId = ast?.id ?? null
    }
    if (!ast) return idleGoal(w, ship, civ)
    return { pos: asteroidPos(ast, w.t), vel: asteroidVel(ast, w.t), frameR: ast.size + 150, dockR: ast.size + 10, onReach: dig }
  }
  const home = nearestOwn(w, civ, ship.systemId, ship.pos)
  if (!home) {
    goHome(w, ship)
    return null
  }
  return planetGoal(w, ship, home.id, unload)
}

/** руды нет — ждём у своей планеты */
function idleGoal(w: World, ship: Ship, civ: Civ): Goal | null {
  const m = ship.mission as Of<'mine'>
  m.idleT += SIM_DT
  const home = nearestOwn(w, civ, ship.systemId, ship.pos)
  if (!home) {
    goHome(w, ship)
    return null
  }
  const p = planetPos(home, w.t)
  return {
    pos: { x: p.x + home.radius + 40, y: p.y },
    vel: planetVel(home, w.t),
    frameR: home.radius * MOVE.frameMatchMul + MOVE.frameMatchPad,
    dockR: 0,
    onReach: () => {},
  }
}

function dig(w: World, ship: Ship): void {
  const m = ship.mission as Of<'mine'>
  const sys = w.galaxy.systems[ship.systemId]
  const i = sys.asteroids.findIndex((a) => a.id === m.asteroidId)
  if (i < 0) {
    m.asteroidId = null
    return
  }
  const ast = sys.asteroids[i]
  const take = Math.min(ECON.minerCargo, ast.ore)
  ast.ore -= take
  if (ast.ore <= 1e-9) sys.asteroids.splice(i, 1)
  m.cargo = take
  m.phase = 'back'
  m.asteroidId = null
}

function unload(w: World, ship: Ship): void {
  const m = ship.mission as Of<'mine'>
  const civ = civById(w, ship.owner)
  if (civ && m.cargo > 0) {
    const amount = m.cargo * ECON.orePrice
    earn(civ, amount, 'mining')
    const home = nearestOwn(w, civ, ship.systemId, ship.pos)
    if (home) fx(w, home, amount)
  }
  m.cargo = 0
  m.phase = 'out'
}
```

- [ ] **Step 6: Modify `src/sim/world.ts` — астероиды и чистка подсказок**

```ts
import { stepAsteroids } from './belts'
import { EVENTS, SIM_DT } from './config'
```

```ts
export function stepWorld(w: World): void {
  w.t += SIM_DT
  w.tick++
  stepPopulation(w)
  stepEconomy(w)
  stepShips(w)
  stepAsteroids(w)
  while (w.fx.length && w.t - w.fx[0].t > EVENTS.fxLife) w.fx.shift()
}
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `npm test && npm run typecheck`
Expected: PASS, включая тесты задачи 10: там «шахтёры» стоят в системе без астероидов (`steadyCiv` убирает их), поэтому теперь они ждут у планеты и ничего не зарабатывают.

- [ ] **Step 8: Commit**

```bash
git add src/sim tests
git commit -m "sim: colonization, mining, trade missions; asteroid regrowth

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 13: Варианты покупок и временный бот

**Files:**
- Create: `src/sim/options.ts`, `src/sim/bot.ts`
- Modify: `src/sim/world.ts` (`stepWorld`)
- Test: `tests/sim/bot.test.ts`

**Interfaces:**
- Consumes: всё из `economy.ts`, `invest.ts`, `query.ts`, `spawnShip`, `setDestination`, `findPath`, `hops`, `colonyValue`.
- Produces:
  - `options.ts`: `type OptionKind = 'colony' | 'station' | 'infra' | 'port' | 'shipyard' | 'research' | 'caravan' | 'miner'`, `interface Option { kind; price; envelope: Envelope; dIncome; dUpkeep; planetId?: string; partnerId?: string; branch?: ResearchBranch }`, `score(o): number` (`(dIncome − dUpkeep) / price`), `listOptions(w, civ): Option[]`, `execute(w, civ, o): boolean`, `tradeRoutes(w, civ): { a: Planet; b: Planet; internal: boolean }[]`. Событие `trade-route` (P1) при первой межсистемной трассе пары систем.
  - `bot.ts`: `decide(w, civ): Option | null`, `stepBots(w): void`.

- [ ] **Step 1: Write the failing test**

`tests/sim/bot.test.ts`:

```ts
import { describe, expect, test } from 'vitest'
import { decide } from '../../src/sim/bot'
import { listOptions } from '../../src/sim/options'
import { capitalOf, populatedOf } from '../../src/sim/query'
import { hops } from '../../src/sim/routing'
import { spawnShip } from '../../src/sim/ships'
import type { Civ, World } from '../../src/sim/types'
import { createWorld } from '../../src/sim/world'
import { quietWorld, run } from '../helpers'

function rich(seed = 1): { w: World; civ: Civ } {
  const w = quietWorld(seed)
  const civ = w.civs[0]
  civ.treasury = 10_000
  civ.eco.envelopes = { expand: 3000, develop: 3000, trade: 3000, reserve: 0 }
  capitalOf(w, civ)!.pop = 6
  return { w, civ }
}

describe('listOptions', () => {
  test('колонии — свободные пригодные планеты не дальше 2 коридоров', () => {
    const { w, civ } = rich()
    const home = capitalOf(w, civ)!
    const cols = listOptions(w, civ).filter((o) => o.kind === 'colony')
    expect(cols.length).toBeGreaterThan(0)
    for (const o of cols) {
      const p = w.planets.get(o.planetId!)!
      expect(p.owner).toBeNull()
      expect(p.habitability).toBeGreaterThan(0)
      expect(hops(w.galaxy, home.systemId, p.systemId)).toBeLessThanOrEqual(2)
      expect(o.envelope).toBe('expand')
    }
  })

  test('туда, куда уже летят свои колонисты, вторую экспедицию не предлагают', () => {
    const { w, civ } = rich()
    const first = listOptions(w, civ).find((o) => o.kind === 'colony')!
    spawnShip(w, civ, 'colony', capitalOf(w, civ)!, { type: 'colonize', planetId: first.planetId!, settlers: 0.5, price: 160 }, 160)
    expect(listOptions(w, civ).some((o) => o.kind === 'colony' && o.planetId === first.planetId)).toBe(false)
  })

  test('в столице меньше 3.5 тыс. — колоний нет', () => {
    const { w, civ } = rich()
    capitalOf(w, civ)!.pop = 3.4
    expect(listOptions(w, civ).some((o) => o.kind === 'colony')).toBe(false)
  })

  test('станции — только на планетах с пригодностью ниже 0.5', () => {
    const { w, civ } = rich()
    for (const o of listOptions(w, civ).filter((x) => x.kind === 'station')) {
      expect(w.planets.get(o.planetId!)!.habitability).toBeLessThan(0.5)
    }
  })

  test('инфраструктура столицы стоит 120; на уровне III не предлагается', () => {
    const { w, civ } = rich()
    const home = capitalOf(w, civ)!
    expect(listOptions(w, civ).find((o) => o.kind === 'infra' && o.planetId === home.id)!.price).toBe(120)
    home.infra = 3
    expect(listOptions(w, civ).some((o) => o.kind === 'infra' && o.planetId === home.id)).toBe(false)
  })

  test('на старте 4 исследования по 300, порт и верфь', () => {
    const { w, civ } = rich()
    const opts = listOptions(w, civ)
    expect(opts.filter((o) => o.kind === 'research').map((o) => o.price)).toEqual([300, 300, 300, 300])
    expect(opts.some((o) => o.kind === 'port')).toBe(true)
    expect(opts.some((o) => o.kind === 'shipyard')).toBe(true)
  })

  test('внутренний караван — только при двух своих населённых планетах', () => {
    const { w, civ } = rich()
    const internal = () => listOptions(w, civ).filter((o) => o.kind === 'caravan' && w.planets.get(o.partnerId!)!.owner === civ.id)
    expect(internal().length).toBe(0)
    const home = capitalOf(w, civ)!
    const p = w.galaxy.systems[home.systemId].planets.find((x) => x.owner === null && x.habitability > 0)!
    p.owner = civ.id
    p.pop = 1
    expect(internal().length).toBe(1)
  })

  test('внешний караван — партнёр не дальше 2 коридоров', () => {
    const { w, civ } = rich()
    const home = capitalOf(w, civ)!
    for (const o of listOptions(w, civ).filter((x) => x.kind === 'caravan')) {
      const b = w.planets.get(o.partnerId!)!
      if (b.owner !== civ.id) expect(hops(w.galaxy, home.systemId, b.systemId)).toBeLessThanOrEqual(2)
    }
  })
})

describe('decide', () => {
  test('деньги только в конверте развития — покупается развитие', () => {
    const { w, civ } = rich()
    civ.eco.envelopes = { expand: 0, develop: 3000, trade: 0, reserve: 0 }
    const o = decide(w, civ)!
    expect(['infra', 'port', 'shipyard', 'research']).toContain(o.kind)
  })

  test('деньги только в конверте расширения — летят колонисты', () => {
    const { w, civ } = rich()
    civ.eco.envelopes = { expand: 3000, develop: 0, trade: 0, reserve: 0 }
    const o = decide(w, civ)!
    expect(o.kind).toBe('colony')
    expect(w.ships.some((s) => s.owner === civ.id && s.kind === 'colony')).toBe(true)
    expect(capitalOf(w, civ)!.pop).toBeCloseTo(5.5)
  })

  test('в долгах ничего не покупает', () => {
    const { w, civ } = rich()
    civ.eco.stage = 'deficit'
    expect(decide(w, civ)).toBeNull()
  })
})

describe('боты в живом мире', () => {
  test('за 10 минут каждая держава что-то покупает, и в галактике появляются колонии', () => {
    const w = createWorld(1)
    run(w, 600)
    for (const c of w.civs) {
      const bought = c.eco.ledger.expense
      expect(bought.colony + bought.caravan + bought.miner + bought.station + bought.infra + bought.port + bought.shipyard + bought.research).toBeGreaterThan(0)
    }
    expect(w.civs.some((c) => populatedOf(w, c).length >= 2)).toBe(true)
  }, 120_000)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/sim/bot.test.ts`
Expected: FAIL — cannot resolve `../../src/sim/bot`.

- [ ] **Step 3: Write `src/sim/options.ts`**

```ts
import { BOT, ECON, MOVE, POP, RESEARCH, RESEARCH_BRANCHES, SHIP_KINDS, type Envelope, type ResearchBranch } from './config'
import { adminTotal, buy, colonyPrice, shipPrice, shipUpkeep, stationIncome, taxOf, tradeIncome } from './economy'
import { pushEvent } from './events'
import { tryInfra, tryProject, tryResearch, tryStation } from './invest'
import { setDestination } from './nav'
import { capOf, capitalOf, capitalSystem, colonyTargets, populatedOf, stationTargets } from './query'
import { findPath, hops } from './routing'
import { spawnShip } from './ships'
import { planetPos } from './system'
import type { Civ, Planet, World } from './types'

export type OptionKind = 'colony' | 'station' | 'infra' | 'port' | 'shipyard' | 'research' | 'caravan' | 'miner'

export interface Option {
  kind: OptionKind
  price: number
  envelope: Envelope
  /** прирост дохода, кр/с */
  dIncome: number
  /** прирост содержания, кр/с */
  dUpkeep: number
  planetId?: string
  partnerId?: string
  branch?: ResearchBranch
}

/** окупаемость: чистая прибыль в секунду на кредит цены */
export function score(o: Option): number {
  return (o.dIncome - o.dUpkeep) / o.price
}

export interface Route {
  a: Planet
  b: Planet
  internal: boolean
}

export function tradeRoutes(w: World, civ: Civ): Route[] {
  const out: Route[] = []
  for (const s of w.ships) {
    if (!s.alive || s.owner !== civ.id || s.mission.type !== 'trade') continue
    const a = w.planets.get(s.mission.a)
    const b = w.planets.get(s.mission.b)
    if (a && b) out.push({ a, b, internal: a.owner === civ.id && b.owner === civ.id })
  }
  return out
}

function legTime(w: World, a: Planet, b: Planet): number {
  const speed = SHIP_KINDS.caravan.speed
  if (a.systemId === b.systemId) {
    const pa = planetPos(a, w.t)
    const pb = planetPos(b, w.t)
    return Math.hypot(pa.x - pb.x, pa.y - pb.y) / speed + 10
  }
  const path = findPath(w.galaxy, a.systemId, b.systemId) ?? []
  let transit = 0
  let from = a.systemId
  for (const to of path) {
    const c = w.galaxy.corridors.find((k) => (k.a === from && k.b === to) || (k.b === from && k.a === to))
    transit += c?.transit ?? 0
    from = to
  }
  const sa = w.galaxy.systems[a.systemId]
  const sb = w.galaxy.systems[b.systemId]
  return (sa.radius + sb.radius) / speed + transit + MOVE.crossingCost * Math.max(0, path.length - 1)
}

function bestRoute(w: World, civ: Civ, internal: boolean, routes: Route[]): { a: Planet; b: Planet; rate: number } | null {
  const capSys = capitalSystem(w, civ)
  let best: { a: Planet; b: Planet; rate: number } | null = null
  for (const a of populatedOf(w, civ)) {
    for (const b of w.planets.values()) {
      if (b.id === a.id || b.pop <= 0 || b.owner === null) continue
      if ((b.owner === civ.id) !== internal) continue
      if (internal && b.id < a.id) continue
      if (!internal && hops(w.galaxy, capSys, b.systemId) > ECON.tradeMaxHops) continue
      if (routes.some((r) => (r.a.id === a.id && r.b.id === b.id) || (r.a.id === b.id && r.b.id === a.id))) continue
      const rate = tradeIncome(civ, a, b) / legTime(w, a, b)
      if (!best || rate > best.rate) best = { a, b, rate }
    }
  }
  return best
}

function minerBase(w: World, civ: Civ): { planet: Planet; rate: number } | null {
  let best: { planet: Planet; rate: number } | null = null
  for (const p of populatedOf(w, civ)) {
    const sys = w.galaxy.systems[p.systemId]
    if (!sys.belts.length || !sys.asteroids.some((a) => a.ore > 0)) continue
    const belt = sys.belts.reduce((x, y) => (Math.abs(y.orbit - p.orbit) < Math.abs(x.orbit - p.orbit) ? y : x))
    const trip = (2 * Math.abs(belt.orbit - p.orbit) + 400) / SHIP_KINDS.miner.speed + 20
    const rate = (ECON.minerCargo * ECON.orePrice) / trip
    if (!best || rate > best.rate) best = { planet: p, rate }
  }
  return best
}

function shipUpkeepTotal(w: World, civ: Civ): number {
  let s = 0
  for (const sh of w.ships) if (sh.alive && sh.owner === civ.id) s += shipUpkeep(civ, sh.kind)
  return s
}

function researchGain(w: World, civ: Civ, b: ResearchBranch, shipUp: number): number {
  switch (b) {
    case 'logistics':
      return RESEARCH.logistics.perLevel * shipUp
    case 'admin':
      return RESEARCH.admin.perLevel * adminTotal(w, civ)
    case 'agro':
      return RESEARCH.agro.perLevel * populatedOf(w, civ).reduce((s, p) => s + taxOf(p, civ), 0)
    case 'engines':
      return 0.5 * RESEARCH.engines.perLevel * civ.eco.tradeEma
  }
}

export function listOptions(w: World, civ: Civ): Option[] {
  const out: Option[] = []
  const capital = capitalOf(w, civ)
  if (!capital) return out
  const mine = populatedOf(w, civ)

  if (capital.pop >= POP.settlers + POP.capitalReserve) {
    const admin0 = adminTotal(w, civ)
    for (const p of colonyTargets(w, civ)) {
      out.push({
        kind: 'colony',
        price: colonyPrice(w, civ, p),
        envelope: 'expand',
        dIncome: ECON.taxPerPop * BOT.colonyMaturity * capOf(p, civ),
        dUpkeep: adminTotal(w, civ, p) - admin0,
        planetId: p.id,
      })
    }
  }

  for (const p of stationTargets(w, civ)) {
    out.push({ kind: 'station', price: ECON.stationPrice, envelope: 'trade', dIncome: stationIncome(w.galaxy.systems[p.systemId]), dUpkeep: ECON.stationUpkeep, planetId: p.id })
  }

  for (const p of mine) {
    if (p.infra < 3 && !p.build) {
      out.push({ kind: 'infra', price: ECON.infraPrice[p.infra], envelope: 'develop', dIncome: ECON.taxPerPop * p.pop * ECON.infraTax, dUpkeep: 0, planetId: p.id })
    }
  }

  const shipUp = shipUpkeepTotal(w, civ)
  if (!civ.project) {
    if (!civ.port) out.push({ kind: 'port', price: ECON.portPrice, envelope: 'develop', dIncome: (ECON.portTradeMul - 1) * civ.eco.tradeEma + 0.1, dUpkeep: 0 })
    if (!civ.shipyard) out.push({ kind: 'shipyard', price: ECON.shipyardPrice, envelope: 'develop', dIncome: (1 - ECON.shipyardUpkeepMul) * shipUp + 0.05, dUpkeep: 0 })
  }

  if (!civ.researchJob) {
    for (const b of RESEARCH_BRANCHES) {
      const lvl = civ.research[b]
      if (lvl < 3) out.push({ kind: 'research', price: ECON.researchPrice[lvl], envelope: 'develop', dIncome: researchGain(w, civ, b, shipUp), dUpkeep: 0, branch: b })
    }
  }

  const routes = tradeRoutes(w, civ)
  const routeLimit = 1 + (civ.port ? 1 : 0)
  for (const internal of [true, false]) {
    if (routes.filter((r) => r.internal === internal).length >= routeLimit) continue
    const best = bestRoute(w, civ, internal, routes)
    if (best) {
      out.push({ kind: 'caravan', price: shipPrice(civ, 'caravan'), envelope: 'trade', dIncome: best.rate, dUpkeep: shipUpkeep(civ, 'caravan'), planetId: best.a.id, partnerId: best.b.id })
    }
  }

  const miners = w.ships.filter((s) => s.alive && s.owner === civ.id && s.kind === 'miner').length
  if (miners < Math.min(BOT.minerMax, BOT.minerBase + Math.floor(mine.length / 2))) {
    const base = minerBase(w, civ)
    if (base) out.push({ kind: 'miner', price: shipPrice(civ, 'miner'), envelope: 'trade', dIncome: base.rate, dUpkeep: shipUpkeep(civ, 'miner'), planetId: base.planet.id })
  }

  return out
}

export function execute(w: World, civ: Civ, o: Option): boolean {
  switch (o.kind) {
    case 'colony': {
      const target = w.planets.get(o.planetId!)
      const capital = capitalOf(w, civ)
      if (!target || !capital || capital.pop < POP.settlers + POP.capitalReserve) return false
      if (!buy(civ, 'colony', o.price, 'expand', o.dUpkeep)) return false
      capital.pop -= POP.settlers
      const ship = spawnShip(w, civ, 'colony', capital, { type: 'colonize', planetId: target.id, settlers: POP.settlers, price: o.price }, o.price)
      setDestination(w, ship, target.systemId)
      return true
    }
    case 'station':
      return tryStation(civ, w.planets.get(o.planetId!)!)
    case 'infra':
      return tryInfra(civ, w.planets.get(o.planetId!)!)
    case 'port':
    case 'shipyard':
      return tryProject(civ, o.kind)
    case 'research':
      return tryResearch(civ, o.branch!)
    case 'caravan': {
      const a = w.planets.get(o.planetId!)!
      const b = w.planets.get(o.partnerId!)!
      const newLink = a.systemId !== b.systemId && !tradeRoutes(w, civ).some((r) => sameSystems(r, a, b))
      if (!buy(civ, 'caravan', o.price, 'trade', o.dUpkeep)) return false
      spawnShip(w, civ, 'caravan', a, { type: 'trade', a: a.id, b: b.id, leg: 0 }, o.price)
      if (newLink) {
        const sa = w.galaxy.systems[a.systemId]
        const sb = w.galaxy.systems[b.systemId]
        pushEvent(w, { kind: 'trade-route', pri: 1, text: `🛤 ${civ.name} открыло торговую трассу ${sa.name} — ${sb.name}`, civs: [civ.id], at: { system: a.systemId } })
      }
      return true
    }
    case 'miner': {
      const p = w.planets.get(o.planetId!)!
      if (!buy(civ, 'miner', o.price, 'trade', o.dUpkeep)) return false
      spawnShip(w, civ, 'miner', p, { type: 'mine', phase: 'out', asteroidId: null, cargo: 0, idleT: 0 }, o.price)
      return true
    }
  }
}

function sameSystems(r: Route, a: Planet, b: Planet): boolean {
  return (r.a.systemId === a.systemId && r.b.systemId === b.systemId) || (r.a.systemId === b.systemId && r.b.systemId === a.systemId)
}
```

- [ ] **Step 4: Write `src/sim/bot.ts`**

```ts
import { BOT } from './config'
import { canAfford } from './economy'
import { execute, listOptions, score, type Option } from './options'
import type { Civ, World } from './types'

/** временный бот: покупает самый окупаемый вариант, на который хватает конверта и запаса */
export function decide(w: World, civ: Civ): Option | null {
  if (civ.eco.stage !== 'ok') return null
  const opts = listOptions(w, civ).filter(
    (o) => score(o) > 0 && civ.eco.envelopes[o.envelope] >= o.price && canAfford(civ, o.price, o.dUpkeep),
  )
  opts.sort((a, b) => score(b) - score(a))
  for (const o of opts) if (execute(w, civ, o)) return o
  return null
}

export function stepBots(w: World): void {
  for (const civ of w.civs) {
    if (w.t < civ.nextDecision) continue
    civ.nextDecision = w.t + w.rng.float(BOT.decideMin, BOT.decideMax)
    decide(w, civ)
  }
}
```

- [ ] **Step 5: Modify `src/sim/world.ts` — боты в шаге**

```ts
import { stepBots } from './bot'
```

```ts
export function stepWorld(w: World): void {
  w.t += SIM_DT
  w.tick++
  stepPopulation(w)
  stepEconomy(w)
  stepBots(w)
  stepShips(w)
  stepAsteroids(w)
  while (w.fx.length && w.t - w.fx[0].t > EVENTS.fxLife) w.fx.shift()
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npm test && npm run typecheck`
Expected: PASS. Тесты, которые используют `quietWorld`, не задеты: там `nextDecision = Infinity`. Если падает интеграционный тест «за 10 минут» — это вопрос чисел, а не кода: запиши, какие державы ничего не купили и почему (`listOptions` пустой? конверты пустые? `canAfford` отказывает?), и разберись до коммита.

- [ ] **Step 7: Commit**

```bash
git add src/sim tests
git commit -m "sim: purchase options with payback scoring, temporary economic bot

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 14: Долгие прогоны, балансный и нагрузочный скрипты, настройка чисел

**Files:**
- Create: `src/sim/stress.ts`, `scripts/balance.ts`, `scripts/stress.ts`, `tests/sim/longrun.test.ts`
- Modify: `src/sim/types.ts` (задача `patrol`), `src/sim/missions.ts` (обработка `patrol`), `src/sim/config.ts` (только числа при настройке)

**Interfaces:**
- Consumes: весь `src/sim/`.
- Produces: `Mission` получает вариант `{ type: 'patrol'; a: string; b: string; leg: 0 | 1 }` (летает между планетами без денег — для нагрузки); `spawnStressShips(w, count, focus): number` (возвращает id нагруженной системы); `npm run balance [зёрен] [минут]`, `npm run stress`.

- [ ] **Step 1: Write the failing test**

`tests/sim/longrun.test.ts`:

```ts
import { describe, expect, test } from 'vitest'
import { ledgerBalance, report } from '../../src/sim/economy'
import { spawnStressShips } from '../../src/sim/stress'
import { createWorld, stepWorld } from '../../src/sim/world'
import { snapshot } from '../helpers'

describe('долгие прогоны', () => {
  test('одно зерно через 10 минут — одинаковое состояние, разные зёрна — разное', () => {
    const a = createWorld(77)
    const b = createWorld(77)
    const c = createWorld(78)
    for (let i = 0; i < 6000; i++) {
      stepWorld(a)
      stepWorld(b)
      stepWorld(c)
    }
    expect(snapshot(a)).toBe(snapshot(b))
    expect(snapshot(a)).not.toBe(snapshot(c))
  }, 300_000)

  test('3 зерна × 10 минут: журнал сходится, нет NaN, никто не в звезде, журнал событий ≤ 500', () => {
    for (const seed of [1, 2, 3]) {
      const w = createWorld(seed)
      for (let i = 1; i <= 6000; i++) {
        stepWorld(w)
        if (i % 600 === 0) {
          for (const c of w.civs) {
            expect(Number.isFinite(c.treasury)).toBe(true)
            expect(Math.abs(ledgerBalance(c) - c.treasury)).toBeLessThan(1e-6 * Math.max(1, Math.abs(c.treasury)) + 1e-6)
            const r = report(c)
            for (const v of [r.grossPerMin, r.upkeepPerMin, r.netPerMin, r.reserveMin, r.runwaySec]) expect(Number.isNaN(v)).toBe(false)
          }
        }
        if (i % 50 === 0) {
          for (const s of w.ships) {
            if (!s.transit) expect(Math.hypot(s.pos.x, s.pos.y)).toBeGreaterThan(w.galaxy.systems[s.systemId].star.radius)
          }
        }
      }
      expect(w.events.length).toBeLessThanOrEqual(500)
      expect(w.ships.every((s) => s.alive)).toBe(true)
    }
  }, 600_000)

  test('нагрузка: 2000 кораблей, 600 в одной системе, летают и не исчезают', () => {
    const w = createWorld(1)
    const heavy = spawnStressShips(w, 2000, 600)
    for (let i = 0; i < 100; i++) stepWorld(w)
    expect(w.ships.filter((s) => s.mission.type === 'patrol').length).toBe(2000)
    expect(w.ships.filter((s) => s.mission.type === 'patrol' && s.systemId === heavy && !s.transit).length).toBe(600)
  }, 120_000)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/sim/longrun.test.ts`
Expected: FAIL — cannot resolve `../../src/sim/stress`.

- [ ] **Step 3: Add `patrol` to `src/sim/types.ts`**

```ts
export type Mission =
  | { type: 'colonize'; planetId: string; settlers: number; price: number }
  | { type: 'trade'; a: string; b: string; leg: 0 | 1 }
  | { type: 'mine'; phase: 'out' | 'back'; asteroidId: number | null; cargo: number; idleT: number }
  | { type: 'return'; planetId: string }
  | { type: 'patrol'; a: string; b: string; leg: 0 | 1 }
```

- [ ] **Step 4: Handle `patrol` in `src/sim/missions.ts`**

В `switch` функции `missionGoal`:

```ts
    case 'patrol':
      return planetGoal(w, ship, ship.mission.leg === 0 ? ship.mission.b : ship.mission.a, turnAround)
```

И функция:

```ts
/** патруль: долетел — развернулся к другой планете, без денег и событий */
function turnAround(_w: World, ship: Ship): void {
  const m = ship.mission as Of<'patrol'>
  m.leg = m.leg === 0 ? 1 : 0
}
```

- [ ] **Step 5: Write `src/sim/stress.ts`**

```ts
import { earn } from './economy'
import { spawnShip } from './ships'
import type { World } from './types'

/** count патрульных кораблей, из них focus — в самой большой системе; возвращает её id */
export function spawnStressShips(w: World, count: number, focus: number): number {
  const civ = w.civs[0]
  // чтобы нагрузка не обанкротила державу, сразу оплачиваем содержание надолго
  earn(civ, 1e9, 'refund')
  const heavy = w.galaxy.systems.reduce((a, b) => (b.planets.length > a.planets.length ? b : a))
  const others = w.galaxy.systems.filter((s) => s.id !== heavy.id)
  for (let i = 0; i < count; i++) {
    const sys = i < focus ? heavy : others[i % others.length]
    const n = sys.planets.length
    const a = sys.planets[i % n]
    const b = sys.planets[(i + 1) % n]
    spawnShip(w, civ, 'caravan', a, { type: 'patrol', a: a.id, b: b.id, leg: 0 }, 0)
  }
  return heavy.id
}
```

- [ ] **Step 6: Write `scripts/stress.ts`**

```ts
// Нагрузка: npm run stress — 2000 кораблей, 600 в одной системе; цель — шаг ≤ 6 мс
import { spawnStressShips } from '../src/sim/stress'
import { createWorld, stepWorld } from '../src/sim/world'

const w = createWorld(1)
spawnStressShips(w, 2000, 600)
for (let i = 0; i < 50; i++) stepWorld(w)
const times: number[] = []
for (let i = 0; i < 600; i++) {
  const t0 = performance.now()
  stepWorld(w)
  times.push(performance.now() - t0)
}
times.sort((a, b) => a - b)
const avg = times.reduce((s, x) => s + x, 0) / times.length
const p95 = times[Math.floor(times.length * 0.95)]
console.log(`кораблей: ${w.ships.length}; шаг: в среднем ${avg.toFixed(2)} мс, 95% ≤ ${p95.toFixed(2)} мс (цель ≤ 6 мс)`)
process.exit(avg <= 6 ? 0 : 1)
```

- [ ] **Step 7: Write `scripts/balance.ts`**

```ts
// Балансный прогон: npm run balance [зёрен=12] [минут=30]. Цели — раздел 12.2 спеки.
import { SIM_DT } from '../src/sim/config'
import { ledgerBalance, report } from '../src/sim/economy'
import { populatedOf } from '../src/sim/query'
import { createWorld, stepWorld } from '../src/sim/world'

const SEEDS = Number(process.argv[2] ?? 12)
const MINUTES = Number(process.argv[3] ?? 30)
const PURCHASES = ['colony', 'caravan', 'miner', 'station', 'infra', 'port', 'shipyard', 'research'] as const
const INVEST = ['station', 'infra', 'port', 'shipyard', 'research'] as const

interface SeedResult {
  seed: number
  civs: number
  twoPlanetsAt10: boolean
  corridorHits: number
  corridorSamples: number
  hoarders: number
  upkeepShares: number[]
  investSpend: number
  totalSpend: number
  crossColonies: number
  interTradeBy15: number
  leaderRatio: number
  bankrupt: number
  stepMs: number
  ledgerOk: boolean
}

function runSeed(seed: number): SeedResult {
  const w = createWorld(seed)
  const steps = Math.round((MINUTES * 60) / SIM_DT)
  const every = Math.round(10 / SIM_DT)
  const r: SeedResult = {
    seed, civs: w.civs.length, twoPlanetsAt10: false, corridorHits: 0, corridorSamples: 0, hoarders: 0, upkeepShares: [],
    investSpend: 0, totalSpend: 0, crossColonies: 0, interTradeBy15: 0, leaderRatio: 0, bankrupt: 0, stepMs: 0, ledgerOk: true,
  }
  const hoardSince = new Map<number, number>()
  const hoarders = new Set<number>()
  const bankrupt = new Set<number>()
  let lastEvent = 0
  let ms = 0
  for (let i = 1; i <= steps; i++) {
    const t0 = performance.now()
    stepWorld(w)
    ms += performance.now() - t0
    if (i % every !== 0) continue
    for (const e of w.events) {
      if (e.id <= lastEvent) continue
      if (e.kind === 'colony' && e.pri === 0) r.crossColonies++
      if (e.kind === 'trade-route' && e.t <= 900) r.interTradeBy15++
    }
    lastEvent = w.events.length ? Math.max(lastEvent, w.events[w.events.length - 1].id) : lastEvent
    for (const c of w.civs) {
      if (c.eco.stage === 'bankrupt') bankrupt.add(c.id)
      const rep = report(c)
      if (w.t >= 180) {
        r.corridorSamples++
        if (rep.reserveMin >= 0.5 && rep.reserveMin <= 4) r.corridorHits++
      }
      if (rep.reserveMin > 5) {
        const since = hoardSince.get(c.id) ?? w.t
        hoardSince.set(c.id, since)
        if (w.t - since > 120) hoarders.add(c.id)
      } else {
        hoardSince.delete(c.id)
      }
      if (w.t >= 600 && rep.grossPerMin > 0) r.upkeepShares.push(rep.upkeepPerMin / rep.grossPerMin)
    }
    if (Math.abs(w.t - 600) < SIM_DT) r.twoPlanetsAt10 = w.civs.every((c) => populatedOf(w, c).length >= 2)
  }
  const pops = w.civs.map((c) => populatedOf(w, c).reduce((s, p) => s + p.pop, 0)).sort((a, b) => b - a)
  r.leaderRatio = pops.length > 1 && pops[1] > 0 ? pops[0] / pops[1] : Infinity
  for (const c of w.civs) {
    for (const k of PURCHASES) r.totalSpend += c.eco.ledger.expense[k]
    for (const k of INVEST) r.investSpend += c.eco.ledger.expense[k]
    if (Math.abs(ledgerBalance(c) - c.treasury) > 1e-6 * Math.max(1, Math.abs(c.treasury)) + 1e-6) r.ledgerOk = false
  }
  r.hoarders = hoarders.size
  r.bankrupt = bankrupt.size
  r.stepMs = ms / steps
  return r
}

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b)
  return s.length ? s[Math.floor(s.length / 2)] : 0
}

const results: SeedResult[] = []
for (let s = 1; s <= SEEDS; s++) {
  const r = runSeed(s)
  results.push(r)
  console.log(
    `зерно ${s}: держав ${r.civs}, ≥2 планет к 10 мин: ${r.twoPlanetsAt10 ? 'да' : 'нет'}, колоний в чужих системах ${r.crossColonies}, ` +
      `трасс к 15 мин ${r.interTradeBy15}, лидер/второй ${r.leaderRatio.toFixed(2)}, банкротов ${r.bankrupt}, шаг ${r.stepMs.toFixed(2)} мс`,
  )
}

const all = results
const share = (n: number) => n / all.length
const checks: [string, boolean, string][] = [
  ['все стартовые державы с ≥ 2 планетами к 10-й мин', share(all.filter((r) => r.twoPlanetsAt10).length) >= 0.8, `${all.filter((r) => r.twoPlanetsAt10).length}/${all.length} зёрен (нужно ≥ 80%)`],
  ['запас казны 0.5–4 мин дохода', all.reduce((s, r) => s + r.corridorHits, 0) / Math.max(1, all.reduce((s, r) => s + r.corridorSamples, 0)) >= 0.7, `${((100 * all.reduce((s, r) => s + r.corridorHits, 0)) / Math.max(1, all.reduce((s, r) => s + r.corridorSamples, 0))).toFixed(0)}% времени (нужно ≥ 70%)`],
  ['никто не копит > 5 мин дохода дольше 120 с', all.every((r) => r.hoarders === 0), `${all.reduce((s, r) => s + r.hoarders, 0)} держав`],
  ['содержание / доход с 10-й мин — медиана 0.35–0.65', (() => { const m = median(all.flatMap((r) => r.upkeepShares)); return m >= 0.35 && m <= 0.65 })(), median(all.flatMap((r) => r.upkeepShares)).toFixed(2)],
  ['инвестиции ≥ 20% трат', all.reduce((s, r) => s + r.investSpend, 0) / Math.max(1, all.reduce((s, r) => s + r.totalSpend, 0)) >= 0.2, `${((100 * all.reduce((s, r) => s + r.investSpend, 0)) / Math.max(1, all.reduce((s, r) => s + r.totalSpend, 0))).toFixed(0)}%`],
  ['колония в чужой системе в каждой партии', all.every((r) => r.crossColonies >= 1), `${all.filter((r) => r.crossColonies >= 1).length}/${all.length}`],
  ['≥ 2 межсистемные трассы к 15-й мин в каждой партии', all.every((r) => r.interTradeBy15 >= 2), `${all.filter((r) => r.interTradeBy15 >= 2).length}/${all.length}`],
  ['лидер ≤ 2× второго к концу в ≥ 70% зёрен', share(all.filter((r) => r.leaderRatio <= 2).length) >= 0.7, `${all.filter((r) => r.leaderRatio <= 2).length}/${all.length}`],
  ['банкротов ≤ 30% держав', all.reduce((s, r) => s + r.bankrupt, 0) / all.reduce((s, r) => s + r.civs, 0) <= 0.3, `${all.reduce((s, r) => s + r.bankrupt, 0)}/${all.reduce((s, r) => s + r.civs, 0)}`],
  ['средний шаг ≤ 2 мс', all.every((r) => r.stepMs <= 2), `макс ${Math.max(...all.map((r) => r.stepMs)).toFixed(2)} мс`],
  ['журнал денег сходится', all.every((r) => r.ledgerOk), all.every((r) => r.ledgerOk) ? 'да' : 'НЕТ'],
]
console.log('\nИТОГ')
for (const [name, ok, value] of checks) console.log(`${ok ? 'OK  ' : 'FAIL'} ${name}: ${value}`)
process.exit(checks.every(([, ok]) => ok) ? 0 : 1)
```

- [ ] **Step 8: Run tests and scripts**

Run: `npm test && npm run typecheck && npm run stress && npm run balance`
Expected: тесты PASS; `stress` — средний шаг ≤ 6 мс; `balance` печатает таблицу и ИТОГ.

- [ ] **Step 9: Настроить числа под цели баланса**

Если в ИТОГ есть FAIL — менять **только числа** в `src/sim/config.ts`, формулы и тесты не трогать. Ручки:

| Не проходит | Что крутить |
|---|---|
| ≥ 2 планет к 10-й мин | `POP.growth` ↑, `POP.capitalReserve` ↓, `ECON.colonyBase` ↓, `ENVELOPE_SHARES.expand` ↑ |
| коридор запаса / накопители | `ECON.envelopeCapMul` ↓ (тратят больше), `ENVELOPE_SHARES.reserve` ↓ |
| доля содержания | `ECON.adminBase`, `ECON.adminPerPlanet`, `SHIP_KINDS.*.upkeep`, `ECON.stationUpkeep` |
| инвестиции < 20% | `ENVELOPE_SHARES.develop` ↑, цены `infraPrice` ↓ |
| колонии в чужих системах | `ECON.colonyOtherSystem` ↓, `ECON.tradeMaxHops` |
| межсистемные трассы | `ECON.tradeBase` ↑, `MOVE.crossingCost` ↓ |
| лидер > 2× | `ECON.adminPerPlanet` ↑ (сверхлинейная администрация сильнее тормозит лидера) |
| банкротов много | `ECON.reserveMin` ↑, `ECON.runwayMin` ↑ |
| шаг > 2 мс | профилировать `stepWorld` (самое тяжёлое — `colonyTargets`/`reachableSystems` в `fillEnvelopes`); кэшировать досягаемые системы на шаг |

После каждого изменения: `npm test && npm run balance`. Не больше 5 итераций. Если после 5 итераций остаются FAIL — остановиться и принести владельцу таблицу ИТОГ с объяснением, какая цель конфликтует с какой. Цели не ослаблять самостоятельно.

- [ ] **Step 10: Commit**

Итоговую таблицу ИТОГ вставить в сообщение коммита.

```bash
git add src/sim scripts tests
git commit -m "sim: long-run invariants, balance and stress scripts, tuned numbers

<таблица ИТОГ из npm run balance>

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 15: Часы симуляции и камера

Чистая математика без Pixi — проверяется тестами.

**Files:**
- Create: `src/app/loop.ts`, `src/render/camera.ts`
- Test: `tests/app/loop.test.ts`, `tests/render/camera.test.ts`

**Interfaces:**
- Consumes: `SIM_DT`, `MAX_STEPS_PER_FRAME`, `MAX_FRAME_DT`, `Galaxy`, `math.ts`.
- Produces:
  - `loop.ts`: `interface Clock { acc: number; speed: number }`, `createClock(speed = 1): Clock`, `advance(clock, realDt, step: () => void): number`, `alpha(clock): number`.
  - `camera.ts`: `interface View { width; height }`, `interface Bounds { minX; minY; maxX; maxY }`, `interface CamTarget { x; y; zoom }`, `interface Camera { x; y; zoom; vx; vy; fly: Fly | null; follow: string | null }`, `ZOOM_MAX = 3`, `type Lod = 'galaxy' | 'approach' | 'system'`, `interface LodInfo { level; approachAlpha; systemAlpha }`, `createCamera()`, `worldToScreen(cam, view, p)`, `screenToWorld(cam, view, s)`, `galaxyBounds(g)`, `fitZoom(view, b, pad = 1.15)`, `zoomAt(cam, view, screen, factor, minZoom)`, `flyDuration(z0, z1)`, `startFly(cam, to, now)`, `updateCamera(cam, now, dt)`, `lodOf(systemRadius, zoom)`.

- [ ] **Step 1: Write the failing tests**

`tests/app/loop.test.ts`:

```ts
import { describe, expect, test } from 'vitest'
import { advance, alpha, createClock } from '../../src/app/loop'

describe('часы симуляции', () => {
  test('пауза — ни одного шага', () => {
    const c = createClock(0)
    expect(advance(c, 0.016, () => {})).toBe(0)
  })

  test('×1: кадр 0.25 с — 2 шага по 0.1, остаток 0.05', () => {
    const c = createClock(1)
    let n = 0
    expect(advance(c, 0.25, () => n++)).toBe(2)
    expect(n).toBe(2)
    expect(alpha(c)).toBeCloseTo(0.5)
  })

  test('×50 при 60 кадрах: 8 шагов за кадр', () => {
    const c = createClock(50)
    expect(advance(c, 1 / 60, () => {})).toBe(8)
  })

  test('вернулись из фоновой вкладки: кадр 30 с обрезается до 0.25 с', () => {
    const c = createClock(1)
    expect(advance(c, 30, () => {})).toBe(2)
  })

  test('больше 60 шагов за кадр не делаем, лишнее время отбрасываем', () => {
    const c = createClock(50)
    expect(advance(c, 0.25, () => {})).toBe(60)
    expect(c.acc).toBe(0)
  })
})
```

`tests/render/camera.test.ts`:

```ts
import { describe, expect, test } from 'vitest'
import {
  createCamera, fitZoom, flyDuration, lodOf, screenToWorld, startFly, updateCamera, worldToScreen, zoomAt,
} from '../../src/render/camera'

describe('камера', () => {
  const view = { width: 800, height: 600 }

  test('мир ↔ экран', () => {
    const cam = { ...createCamera(), x: 100, y: 50, zoom: 2 }
    expect(worldToScreen(cam, view, { x: 110, y: 60 })).toEqual({ x: 420, y: 320 })
    expect(screenToWorld(cam, view, { x: 420, y: 320 })).toEqual({ x: 110, y: 60 })
  })

  test('зум колесом держит точку под курсором', () => {
    const cam = { ...createCamera(), x: 0, y: 0, zoom: 0.5 }
    const cursor = { x: 650, y: 120 }
    const before = screenToWorld(cam, view, cursor)
    zoomAt(cam, view, cursor, 2, 0.01)
    const after = screenToWorld(cam, view, cursor)
    expect(after.x).toBeCloseTo(before.x)
    expect(after.y).toBeCloseTo(before.y)
    expect(cam.zoom).toBe(1)
  })

  test('зум ограничен снизу и сверху (3)', () => {
    const cam = { ...createCamera(), zoom: 2 }
    zoomAt(cam, view, { x: 0, y: 0 }, 100, 0.01)
    expect(cam.zoom).toBe(3)
    zoomAt(cam, view, { x: 0, y: 0 }, 1e-6, 0.01)
    expect(cam.zoom).toBe(0.01)
  })

  test('длительность перелёта: 0.6 с без смены зума, 1.0 при ×4, не больше 1.4', () => {
    expect(flyDuration(1, 1)).toBeCloseTo(0.6)
    expect(flyDuration(1, 4)).toBeCloseTo(1.0)
    expect(flyDuration(1, 16)).toBeCloseTo(1.4)
    expect(flyDuration(1, 1000)).toBeCloseTo(1.4)
  })

  test('перелёт: на середине зум — среднее геометрическое, в конце — ровно цель', () => {
    const cam = { ...createCamera(), x: 0, y: 0, zoom: 1 }
    startFly(cam, { x: 100, y: 0, zoom: 4 }, 0)
    updateCamera(cam, 0.5, 0)
    expect(cam.zoom).toBeCloseTo(2)
    expect(cam.x).toBeCloseTo(50)
    updateCamera(cam, 1.0, 0)
    expect(cam).toMatchObject({ x: 100, y: 0, zoom: 4, fly: null })
  })

  test('инерция гаснет: через секунду остаётся ~e⁻⁵ скорости', () => {
    const cam = { ...createCamera(), vx: 100 }
    for (let i = 0; i < 10; i++) updateCamera(cam, i * 0.1, 0.1)
    expect(cam.vx).toBeCloseTo(100 * Math.exp(-5), 3)
  })

  test('уровни детализации по экранному радиусу системы', () => {
    expect(lodOf(1000, 0.1)).toEqual({ level: 'galaxy', approachAlpha: 0, systemAlpha: 0 })
    expect(lodOf(1000, 0.18).approachAlpha).toBeCloseTo(0.5)
    expect(lodOf(1000, 0.18).level).toBe('approach')
    expect(lodOf(1000, 0.216).approachAlpha).toBeCloseTo(1)
    expect(lodOf(1000, 0.7)).toMatchObject({ level: 'system', approachAlpha: 1 })
    expect(lodOf(1000, 0.7).systemAlpha).toBeCloseTo(0.5)
  })

  test('вся галактика в кадре — уровень «галактика» на экранах 1280×720 и 2560×1440', () => {
    const b = { minX: -50_000, minY: -30_000, maxX: 50_000, maxY: 30_000 }
    for (const v of [{ width: 1280, height: 720 }, { width: 2560, height: 1440 }]) {
      expect(lodOf(8000, fitZoom(v, b)).level).toBe('galaxy')
    }
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/app tests/render`
Expected: FAIL — cannot resolve `../../src/app/loop`.

- [ ] **Step 3: Write `src/app/loop.ts`**

```ts
import { MAX_FRAME_DT, MAX_STEPS_PER_FRAME, SIM_DT } from '../sim/config'

export interface Clock {
  /** накопленное и ещё не просчитанное игровое время, с */
  acc: number
  /** 0 — пауза */
  speed: number
}

export function createClock(speed = 1): Clock {
  return { acc: 0, speed }
}

/** продвигает симуляцию фиксированными шагами; возвращает число шагов за кадр */
export function advance(clock: Clock, realDt: number, step: () => void): number {
  clock.acc += Math.min(Math.max(realDt, 0), MAX_FRAME_DT) * clock.speed
  let n = 0
  while (clock.acc >= SIM_DT - 1e-9 && n < MAX_STEPS_PER_FRAME) {
    step()
    clock.acc -= SIM_DT
    n++
  }
  if (n === MAX_STEPS_PER_FRAME && clock.acc >= SIM_DT) clock.acc = 0
  if (clock.acc < 0) clock.acc = 0
  return n
}

/** доля шага между последним и следующим состоянием — для плавной отрисовки */
export function alpha(clock: Clock): number {
  return Math.min(1, clock.acc / SIM_DT)
}
```

- [ ] **Step 4: Write `src/render/camera.ts`**

```ts
import { clamp, lerp, type Vec } from '../sim/math'
import type { Galaxy } from '../sim/types'

export interface View {
  width: number
  height: number
}

export interface Bounds {
  minX: number
  minY: number
  maxX: number
  maxY: number
}

export interface CamTarget {
  x: number
  y: number
  zoom: number
}

export interface Fly {
  from: CamTarget
  to: CamTarget
  start: number
  duration: number
}

export interface Camera {
  x: number
  y: number
  zoom: number
  vx: number
  vy: number
  fly: Fly | null
  /** id планеты, за которой камера следует */
  follow: string | null
}

export const ZOOM_MAX = 3
export const LOD = { approach: 180, system: 700, band: 0.2 }
export type Lod = 'galaxy' | 'approach' | 'system'
export interface LodInfo {
  level: Lod
  approachAlpha: number
  systemAlpha: number
}

export function createCamera(): Camera {
  return { x: 0, y: 0, zoom: 0.02, vx: 0, vy: 0, fly: null, follow: null }
}

export function worldToScreen(cam: Camera, view: View, p: Vec): Vec {
  return { x: (p.x - cam.x) * cam.zoom + view.width / 2, y: (p.y - cam.y) * cam.zoom + view.height / 2 }
}

export function screenToWorld(cam: Camera, view: View, s: Vec): Vec {
  return { x: (s.x - view.width / 2) / cam.zoom + cam.x, y: (s.y - view.height / 2) / cam.zoom + cam.y }
}

export function galaxyBounds(g: Galaxy): Bounds {
  const b = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity }
  for (const s of g.systems) {
    b.minX = Math.min(b.minX, s.pos.x - s.radius)
    b.minY = Math.min(b.minY, s.pos.y - s.radius)
    b.maxX = Math.max(b.maxX, s.pos.x + s.radius)
    b.maxY = Math.max(b.maxY, s.pos.y + s.radius)
  }
  return b
}

export function fitZoom(view: View, b: Bounds, pad = 1.15): number {
  return Math.min(view.width / ((b.maxX - b.minX) * pad), view.height / ((b.maxY - b.minY) * pad))
}

/** зум колесом: точка мира под курсором остаётся под курсором */
export function zoomAt(cam: Camera, view: View, screen: Vec, factor: number, minZoom: number): void {
  const before = screenToWorld(cam, view, screen)
  cam.zoom = clamp(cam.zoom * factor, minZoom, ZOOM_MAX)
  const after = screenToWorld(cam, view, screen)
  cam.x += before.x - after.x
  cam.y += before.y - after.y
}

export function flyDuration(z0: number, z1: number): number {
  return clamp(0.6 + 0.2 * Math.abs(Math.log2(z1 / z0)), 0.6, 1.4)
}

export function startFly(cam: Camera, to: CamTarget, now: number): void {
  cam.fly = { from: { x: cam.x, y: cam.y, zoom: cam.zoom }, to, start: now, duration: flyDuration(cam.zoom, to.zoom) }
  cam.vx = 0
  cam.vy = 0
}

const easeInOutCubic = (u: number): number => (u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2)

export function updateCamera(cam: Camera, now: number, dt: number): void {
  if (cam.fly) {
    const f = cam.fly
    const u = clamp((now - f.start) / f.duration, 0, 1)
    const e = easeInOutCubic(u)
    cam.x = lerp(f.from.x, f.to.x, e)
    cam.y = lerp(f.from.y, f.to.y, e)
    cam.zoom = f.from.zoom * Math.pow(f.to.zoom / f.from.zoom, e)
    if (u >= 1) {
      cam.x = f.to.x
      cam.y = f.to.y
      cam.zoom = f.to.zoom
      cam.fly = null
    }
    return
  }
  cam.x += cam.vx * dt
  cam.y += cam.vy * dt
  const k = Math.exp(-dt * 5)
  cam.vx *= k
  cam.vy *= k
}

/** уровень детализации по экранному радиусу системы; альфы плавно переходят в полосе ±20% от порога */
export function lodOf(systemRadius: number, zoom: number): LodInfo {
  const r = systemRadius * zoom
  const ramp = (edge: number) => clamp((r - edge * (1 - LOD.band)) / (2 * edge * LOD.band), 0, 1)
  return {
    level: r < LOD.approach ? 'galaxy' : r < LOD.system ? 'approach' : 'system',
    approachAlpha: ramp(LOD.approach),
    systemAlpha: ramp(LOD.system),
  }
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test && npm run typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/app/loop.ts src/render/camera.ts tests/app tests/render
git commit -m "app: fixed-step clock; render: camera math and LOD

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 16: PixiJS, вид галактики, снимок экрана

**Files:**
- Create: `src/render/textures.ts`, `src/render/territory.ts`, `src/render/starfield.ts`, `src/render/galaxyLayer.ts`, `src/render/renderer.ts`, `scripts/shot.ts`
- Modify: `src/app/main.tsx`, `package.json` (скрипт `shot`), `.gitignore` (`artifacts/`)
- Test: `tests/render/territory.test.ts`

**Interfaces:**
- Consumes: `Camera`, `lodOf`, `worldToScreen`, `galaxyBounds`, `fitZoom`, `createClock`, `advance`, `alpha`, `createWorld`, `stepWorld`, `gateGalaxyPos`, `gateTo`, `findPath`, `civById`.
- Produces:
  - `territory.ts`: `interface Share { civ: number; color: number; share: number }`, `territoryShares(w, sys): Share[]` (населённая планета весит 1, станция 0.5; по убыванию доли).
  - `textures.ts`: `glowTexture(size = 128): Texture`.
  - `GalaxyLayer` (`under`, `over`, `labels`, `update(w, cam, view, lods)`), `Starfield` (`root`, `update(cam, view)`), `GameRenderer` (`constructor(app, w)`, `render(w, cam, view, alpha)`).
  - `window.__orbita = { world, cam, clock, renderer, fastForward(n) }` — отладочный доступ для скриптов.
  - `npm run shot -- "<параметры URL>" <файл.png> "<JS перед снимком>"`.

- [ ] **Step 1: Write the failing test**

`tests/render/territory.test.ts`:

```ts
import { expect, test } from 'vitest'
import { territoryShares } from '../../src/render/territory'
import { quietWorld } from '../helpers'

test('доли держав: населённая планета — 1, станция — 0.5', () => {
  const w = quietWorld(1)
  const sys = w.galaxy.systems.find((s) => s.role === 'pit')!
  const [A, B] = w.civs
  const ps = sys.planets
  ps[0].owner = A.id
  ps[0].pop = 1
  ps[1].owner = A.id
  ps[1].pop = 2
  ps[2].owner = B.id
  ps[2].pop = 1
  if (ps[3]) {
    ps[3].owner = B.id
    ps[3].station = true
  }
  const shares = territoryShares(w, sys)
  const bWeight = ps[3] ? 1.5 : 1
  expect(shares.map((s) => s.civ)).toEqual([A.id, B.id])
  expect(shares[0].share).toBeCloseTo(2 / (2 + bWeight))
  expect(shares[1].share).toBeCloseTo(bWeight / (2 + bWeight))
  expect(shares[0].color).toBe(A.color)
})

test('ничья система — пустой список', () => {
  const w = quietWorld(1)
  expect(territoryShares(w, w.galaxy.systems.find((s) => s.role === 'nebula' || s.role === 'ore')!)).toEqual([])
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/render/territory.test.ts`
Expected: FAIL — cannot resolve `../../src/render/territory`.

- [ ] **Step 3: Write `src/render/territory.ts`**

```ts
import { civById } from '../sim/query'
import type { StarSystem, World } from '../sim/types'

export interface Share {
  civ: number
  color: number
  share: number
}

/** доли держав в системе: населённая планета весит 1, станция — 0.5 */
export function territoryShares(w: World, sys: StarSystem): Share[] {
  const weight = new Map<number, number>()
  let total = 0
  for (const p of sys.planets) {
    if (p.owner === null) continue
    const k = p.pop > 0 ? 1 : p.station ? 0.5 : 0
    if (!k) continue
    weight.set(p.owner, (weight.get(p.owner) ?? 0) + k)
    total += k
  }
  const out: Share[] = []
  for (const [id, wgt] of weight) {
    const c = civById(w, id)
    if (c) out.push({ civ: id, color: c.color, share: wgt / total })
  }
  return out.sort((a, b) => b.share - a.share || a.civ - b.civ)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/render/territory.test.ts`
Expected: PASS.

- [ ] **Step 5: Write `src/render/textures.ts`**

```ts
import { Texture } from 'pixi.js'

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  return [c, c.getContext('2d')!]
}

/** белое радиальное свечение — красится через tint */
export function glowTexture(size = 128): Texture {
  const [c, ctx] = canvas(size, size)
  const r = size / 2
  const g = ctx.createRadialGradient(r, r, 0, r, r, r)
  g.addColorStop(0, 'rgba(255,255,255,1)')
  g.addColorStop(0.22, 'rgba(255,255,255,0.55)')
  g.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, size, size)
  return Texture.from(c)
}
```

- [ ] **Step 6: Write `src/render/starfield.ts`**

```ts
import { Particle, ParticleContainer, type Texture } from 'pixi.js'
import type { Camera, View } from './camera'

interface BgStar {
  p: Particle
  u: number
  v: number
  depth: number
}

const mod = (a: number, n: number) => ((a % n) + n) % n

/** фоновые звёзды в экранных координатах с лёгким параллаксом */
export class Starfield {
  readonly root = new ParticleContainer({ dynamicProperties: { position: true } })
  private readonly stars: BgStar[] = []

  constructor(glow: Texture, count = 500) {
    let seed = 12345
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647
    for (let i = 0; i < count; i++) {
      const size = (1 + rnd() * 2.2) / 32
      const tint = rnd() < 0.85 ? 0xffffff : rnd() < 0.5 ? 0xa0c8ff : 0xffdcb4
      const p = new Particle({ texture: glow, anchorX: 0.5, anchorY: 0.5, scaleX: size, scaleY: size, alpha: 0.2 + rnd() * 0.45, tint })
      this.root.addParticle(p)
      this.stars.push({ p, u: rnd(), v: rnd(), depth: 0.2 + rnd() * 0.8 })
    }
  }

  update(cam: Camera, view: View): void {
    for (const s of this.stars) {
      s.p.x = mod(s.u * view.width - cam.x * cam.zoom * 0.03 * s.depth, view.width)
      s.p.y = mod(s.v * view.height - cam.y * cam.zoom * 0.03 * s.depth, view.height)
    }
  }
}
```

- [ ] **Step 7: Write `src/render/galaxyLayer.ts`**

```ts
import { Container, Graphics, Sprite, Text, type Texture } from 'pixi.js'
import { TAU } from '../sim/math'
import { findPath, gateGalaxyPos, gateTo } from '../sim/routing'
import type { World } from '../sim/types'
import { worldToScreen, type Camera, type LodInfo, type View } from './camera'
import { territoryShares } from './territory'

const LABEL = { fontFamily: 'JetBrains Mono, monospace', fontSize: 12, fill: 0xcfe0ff, letterSpacing: 1.5 }

/** общий план: коридоры, звёзды-значки, кольца долей держав, торговые трассы */
export class GalaxyLayer {
  readonly under = new Container()
  readonly over = new Container()
  readonly labels = new Container()
  private readonly corridors = new Graphics()
  private readonly spokes = new Graphics()
  private readonly trade = new Graphics()
  private readonly rings = new Graphics()
  private readonly halos: Sprite[] = []
  private readonly icons: Sprite[] = []
  private readonly names: Text[] = []
  private tradeAt = -Infinity

  constructor(w: World, glow: Texture) {
    for (const c of w.galaxy.corridors) {
      const A = w.galaxy.systems[c.a]
      const B = w.galaxy.systems[c.b]
      const ga = gateGalaxyPos(A, gateTo(A, c.b)!)
      const gb = gateGalaxyPos(B, gateTo(B, c.a)!)
      this.corridors.moveTo(ga.x, ga.y).lineTo(gb.x, gb.y)
      this.spokes.moveTo(A.pos.x, A.pos.y).lineTo(ga.x, ga.y).moveTo(B.pos.x, B.pos.y).lineTo(gb.x, gb.y)
    }
    this.corridors.stroke({ width: 1, color: 0x4a5d85, alpha: 0.9, pixelLine: true })
    this.spokes.stroke({ width: 1, color: 0x4a5d85, alpha: 0.9, pixelLine: true })
    for (const s of w.galaxy.systems) {
      const halo = new Sprite(glow)
      halo.anchor.set(0.5)
      halo.position.set(s.pos.x, s.pos.y)
      halo.blendMode = 'add'
      halo.alpha = 0
      this.halos.push(halo)
      this.under.addChild(halo)
      const icon = new Sprite(glow)
      icon.anchor.set(0.5)
      icon.position.set(s.pos.x, s.pos.y)
      icon.tint = s.star.color
      icon.blendMode = 'add'
      this.icons.push(icon)
      this.over.addChild(icon)
      const name = new Text({ text: s.name.toUpperCase(), style: LABEL })
      name.anchor.set(0.5, 0)
      this.names.push(name)
      this.labels.addChild(name)
    }
    this.under.addChild(this.corridors, this.spokes, this.trade)
    this.over.addChild(this.rings)
  }

  update(w: World, cam: Camera, view: View, lods: LodInfo[]): void {
    const z = cam.zoom
    let focus = 0
    this.rings.clear()
    w.galaxy.systems.forEach((s, i) => {
      const L = lods[i]
      focus = Math.max(focus, L.approachAlpha)
      const far = 1 - L.approachAlpha
      const icon = this.icons[i]
      icon.scale.set(28 / 128 / z)
      icon.alpha = far
      const shares = territoryShares(w, s)
      const halo = this.halos[i]
      if (shares.length) {
        halo.tint = shares[0].color
        halo.scale.set(150 / 128 / z)
        halo.alpha = 0.35 * far
      } else {
        halo.alpha = 0
      }
      if (far > 0.01 && shares.length) {
        const R = 15 / z
        let a0 = -Math.PI / 2
        for (const sh of shares) {
          const a1 = a0 + sh.share * TAU
          this.rings
            .moveTo(s.pos.x + Math.cos(a0) * R, s.pos.y + Math.sin(a0) * R)
            .arc(s.pos.x, s.pos.y, R, a0, a1)
            .stroke({ width: 3 / z, color: sh.color, alpha: far })
          a0 = a1
        }
      }
      const sp = worldToScreen(cam, view, s.pos)
      const name = this.names[i]
      name.position.set(sp.x, sp.y + 18)
      name.alpha = (1 - L.systemAlpha) * 0.9
    })
    this.spokes.alpha = 1 - focus
    if (Math.abs(w.t - this.tradeAt) > 0.25) {
      this.tradeAt = w.t
      this.drawTrade(w, z, 1 - focus)
    }
  }

  /** бегущий пунктир по пути межсистемных караванов */
  private drawTrade(w: World, z: number, alpha: number): void {
    this.trade.clear()
    if (alpha < 0.01) return
    const hopsSet = new Set<string>()
    for (const s of w.ships) {
      if (!s.alive || s.mission.type !== 'trade') continue
      const a = w.planets.get(s.mission.a)
      const b = w.planets.get(s.mission.b)
      if (!a || !b || a.systemId === b.systemId) continue
      let from = a.systemId
      for (const to of findPath(w.galaxy, a.systemId, b.systemId) ?? []) {
        hopsSet.add(from < to ? `${from}-${to}` : `${to}-${from}`)
        from = to
      }
    }
    if (!hopsSet.size) return
    const dash = 10 / z
    const gap = 8 / z
    const offset = ((w.t * 30) / z) % (dash + gap)
    for (const key of hopsSet) {
      const [i, j] = key.split('-').map(Number)
      const A = w.galaxy.systems[i].pos
      const B = w.galaxy.systems[j].pos
      const len = Math.hypot(B.x - A.x, B.y - A.y)
      const ux = (B.x - A.x) / len
      const uy = (B.y - A.y) / len
      for (let d = offset; d < len; d += dash + gap) {
        const e = Math.min(len, d + dash)
        this.trade.moveTo(A.x + ux * d, A.y + uy * d).lineTo(A.x + ux * e, A.y + uy * e)
      }
    }
    this.trade.stroke({ width: 2 / z, color: 0xe0c060, alpha: 0.75 * alpha })
  }
}
```

- [ ] **Step 8: Write `src/render/renderer.ts`**

```ts
import { Container, type Application } from 'pixi.js'
import type { World } from '../sim/types'
import { lodOf, type Camera, type View } from './camera'
import { GalaxyLayer } from './galaxyLayer'
import { Starfield } from './starfield'
import { glowTexture } from './textures'

export class GameRenderer {
  private readonly worldRoot = new Container()
  private readonly overlay = new Container()
  private readonly stars: Starfield
  private readonly galaxy: GalaxyLayer

  constructor(app: Application, w: World) {
    const glow = glowTexture()
    this.stars = new Starfield(glow)
    this.galaxy = new GalaxyLayer(w, glow)
    this.worldRoot.addChild(this.galaxy.under, this.galaxy.over)
    this.overlay.addChild(this.galaxy.labels)
    app.stage.addChild(this.stars.root, this.worldRoot, this.overlay)
  }

  /** alpha — доля шага симуляции для плавной отрисовки (0…1) */
  render(w: World, cam: Camera, view: View, alpha: number): void {
    this.worldRoot.scale.set(cam.zoom)
    this.worldRoot.position.set(view.width / 2 - cam.x * cam.zoom, view.height / 2 - cam.y * cam.zoom)
    const lods = w.galaxy.systems.map((s) => lodOf(s.radius, cam.zoom))
    this.stars.update(cam, view)
    this.galaxy.update(w, cam, view, lods)
    void alpha
  }
}
```

- [ ] **Step 9: Replace `src/app/main.tsx`**

```tsx
import { Application } from 'pixi.js'
import { createCamera, fitZoom, galaxyBounds, updateCamera } from '../render/camera'
import { GameRenderer } from '../render/renderer'
import { createWorld, stepWorld } from '../sim/world'
import { advance, alpha, createClock } from './loop'

async function boot(): Promise<void> {
  const params = new URLSearchParams(location.search)
  const seed = Number(params.get('seed')) || Math.floor(Math.random() * 1_000_000)
  const world = createWorld(seed)

  const app = new Application()
  await app.init({ background: '#04060c', resizeTo: window, antialias: true, autoDensity: true, resolution: Math.min(window.devicePixelRatio, 2) })
  document.getElementById('stage')!.appendChild(app.canvas)
  const view = () => ({ width: app.screen.width, height: app.screen.height })

  const renderer = new GameRenderer(app, world)
  const cam = createCamera()
  const b = galaxyBounds(world.galaxy)
  cam.x = (b.minX + b.maxX) / 2
  cam.y = (b.minY + b.maxY) / 2
  cam.zoom = fitZoom(view(), b)
  const clock = createClock(1)

  app.ticker.add((ticker) => {
    const dt = ticker.deltaMS / 1000
    advance(clock, dt, () => stepWorld(world))
    updateCamera(cam, performance.now() / 1000, dt)
    renderer.render(world, cam, view(), alpha(clock))
  })

  Object.assign(window, {
    __orbita: { world, cam, clock, renderer, fastForward: (n: number) => { for (let i = 0; i < n; i++) stepWorld(world) } },
  })
}

void boot()
```

- [ ] **Step 10: Write `scripts/shot.ts`, add script and ignore artifacts**

`scripts/shot.ts`:

```ts
// Снимок экрана игры: npm run shot -- "<параметры URL>" <файл.png> "<JS перед снимком>"
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { chromium } from 'playwright-core'
import { createServer } from 'vite'

const query = process.argv[2] ?? 'seed=4815'
const out = process.argv[3] ?? 'artifacts/shot.png'
const setup = process.argv[4] ?? ''
mkdirSync(dirname(out), { recursive: true })

const server = await createServer({ server: { port: 5198, strictPort: true }, logLevel: 'error' })
await server.listen()
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } })
const errors: string[] = []
page.on('pageerror', (e) => errors.push(String(e)))
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text())
})
await page.goto(`http://localhost:5198/?${query}`)
await page.waitForFunction(() => '__orbita' in window, null, { timeout: 30_000 })
if (setup) await page.evaluate(setup)
await page.waitForTimeout(1500)
await page.screenshot({ path: out })
console.log(errors.length ? `ОШИБКИ:\n${errors.join('\n')}` : 'ошибок нет', '→', out)
await browser.close()
await server.close()
process.exit(errors.length ? 1 : 0)
```

В `package.json` в `scripts` добавить: `"shot": "tsx scripts/shot.ts"`.
В `.gitignore` добавить строку `artifacts/`.

- [ ] **Step 11: Проверить глазами**

Run: `npm run typecheck && npm run shot -- "seed=4815" artifacts/galaxy.png`
Expected: «ошибок нет». Открыть `artifacts/galaxy.png` (инструментом Read) и убедиться:
- тёмный фон с россыпью звёзд;
- 5–7 светящихся звёзд с подписями ЗАГЛАВНЫМИ;
- линии коридоров между ними (тонкие, синевато-серые);
- у обитаемых систем — цветной ореол и кольцо из дуг цветов держав.

Если картинка пустая или чёрная — проверить консоль (ошибки WebGL), масштаб `cam.zoom` и положение `worldRoot`.

- [ ] **Step 12: Commit**

```bash
git add src scripts tests package.json .gitignore
git commit -m "render: PixiJS bootstrap, galaxy layer, starfield, screenshot script

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 17: Вид системы — звезда, орбиты, планеты, пояса, врата

**Files:**
- Create: `src/render/systemLayer.ts`
- Modify: `src/render/textures.ts` (текстура планеты), `src/render/renderer.ts`

**Interfaces:**
- Consumes: `planetPos`, `asteroidPos`, `civById`, `lodOf`, `worldToScreen`, `PlanetLook`.
- Produces: `PLANET_TEX = 160`, `PLANET_DISC = 36`, `planetTexture(p): Texture` (диск освещён слева); `SystemLayer` (`root`, `labels`, `update(w, cam, view, lods, t, selected: string | null)`); `GameRenderer.render(w, cam, view, alpha, selected: string | null = null)`.
- Note: `main.tsx` пока вызывает `render` с четырьмя аргументами — `selected` по умолчанию `null`, выбор появится в задаче 19.

- [ ] **Step 1: Add planet texture to `src/render/textures.ts`**

В начало файла, к импортам, добавить `import type { Planet } from '../sim/types'`. Ниже существующей `glowTexture` дописать:

```ts
const TAU = Math.PI * 2
export const PLANET_TEX = 160
/** радиус диска планеты на текстуре, px */
export const PLANET_DISC = 36

function ring(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, a0: number, a1: number): void {
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(-0.18)
  ctx.scale(1, 0.32)
  ctx.strokeStyle = 'rgba(205,178,124,0.6)'
  ctx.lineWidth = r * 0.42
  ctx.beginPath()
  ctx.arc(0, 0, r * 1.8, a0, a1)
  ctx.stroke()
  ctx.restore()
}

/** планета по палитре из симуляции; освещённая сторона — слева, спрайт поворачивают к звезде */
export function planetTexture(p: Planet): Texture {
  const [c, ctx] = canvas(PLANET_TEX, PLANET_TEX)
  const x = PLANET_TEX / 2
  const y = PLANET_TEX / 2
  const r = PLANET_DISC
  let g = ctx.createRadialGradient(x, y, r * 0.6, x, y, r * 1.55)
  g.addColorStop(0, p.look.glow)
  g.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.arc(x, y, r * 1.55, 0, TAU)
  ctx.fill()
  if (p.look.rings) ring(ctx, x, y, r, Math.PI, TAU)
  g = ctx.createRadialGradient(x - r * 0.5, y, r * 0.12, x, y, r * 1.04)
  g.addColorStop(0, p.look.colors[0])
  g.addColorStop(0.55, p.look.colors[1])
  g.addColorStop(1, p.look.colors[2])
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.arc(x, y, r, 0, TAU)
  ctx.fill()
  if (p.look.banded) {
    ctx.save()
    ctx.beginPath()
    ctx.arc(x, y, r, 0, TAU)
    ctx.clip()
    ctx.globalAlpha = 0.16
    ctx.fillStyle = p.look.colors[2]
    for (let i = 0; i < 4; i++) {
      const by = y - r + ((i + 0.5) * 2 * r) / 4
      ctx.fillRect(x - r, by - r * 0.08, r * 2, r * 0.18)
    }
    ctx.restore()
  }
  // ночная сторона
  g = ctx.createLinearGradient(x - r, y, x + r, y)
  g.addColorStop(0.45, 'rgba(0,0,0,0)')
  g.addColorStop(1, 'rgba(0,0,8,0.6)')
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.arc(x, y, r, 0, TAU)
  ctx.fill()
  if (p.look.rings) ring(ctx, x, y, r, 0, Math.PI)
  return Texture.from(c)
}
```

- [ ] **Step 2: Write `src/render/systemLayer.ts`**

```ts
import { Container, Graphics, Sprite, Text, type Texture } from 'pixi.js'
import { asteroidPos } from '../sim/belts'
import { TAU } from '../sim/math'
import { civById } from '../sim/query'
import { planetPos } from '../sim/system'
import type { Planet, StarSystem, World } from '../sim/types'
import { worldToScreen, type Camera, type LodInfo, type View } from './camera'
import { PLANET_DISC, planetTexture } from './textures'

interface PlanetView {
  p: Planet
  sprite: Sprite
  halo: Sprite
  label: Text
}

interface SystemView {
  s: StarSystem
  root: Container
  belt: Graphics
  marks: Graphics
  planets: PlanetView[]
}

const LABEL = { fontFamily: 'JetBrains Mono, monospace', fontSize: 11, fill: 0xdce8ff, letterSpacing: 1 }

/** раскрытые системы: звезда, орбиты, планеты в цвет владельца, пояса, врата, стройки */
export class SystemLayer {
  readonly root = new Container()
  readonly labels = new Container()
  private readonly views: SystemView[] = []

  constructor(w: World, private readonly glow: Texture) {
    for (const s of w.galaxy.systems) this.views.push(this.build(s))
  }

  private build(s: StarSystem): SystemView {
    const root = new Container()
    root.position.set(s.pos.x, s.pos.y)
    root.visible = false
    const orbits = new Graphics()
    for (const p of s.planets) orbits.circle(0, 0, p.orbit)
    orbits.stroke({ width: 1, color: 0x1f2a44, alpha: 1, pixelLine: true })
    for (const b of s.belts) orbits.circle(0, 0, b.orbit)
    orbits.stroke({ width: 1, color: 0x2a3348, alpha: 0.6, pixelLine: true })
    const corona = new Sprite(this.glow)
    corona.anchor.set(0.5)
    corona.tint = s.star.color
    corona.blendMode = 'add'
    corona.scale.set((s.star.radius * 7) / 128)
    const disc = new Graphics().circle(0, 0, s.star.radius).fill({ color: s.star.color })
    const gates = new Graphics()
    for (const g of s.gates) gates.circle(g.pos.x, g.pos.y, 30)
    gates.stroke({ width: 4, color: 0x7df0ff, alpha: 0.85 })
    const belt = new Graphics()
    const marks = new Graphics()
    const planets = s.planets.map((p) => {
      const halo = new Sprite(this.glow)
      halo.anchor.set(0.5)
      halo.blendMode = 'add'
      halo.alpha = 0
      const sprite = new Sprite(planetTexture(p))
      sprite.anchor.set(0.5)
      const label = new Text({ text: p.name.toUpperCase(), style: LABEL })
      label.anchor.set(0.5, 0)
      label.visible = false
      this.labels.addChild(label)
      return { p, sprite, halo, label }
    })
    root.addChild(orbits, belt, corona, disc, gates, ...planets.map((v) => v.halo), ...planets.map((v) => v.sprite), marks)
    this.root.addChild(root)
    return { s, root, belt, marks, planets }
  }

  update(w: World, cam: Camera, view: View, lods: LodInfo[], t: number, selected: string | null): void {
    const z = cam.zoom
    this.views.forEach((v, i) => {
      const L = lods[i]
      const on = L.approachAlpha > 0.01
      v.root.visible = on
      for (const pv of v.planets) pv.label.visible = on
      if (!on) return
      v.root.alpha = L.approachAlpha

      v.belt.clear()
      const dot = 1.5 / z
      for (const a of v.s.asteroids) {
        const q = asteroidPos(a, t)
        v.belt.circle(q.x, q.y, Math.max(a.size, dot))
      }
      v.belt.fill({ color: 0x8a8f99, alpha: 0.85 })

      v.marks.clear()
      const labelA = Math.min(1, Math.max(0, (v.s.radius * z - 400) / 150))
      for (const pv of v.planets) {
        const p = pv.p
        const q = planetPos(p, t)
        const r = Math.max(p.radius, 2.5 / z)
        pv.sprite.position.set(q.x, q.y)
        pv.sprite.scale.set(r / PLANET_DISC)
        pv.sprite.rotation = Math.atan2(-q.y, -q.x) - Math.PI
        const owner = p.owner === null ? undefined : civById(w, p.owner)
        if (owner) {
          pv.halo.tint = owner.color
          pv.halo.alpha = p.pop > 0 ? 0.22 : 0.1
          pv.halo.position.set(q.x, q.y)
          pv.halo.scale.set(((p.radius * 3 + 100) * 2) / 128)
        } else {
          pv.halo.alpha = 0
        }
        const color = owner?.color ?? 0xffffff
        if (p.build) {
          const frac = 1 - p.build.remaining / p.build.total
          const rr = r + 8 / z
          v.marks.moveTo(q.x + rr, q.y).arc(q.x, q.y, rr, 0, frac * TAU).stroke({ width: 2 / z, color, alpha: 0.9 })
        }
        if (p.station && !p.build) {
          const s = 5 / z
          const cx = q.x + r + 10 / z
          const cy = q.y - r - 10 / z
          v.marks.poly([cx, cy - s, cx + s, cy, cx, cy + s, cx - s, cy]).fill({ color })
        }
        if (p.id === selected) v.marks.circle(q.x, q.y, r + 14 / z).stroke({ width: 1.5 / z, color: 0x8cbeff, alpha: 0.9 })
        const sp = worldToScreen(cam, view, { x: v.s.pos.x + q.x, y: v.s.pos.y + q.y })
        pv.label.position.set(sp.x, sp.y + r * z + 6)
        pv.label.alpha = labelA * L.approachAlpha
      }
    })
  }
}
```

- [ ] **Step 3: Modify `src/render/renderer.ts` — добавить системы**

```ts
import { Container, type Application } from 'pixi.js'
import { SIM_DT } from '../sim/config'
import type { World } from '../sim/types'
import { lodOf, type Camera, type View } from './camera'
import { GalaxyLayer } from './galaxyLayer'
import { Starfield } from './starfield'
import { SystemLayer } from './systemLayer'
import { glowTexture } from './textures'

export class GameRenderer {
  private readonly worldRoot = new Container()
  private readonly overlay = new Container()
  private readonly stars: Starfield
  private readonly galaxy: GalaxyLayer
  private readonly systems: SystemLayer

  constructor(app: Application, w: World) {
    const glow = glowTexture()
    this.stars = new Starfield(glow)
    this.galaxy = new GalaxyLayer(w, glow)
    this.systems = new SystemLayer(w, glow)
    this.worldRoot.addChild(this.galaxy.under, this.systems.root, this.galaxy.over)
    this.overlay.addChild(this.galaxy.labels, this.systems.labels)
    app.stage.addChild(this.stars.root, this.worldRoot, this.overlay)
  }

  render(w: World, cam: Camera, view: View, alpha: number, selected: string | null = null): void {
    this.worldRoot.scale.set(cam.zoom)
    this.worldRoot.position.set(view.width / 2 - cam.x * cam.zoom, view.height / 2 - cam.y * cam.zoom)
    const lods = w.galaxy.systems.map((s) => lodOf(s.radius, cam.zoom))
    // время отрисовки — между прошлым и текущим шагом симуляции
    const t = w.t - SIM_DT * (1 - alpha)
    this.stars.update(cam, view)
    this.galaxy.update(w, cam, view, lods)
    this.systems.update(w, cam, view, lods, t, selected)
  }
}
```

- [ ] **Step 4: Проверить глазами на трёх уровнях**

Run:

```bash
npm run typecheck
npm run shot -- "seed=4815" artifacts/approach.png "(()=>{const o=window.__orbita;o.fastForward(3000);const s=o.world.galaxy.systems.find(x=>x.role==='inhabited');o.cam.x=s.pos.x;o.cam.y=s.pos.y;o.cam.zoom=450/s.radius})()"
npm run shot -- "seed=4815" artifacts/system.png "(()=>{const o=window.__orbita;o.fastForward(3000);const s=o.world.galaxy.systems.find(x=>x.role==='inhabited');o.cam.x=s.pos.x;o.cam.y=s.pos.y;o.cam.zoom=1100/s.radius})()"
npm run shot -- "seed=4815" artifacts/planet.png "(()=>{const o=window.__orbita;o.fastForward(3000);const c=o.world.civs[0];const p=o.world.planets.get(c.capital);const s=o.world.galaxy.systems[p.systemId];const a=p.phase+2*Math.PI*o.world.t/p.period;o.cam.x=s.pos.x+Math.cos(a)*p.orbit;o.cam.y=s.pos.y+Math.sin(a)*p.orbit;o.cam.zoom=2})()"
```

Expected: «ошибок нет» трижды. Открыть снимки и проверить:
- `approach.png` — орбиты тонкими кругами, звезда со свечением, планеты точками/дисками, цветные ореолы владельцев, голубые кольца врат на краю;
- `system.png` — планеты различимы, освещённая сторона повёрнута к звезде, видны пояса астероидов, подписи планет;
- `planet.png` — планета крупно с градиентом, у газовых гигантов полосы/кольца, не пиксельная каша.

- [ ] **Step 5: Commit**

```bash
git add src/render
git commit -m "render: system view with star, orbits, planets, belts, gates

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 18: Корабли на экране и всплывающий доход

**Files:**
- Create: `src/render/shipsLayer.ts`
- Modify: `src/render/textures.ts` (атлас значков), `src/render/renderer.ts`

**Interfaces:**
- Consumes: `transitGalaxyPos`, `civById`, `SHIP_KINDS`, `Fx`, `worldToScreen`.
- Produces: `type IconKind = 'colony' | 'caravan' | 'miner' | 'dot'`, `type Atlas = Record<IconKind, Texture>`, `ICON_CELL = 32`, `ICON_BODY = 24`, `shipAtlas(): Atlas`; `ShipsLayer` (`root: ParticleContainer`, `popups: Container`, `update(w, cam, view, lods, alpha, now)`).

- [ ] **Step 1: Add atlas to `src/render/textures.ts`**

```ts
import { Rectangle, Texture } from 'pixi.js'
```

(заменить первую строку импорта) и дописать:

```ts
export type IconKind = 'colony' | 'caravan' | 'miner' | 'dot'
export type Atlas = Record<IconKind, Texture>
export const ICON_CELL = 32
/** длина корпуса значка внутри клетки, px — по ней считается масштаб */
export const ICON_BODY = 24

/** белые силуэты кораблей в одной текстуре — для пакетной отрисовки и перекраски tint */
export function shipAtlas(): Atlas {
  const S = ICON_CELL
  const [c, ctx] = canvas(S * 4, S)
  ctx.fillStyle = '#fff'
  // караван — вытянутый грузовой корпус
  ctx.beginPath()
  ctx.roundRect(4, 11, 24, 10, 3)
  ctx.fill()
  // колонисты — ромб
  ctx.beginPath()
  ctx.moveTo(S + 28, 16)
  ctx.lineTo(S + 16, 7)
  ctx.lineTo(S + 4, 16)
  ctx.lineTo(S + 16, 25)
  ctx.closePath()
  ctx.fill()
  // шахтёр — треугольник носом вперёд
  ctx.beginPath()
  ctx.moveTo(2 * S + 28, 16)
  ctx.lineTo(2 * S + 4, 6)
  ctx.lineTo(2 * S + 4, 26)
  ctx.closePath()
  ctx.fill()
  // точка — корабль в коридоре на общем плане
  ctx.beginPath()
  ctx.arc(3 * S + 16, 16, 10, 0, TAU)
  ctx.fill()
  const base = Texture.from(c)
  const frame = (i: number) => new Texture({ source: base.source, frame: new Rectangle(i * S, 0, S, S) })
  return { caravan: frame(0), colony: frame(1), miner: frame(2), dot: frame(3) }
}
```

- [ ] **Step 2: Write `src/render/shipsLayer.ts`**

```ts
import { Container, Particle, ParticleContainer, Text } from 'pixi.js'
import { SHIP_KINDS } from '../sim/config'
import { lerp } from '../sim/math'
import { civById } from '../sim/query'
import { transitGalaxyPos } from '../sim/routing'
import type { Fx, World } from '../sim/types'
import { worldToScreen, type Camera, type LodInfo, type View } from './camera'
import { ICON_BODY, type Atlas } from './textures'

interface Popup {
  text: Text
  x: number
  y: number
  born: number
}

const POPUP = { fontFamily: 'JetBrains Mono, monospace', fontSize: 12, fill: 0xffd97a, fontWeight: '700' as const }

/** каждый корабль — отдельная частица; на дальнем зуме — значок постоянного экранного размера */
export class ShipsLayer {
  readonly root = new ParticleContainer({ dynamicProperties: { position: true, rotation: true, color: true, vertex: true, uvs: true } })
  readonly popups = new Container()
  private readonly parts = new Map<number, Particle>()
  private readonly seen = new Map<number, number>()
  private readonly consumed = new WeakSet<Fx>()
  private frame = 0
  private live: Popup[] = []

  constructor(private readonly atlas: Atlas) {}

  update(w: World, cam: Camera, view: View, lods: LodInfo[], alpha: number, now: number): void {
    const z = cam.zoom
    this.frame++
    for (const s of w.ships) {
      if (!s.alive) continue
      let p = this.parts.get(s.id)
      if (!p) {
        p = new Particle({ texture: this.atlas[s.kind], anchorX: 0.5, anchorY: 0.5 })
        this.root.addParticle(p)
        this.parts.set(s.id, p)
      }
      this.seen.set(s.id, this.frame)
      p.tint = civById(w, s.owner)?.color ?? 0xffffff
      if (s.transit) {
        const g = transitGalaxyPos(w.galaxy, s.transit, alpha)
        p.texture = this.atlas.dot
        p.x = g.x
        p.y = g.y
        p.rotation = 0
        const sc = 6 / z / ICON_BODY
        p.scaleX = sc
        p.scaleY = sc
        p.alpha = 1
        continue
      }
      const sys = w.galaxy.systems[s.systemId]
      p.texture = this.atlas[s.kind]
      p.x = sys.pos.x + lerp(s.prevPos.x, s.pos.x, alpha)
      p.y = sys.pos.y + lerp(s.prevPos.y, s.pos.y, alpha)
      p.rotation = Math.atan2(s.vel.y, s.vel.x)
      const screenLen = Math.max(SHIP_KINDS[s.kind].length * z, 6)
      const sc = screenLen / z / ICON_BODY
      p.scaleX = sc
      p.scaleY = sc
      p.alpha = lods[s.systemId].approachAlpha
    }
    for (const [id, p] of this.parts) {
      if (this.seen.get(id) === this.frame) continue
      this.root.removeParticle(p)
      this.parts.delete(id)
      this.seen.delete(id)
    }
    this.updatePopups(w, cam, view, lods, now)
  }

  private updatePopups(w: World, cam: Camera, view: View, lods: LodInfo[], now: number): void {
    for (const f of w.fx) {
      if (this.consumed.has(f)) continue
      this.consumed.add(f)
      if (lods[f.systemId].systemAlpha < 0.5) continue
      const sys = w.galaxy.systems[f.systemId]
      const text = new Text({ text: `+${Math.round(f.amount)} кр`, style: POPUP })
      text.anchor.set(0.5, 1)
      this.popups.addChild(text)
      this.live.push({ text, x: sys.pos.x + f.x, y: sys.pos.y + f.y, born: now })
      if (this.live.length > 40) this.live.shift()!.text.destroy()
    }
    this.live = this.live.filter((pp) => {
      const age = now - pp.born
      if (age > 1.6) {
        pp.text.destroy()
        return false
      }
      const sp = worldToScreen(cam, view, { x: pp.x, y: pp.y })
      pp.text.position.set(sp.x, sp.y - 14 - age * 22)
      pp.text.alpha = 1 - age / 1.6
      return true
    })
  }
}
```

- [ ] **Step 3: Replace `src/render/renderer.ts` — корабли поверх планет**

```ts
import { Container, type Application } from 'pixi.js'
import { SIM_DT } from '../sim/config'
import type { World } from '../sim/types'
import { lodOf, type Camera, type View } from './camera'
import { GalaxyLayer } from './galaxyLayer'
import { ShipsLayer } from './shipsLayer'
import { Starfield } from './starfield'
import { SystemLayer } from './systemLayer'
import { glowTexture, shipAtlas } from './textures'

export class GameRenderer {
  private readonly worldRoot = new Container()
  private readonly overlay = new Container()
  private readonly stars: Starfield
  private readonly galaxy: GalaxyLayer
  private readonly systems: SystemLayer
  private readonly ships: ShipsLayer

  constructor(app: Application, w: World) {
    const glow = glowTexture()
    this.stars = new Starfield(glow)
    this.galaxy = new GalaxyLayer(w, glow)
    this.systems = new SystemLayer(w, glow)
    this.ships = new ShipsLayer(shipAtlas())
    this.worldRoot.addChild(this.galaxy.under, this.systems.root, this.ships.root, this.galaxy.over)
    this.overlay.addChild(this.galaxy.labels, this.systems.labels, this.ships.popups)
    app.stage.addChild(this.stars.root, this.worldRoot, this.overlay)
  }

  render(w: World, cam: Camera, view: View, alpha: number, selected: string | null = null): void {
    this.worldRoot.scale.set(cam.zoom)
    this.worldRoot.position.set(view.width / 2 - cam.x * cam.zoom, view.height / 2 - cam.y * cam.zoom)
    const lods = w.galaxy.systems.map((s) => lodOf(s.radius, cam.zoom))
    const t = w.t - SIM_DT * (1 - alpha)
    this.stars.update(cam, view)
    this.galaxy.update(w, cam, view, lods)
    this.systems.update(w, cam, view, lods, t, selected)
    this.ships.update(w, cam, view, lods, alpha, performance.now() / 1000)
  }
}
```

- [ ] **Step 4: Проверить глазами**

Run:

```bash
npm run typecheck
npm run shot -- "seed=4815" artifacts/ships-system.png "(()=>{const o=window.__orbita;o.fastForward(6000);const s=o.world.galaxy.systems.find(x=>x.role==='inhabited');o.cam.x=s.pos.x;o.cam.y=s.pos.y;o.cam.zoom=1100/s.radius})()"
npm run shot -- "seed=4815" artifacts/ships-galaxy.png "(()=>{const o=window.__orbita;o.fastForward(9000)})()"
```

Expected: «ошибок нет». На `ships-system.png` видны мелкие цветные значки кораблей (караваны — вытянутые, шахтёры — треугольники), повёрнутые по ходу движения, не крупнее планет. На `ships-galaxy.png` — точки кораблей в коридорах и жёлтый бегущий пунктир торговых трасс, если межсистемные караваны уже есть.

- [ ] **Step 5: Commit**

```bash
git add src/render
git commit -m "render: per-ship particles, transit dots, income popups

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 19: Что под курсором, управление камерой, мышь и клавиатура

**Files:**
- Create: `src/render/hit.ts`, `src/app/controller.ts`, `src/app/input.ts`
- Modify: `src/app/main.tsx`
- Test: `tests/render/hit.test.ts`, `tests/app/controller.test.ts`

**Interfaces:**
- Consumes: `Camera`, `lodOf`, `screenToWorld`, `startFly`, `updateCamera`, `fitZoom`, `galaxyBounds`, `ZOOM_MAX`, `Clock`, `planetPos`, `capitalOf`, `civById`, `SPEEDS`, `GameEvent`.
- Produces:
  - `hit.ts`: `type Pick = { type: 'ship'; id: number } | { type: 'planet'; id: string } | { type: 'system'; id: number }`, `pickAt(w, cam, view, screen): Pick | null` (приоритет: корабль > планета > система).
  - `controller.ts`: `interface Crumb { label: string; target: { type: 'galaxy' } | { type: 'system'; id: number } | { type: 'planet'; id: string } }`, `interface UiState { speedIndex; paused; follow; minimap; feedOpen; selected: Pick | null; hovered: Pick | null; mouse: { x: number; y: number } }`, класс `Controller(world, cam, clock, view: () => View)` с методами `minZoom()`, `setSpeed(i)`, `togglePause()`, `toggleFollow(on?)`, `toggleMinimap()`, `toggleFeed()`, `select(p)`, `hover(p, mouse?)`, `userMoved()`, `flyToGalaxy(instant?)`, `flyToSystem(id, level = 'approach', instant?)`, `flyToPlanet(id, instant?)`, `flyToCiv(id)`, `flyToEvent(ev)`, `flyToWorldPoint(x, y)`, `goCrumb(c)`, `focusSystem(): number | null`, `level(): Lod`, `crumbs(): Crumb[]`, `back()`, `update(now, dt)`, `selectedPlanet(): string | null`.
  - `input.ts`: `attachInput(el: HTMLElement, c: Controller): () => void`.

- [ ] **Step 1: Write the failing tests**

`tests/app/controller.test.ts`:

```ts
import { describe, expect, test } from 'vitest'
import { Controller } from '../../src/app/controller'
import { createClock } from '../../src/app/loop'
import { createCamera } from '../../src/render/camera'
import { capitalOf } from '../../src/sim/query'
import { planetPos } from '../../src/sim/system'
import { stepWorld } from '../../src/sim/world'
import { quietWorld } from '../helpers'

function setup() {
  const w = quietWorld(4815)
  const c = new Controller(w, createCamera(), createClock(1), () => ({ width: 1600, height: 900 }))
  c.flyToGalaxy(true)
  return { w, c }
}

describe('Controller', () => {
  test('хлебные крошки: галактика → система → планета', () => {
    const { w, c } = setup()
    expect(c.crumbs().map((x) => x.label)).toEqual(['Галактика'])
    const home = capitalOf(w, w.civs[0])!
    const sys = w.galaxy.systems[home.systemId]
    c.flyToSystem(sys.id, 'approach', true)
    expect(c.level()).toBe('approach')
    expect(c.crumbs().map((x) => x.label)).toEqual(['Галактика', sys.name])
    c.flyToPlanet(home.id, true)
    expect(c.level()).toBe('system')
    expect(c.crumbs().map((x) => x.label)).toEqual(['Галактика', sys.name, home.name])
  })

  test('камера следует за выбранной планетой, пока она летит по орбите', () => {
    const { w, c } = setup()
    const home = capitalOf(w, w.civs[0])!
    c.flyToPlanet(home.id, true)
    for (let i = 0; i < 100; i++) stepWorld(w)
    c.update(10, 0.016)
    const s = w.galaxy.systems[home.systemId]
    const q = planetPos(home, w.t)
    expect(c.cam.x).toBeCloseTo(s.pos.x + q.x)
    expect(c.cam.y).toBeCloseTo(s.pos.y + q.y)
  })

  test('Esc по шагам: снять выбор → обзор системы → галактика', () => {
    const { w, c } = setup()
    const home = capitalOf(w, w.civs[0])!
    c.flyToPlanet(home.id, true)
    c.back()
    expect(c.ui.selected).toBeNull()
    expect(c.cam.follow).toBeNull()
    c.update(0, 0)
    c.back()
    c.update(5, 0)
    expect(c.level()).toBe('approach')
    c.back()
    c.update(10, 0)
    expect(c.level()).toBe('galaxy')
  })

  test('скорость и пауза управляют часами', () => {
    const { c } = setup()
    c.setSpeed(3)
    c.update(0, 0)
    expect(c.clock.speed).toBe(50)
    c.togglePause()
    c.update(0, 0)
    expect(c.clock.speed).toBe(0)
  })

  test('ручное движение камеры выключает слежку', () => {
    const { w, c } = setup()
    c.toggleFollow(true)
    c.flyToPlanet(capitalOf(w, w.civs[0])!.id, true)
    c.userMoved()
    expect(c.ui.follow).toBe(false)
    expect(c.cam.follow).toBeNull()
  })
})
```

`tests/render/hit.test.ts`:

```ts
import { describe, expect, test } from 'vitest'
import { Controller } from '../../src/app/controller'
import { createClock } from '../../src/app/loop'
import { createCamera, worldToScreen } from '../../src/render/camera'
import { pickAt } from '../../src/render/hit'
import { capitalOf } from '../../src/sim/query'
import { spawnShip } from '../../src/sim/ships'
import { planetPos } from '../../src/sim/system'
import { quietWorld } from '../helpers'

const view = { width: 1600, height: 900 }

function setup() {
  const w = quietWorld(4815)
  const c = new Controller(w, createCamera(), createClock(1), () => view)
  c.flyToGalaxy(true)
  return { w, c }
}

describe('pickAt', () => {
  test('на общем плане клик по звезде выбирает систему', () => {
    const { w, c } = setup()
    const s = w.galaxy.systems[2]
    expect(pickAt(w, c.cam, view, worldToScreen(c.cam, view, s.pos))).toEqual({ type: 'system', id: s.id })
  })

  test('крупно клик по планете выбирает планету', () => {
    const { w, c } = setup()
    const home = capitalOf(w, w.civs[0])!
    c.flyToPlanet(home.id, true)
    expect(pickAt(w, c.cam, view, { x: 800, y: 450 })).toEqual({ type: 'planet', id: home.id })
  })

  test('корабль у планеты важнее планеты', () => {
    const { w, c } = setup()
    const civ = w.civs[0]
    const home = capitalOf(w, civ)!
    c.flyToPlanet(home.id, true)
    const ship = spawnShip(w, civ, 'caravan', home, { type: 'return', planetId: home.id }, 50)
    const q = planetPos(home, w.t)
    ship.pos = { x: q.x + 3, y: q.y }
    const s = w.galaxy.systems[home.systemId]
    const at = worldToScreen(c.cam, view, { x: s.pos.x + ship.pos.x, y: s.pos.y + ship.pos.y })
    expect(pickAt(w, c.cam, view, at)).toEqual({ type: 'ship', id: ship.id })
  })

  test('пустота — ничего', () => {
    const { w, c } = setup()
    expect(pickAt(w, c.cam, view, { x: 3, y: 3 })).toBeNull()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/app/controller.test.ts tests/render/hit.test.ts`
Expected: FAIL — cannot resolve `../../src/app/controller`.

- [ ] **Step 3: Write `src/render/hit.ts`**

```ts
import type { Vec } from '../sim/math'
import { planetPos } from '../sim/system'
import type { World } from '../sim/types'
import { lodOf, screenToWorld, type Camera, type View } from './camera'

export type Pick = { type: 'ship'; id: number } | { type: 'planet'; id: string } | { type: 'system'; id: number }

/** что под курсором; корабль важнее планеты, планета — системы */
export function pickAt(w: World, cam: Camera, view: View, screen: Vec): Pick | null {
  const z = cam.zoom
  const wp = screenToWorld(cam, view, screen)
  let ship: { id: number; d: number } | null = null
  let planet: { id: string; d: number } | null = null
  let star: { id: number; d: number } | null = null
  for (const s of w.galaxy.systems) {
    const L = lodOf(s.radius, z)
    const lx = wp.x - s.pos.x
    const ly = wp.y - s.pos.y
    if (L.approachAlpha < 0.5) {
      const ds = Math.hypot(lx, ly) * z
      if (ds < 18 && (!star || ds < star.d)) star = { id: s.id, d: ds }
      continue
    }
    if (Math.hypot(lx, ly) > s.radius + 500) continue
    if (L.approachAlpha >= 0.5) {
      for (const sh of w.ships) {
        if (!sh.alive || sh.transit || sh.systemId !== s.id) continue
        const d = Math.hypot(sh.pos.x - lx, sh.pos.y - ly) * z
        if (d < 10 && (!ship || d < ship.d)) ship = { id: sh.id, d }
      }
    }
    for (const p of s.planets) {
      const q = planetPos(p, w.t)
      const d = Math.hypot(q.x - lx, q.y - ly) * z
      if (d < Math.max(p.radius * z, 6) + 4 && (!planet || d < planet.d)) planet = { id: p.id, d }
    }
  }
  if (ship) return { type: 'ship', id: ship.id }
  if (planet) return { type: 'planet', id: planet.id }
  if (star) return { type: 'system', id: star.id }
  return null
}
```

- [ ] **Step 4: Write `src/app/controller.ts`**

```ts
import { fitZoom, galaxyBounds, lodOf, startFly, updateCamera, ZOOM_MAX, type Camera, type CamTarget, type Lod, type View } from '../render/camera'
import type { Pick } from '../render/hit'
import { SPEEDS } from '../sim/config'
import { clamp } from '../sim/math'
import { capitalOf, civById } from '../sim/query'
import { planetPos } from '../sim/system'
import type { GameEvent, World } from '../sim/types'
import type { Clock } from './loop'

export interface Crumb {
  label: string
  target: { type: 'galaxy' } | { type: 'system'; id: number } | { type: 'planet'; id: string }
}

export interface UiState {
  speedIndex: number
  paused: boolean
  follow: boolean
  minimap: boolean
  feedOpen: boolean
  selected: Pick | null
  hovered: Pick | null
  mouse: { x: number; y: number }
}

/** экранный радиус системы при обзоре «подлёт» */
const APPROACH_R = 420

export class Controller {
  readonly ui: UiState = { speedIndex: 0, paused: false, follow: false, minimap: true, feedOpen: false, selected: null, hovered: null, mouse: { x: 0, y: 0 } }
  protected now = 0

  constructor(
    readonly world: World,
    readonly cam: Camera,
    readonly clock: Clock,
    readonly view: () => View,
  ) {}

  minZoom(): number {
    return fitZoom(this.view(), galaxyBounds(this.world.galaxy)) * 0.8
  }

  // ---------- время и переключатели ----------

  setSpeed(i: number): void {
    this.ui.speedIndex = clamp(i, 0, SPEEDS.length - 1)
    this.ui.paused = false
  }

  togglePause(): void {
    this.ui.paused = !this.ui.paused
  }

  toggleFollow(on = !this.ui.follow): void {
    this.ui.follow = on
  }

  toggleMinimap(): void {
    this.ui.minimap = !this.ui.minimap
  }

  toggleFeed(): void {
    this.ui.feedOpen = !this.ui.feedOpen
  }

  // ---------- выбор ----------

  select(p: Pick | null): void {
    this.ui.selected = p
    if (p === null) this.cam.follow = null
  }

  hover(p: Pick | null, mouse?: { x: number; y: number }): void {
    this.ui.hovered = p
    if (mouse) this.ui.mouse = mouse
  }

  selectedPlanet(): string | null {
    return this.ui.selected?.type === 'planet' ? this.ui.selected.id : null
  }

  /** пользователь сам двигает камеру — слежка и привязка к планете выключаются */
  userMoved(): void {
    this.ui.follow = false
    this.cam.follow = null
    this.cam.fly = null
  }

  // ---------- перелёты ----------

  protected go(to: CamTarget, instant: boolean): void {
    if (instant) {
      this.cam.x = to.x
      this.cam.y = to.y
      this.cam.zoom = to.zoom
      this.cam.fly = null
      this.cam.vx = 0
      this.cam.vy = 0
    } else {
      startFly(this.cam, to, this.now)
    }
  }

  flyToGalaxy(instant = false): void {
    const b = galaxyBounds(this.world.galaxy)
    this.cam.follow = null
    this.go({ x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2, zoom: fitZoom(this.view(), b) }, instant)
  }

  flyToSystem(id: number, level: 'approach' | 'system' = 'approach', instant = false): void {
    const s = this.world.galaxy.systems[id]
    const v = this.view()
    const screenR = level === 'system' ? Math.max(900, Math.min(v.width, v.height)) : APPROACH_R
    this.cam.follow = null
    this.go({ x: s.pos.x, y: s.pos.y, zoom: clamp(screenR / s.radius, this.minZoom(), ZOOM_MAX) }, instant)
  }

  /** камера на планете: экранный радиус ~36 px, дальше следует за ней по орбите */
  flyToPlanet(id: string, instant = false, select = true): void {
    const p = this.world.planets.get(id)
    if (!p) return
    const s = this.world.galaxy.systems[p.systemId]
    const q = planetPos(p, this.world.t)
    if (select) this.ui.selected = { type: 'planet', id }
    this.cam.follow = id
    this.go({ x: s.pos.x + q.x, y: s.pos.y + q.y, zoom: clamp(36 / p.radius, 0.6, ZOOM_MAX) }, instant)
  }

  flyToCiv(id: number): void {
    const civ = civById(this.world, id)
    const cap = civ ? capitalOf(this.world, civ) : null
    if (cap) this.flyToPlanet(cap.id)
  }

  flyToEvent(ev: GameEvent): void {
    if (ev.at.planet) this.flyToPlanet(ev.at.planet)
    else this.flyToSystem(ev.at.system, 'approach')
  }

  flyToWorldPoint(x: number, y: number): void {
    this.cam.follow = null
    this.go({ x, y, zoom: this.cam.zoom }, false)
  }

  goCrumb(c: Crumb): void {
    if (c.target.type === 'galaxy') {
      this.select(null)
      this.flyToGalaxy()
    } else if (c.target.type === 'system') {
      this.select(null)
      this.flyToSystem(c.target.id, 'approach')
    } else {
      this.flyToPlanet(c.target.id)
    }
  }

  // ---------- где мы ----------

  /** система, на которую смотрим: раскрытая и ближайшая к центру кадра */
  focusSystem(): number | null {
    let best: number | null = null
    let bd = Infinity
    for (const s of this.world.galaxy.systems) {
      if (lodOf(s.radius, this.cam.zoom).approachAlpha < 0.5) continue
      const d = Math.hypot(s.pos.x - this.cam.x, s.pos.y - this.cam.y)
      if (d < s.radius * 1.5 && d < bd) {
        best = s.id
        bd = d
      }
    }
    return best
  }

  level(): Lod {
    const f = this.focusSystem()
    return f === null ? 'galaxy' : lodOf(this.world.galaxy.systems[f].radius, this.cam.zoom).level
  }

  crumbs(): Crumb[] {
    const out: Crumb[] = [{ label: 'Галактика', target: { type: 'galaxy' } }]
    const f = this.focusSystem()
    if (f === null) return out
    const s = this.world.galaxy.systems[f]
    out.push({ label: s.name, target: { type: 'system', id: f } })
    const sel = this.selectedPlanet()
    const p = sel ? this.world.planets.get(sel) : undefined
    if (p && p.systemId === f) out.push({ label: p.name, target: { type: 'planet', id: p.id } })
    return out
  }

  /** Esc: снять выбор → обзор системы → вся галактика */
  back(): void {
    if (this.ui.selected) {
      this.select(null)
      return
    }
    const f = this.focusSystem()
    if (f !== null && this.level() === 'system') this.flyToSystem(f, 'approach')
    else this.flyToGalaxy()
  }

  update(now: number, dt: number): void {
    this.now = now
    this.clock.speed = this.ui.paused ? 0 : SPEEDS[this.ui.speedIndex]
    if (this.cam.follow) {
      const p = this.world.planets.get(this.cam.follow)
      if (p) {
        const s = this.world.galaxy.systems[p.systemId]
        const q = planetPos(p, this.world.t)
        if (this.cam.fly) {
          this.cam.fly.to.x = s.pos.x + q.x
          this.cam.fly.to.y = s.pos.y + q.y
        } else {
          this.cam.x = s.pos.x + q.x
          this.cam.y = s.pos.y + q.y
        }
      }
    }
    updateCamera(this.cam, now, dt)
  }
}
```

- [ ] **Step 5: Write `src/app/input.ts`**

```ts
import { zoomAt } from '../render/camera'
import { pickAt } from '../render/hit'
import type { Controller } from './controller'

/** мышь и клавиатура → контроллер; возвращает функцию отписки */
export function attachInput(el: HTMLElement, c: Controller): () => void {
  let drag: { x: number; y: number; moved: number; t: number; vx: number; vy: number } | null = null
  const local = (e: MouseEvent) => {
    const r = el.getBoundingClientRect()
    return { x: e.clientX - r.left, y: e.clientY - r.top }
  }
  const pick = (e: MouseEvent) => pickAt(c.world, c.cam, c.view(), local(e))

  const onWheel = (e: WheelEvent) => {
    e.preventDefault()
    c.userMoved()
    zoomAt(c.cam, c.view(), local(e), Math.exp(-e.deltaY * 0.0015), c.minZoom())
  }
  const onDown = (e: PointerEvent) => {
    el.setPointerCapture(e.pointerId)
    const p = local(e)
    drag = { x: p.x, y: p.y, moved: 0, t: performance.now(), vx: 0, vy: 0 }
    c.cam.vx = 0
    c.cam.vy = 0
  }
  const onMove = (e: PointerEvent) => {
    const p = local(e)
    if (!drag) {
      c.hover(pickAt(c.world, c.cam, c.view(), p), p)
      return
    }
    const dx = p.x - drag.x
    const dy = p.y - drag.y
    drag.moved += Math.abs(dx) + Math.abs(dy)
    drag.x = p.x
    drag.y = p.y
    if (drag.moved <= 4) return
    c.userMoved()
    const now = performance.now()
    const dt = Math.max(1, now - drag.t) / 1000
    drag.t = now
    c.cam.x -= dx / c.cam.zoom
    c.cam.y -= dy / c.cam.zoom
    drag.vx = -dx / c.cam.zoom / dt
    drag.vy = -dy / c.cam.zoom / dt
  }
  const onUp = (e: PointerEvent) => {
    if (drag && drag.moved <= 4) c.select(pick(e))
    else if (drag) {
      // инерция после броска
      c.cam.vx = drag.vx
      c.cam.vy = drag.vy
    }
    drag = null
  }
  const onDbl = (e: MouseEvent) => {
    const p = pick(e)
    if (p?.type === 'system') c.flyToSystem(p.id, 'approach')
    else if (p?.type === 'planet') c.flyToPlanet(p.id)
  }
  const onKey = (e: KeyboardEvent) => {
    if (e.target instanceof HTMLInputElement) return
    switch (e.code) {
      case 'Space':
        e.preventDefault()
        c.togglePause()
        break
      case 'Digit1':
      case 'Digit2':
      case 'Digit3':
      case 'Digit4':
        c.setSpeed(Number(e.code.slice(5)) - 1)
        break
      case 'KeyF':
        c.toggleFollow()
        break
      case 'KeyM':
        c.toggleMinimap()
        break
      case 'KeyL':
        c.toggleFeed()
        break
      case 'Escape':
        c.back()
        break
    }
  }

  el.addEventListener('wheel', onWheel, { passive: false })
  el.addEventListener('pointerdown', onDown)
  el.addEventListener('pointermove', onMove)
  el.addEventListener('pointerup', onUp)
  el.addEventListener('dblclick', onDbl)
  window.addEventListener('keydown', onKey)
  return () => {
    el.removeEventListener('wheel', onWheel)
    el.removeEventListener('pointerdown', onDown)
    el.removeEventListener('pointermove', onMove)
    el.removeEventListener('pointerup', onUp)
    el.removeEventListener('dblclick', onDbl)
    window.removeEventListener('keydown', onKey)
  }
}
```

- [ ] **Step 6: Replace `src/app/main.tsx`**

```tsx
import { Application } from 'pixi.js'
import { createCamera } from '../render/camera'
import { GameRenderer } from '../render/renderer'
import { createWorld, stepWorld } from '../sim/world'
import { Controller } from './controller'
import { attachInput } from './input'
import { advance, alpha, createClock } from './loop'

async function boot(): Promise<void> {
  const params = new URLSearchParams(location.search)
  const seed = Number(params.get('seed')) || Math.floor(Math.random() * 1_000_000)
  const world = createWorld(seed)

  const app = new Application()
  await app.init({ background: '#04060c', resizeTo: window, antialias: true, autoDensity: true, resolution: Math.min(window.devicePixelRatio, 2) })
  document.getElementById('stage')!.appendChild(app.canvas)
  const view = () => ({ width: app.screen.width, height: app.screen.height })

  const renderer = new GameRenderer(app, world)
  const clock = createClock(1)
  const controller = new Controller(world, createCamera(), clock, view)
  controller.flyToGalaxy(true)
  attachInput(app.canvas, controller)

  app.ticker.add((ticker) => {
    const dt = ticker.deltaMS / 1000
    advance(clock, dt, () => stepWorld(world))
    controller.update(performance.now() / 1000, dt)
    renderer.render(world, controller.cam, view(), alpha(clock), controller.selectedPlanet())
  })

  Object.assign(window, {
    __orbita: { world, cam: controller.cam, clock, renderer, controller, fastForward: (n: number) => { for (let i = 0; i < n; i++) stepWorld(world) } },
  })
}

void boot()
```

- [ ] **Step 7: Run tests and check by hand**

Run: `npm test && npm run typecheck`
Expected: PASS.

Затем `npm run dev`, открыть http://localhost:5173/?seed=4815 и проверить руками: колесо зумит к курсору, перетаскивание двигает карту и после броска она немного скользит, двойной клик по звезде плавно влетает в систему, двойной клик по планете — крупно и камера едет за планетой, Esc возвращает по шагам, Пробел — пауза, 1–4 — скорости. Остановить сервер.

- [ ] **Step 8: Commit**

```bash
git add src tests
git commit -m "app: picking, camera controller, mouse and keyboard input

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 20: Интерфейс — время, крошки, полоса держав, всплывающие события, лента

**Files:**
- Create: `src/ui/format.ts`, `src/ui/model.ts`, `src/ui/snapshot.ts`, `src/ui/store.ts`, `src/ui/Hud.tsx`, `src/ui/Breadcrumbs.tsx`, `src/ui/TimeControls.tsx`, `src/ui/CivBar.tsx`, `src/ui/Toasts.tsx`, `src/ui/FeedDrawer.tsx`, `src/ui/styles.css`
- Modify: `src/app/main.tsx`
- Test: `tests/ui/format.test.ts`, `tests/ui/model.test.ts`, `tests/ui/snapshot.test.ts`

**Interfaces:**
- Consumes: `Controller`, `Crumb`, `report`, `populatedOf`, `GameEvent`, `YEAR_SECONDS`, `SPEEDS`.
- Produces:
  - `format.ts`: `yearOf(t)`, `fmtInt(n)`, `fmtPop(popK)`, `fmtRate(perMin)` (`+1.2 кр/с`), `fmtCredits(n)`, `fmtDuration(sec)`, `roman(n)`, `hex(color)`.
  - `model.ts`: `interface Toast { ev: GameEvent; until: number }`, `TOAST_LIFE`, `MAX_TOASTS = 3`, `updateToasts(toasts, events, lastId, now)`, `class TrendTracker { trend(id, pop, t): -1 | 0 | 1 }`, `class UiModel { toasts; lastId; trends; tick(w, now) }`.
  - `snapshot.ts`: `interface CivSummary`, `interface Snapshot`, `buildSnapshot(w, c, model): Snapshot`.
  - `store.ts`: `interface Store { get; set; subscribe }`, `createStore()`.
  - React: `<Hud store controller />`.

- [ ] **Step 1: Write the failing tests**

`tests/ui/format.test.ts`:

```ts
import { expect, test } from 'vitest'
import { fmtCredits, fmtDuration, fmtInt, fmtPop, fmtRate, hex, roman, yearOf } from '../../src/ui/format'

test('числа и подписи', () => {
  expect(fmtInt(8400)).toBe('8 400')
  expect(fmtInt(12)).toBe('12')
  expect(fmtPop(8.4)).toBe('8 400')
  expect(fmtRate(72)).toBe('+1.2 кр/с')
  expect(fmtRate(-24)).toBe('−0.4 кр/с')
  expect(fmtCredits(-1250)).toBe('−1 250 кр')
  expect(fmtDuration(Infinity)).toBe('∞')
  expect(fmtDuration(42)).toBe('42 с')
  expect(fmtDuration(150)).toBe('3 мин')
  expect(roman(2)).toBe('II')
  expect(yearOf(41)).toBe(2)
  expect(hex(0x5da8ff)).toBe('#5da8ff')
  expect(hex(0x00ff00)).toBe('#00ff00')
})
```

`tests/ui/model.test.ts`:

```ts
import { describe, expect, test } from 'vitest'
import type { GameEvent } from '../../src/sim/types'
import { TrendTracker, updateToasts } from '../../src/ui/model'

const ev = (id: number, pri: 0 | 1 | 2): GameEvent => ({ id, t: 0, kind: 'x', pri, text: String(id), civs: [], at: { system: 0 }, count: 1 })

describe('всплывающие события', () => {
  test('новые P0/P1 появляются, P2 — нет; живут 8 и 5 с', () => {
    const r = updateToasts([], [ev(1, 0), ev(2, 1), ev(3, 2)], 0, 100)
    expect(r.toasts.map((t) => [t.ev.id, t.until])).toEqual([[1, 108], [2, 105]])
    expect(r.lastId).toBe(3)
    expect(updateToasts(r.toasts, [], r.lastId, 106).toasts.map((t) => t.ev.id)).toEqual([1])
  })

  test('не больше трёх; лишние P1 вытесняются раньше P0', () => {
    const r = updateToasts([], [ev(1, 0), ev(2, 1), ev(3, 1), ev(4, 1)], 0, 0)
    expect(r.toasts.map((t) => t.ev.id)).toEqual([1, 3, 4])
  })

  test('уже показанные события не повторяются', () => {
    const r = updateToasts([], [ev(1, 1)], 0, 0)
    expect(updateToasts([], [ev(1, 1)], r.lastId, 1).toasts).toEqual([])
  })
})

describe('тренд населения', () => {
  test('сравнивает с замером 30-секундной давности, порог 2%', () => {
    const tr = new TrendTracker()
    expect(tr.trend(1, 10, 0)).toBe(0)
    expect(tr.trend(1, 10.1, 10)).toBe(0)
    expect(tr.trend(1, 10.3, 20)).toBe(0)
    expect(tr.trend(1, 10.5, 30)).toBe(1)
    expect(tr.trend(2, 10, 0)).toBe(0)
    expect(tr.trend(2, 9.5, 30)).toBe(-1)
  })
})
```

`tests/ui/snapshot.test.ts`:

```ts
import { expect, test } from 'vitest'
import { Controller } from '../../src/app/controller'
import { createClock } from '../../src/app/loop'
import { createCamera } from '../../src/render/camera'
import { UiModel } from '../../src/ui/model'
import { buildSnapshot } from '../../src/ui/snapshot'
import { quietWorld, run } from '../helpers'

test('снимок для интерфейса: держав столько же, деньги и год берутся из мира', () => {
  const w = quietWorld(4815)
  run(w, 45)
  const c = new Controller(w, createCamera(), createClock(1), () => ({ width: 1600, height: 900 }))
  c.flyToGalaxy(true)
  const s = buildSnapshot(w, c, new UiModel())
  expect(s.seed).toBe(4815)
  expect(s.year).toBe(2)
  expect(s.civs.length).toBe(w.civs.length)
  expect(s.civs[0].name).toBe(w.civs[0].name)
  expect(s.civs[0].treasury).toBe(Math.round(w.civs[0].treasury))
  expect(s.civs[0].color).toMatch(/^#[0-9a-f]{6}$/)
  expect(s.crumbs.map((x) => x.label)).toEqual(['Галактика'])
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/ui`
Expected: FAIL — cannot resolve `../../src/ui/format`.

- [ ] **Step 3: Write `src/ui/format.ts`**

```ts
import { YEAR_SECONDS } from '../sim/config'

export const yearOf = (t: number): number => Math.floor(t / YEAR_SECONDS)

/** 8400 → «8 400» (узкий неразрывный пробел) */
export function fmtInt(n: number): string {
  return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
}

/** население в тысячах → люди */
export const fmtPop = (popK: number): string => fmtInt(popK * 1000)

/** кредиты в минуту → «+1.2 кр/с» */
export function fmtRate(perMin: number): string {
  const v = perMin / 60
  return `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(1)} кр/с`
}

export const fmtCredits = (n: number): string => `${n < 0 ? '−' : ''}${fmtInt(Math.abs(n))} кр`

export function fmtDuration(sec: number): string {
  if (!Number.isFinite(sec)) return '∞'
  if (sec < 60) return `${Math.round(sec)} с`
  return `${Math.round(sec / 60)} мин`
}

export const roman = (n: number): string => ['', 'I', 'II', 'III', 'IV', 'V'][n] ?? String(n)

export const hex = (color: number): string => `#${color.toString(16).padStart(6, '0')}`
```

- [ ] **Step 4: Write `src/ui/model.ts`**

```ts
import type { GameEvent, World } from '../sim/types'

export interface Toast {
  ev: GameEvent
  /** реальное время, до которого показываем */
  until: number
}

export const TOAST_LIFE: Record<0 | 1, number> = { 0: 8, 1: 5 }
export const MAX_TOASTS = 3

/** новые P0/P1 события становятся всплывашками; не больше трёх, лишние P1 уходят первыми */
export function updateToasts(toasts: Toast[], events: GameEvent[], lastId: number, now: number): { toasts: Toast[]; lastId: number } {
  const next = toasts.filter((t) => t.until > now)
  let maxId = lastId
  for (const ev of events) {
    if (ev.id <= lastId) continue
    maxId = Math.max(maxId, ev.id)
    if (ev.pri === 2) continue
    next.push({ ev, until: now + TOAST_LIFE[ev.pri] })
  }
  while (next.length > MAX_TOASTS) {
    const i = next.findIndex((t) => t.ev.pri === 1)
    next.splice(i >= 0 ? i : 0, 1)
  }
  return { toasts: next, lastId: maxId }
}

/** тренд населения державы: сравнение с замером не моложе 30 с, порог 2% */
export class TrendTracker {
  private readonly hist = new Map<number, { t: number; pop: number }[]>()

  trend(id: number, pop: number, t: number): -1 | 0 | 1 {
    let h = this.hist.get(id)
    if (!h) {
      h = []
      this.hist.set(id, h)
    }
    if (!h.length || t - h[h.length - 1].t >= 10) h.push({ t, pop })
    while (h.length > 1 && t - h[1].t >= 30) h.shift()
    const old = h[0]
    if (t - old.t < 30) return 0
    if (pop > old.pop * 1.02) return 1
    if (pop < old.pop * 0.98) return -1
    return 0
  }
}

export class UiModel {
  toasts: Toast[] = []
  lastId = 0
  readonly trends = new TrendTracker()

  tick(w: World, now: number): void {
    const r = updateToasts(this.toasts, w.events, this.lastId, now)
    this.toasts = r.toasts
    this.lastId = r.lastId
  }
}
```

- [ ] **Step 5: Write `src/ui/snapshot.ts` and `src/ui/store.ts`**

`src/ui/snapshot.ts`:

```ts
import type { Controller, Crumb } from '../app/controller'
import { report } from '../sim/economy'
import { populatedOf } from '../sim/query'
import type { GameEvent, Stage, World } from '../sim/types'
import { hex, yearOf } from './format'
import type { Toast, UiModel } from './model'

export interface CivSummary {
  id: number
  name: string
  color: string
  planets: number
  pop: number
  treasury: number
  netPerMin: number
  stage: Stage
  trend: -1 | 0 | 1
}

export interface Snapshot {
  seed: number
  year: number
  speedIndex: number
  paused: boolean
  follow: boolean
  minimapOn: boolean
  feedOpen: boolean
  crumbs: Crumb[]
  civs: CivSummary[]
  toasts: Toast[]
  feed: GameEvent[]
}

export function buildSnapshot(w: World, c: Controller, model: UiModel): Snapshot {
  const civs = w.civs.map((civ) => {
    const mine = populatedOf(w, civ)
    const pop = mine.reduce((s, p) => s + p.pop, 0)
    const r = report(civ)
    return {
      id: civ.id,
      name: civ.name,
      color: hex(civ.color),
      planets: mine.length,
      pop,
      treasury: Math.round(civ.treasury),
      netPerMin: r.netPerMin,
      stage: civ.eco.stage,
      trend: model.trends.trend(civ.id, pop, w.t),
    }
  })
  return {
    seed: w.seed,
    year: yearOf(w.t),
    speedIndex: c.ui.speedIndex,
    paused: c.ui.paused,
    follow: c.ui.follow,
    minimapOn: c.ui.minimap,
    feedOpen: c.ui.feedOpen,
    crumbs: c.crumbs(),
    civs,
    toasts: model.toasts,
    feed: c.ui.feedOpen ? w.events.slice(-200).reverse() : [],
  }
}
```

`src/ui/store.ts`:

```ts
import type { Snapshot } from './snapshot'

export interface Store {
  get: () => Snapshot | null
  set: (s: Snapshot) => void
  subscribe: (listener: () => void) => () => void
}

export function createStore(): Store {
  let snap: Snapshot | null = null
  const listeners = new Set<() => void>()
  return {
    get: () => snap,
    set: (s) => {
      snap = s
      for (const l of listeners) l()
    },
    subscribe: (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
  }
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run tests/ui && npm run typecheck`
Expected: PASS.

- [ ] **Step 7: Write the React components and styles**

`src/ui/Breadcrumbs.tsx`:

```tsx
import type { Crumb } from '../app/controller'

export function Breadcrumbs({ crumbs, onPick }: { crumbs: Crumb[]; onPick: (c: Crumb) => void }) {
  return (
    <nav className="panel crumbs">
      <span className="brand">ОРБИТА</span>
      {crumbs.map((c, i) => (
        <span key={c.label + i}>
          <span className="sep">{i === 0 ? '·' : '›'}</span>
          <button className={i === crumbs.length - 1 ? 'crumb current' : 'crumb'} onClick={() => onPick(c)}>
            {c.label}
          </button>
        </span>
      ))}
    </nav>
  )
}
```

`src/ui/TimeControls.tsx`:

```tsx
import type { Controller } from '../app/controller'
import { SPEEDS } from '../sim/config'
import type { Snapshot } from './snapshot'

export function TimeControls({ s, controller }: { s: Snapshot; controller: Controller }) {
  const newSeed = (seed: number) => {
    location.search = `?seed=${seed}`
  }
  return (
    <div className="panel time">
      <span className="year">год {s.year}</span>
      <span className="epoch">эпоха I</span>
      <span className="seg">
        <button className={s.paused ? 'on' : ''} onClick={() => controller.togglePause()} title="Пауза — Пробел">
          {s.paused ? '▶' : '❚❚'}
        </button>
        {SPEEDS.map((v, i) => (
          <button key={v} className={!s.paused && s.speedIndex === i ? 'on' : ''} onClick={() => controller.setSpeed(i)} title={`×${v} — клавиша ${i + 1}`}>
            ×{v}
          </button>
        ))}
      </span>
      <button className={s.follow ? 'on' : ''} onClick={() => controller.toggleFollow()} title="Камера следит за самым интересным — F">
        🎥
      </button>
      <button
        className="seed"
        title="Зерно галактики: щёлкни, чтобы ввести своё"
        onClick={() => {
          const v = prompt('Зерно галактики', String(s.seed))
          if (v && Number(v)) newSeed(Number(v))
        }}
      >
        зерно {s.seed}
      </button>
      <button title="Новая случайная галактика" onClick={() => newSeed(Math.floor(Math.random() * 1_000_000))}>
        🎲
      </button>
    </div>
  )
}
```

`src/ui/CivBar.tsx`:

```tsx
import { fmtRate } from './format'
import type { CivSummary } from './snapshot'

const ARROW = { 1: '↑', 0: '→', [-1]: '↓' } as const

export function CivBar({ civs, onPick, onFeed }: { civs: CivSummary[]; onPick: (id: number) => void; onFeed: () => void }) {
  return (
    <div className="panel civbar">
      <div className="civs">
        {civs.map((c) => (
          <button key={c.id} className="civ" onClick={() => onPick(c.id)} title={`${c.name}: ${c.planets} пл., казна ${c.treasury} кр, ${fmtRate(c.netPerMin)}`}>
            <span className="dot" style={{ background: c.color, color: c.color }} />
            <b>{c.name}</b>
            <span className="muted">{c.planets}пл</span>
            <span className={c.trend > 0 ? 'good' : c.trend < 0 ? 'bad' : 'muted'}>{ARROW[c.trend]}</span>
            {c.stage !== 'ok' && <span title="долги">💸</span>}
          </button>
        ))}
      </div>
      <button className="feed-btn" onClick={onFeed} title="Вся лента событий — L">
        ☰ лента
      </button>
    </div>
  )
}
```

`src/ui/Toasts.tsx`:

```tsx
import type { GameEvent } from '../sim/types'
import type { Toast } from './model'

export function Toasts({ toasts, onPick }: { toasts: Toast[]; onPick: (ev: GameEvent) => void }) {
  return (
    <div className="toasts">
      {toasts.map((t) => (
        <button key={t.ev.id} className={`panel toast pri${t.ev.pri}`} onClick={() => onPick(t.ev)} title="Показать на карте">
          {t.ev.text}
        </button>
      ))}
    </div>
  )
}
```

`src/ui/FeedDrawer.tsx`:

```tsx
import type { GameEvent } from '../sim/types'
import { yearOf } from './format'

export function FeedDrawer({ events, onPick, onClose }: { events: GameEvent[]; onPick: (ev: GameEvent) => void; onClose: () => void }) {
  return (
    <aside className="panel feed">
      <header>
        <b>ЛЕНТА</b>
        <button onClick={onClose} aria-label="закрыть">✕</button>
      </header>
      <ol>
        {events.map((e) => (
          <li key={e.id} className={`pri${e.pri}`}>
            <button onClick={() => onPick(e)}>
              <span className="muted">г.{yearOf(e.t)}</span> {e.text}
            </button>
          </li>
        ))}
      </ol>
    </aside>
  )
}
```

`src/ui/Hud.tsx`:

```tsx
import { useSyncExternalStore } from 'react'
import type { Controller } from '../app/controller'
import { Breadcrumbs } from './Breadcrumbs'
import { CivBar } from './CivBar'
import { FeedDrawer } from './FeedDrawer'
import type { Store } from './store'
import { TimeControls } from './TimeControls'
import { Toasts } from './Toasts'
import './styles.css'

export function Hud({ store, controller }: { store: Store; controller: Controller }) {
  const s = useSyncExternalStore(store.subscribe, store.get)
  if (!s) return null
  return (
    <>
      <Breadcrumbs crumbs={s.crumbs} onPick={(c) => controller.goCrumb(c)} />
      <TimeControls s={s} controller={controller} />
      <Toasts toasts={s.toasts} onPick={(ev) => controller.flyToEvent(ev)} />
      <CivBar civs={s.civs} onPick={(id) => controller.flyToCiv(id)} onFeed={() => controller.toggleFeed()} />
      {s.feedOpen && <FeedDrawer events={s.feed} onPick={(ev) => controller.flyToEvent(ev)} onClose={() => controller.toggleFeed()} />}
    </>
  )
}
```

`src/ui/styles.css`:

```css
:root {
  --glass: rgba(13, 20, 38, 0.86);
  --edge: #2b3756;
  --text: #cfe0ff;
  --muted: #6b7a99;
  --accent: #0a84ff;
  --good: #7dd87d;
  --bad: #ff6b6b;
  --gold: #ffd97a;
  font-family: 'JetBrains Mono', monospace;
  font-size: 12px;
  color: var(--text);
}

.panel {
  position: absolute;
  pointer-events: auto;
  background: var(--glass);
  border: 1px solid var(--edge);
  border-radius: 8px;
  backdrop-filter: blur(6px);
  padding: 6px 10px;
}

button {
  font: inherit;
  color: inherit;
  background: none;
  border: 0;
  cursor: pointer;
  padding: 2px 6px;
  border-radius: 4px;
}
button:hover { background: rgba(255, 255, 255, 0.06); }
button.on { background: var(--accent); color: #fff; }
.muted { color: var(--muted); }
.good { color: var(--good); }
.bad { color: var(--bad); }

.crumbs { left: 16px; top: 16px; display: flex; align-items: center; gap: 2px; }
.crumbs .brand { font-family: 'Russo One', sans-serif; letter-spacing: 3px; margin-right: 6px; }
.crumbs .sep { color: var(--muted); margin: 0 2px; }
.crumbs .crumb.current { color: #fff; font-weight: 700; }

.time { right: 16px; top: 16px; display: flex; align-items: center; gap: 8px; }
.time .year { font-weight: 700; }
.time .seg { display: flex; gap: 2px; }
.time .seed { color: var(--muted); }

.toasts { position: absolute; left: 16px; bottom: 64px; display: flex; flex-direction: column-reverse; gap: 6px; pointer-events: none; }
.toast { position: static; text-align: left; max-width: 380px; pointer-events: auto; animation: toast-in 0.25s ease-out; }
.toast.pri0 { border-color: var(--gold); }
@keyframes toast-in { from { opacity: 0; transform: translateY(8px); } }

.civbar { left: 16px; right: 16px; bottom: 16px; display: flex; align-items: center; gap: 8px; }
.civbar .civs { display: flex; gap: 4px; flex: 1; overflow-x: auto; }
.civbar .civ { display: flex; gap: 5px; align-items: center; white-space: nowrap; }
.dot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; box-shadow: 0 0 6px currentColor; }

.feed { right: 16px; top: 64px; bottom: 64px; width: 360px; display: flex; flex-direction: column; }
.feed header { display: flex; justify-content: space-between; margin-bottom: 6px; }
.feed ol { list-style: none; margin: 0; padding: 0; overflow-y: auto; }
.feed li button { text-align: left; width: 100%; }
.feed li.pri0 { color: var(--gold); }
.feed li.pri2 { color: var(--muted); }
```

- [ ] **Step 8: Modify `src/app/main.tsx` — интерфейс**

Добавить импорты:

```tsx
import { createRoot } from 'react-dom/client'
import { Hud } from '../ui/Hud'
import { UiModel } from '../ui/model'
import { buildSnapshot } from '../ui/snapshot'
import { createStore } from '../ui/store'
```

После `attachInput(...)`:

```tsx
  const store = createStore()
  const model = new UiModel()
  createRoot(document.getElementById('hud')!).render(<Hud store={store} controller={controller} />)
  let uiT = 0
```

В тикере после `renderer.render(...)`:

```tsx
    uiT += dt
    if (uiT >= 0.2) {
      uiT = 0
      model.tick(world, performance.now() / 1000)
      store.set(buildSnapshot(world, controller, model))
    }
```

- [ ] **Step 9: Проверить глазами**

Run: `npm test && npm run typecheck && npm run shot -- "seed=4815" artifacts/hud.png "(()=>{const o=window.__orbita;o.fastForward(6000)})()"`
Expected: «ошибок нет». На `artifacts/hud.png`: слева сверху «ОРБИТА · Галактика», справа сверху год, скорости, 🎥, зерно; внизу полоса держав с цветными точками; слева над ней 0–3 всплывающих события. Панели не закрывают центр карты.

- [ ] **Step 10: Commit**

```bash
git add src tests
git commit -m "ui: HUD shell — time, breadcrumbs, civ bar, toasts, event feed

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 21: Карточки, миникарта, подсказки

**Files:**
- Create: `src/ui/cards.ts`, `src/ui/Card.tsx`, `src/ui/Minimap.tsx`, `src/ui/Tooltip.tsx`
- Modify: `src/ui/snapshot.ts` (карточка, подсказка, миникарта), `src/app/controller.ts` (карточка державы, задержка подсказки), `src/ui/Hud.tsx`, `src/ui/styles.css`
- Test: `tests/ui/cards.test.ts`

**Interfaces:**
- Consumes: `Pick`, `report`, `capOf`, `taxOf`, `stationIncome`, `territoryShares`, `galaxyBounds`, `screenToWorld`, `gateTo`, формат.
- Produces:
  - `cards.ts`: `interface CardRow { label; value; tone? }`, `interface CardData { kind: 'planet' | 'system' | 'civ' | 'ship'; title; subtitle?; color?; rows }`, `planetCard(w, id)`, `systemCard(w, id)`, `civCard(w, id)`, `shipCard(w, id)`, `cardFor(w, pick): CardData | null`, `missionText(w, ship): string`.
  - `Snapshot` получает поля `card: CardData | null`, `hover: { x: number; y: number; card: CardData } | null`, `minimap: MinimapData | null`; `interface MinimapData { systems: { x; y; star: string; owner: string | null }[]; corridors: [number, number, number, number][]; bounds: Bounds; view: { x0; y0; x1; y1 } }`.

- [ ] **Step 1: Write the failing test**

`tests/ui/cards.test.ts`:

```ts
import { describe, expect, test } from 'vitest'
import { capitalOf } from '../../src/sim/query'
import { spawnShip } from '../../src/sim/ships'
import { civCard, missionText, planetCard, shipCard, systemCard } from '../../src/ui/cards'
import { quietWorld, run } from '../helpers'

describe('карточки', () => {
  test('столица: владелец, население из потолка, налог', () => {
    const w = quietWorld(4815)
    const civ = w.civs[0]
    const home = capitalOf(w, civ)!
    const card = planetCard(w, home.id)!
    expect(card.title).toBe(home.name)
    expect(card.subtitle).toBe(`${civ.name} · столица`)
    const rows = Object.fromEntries(card.rows.map((r) => [r.label, r.value]))
    expect(rows['население']).toMatch(/^\d[\d ]* \/ \d[\d ]*$/)
    expect(rows['налог']).toMatch(/^\+\d+\.\d кр\/с$/)
  })

  test('ничья планета показывает пригодность', () => {
    const w = quietWorld(4815)
    const free = [...w.planets.values()].find((p) => p.owner === null && p.habitability >= 1)!
    const card = planetCard(w, free.id)!
    expect(card.subtitle).toBe('ничья')
    expect(card.rows.find((r) => r.label === 'пригодность')!.tone).toBe('good')
  })

  test('система: роль и доли держав', () => {
    const w = quietWorld(4815)
    const home = capitalOf(w, w.civs[0])!
    const card = systemCard(w, home.systemId)!
    expect(card.subtitle).toContain('обитаемая')
    expect(card.rows.some((r) => r.label === w.civs[0].name)).toBe(true)
  })

  test('держава: отчёт казны и стадия', () => {
    const w = quietWorld(4815)
    run(w, 10)
    const card = civCard(w, w.civs[0].id)!
    const labels = card.rows.map((r) => r.label)
    expect(labels).toEqual(expect.arrayContaining(['казна', 'чистый доход', 'запас', 'стадия', 'планет']))
  })

  test('корабль: чей и чем занят', () => {
    const w = quietWorld(4815)
    const civ = w.civs[0]
    const home = capitalOf(w, civ)!
    const ship = spawnShip(w, civ, 'caravan', home, { type: 'return', planetId: home.id }, 50)
    expect(missionText(w, ship)).toBe('возвращается в док')
    ship.mission = { type: 'mine', phase: 'back', asteroidId: null, cargo: 20, idleT: 0 }
    expect(missionText(w, ship)).toBe('везёт руду домой (+16 кр)')
    const card = shipCard(w, ship.id)!
    expect(card.subtitle).toBe(civ.name)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/ui/cards.test.ts`
Expected: FAIL — cannot resolve `../../src/ui/cards`.

- [ ] **Step 3: Write `src/ui/cards.ts`**

```ts
import type { Pick } from '../render/hit'
import { territoryShares } from '../render/territory'
import { ECON, RESEARCH, RESEARCH_BRANCHES } from '../sim/config'
import { report, stationIncome, taxOf } from '../sim/economy'
import { capOf, civById, planetsOf, populatedOf } from '../sim/query'
import type { Ship, World } from '../sim/types'
import { fmtCredits, fmtDuration, fmtPop, fmtRate, hex, roman } from './format'

export interface CardRow {
  label: string
  value: string
  tone?: 'good' | 'bad' | 'muted'
}

export interface CardData {
  kind: 'planet' | 'system' | 'civ' | 'ship'
  title: string
  subtitle?: string
  color?: string
  rows: CardRow[]
}

const KIND_RU = { rocky: 'каменистая', ice: 'ледяной гигант', gas: 'газовый гигант', dwarf: 'карлик' }
const ZONE_RU = { hot: 'горячая', temperate: 'умеренная', cold: 'холодная' }
const ROLE_RU = { inhabited: 'обитаемая', ore: 'рудная', pit: 'астероидная «Яма»', nebula: 'туманность' }
const STAGE_RU = { ok: 'в норме', deficit: 'дефицит', crisis: 'кризис', bankrupt: 'банкрот' }
const SHIP_RU = { colony: 'Колонисты', caravan: 'Караван', miner: 'Шахтёр' }

export function planetCard(w: World, id: string): CardData | null {
  const p = w.planets.get(id)
  if (!p) return null
  const owner = p.owner === null ? undefined : civById(w, p.owner)
  const t = p.tempK - 273
  const rows: CardRow[] = [
    { label: 'тип', value: `${KIND_RU[p.kind]}, ${ZONE_RU[p.zone]} зона` },
    { label: 'температура', value: `${t > 0 ? '+' : ''}${t} °C` },
  ]
  if (owner && p.pop > 0) {
    rows.push({ label: 'население', value: `${fmtPop(p.pop)} / ${fmtPop(capOf(p, owner))}` })
    rows.push({ label: 'инфраструктура', value: p.infra ? roman(p.infra) : '—' })
    rows.push({ label: 'налог', value: fmtRate(taxOf(p, owner) * 60) })
  } else if (p.station) {
    rows.push({ label: 'станция', value: p.build ? 'строится' : fmtRate(stationIncome(w.galaxy.systems[p.systemId]) * 60) })
  } else if (p.owner === null) {
    rows.push({ label: 'пригодность', value: p.habitability > 0 ? `×${p.habitability}` : 'непригодна', tone: p.habitability >= 1 ? 'good' : 'muted' })
  }
  if (p.build) {
    const what = p.build.kind === 'infra' ? `инфраструктура ${roman(p.build.level)}` : 'станция'
    rows.push({ label: 'стройка', value: `${what} · ${fmtDuration(p.build.remaining)}` })
  }
  const caravans = w.ships.filter((s) => s.alive && s.mission.type === 'trade' && (s.mission.a === id || s.mission.b === id)).length
  if (caravans) rows.push({ label: 'караваны', value: String(caravans) })
  return {
    kind: 'planet',
    title: p.name,
    subtitle: owner ? `${owner.name}${owner.capital === p.id ? ' · столица' : ''}` : 'ничья',
    color: owner ? hex(owner.color) : undefined,
    rows,
  }
}

export function systemCard(w: World, id: number): CardData | null {
  const s = w.galaxy.systems[id]
  if (!s) return null
  const rows: CardRow[] = [{ label: 'планет', value: String(s.planets.length) }]
  for (const sh of territoryShares(w, s)) {
    const c = civById(w, sh.civ)!
    rows.push({ label: c.name, value: `${Math.round(sh.share * 100)}%` })
  }
  const neighbours = s.gates.map((g) => w.galaxy.systems[g.toSystem].name).join(', ')
  rows.push({ label: 'коридоры', value: neighbours || '—' })
  return { kind: 'system', title: s.name, subtitle: `${ROLE_RU[s.role]} · звезда ${s.star.type}`, rows }
}

export function civCard(w: World, id: number): CardData | null {
  const civ = civById(w, id)
  if (!civ) return null
  const r = report(civ)
  const mine = populatedOf(w, civ)
  const stations = planetsOf(w, civ).filter((p) => p.station).length
  const research = RESEARCH_BRANCHES.filter((b) => civ.research[b] > 0).map((b) => `${RESEARCH[b].label} ${roman(civ.research[b])}`)
  const rows: CardRow[] = [
    { label: 'казна', value: fmtCredits(civ.treasury), tone: civ.treasury < 0 ? 'bad' : undefined },
    { label: 'доход', value: fmtRate(r.grossPerMin) },
    { label: 'содержание', value: fmtRate(-r.upkeepPerMin) },
    { label: 'чистый доход', value: fmtRate(r.netPerMin), tone: r.netPerMin >= 0 ? 'good' : 'bad' },
    { label: 'запас', value: `${r.reserveMin.toFixed(1)} мин дохода` },
    { label: 'стадия', value: STAGE_RU[civ.eco.stage], tone: civ.eco.stage === 'ok' ? 'good' : 'bad' },
    { label: 'планет', value: `${mine.length}${stations ? ` + ${stations} станц.` : ''}` },
    { label: 'население', value: fmtPop(mine.reduce((s, p) => s + p.pop, 0)) },
    { label: 'исследования', value: research.length ? research.join(', ') : '—' },
    { label: 'верфь / порт', value: `${civ.shipyard ? 'есть' : 'нет'} / ${civ.port ? 'есть' : 'нет'}` },
  ]
  if (civ.researchJob) rows.push({ label: 'исследует', value: `${RESEARCH[civ.researchJob.branch].label} ${roman(civ.researchJob.level)} · ${fmtDuration(civ.researchJob.remaining)}` })
  if (civ.project) rows.push({ label: 'строит', value: `${civ.project.kind === 'port' ? 'порт' : 'верфь'} · ${fmtDuration(civ.project.remaining)}` })
  return { kind: 'civ', title: civ.name, color: hex(civ.color), rows }
}

export function missionText(w: World, ship: Ship): string {
  if (ship.transit) {
    const to = w.galaxy.systems[ship.transit.to].name
    return `в коридоре → ${to} · ${fmtDuration(ship.transit.duration - ship.transit.elapsed)}`
  }
  const name = (id: string) => w.planets.get(id)?.name ?? '?'
  const m = ship.mission
  switch (m.type) {
    case 'colonize':
      return `везёт колонистов → ${name(m.planetId)}`
    case 'trade':
      return `торгует: ${name(m.a)} ↔ ${name(m.b)}`
    case 'mine':
      if (m.phase === 'back') return `везёт руду домой (+${Math.round(m.cargo * ECON.orePrice)} кр)`
      return m.asteroidId === null && m.idleT > 0 ? 'ждёт руду у планеты' : 'летит к астероиду'
    case 'return':
      return 'возвращается в док'
    case 'patrol':
      return 'патрулирует'
  }
}

export function shipCard(w: World, id: number): CardData | null {
  const ship = w.ships.find((s) => s.id === id)
  if (!ship) return null
  const owner = civById(w, ship.owner)
  const where = ship.transit ? 'в коридоре' : w.galaxy.systems[ship.systemId].name
  return {
    kind: 'ship',
    title: SHIP_RU[ship.kind],
    subtitle: owner?.name,
    color: owner ? hex(owner.color) : undefined,
    rows: [
      { label: 'задача', value: missionText(w, ship) },
      { label: 'где', value: where },
    ],
  }
}

export function cardFor(w: World, pick: Pick | null): CardData | null {
  if (!pick) return null
  if (pick.type === 'planet') return planetCard(w, pick.id)
  if (pick.type === 'system') return systemCard(w, pick.id)
  return shipCard(w, pick.id)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/ui/cards.test.ts`
Expected: PASS.

- [ ] **Step 5: Extend `src/ui/snapshot.ts`**

Импорты:

```ts
import { galaxyBounds, screenToWorld, type Bounds } from '../render/camera'
import { territoryShares } from '../render/territory'
import { gateGalaxyPos, gateTo } from '../sim/routing'
import { cardFor, civCard, type CardData } from './cards'
```

Типы и поля:

```ts
export interface MinimapData {
  systems: { x: number; y: number; star: string; owner: string | null }[]
  corridors: [number, number, number, number][]
  bounds: Bounds
  view: { x0: number; y0: number; x1: number; y1: number }
}
```

В `Snapshot` добавить:

```ts
  card: CardData | null
  hover: { x: number; y: number; card: CardData } | null
  minimap: MinimapData | null
```

Функция миникарты и заполнение полей в `buildSnapshot` (в возвращаемый объект):

```ts
function minimapOf(w: World, c: Controller): MinimapData {
  const v = c.view()
  const a = screenToWorld(c.cam, v, { x: 0, y: 0 })
  const b = screenToWorld(c.cam, v, { x: v.width, y: v.height })
  return {
    systems: w.galaxy.systems.map((s) => {
      const lead = territoryShares(w, s)[0]
      return { x: s.pos.x, y: s.pos.y, star: hex(s.star.color), owner: lead ? hex(lead.color) : null }
    }),
    corridors: w.galaxy.corridors.map((k) => {
      const A = w.galaxy.systems[k.a]
      const B = w.galaxy.systems[k.b]
      const ga = gateGalaxyPos(A, gateTo(A, k.b)!)
      const gb = gateGalaxyPos(B, gateTo(B, k.a)!)
      return [ga.x, ga.y, gb.x, gb.y]
    }),
    bounds: galaxyBounds(w.galaxy),
    view: { x0: a.x, y0: a.y, x1: b.x, y1: b.y },
  }
}
```

Подсказка при наведении показывается через 0.3 с, а клик по державе в полосе открывает карточку державы. Для этого в `src/app/controller.ts` добавить поля и методы, а `select` и `hover` заменить:

```ts
  /** держава, чья карточка открыта кликом в полосе держав */
  civCardId: number | null = null
  private hoverSince = 0

  select(p: Pick | null): void {
    this.ui.selected = p
    this.civCardId = null
    if (p === null) this.cam.follow = null
  }

  hover(p: Pick | null, mouse?: { x: number; y: number }): void {
    const prev = this.ui.hovered
    const changed = !prev || !p || prev.type !== p.type || prev.id !== p.id
    if (changed) this.hoverSince = this.now
    this.ui.hovered = p
    if (mouse) this.ui.mouse = mouse
  }

  /** подсказка готова: под курсором что-то есть уже 0.3 с и это не выбранный объект */
  hoverReady(): boolean {
    const h = this.ui.hovered
    const s = this.ui.selected
    if (!h || this.now - this.hoverSince < 0.3) return false
    return !(s && s.type === h.type && s.id === h.id)
  }

  /** клик по державе: перелёт к столице и карточка державы */
  showCiv(id: number): void {
    this.flyToCiv(id)
    this.ui.selected = null
    this.civCardId = id
  }
```

В возвращаемый объект `buildSnapshot` добавить:

```ts
    card: c.civCardId !== null && !c.ui.selected ? civCard(w, c.civCardId) : cardFor(w, c.ui.selected),
    hover: (() => {
      if (!c.hoverReady()) return null
      const card = cardFor(w, c.ui.hovered)
      return card ? { x: c.ui.mouse.x, y: c.ui.mouse.y, card } : null
    })(),
    minimap: c.ui.minimap ? minimapOf(w, c) : null,
```

- [ ] **Step 6: Write `Card.tsx`, `Minimap.tsx`, `Tooltip.tsx`**

`src/ui/Card.tsx`:

```tsx
import type { CardData } from './cards'

export function Card({ card, onClose }: { card: CardData; onClose: () => void }) {
  return (
    <aside className="panel card">
      <header>
        <b style={{ color: card.color }}>{card.title.toUpperCase()}</b>
        <button onClick={onClose} aria-label="закрыть" title="Закрыть — Esc">
          ✕
        </button>
      </header>
      {card.subtitle && <div className="subtitle">{card.subtitle}</div>}
      <dl>
        {card.rows.map((r) => (
          <div key={r.label} className="row">
            <dt>{r.label}</dt>
            <dd className={r.tone}>{r.value}</dd>
          </div>
        ))}
      </dl>
    </aside>
  )
}
```

`src/ui/Minimap.tsx`:

```tsx
import { useEffect, useRef } from 'react'
import type { MinimapData } from './snapshot'

const W = 190
const H = 124

export function Minimap({ data, onJump }: { data: MinimapData; onJump: (x: number, y: number) => void }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const { bounds: b } = data
  const k = Math.min(W / (b.maxX - b.minX), H / (b.maxY - b.minY))
  const ox = (W - (b.maxX - b.minX) * k) / 2
  const oy = (H - (b.maxY - b.minY) * k) / 2
  const sx = (x: number) => ox + (x - b.minX) * k
  const sy = (y: number) => oy + (y - b.minY) * k

  useEffect(() => {
    const ctx = ref.current?.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, W, H)
    ctx.strokeStyle = '#3a4a6a'
    ctx.lineWidth = 1
    for (const [x1, y1, x2, y2] of data.corridors) {
      ctx.beginPath()
      ctx.moveTo(sx(x1), sy(y1))
      ctx.lineTo(sx(x2), sy(y2))
      ctx.stroke()
    }
    for (const s of data.systems) {
      if (s.owner) {
        ctx.fillStyle = s.owner + '55'
        ctx.beginPath()
        ctx.arc(sx(s.x), sy(s.y), 8, 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.fillStyle = s.star
      ctx.beginPath()
      ctx.arc(sx(s.x), sy(s.y), 3, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.strokeStyle = '#e6eeff'
    ctx.strokeRect(sx(data.view.x0), sy(data.view.y0), (data.view.x1 - data.view.x0) * k, (data.view.y1 - data.view.y0) * k)
  })

  return (
    <div className="panel minimap" title="Вся галактика — клик для перелёта, M — скрыть">
      <canvas
        ref={ref}
        width={W}
        height={H}
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect()
          onJump(b.minX + (e.clientX - r.left - ox) / k, b.minY + (e.clientY - r.top - oy) / k)
        }}
      />
    </div>
  )
}
```

`src/ui/Tooltip.tsx`:

```tsx
import type { CardData } from './cards'

export function Tooltip({ x, y, card }: { x: number; y: number; card: CardData }) {
  return (
    <div className="panel tooltip" style={{ left: x + 16, top: y + 12 }}>
      <b style={{ color: card.color }}>{card.title}</b>
      {card.subtitle && <span className="muted"> · {card.subtitle}</span>}
      {card.rows.slice(0, 2).map((r) => (
        <div key={r.label} className="muted">
          {r.label}: {r.value}
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 7: Wire into `Hud.tsx` and styles**

`src/ui/Hud.tsx` целиком:

```tsx
import { useSyncExternalStore } from 'react'
import type { Controller } from '../app/controller'
import { Breadcrumbs } from './Breadcrumbs'
import { Card } from './Card'
import { CivBar } from './CivBar'
import { FeedDrawer } from './FeedDrawer'
import { Minimap } from './Minimap'
import type { Store } from './store'
import { TimeControls } from './TimeControls'
import { Toasts } from './Toasts'
import { Tooltip } from './Tooltip'
import './styles.css'

export function Hud({ store, controller }: { store: Store; controller: Controller }) {
  const s = useSyncExternalStore(store.subscribe, store.get)
  if (!s) return null
  return (
    <>
      <Breadcrumbs crumbs={s.crumbs} onPick={(c) => controller.goCrumb(c)} />
      <TimeControls s={s} controller={controller} />
      {s.minimap && <Minimap data={s.minimap} onJump={(x, y) => controller.flyToWorldPoint(x, y)} />}
      {s.card && <Card card={s.card} onClose={() => controller.select(null)} />}
      <Toasts toasts={s.toasts} onPick={(ev) => controller.flyToEvent(ev)} />
      <CivBar civs={s.civs} onPick={(id) => controller.showCiv(id)} onFeed={() => controller.toggleFeed()} />
      {s.feedOpen && <FeedDrawer events={s.feed} onPick={(ev) => controller.flyToEvent(ev)} onClose={() => controller.toggleFeed()} />}
      {s.hover && <Tooltip x={s.hover.x} y={s.hover.y} card={s.hover.card} />}
    </>
  )
}
```

В `styles.css` дописать:

```css
.minimap { right: 16px; top: 60px; padding: 4px; }
.minimap canvas { display: block; cursor: pointer; }

.card { right: 16px; top: 200px; width: 260px; }
.card header { display: flex; justify-content: space-between; align-items: center; }
.card .subtitle { color: var(--muted); margin: 2px 0 6px; }
.card dl { margin: 0; }
.card .row { display: flex; justify-content: space-between; gap: 12px; padding: 2px 0; border-top: 1px solid rgba(255, 255, 255, 0.04); }
.card dt { color: var(--muted); }
.card dd { margin: 0; text-align: right; }

.tooltip { pointer-events: none; max-width: 280px; padding: 4px 8px; }
```

- [ ] **Step 8: Проверить**

Run: `npm test && npm run typecheck && npm run shot -- "seed=4815" artifacts/cards.png "(()=>{const o=window.__orbita;o.fastForward(6000);const c=o.world.civs[0];o.controller.flyToPlanet(c.capital,true)})()"`
Expected: «ошибок нет»; на снимке справа миникарта с рамкой видимой области и под ней карточка столицы с населением, налогом, инфраструктурой. В `npm run dev` проверить руками: наведение на планету/корабль даёт подсказку, клик по державе в полосе — перелёт и карточка державы, M прячет миникарту, клик по миникарте переносит камеру.

- [ ] **Step 9: Commit**

```bash
git add src tests
git commit -m "ui: planet/system/civ/ship cards, minimap, hover tooltips

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 22: Слежка 🎥 — камера сама летит к интересному

**Files:**
- Create: `src/app/director.ts`
- Modify: `src/app/controller.ts`
- Test: `tests/app/director.test.ts`

**Interfaces:**
- Consumes: `GameEvent`, `Controller`.
- Produces: `interface Focus { eventId: number; since: number }`, `pickFocus(fresh: GameEvent[], now: number, current: Focus | null, minDwell = 8): { focus: Focus | null; event: GameEvent | null }`. `Controller` при включённой слежке раз в полсекунды выбирает событие и летит к нему, не выделяя планету.

- [ ] **Step 1: Write the failing test**

`tests/app/director.test.ts`:

```ts
import { describe, expect, test } from 'vitest'
import { Controller } from '../../src/app/controller'
import { pickFocus } from '../../src/app/director'
import { createClock } from '../../src/app/loop'
import { createCamera } from '../../src/render/camera'
import { pushEvent } from '../../src/sim/events'
import { capitalOf } from '../../src/sim/query'
import type { GameEvent } from '../../src/sim/types'
import { quietWorld } from '../helpers'

const ev = (id: number, pri: 0 | 1 | 2): GameEvent => ({ id, t: 0, kind: 'x', pri, text: '', civs: [], at: { system: 0 }, count: 1 })

describe('pickFocus', () => {
  test('важное важнее свежего, среди равных — самое новое', () => {
    expect(pickFocus([ev(1, 1), ev(2, 0), ev(3, 1)], 0, null).event!.id).toBe(2)
    expect(pickFocus([ev(1, 1), ev(3, 1)], 0, null).event!.id).toBe(3)
  })

  test('камера задерживается минимум на 8 с', () => {
    const first = pickFocus([ev(1, 1)], 10, null)
    expect(pickFocus([ev(2, 0)], 15, first.focus).event).toBeNull()
    expect(pickFocus([ev(2, 0)], 18.5, first.focus).event!.id).toBe(2)
  })

  test('нового нет — остаёмся где были', () => {
    const f = { eventId: 1, since: 0 }
    expect(pickFocus([], 100, f)).toEqual({ focus: f, event: null })
  })
})

describe('слежка в контроллере', () => {
  test('новое событие на планете — камера летит туда и следует за планетой, не выделяя её', () => {
    const w = quietWorld(4815)
    const c = new Controller(w, createCamera(), createClock(1), () => ({ width: 1600, height: 900 }))
    c.flyToGalaxy(true)
    c.toggleFollow(true)
    c.update(0, 0)
    const home = capitalOf(w, w.civs[0])!
    pushEvent(w, { kind: 'colony', pri: 0, text: 'тест', civs: [w.civs[0].id], at: { system: home.systemId, planet: home.id } })
    c.update(1, 0)
    expect(c.cam.follow).toBe(home.id)
    expect(c.cam.fly).not.toBeNull()
    expect(c.ui.selected).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/app/director.test.ts`
Expected: FAIL — cannot resolve `../../src/app/director`.

- [ ] **Step 3: Write `src/app/director.ts`**

```ts
import type { GameEvent } from '../sim/types'

export interface Focus {
  eventId: number
  /** реальное время, когда камера переключилась */
  since: number
}

/** выбор, куда смотреть: важнее (меньше pri) и новее; не чаще раза в minDwell секунд */
export function pickFocus(fresh: GameEvent[], now: number, current: Focus | null, minDwell = 8): { focus: Focus | null; event: GameEvent | null } {
  if (current && now - current.since < minDwell) return { focus: current, event: null }
  let best: GameEvent | null = null
  for (const e of fresh) {
    if (current && e.id === current.eventId) continue
    if (!best || e.pri < best.pri || (e.pri === best.pri && e.id > best.id)) best = e
  }
  if (!best) return { focus: current, event: null }
  return { focus: { eventId: best.id, since: now }, event: best }
}
```

- [ ] **Step 4: Modify `src/app/controller.ts` — слежка**

Импорт:

```ts
import { pickFocus, type Focus } from './director'
```

Поля класса:

```ts
  private focus: Focus | null = null
  private seenEvent = 0
  private directorAt = -Infinity
  /** отложенные новые события, пока камера «держит» прошлое */
  private pending: GameEvent[] = []
```

Заменить `toggleFollow`:

```ts
  toggleFollow(on = !this.ui.follow): void {
    this.ui.follow = on
    if (on) {
      // при включении учитываем события последних 30 игровых секунд
      this.focus = null
      this.pending = this.world.events.filter((e) => e.pri < 2 && this.world.t - e.t <= 30)
      this.seenEvent = this.world.events.length ? this.world.events[this.world.events.length - 1].id : 0
      this.directorAt = -Infinity
    }
  }
```

Добавить в конец `update` (после `updateCamera`):

```ts
    if (this.ui.follow && now - this.directorAt >= 0.5) {
      this.directorAt = now
      for (const e of this.world.events) {
        if (e.id > this.seenEvent && e.pri < 2) this.pending.push(e)
      }
      if (this.world.events.length) this.seenEvent = Math.max(this.seenEvent, this.world.events[this.world.events.length - 1].id)
      const r = pickFocus(this.pending, now, this.focus)
      this.focus = r.focus
      if (r.event) {
        this.pending = []
        if (r.event.at.planet) this.flyToPlanet(r.event.at.planet, false, false)
        else this.flyToSystem(r.event.at.system, 'approach')
      }
    }
```

Тип `GameEvent` уже импортирован в `controller.ts`.

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test && npm run typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/app tests/app
git commit -m "app: follow-cam director picks the most important fresh event

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 23: Итоговая проверка: дымовой тест, частота кадров, нагрузка на экране, README

**Files:**
- Create: `scripts/smoke.ts`
- Modify: `src/app/main.tsx` (`?fps=1`, `?stress=1`), `README.md`

**Interfaces:**
- Consumes: всё.
- Produces: `npm run smoke` — снимки трёх уровней на 1600×900 и галактики на 1280×720 в `artifacts/smoke/`, проверка ошибок консоли, наличия панелей и того, что центр экрана свободен, замер кадров (обычный и нагрузочный). `?fps=1` — счётчик кадров в углу, `?stress=1` — 2000 кораблей.

- [ ] **Step 1: Modify `src/app/main.tsx`**

Импорт:

```tsx
import { spawnStressShips } from '../sim/stress'
```

После `controller.flyToGalaxy(true)`:

```tsx
  if (params.get('stress')) controller.flyToSystem(spawnStressShips(world, 2000, 600), 'approach', true)
  if (params.get('fps')) {
    const fps = document.createElement('div')
    fps.style.cssText = 'position:fixed;left:50%;top:8px;transform:translateX(-50%);font:12px JetBrains Mono,monospace;color:#7df0ff;z-index:9;pointer-events:none'
    document.body.appendChild(fps)
    setInterval(() => {
      fps.textContent = `${Math.round(app.ticker.FPS)} к/с · кораблей ${world.ships.length}`
    }, 500)
  }
```

- [ ] **Step 2: Write `scripts/smoke.ts`**

```ts
// Дымовой тест: npm run smoke. Снимки — artifacts/smoke/
import { mkdirSync } from 'node:fs'
import { chromium, type Page } from 'playwright-core'
import { createServer } from 'vite'

mkdirSync('artifacts/smoke', { recursive: true })
const server = await createServer({ server: { port: 5199, strictPort: true }, logLevel: 'error' })
await server.listen()
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--ignore-gpu-blocklist', '--enable-gpu-rasterization'] })
const problems: string[] = []
const notes: string[] = []

async function open(query: string, width: number, height: number): Promise<Page> {
  const page = await browser.newPage({ viewport: { width, height } })
  page.on('pageerror', (e) => problems.push(`ошибка страницы (${query}): ${e}`))
  page.on('console', (m) => {
    if (m.type() === 'error') problems.push(`консоль (${query}): ${m.text()}`)
  })
  await page.goto(`http://localhost:5199/?${query}`)
  await page.waitForFunction(() => '__orbita' in window, null, { timeout: 30_000 })
  return page
}

async function fps(page: Page): Promise<number> {
  return page.evaluate(
    () =>
      new Promise<number>((done) => {
        let n = 0
        const t0 = performance.now()
        const tick = () => {
          n++
          if (performance.now() - t0 < 3000) requestAnimationFrame(tick)
          else done(n / 3)
        }
        requestAnimationFrame(tick)
      }),
  )
}

// 1) основной сценарий, 1600×900
{
  const page = await open('seed=4815', 1600, 900)
  await page.evaluate(() => (window as any).__orbita.fastForward(9000))
  const shots: [string, string][] = [
    ['galaxy', 'o.controller.flyToGalaxy(true)'],
    ['approach', 'o.controller.flyToSystem(o.world.planets.get(o.world.civs[0].capital).systemId, "approach", true)'],
    ['system', 'o.controller.flyToPlanet(o.world.civs[0].capital, true)'],
  ]
  for (const [name, js] of shots) {
    await page.evaluate(`(()=>{const o=window.__orbita;${js}})()`)
    await page.waitForTimeout(800)
    await page.screenshot({ path: `artifacts/smoke/${name}.png` })
  }
  const crumbs = await page.textContent('.crumbs')
  if (!crumbs?.includes('Галактика')) problems.push('нет хлебных крошек')
  const civs = await page.locator('.civbar .civ').count()
  if (civs < 8) problems.push(`в полосе держав ${civs} записей, ожидалось ≥ 8`)
  await page.evaluate(() => {
    const o = (window as any).__orbita
    o.controller.select(null)
    o.controller.flyToGalaxy(true)
    o.controller.setSpeed(2)
  })
  notes.push(`кадров в секунду, галактика ×20: ${(await fps(page)).toFixed(0)}`)
  await page.close()
}

// 2) маленький экран: уровень «галактика» и свободный центр
{
  const page = await open('seed=4815', 1280, 720)
  await page.waitForTimeout(800)
  await page.screenshot({ path: 'artifacts/smoke/galaxy-1280.png' })
  const level = await page.evaluate(() => (window as any).__orbita.controller.level())
  if (level !== 'galaxy') problems.push(`на 1280×720 вся галактика не на уровне «галактика», а «${level}»`)
  const covered = await page.evaluate(() =>
    [...document.querySelectorAll('.panel')].some((el) => {
      const r = el.getBoundingClientRect()
      return r.left < 640 && r.right > 640 && r.top < 360 && r.bottom > 360
    }),
  )
  if (covered) problems.push('панель закрывает центр экрана на 1280×720')
  await page.close()
}

// 3) нагрузка: 2000 кораблей, 600 в одной системе
{
  const page = await open('seed=4815&stress=1', 1600, 900)
  await page.waitForTimeout(1500)
  await page.screenshot({ path: 'artifacts/smoke/stress.png' })
  notes.push(`кадров в секунду, 2000 кораблей: ${(await fps(page)).toFixed(0)}`)
  await page.close()
}

await browser.close()
await server.close()
for (const n of notes) console.log(n)
console.log('Частота кадров в headless Chrome может быть занижена (программная отрисовка) — финальная проверка: npm run dev и ?fps=1 в обычном браузере.')
if (problems.length) {
  console.log('ПРОБЛЕМЫ:\n' + problems.join('\n'))
  process.exit(1)
}
console.log('дымовой тест пройден, снимки в artifacts/smoke/')
```

- [ ] **Step 3: Rewrite `README.md`**

```markdown
# ОРБИТА 2

Песочница для наблюдения: галактика из 5–7 звёздных систем, связанных коридорами. В каждой обитаемой системе — свой «плавильный котёл» из 2–3 цивилизаций: они растут, колонизируют свои и соседние системы, торгуют, вкладываются в развитие и иногда влезают в долги. Ты смотришь.

## Запуск

```
npm install
npm run dev
```

Открыть http://localhost:5173. Параметры адреса: `?seed=4815` — конкретная галактика, `?fps=1` — счётчик кадров, `?stress=1` — 2000 кораблей.

## Управление

- Колесо — зум к курсору, перетаскивание — обзор (с инерцией)
- Двойной клик по звезде — в систему, по планете — крупно, камера следует за планетой
- Esc — на уровень выше; клик — карточка; наведение — подсказка
- Пробел — пауза, 1–4 — скорость ×1/×5/×20/×50
- F — 🎥 камера сама следит за важными событиями
- M — миникарта, L — лента событий

## Проверки

- `npm test` — тесты симуляции и интерфейсной логики
- `npm run balance` — 12 галактик по 30 минут и сверка с целями баланса
- `npm run stress` — шаг симуляции с 2000 кораблями
- `npm run smoke` — снимки экрана, ошибки консоли, частота кадров
- `npm run shot -- "seed=1" artifacts/x.png` — снимок экрана

## Устройство

`src/sim` — детерминированная симуляция (зерно, шаг 0.1 с, без DOM), `src/render` — PixiJS, `src/ui` — React-панели, `src/app` — цикл, камера, ввод. Спека: `docs/superpowers/specs/2026-10-14-galaxy-skeleton-design.md`, видение: `docs/vision.md`.
```

- [ ] **Step 4: Полная проверка**

Run:

```bash
npm test
npm run typecheck
npm run build
npm run stress
npm run balance
npm run smoke
```

Expected: всё зелёное; `smoke` печатает частоту кадров и «дымовой тест пройден». Открыть все снимки из `artifacts/smoke/` и посмотреть глазами. Если частота кадров в headless ниже 50 — запустить `npm run dev`, открыть `?seed=4815&fps=1` и `?seed=4815&stress=1&fps=1` в обычном Chrome; цифры записать для владельца (раздел 12.3 и 14 спеки: ≥ 50 к/с).

- [ ] **Step 5: Commit**

```bash
rm -rf dist
git add src scripts README.md
git commit -m "Smoke test, fps overlay, stress view, README for ОРБИТА 2

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 6: Показать владельцу**

Запустить `npm run dev` в фоне, открыть игру в браузере владельца (`Start-Process http://localhost:5173/?seed=4815`), приложить снимки из `artifacts/smoke/`, итог `npm run balance` и цифры кадров. На GitHub не отправлять без его согласия.

