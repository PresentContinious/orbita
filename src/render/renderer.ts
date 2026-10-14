import { Container, type Application } from 'pixi.js'
import { SIM_DT } from '../sim/config'
import type { World } from '../sim/types'
import { lodOf, type Camera, type View } from './camera'
import { GalaxyLayer } from './galaxyLayer'
import { Starfield } from './starfield'
import { SystemLayer } from './systemLayer'
import { glowTexture } from './textures'

export class GameRenderer {
  private readonly worldRoot = new Container()
  private readonly overlay = new Container()
  private readonly stars: Starfield
  private readonly galaxy: GalaxyLayer
  private readonly systems: SystemLayer

  constructor(app: Application, w: World) {
    const glow = glowTexture()
    this.stars = new Starfield(glow)
    this.galaxy = new GalaxyLayer(w, glow)
    this.systems = new SystemLayer(w, glow)
    this.worldRoot.addChild(this.galaxy.under, this.systems.root, this.galaxy.over)
    this.overlay.addChild(this.galaxy.labels, this.systems.labels)
    app.stage.addChild(this.stars.root, this.worldRoot, this.overlay)
  }

  render(w: World, cam: Camera, view: View, alpha: number, selected: string | null = null): void {
    this.worldRoot.scale.set(cam.zoom)
    this.worldRoot.position.set(view.width / 2 - cam.x * cam.zoom, view.height / 2 - cam.y * cam.zoom)
    const lods = w.galaxy.systems.map((s) => lodOf(s.radius, cam.zoom))
    // время отрисовки — между прошлым и текущим шагом симуляции
    const t = w.t - SIM_DT * (1 - alpha)
    this.stars.update(cam, view)
    this.galaxy.update(w, cam, view, lods)
    this.systems.update(w, cam, view, lods, t, selected)
  }
}
