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
