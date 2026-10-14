// Дымовой тест: npm run smoke. Снимки — artifacts/smoke/
import { mkdirSync } from 'node:fs'
import { chromium, type Page } from 'playwright-core'
import { createServer } from 'vite'

mkdirSync('artifacts/smoke', { recursive: true })
const server = await createServer({ server: { port: 5199, strictPort: true }, logLevel: 'error' })
await server.listen()
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--ignore-gpu-blocklist', '--enable-gpu-rasterization'] }).catch(async (e) => {
  await server.close()
  throw e
})
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

// Бюджет кадра по спеке: ≥ 50 к/с = 20 мс. Не повышать; для другой машины — SMOKE_FRAME_MS
const BUDGET_MS = Number(process.env.SMOKE_FRAME_MS) || 20

// Время кадра (шаги + отрисовка + UI) из кольцевых буферов страницы, не зависит от vsync.
// Код строкой: esbuild (tsx) добавляет в функции вызовы __name, которых нет в странице.
const STATS_JS = `(() => {
  const s = window.__orbita.frameStats
  const k = Math.min(s.n, 300)
  return { n: s.n, frame: Array.from(s.frameMs.slice(0, k)), step: Array.from(s.stepMs.slice(0, k)), render: Array.from(s.renderMs.slice(0, k)) }
})()`

const avg = (a: number[]) => a.reduce((x, y) => x + y, 0) / Math.max(a.length, 1)
const p95 = (a: number[]) => [...a].sort((x, y) => x - y)[Math.max(0, Math.ceil(a.length * 0.95) - 1)] ?? 0

async function frameTime(page: Page, label: string): Promise<void> {
  await page.evaluate('window.__orbita.frameStats.n = 0')
  await page.waitForTimeout(3000)
  const s = await page.evaluate<{ n: number; frame: number[]; step: number[]; render: number[] }>(STATS_JS)
  if (s.frame.length < 30) problems.push(`${label}: за 3 с набралось только ${s.frame.length} кадров`)
  const f = p95(s.frame)
  notes.push(
    `время кадра, ${label}: среднее ${avg(s.frame).toFixed(1)} мс, p95 ${f.toFixed(1)} мс (бюджет ${BUDGET_MS} мс); ` +
      `шаги: среднее ${avg(s.step).toFixed(1)} / p95 ${p95(s.step).toFixed(1)} мс; отрисовка: среднее ${avg(s.render).toFixed(1)} / p95 ${p95(s.render).toFixed(1)} мс; кадров ${s.frame.length}`,
  )
  if (f > BUDGET_MS) problems.push(`${label}: p95 времени кадра ${f.toFixed(1)} мс больше бюджета ${BUDGET_MS} мс`)
}

// браузер и сервер закрываются при любом исходе — иначе после таймаута они висят в фоне
try {
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
      o.controller.setSpeed(3) // ×20 (SPEEDS = [1, 2, 5, 20, 50])
    })
    await frameTime(page, 'галактика ×20')
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

  // 3) экран настроек (адрес без зерна)
  {
    const page = await open('', 1600, 900)
    await page.waitForSelector('.setup .setup-preview', { timeout: 10_000 })
    await page.waitForTimeout(300)
    await page.screenshot({ path: 'artifacts/smoke/setup.png' })
    const dots = await page.locator('.setup-preview circle').count()
    if (dots < 4) problems.push(`на превью экрана настроек ${dots} систем`)
    await page.close()
  }

  // 4) нагрузка: 2000 кораблей, 600 в одной системе
  {
    const page = await open('seed=4815&stress=1', 1600, 900)
    await page.waitForTimeout(1500)
    await page.screenshot({ path: 'artifacts/smoke/stress.png' })
    await frameTime(page, '2000 кораблей')
    await page.close()
  }
} catch (e) {
  problems.push(`сбой дымового теста: ${e}`)
} finally {
  await browser.close()
  await server.close()
}
for (const n of notes) console.log(n)
console.log('Время кадра измеряется на стороне JS (шаги + команды отрисовки + UI); в headless без видеокарты WebGL может идти программно — финальная проверка: npm run dev и ?fps=1 в обычном браузере.')
if (problems.length) {
  console.log('ПРОБЛЕМЫ:\n' + problems.join('\n'))
  process.exit(1)
}
console.log('дымовой тест пройден, снимки в artifacts/smoke/')
