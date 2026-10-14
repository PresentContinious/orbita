# Карта кода

Генерируется `npm run codemap` — руками не править. Формат: файл — строк — первый комментарий; ниже экспорты (вид, строка).

## src/

- `src/app/main.tsx` — 3 стр. — Точка входа. Заполняется в задаче 16.
- `src/sim/config.ts` — 169 стр. — ---------- время ----------
  - `SIM_DT` (const, 4), `YEAR_SECONDS` (const, 5), `MAX_STEPS_PER_FRAME` (const, 6), `MAX_FRAME_DT` (const, 7), `SPEEDS` (const, 9), `GALAXY` (const, 12), `CIVS` (const, 24), `StarType` (type, 27), `STAR_TYPES` (const, 28), `ORBIT` (const, 36), `HZ` (const, 52), `PlanetKind` (type, 54), `PLANET_KINDS` (const, 55), `ROLE_GEN` (const, 62), `BELT` (const, 72), `POP` (const, 75), `ShipKind` (type, 78), `SHIP_KINDS` (const, 79), `MOVE` (const, 85), `Envelope` (type, 101), `ENVELOPE_SHARES` (const, 102), `ECON` (const, 104), `ResearchBranch` (type, 154), `RESEARCH` (const, 155), `RESEARCH_BRANCHES` (const, 161), `BOT` (const, 164), `PALETTE` (const, 167), `EVENTS` (const, 168)
- `src/sim/math.ts` — 9 стр.
  - `Vec` (type, 1), `TAU` (const, 3), `ZERO` (const, 4), `clamp` (const, 6), `lerp` (const, 7), `dist` (const, 8)
- `src/sim/names.ts` — 27 стр. — Слоги из старой ОРБИТЫ
  - `genName` (function, 8), `uniqueName` (function, 15)
- `src/sim/rng.ts` — 59 стр. — Генератор случайных чисел с зерном (mulberry32): одно зерно — одна и та же история.
  - `Rng` (interface, 4), `hashString` (function, 19), `createRng` (function, 28)
- `src/sim/spatial.ts` — 46 стр. — Пространственная сетка: поиск соседей без перебора всех кораблей.
  - `SpatialGrid` (class, 3)
- `src/sim/system.ts` — 172 стр.
  - `Orbiting` (type, 7), `periodOf` (function, 9), `zoneOf` (function, 13), `tempKOf` (function, 20), `planetPos` (function, 24), `planetVel` (function, 29), `makeLook` (function, 50), `habitableCount` (function, 68), `makeAsteroid` (function, 72), `generateSystem` (function, 86)
- `src/sim/types.ts` — 230 стр.
  - `Zone` (type, 7), `SystemRole` (type, 8), `PlanetLook` (interface, 10), `Build` (interface, 17), `Planet` (interface, 24), `Belt` (interface, 45), `Asteroid` (interface, 50), `Gate` (interface, 60), `Star` (interface, 67), `StarSystem` (interface, 74), `Corridor` (interface, 92), `Galaxy` (interface, 102), `Mission` (type, 107), `Transit` (interface, 113), `Ship` (interface, 121), `Stage` (type, 138), `IncomeSource` (type, 139), `ExpenseCat` (type, 140), `Ledger` (interface, 142), `CivEconomy` (interface, 148), `CivProject` (interface, 165), `ResearchJob` (interface, 171), `Civ` (interface, 178), `GameEvent` (interface, 194), `Fx` (interface, 206), `World` (interface, 215)

## scripts/

- `scripts/codemap.mjs` — 43 стр. — Карта кода: файл → первая строка-комментарий, длина и экспорты с номерами строк.

## tests/

- `tests/sim/names.test.ts` — 11 стр.
- `tests/sim/rng.test.ts` — 60 стр.
- `tests/sim/spatial.test.ts` — 42 стр.
- `tests/sim/system.test.ts` — 110 стр.
