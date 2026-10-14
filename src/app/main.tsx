import { Application } from 'pixi.js'
import { createCamera } from '../render/camera'
import { GameRenderer } from '../render/renderer'
import { createRoot } from 'react-dom/client'
import { Hud } from '../ui/Hud'
import { UiModel } from '../ui/model'
import { buildSnapshot } from '../ui/snapshot'
import { createStore } from '../ui/store'
import { spawnStressShips } from '../sim/stress'
import { createWorld, stepWorld } from '../sim/world'
import { initDisplay } from './display'
import { loadUnitCap, parseSetup } from './setup'
import { SETUP } from '../sim/setup'
import { SetupScreen } from '../ui/SetupScreen'
import { Controller } from './controller'
import { attachInput } from './input'
import { advance, alpha, createClock } from './loop'

async function boot(): Promise<void> {
  const params = new URLSearchParams(location.search)
  const parsed = parseSetup(location.search)
  if (parsed.seed === null) {
    // нет зерна в адресе — экран «Галактика под заказ», без Pixi и без мира
    createRoot(document.getElementById('hud')!).render(<SetupScreen />)
    Object.assign(window, { __orbita: { setup: true } })
    return
  }
  const seed = parsed.seed
  const opts = { ...parsed.opts }
  if (opts.unitCap === undefined) {
    if (parsed.stress) {
      // лимит под нагрузку, чтобы стресс не срезался; в браузере не запоминаем
      opts.unitCap = SETUP.unitCap.options.find((c) => c >= parsed.stress + 200) ?? Math.max(...SETUP.unitCap.options)
    } else {
      const saved = loadUnitCap()
      if (saved !== null) opts.unitCap = saved
    }
  }
  const world = createWorld(seed, opts)

  initDisplay(location.search)
  const app = new Application()
  await app.init({ background: '#04060c', resizeTo: window, antialias: true, autoDensity: true, resolution: Math.min(window.devicePixelRatio, 2) })
  document.getElementById('stage')!.appendChild(app.canvas)
  const view = () => ({ width: app.screen.width, height: app.screen.height })

  const renderer = new GameRenderer(app, world)
  const clock = createClock(1)
  const controller = new Controller(world, createCamera(), clock, view)
  controller.flyToGalaxy(true)
  if (parsed.stress) controller.flyToSystem(spawnStressShips(world, parsed.stress, Math.round(parsed.stress * 0.3)), 'approach', true)
  if (params.get('fps')) {
    const fps = document.createElement('div')
    fps.style.cssText = 'position:fixed;left:50%;top:8px;transform:translateX(-50%);font:12px JetBrains Mono,monospace;color:#7df0ff;z-index:9;pointer-events:none'
    document.body.appendChild(fps)
    setInterval(() => {
      fps.textContent = `${Math.round(app.ticker.FPS)} к/с · кораблей ${world.ships.length}`
    }, 500)
  }
  attachInput(app.canvas, controller)

  const store = createStore()
  const model = new UiModel()
  createRoot(document.getElementById('hud')!).render(<Hud store={store} controller={controller} />)
  let uiT = 0

  // время кадра для smoke-замера: кольцевые буферы фиксированного размера, без аллокаций в кадре
  const RING = 300
  const frameStats = { frameMs: new Float64Array(RING), stepMs: new Float64Array(RING), renderMs: new Float64Array(RING), n: 0 }

  app.ticker.add((ticker) => {
    const t0 = performance.now()
    const dt = ticker.deltaMS / 1000
    advance(clock, dt, () => stepWorld(world))
    const t1 = performance.now()
    controller.update(t1 / 1000, dt)
    renderer.render(world, controller.cam, view(), alpha(clock), controller.selectedPlanet(), controller.ui.selected)
    const t2 = performance.now()
    uiT += dt
    if (uiT >= 0.2) {
      uiT = 0
      model.tick(world, performance.now() / 1000, controller.ui.feedAll ? 1 : 0)
      store.set(buildSnapshot(world, controller, model))
    }
    const i = frameStats.n % RING
    frameStats.stepMs[i] = t1 - t0
    frameStats.renderMs[i] = t2 - t1
    frameStats.frameMs[i] = performance.now() - t0
    frameStats.n++
  })

  Object.assign(window, {
    __orbita: { frameStats, world, cam: controller.cam, clock, renderer, controller, fastForward: (n: number) => { for (let i = 0; i < n; i++) stepWorld(world) } },
  })
}

void boot()
