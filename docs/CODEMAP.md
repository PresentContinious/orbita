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
- `src/sim/types.ts` — 3 стр. — Временный файл; полностью заменяется в задаче 4
  - `SystemRole` (type, 2)

## scripts/

- `scripts/codemap.mjs` — 43 стр. — Карта кода: файл → первая строка-комментарий, длина и экспорты с номерами строк.

## tests/

- `tests/sim/names.test.ts` — 11 стр.
- `tests/sim/rng.test.ts` — 60 стр.
- `tests/sim/spatial.test.ts` — 42 стр.
