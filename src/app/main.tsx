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
  if (params.get('stress')) controller.flyToSystem(spawnStressShips(world, 2000, 600), 'approach', true)
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

  app.ticker.add((ticker) => {
    const dt = ticker.deltaMS / 1000
    advance(clock, dt, () => stepWorld(world))
    controller.update(performance.now() / 1000, dt)
    renderer.render(world, controller.cam, view(), alpha(clock), controller.selectedPlanet())
    uiT += dt
    if (uiT >= 0.2) {
      uiT = 0
      model.tick(world, performance.now() / 1000)
      store.set(buildSnapshot(world, controller, model))
    }
  })

  Object.assign(window, {
    __orbita: { world, cam: controller.cam, clock, renderer, controller, fastForward: (n: number) => { for (let i = 0; i < n; i++) stepWorld(world) } },
  })
}

void boot()
