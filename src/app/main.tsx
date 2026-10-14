import { Application } from 'pixi.js'
import { createCamera, galaxyBounds, galaxyZoom, updateCamera } from '../render/camera'
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
  cam.zoom = galaxyZoom(view(), world.galaxy)
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
