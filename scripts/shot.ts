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
const browser = await chromium.launch({ channel: 'chrome', headless: true }).catch(async (e) => {
  await server.close()
  throw e
})
const errors: string[] = []
let failed = false
// браузер и сервер закрываются при любом исходе — иначе после таймаута они висят в фоне
try {
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } })
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
} catch (e) {
  failed = true
  console.error('снимок не удался:', e, errors.length ? `\nОШИБКИ:\n${errors.join('\n')}` : '')
} finally {
  await browser.close()
  await server.close()
}
process.exit(failed || errors.length ? 1 : 0)
