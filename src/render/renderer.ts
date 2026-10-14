import { Container, type Application } from 'pixi.js'
import type { World } from '../sim/types'
import { lodOf, type Camera, type View } from './camera'
import { GalaxyLayer } from './galaxyLayer'
import { Starfield } from './starfield'
import { glowTexture } from './textures'

export class GameRenderer {
  private readonly worldRoot = new Container()
  private readonly overlay = new Container()
  private readonly stars: Starfield
  private readonly galaxy: GalaxyLayer

  constructor(app: Application, w: World) {
    const glow = glowTexture()
    this.stars = new Starfield(glow)
    this.galaxy = new GalaxyLayer(w, glow)
    this.worldRoot.addChild(this.galaxy.under, this.galaxy.over)
    this.overlay.addChild(this.galaxy.labels)
    app.stage.addChild(this.stars.root, this.worldRoot, this.overlay)
  }

  /** alpha — доля шага симуляции для плавной отрисовки (0…1) */
  render(w: World, cam: Camera, view: View, alpha: number): void {
    this.worldRoot.scale.set(cam.zoom)
    this.worldRoot.position.set(view.width / 2 - cam.x * cam.zoom, view.height / 2 - cam.y * cam.zoom)
    const lods = w.galaxy.systems.map((s) => lodOf(s.radius, cam.zoom))
    this.stars.update(cam, view)
    this.galaxy.update(w, cam, view, lods)
    void alpha
  }
}
