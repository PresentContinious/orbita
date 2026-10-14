import { Container, type Application } from 'pixi.js'
import { display } from '../app/display'
import { SIM_DT } from '../sim/config'
import type { World } from '../sim/types'
import { lodOf, type Camera, type View } from './camera'
import { GalaxyLayer } from './galaxyLayer'
import { ShipsLayer } from './shipsLayer'
import { Starfield } from './starfield'
import { SystemLayer } from './systemLayer'
import { glowTexture, shipAtlas } from './textures'

export class GameRenderer {
  private readonly worldRoot = new Container()
  private readonly overlay = new Container()
  private readonly stars: Starfield
  private readonly galaxy: GalaxyLayer
  private readonly systems: SystemLayer
  private readonly ships: ShipsLayer

  constructor(app: Application, w: World) {
    const glow = glowTexture()
    this.stars = new Starfield(glow)
    this.galaxy = new GalaxyLayer(w, glow)
    this.systems = new SystemLayer(w, glow)
    this.ships = new ShipsLayer(shipAtlas())
    this.worldRoot.addChild(this.galaxy.under, this.systems.root, this.ships.root, this.galaxy.over)
    this.overlay.addChild(this.galaxy.labels, this.systems.labels, this.ships.popups)
    app.stage.addChild(this.stars.root, this.worldRoot, this.overlay)
  }

  render(w: World, cam: Camera, view: View, alpha: number, selected: string | null = null): void {
    this.worldRoot.scale.set(cam.zoom)
    this.worldRoot.position.set(view.width / 2 - cam.x * cam.zoom, view.height / 2 - cam.y * cam.zoom)
    const lods = w.galaxy.systems.map((s) => lodOf(s.radius, cam.zoom))
    const t = w.t - SIM_DT * (1 - alpha)
    this.systems.restyle(display.planets)
    this.stars.update(cam, view)
    this.galaxy.update(w, cam, view, lods)
    this.systems.update(w, cam, view, lods, t, selected)
    this.ships.update(w, cam, view, lods, alpha, performance.now() / 1000)
  }
}
