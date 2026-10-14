# Карта кода

Генерируется `npm run codemap` — руками не править. Формат: файл — строк — первый комментарий; ниже экспорты (вид, строка).

## src/

- `src/App.jsx` — 443 стр. — предохранитель: если что-то падает, показываем кнопку перезагрузки, а не чёрный экран
  - `Boundary` (class, 5), `App` (function, 54)
- `src/main.jsx` — 13 стр.
- `src/solar/civ.js` — 1791 стр. — Цивилизация: государства, население, дипломатия, флоты, пираты, экономика.
  - `Civ` (class, 36)
- `src/solar/engine.js` — 1979 стр. — Сплющивание плоскости системы для псевдо-3/4 ракурса (только отрисовка)
  - `Engine` (class, 42)
- `src/solar/gen.js` — 123 стр. — Генератор случайной звёздной системы — новая карта каждую игру
  - `genName` (function, 10), `generateSystem` (function, 53)
- `src/solar/sprites.js` — 37 стр. — Спрайты кораблей: SVG с CSS-переменной --accent,
  - `getSprite` (function, 26)

## scripts/

- `scripts/codemap.mjs` — 43 стр. — Карта кода: файл → первая строка-комментарий, длина и экспорты с номерами строк.

## tests/

- `tests/civ.test.js` — 226 стр.
- `tests/harness.js` — 72 стр. — Прогон симуляции без браузера: движку нужен canvas и window, но рисовать мы не будем
  - `seedRandom` (function, 19), `makeEngine` (function, 30), `run` (function, 39), `onlyStates` (function, 46), `atWar` (function, 59), `freeze` (function, 65)
