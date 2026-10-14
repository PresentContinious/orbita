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

// код передаётся строкой: esbuild (tsx) добавляет в функции вызовы __name, которых нет в странице
const FPS_JS = `new Promise((done) => {
  let n = 0
  const t0 = performance.now()
  const tick = () => {
    n++
    if (performance.now() - t0 < 3000) requestAnimationFrame(tick)
    else done(n / 3)
  }
  requestAnimationFrame(tick)
})`

async function fps(page: Page): Promise<number> {
  return page.evaluate<number>(FPS_JS)
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
} catch (e) {
  problems.push(`сбой дымового теста: ${e}`)
} finally {
  await browser.close()
  await server.close()
}
for (const n of notes) console.log(n)
console.log('Частота кадров в headless Chrome может быть занижена (программная отрисовка) — финальная проверка: npm run dev и ?fps=1 в обычном браузере.')
if (problems.length) {
  console.log('ПРОБЛЕМЫ:\n' + problems.join('\n'))
  process.exit(1)
}
console.log('дымовой тест пройден, снимки в artifacts/smoke/')
