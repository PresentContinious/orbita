import { Container, Graphics, Sprite, Text, type Texture } from 'pixi.js'
import { TAU } from '../sim/math'
import { findPath, gateGalaxyPos, gateTo } from '../sim/routing'
import type { World } from '../sim/types'
import { worldToScreen, type Camera, type LodInfo, type View } from './camera'
import { territoryShares } from './territory'

const LABEL = { fontFamily: 'JetBrains Mono, monospace', fontSize: 12, fill: 0xcfe0ff, letterSpacing: 1.5 }

/** общий план: коридоры, звёзды-значки, кольца долей держав, торговые трассы */
export class GalaxyLayer {
  readonly under = new Container()
  readonly over = new Container()
  readonly labels = new Container()
  private readonly corridors = new Graphics()
  private readonly spokes = new Graphics()
  private readonly trade = new Graphics()
  private readonly rings = new Graphics()
  private readonly halos: Sprite[] = []
  private readonly icons: Sprite[] = []
  private readonly names: Text[] = []
  private tradeAt = -Infinity
  private tradeZ = 0
  private hopsSet = new Set<string>()

  constructor(w: World, glow: Texture) {
    for (const c of w.galaxy.corridors) {
      const A = w.galaxy.systems[c.a]
      const B = w.galaxy.systems[c.b]
      const ga = gateGalaxyPos(A, gateTo(A, c.b)!)
      const gb = gateGalaxyPos(B, gateTo(B, c.a)!)
      this.corridors.moveTo(ga.x, ga.y).lineTo(gb.x, gb.y)
      this.spokes.moveTo(A.pos.x, A.pos.y).lineTo(ga.x, ga.y).moveTo(B.pos.x, B.pos.y).lineTo(gb.x, gb.y)
    }
    this.corridors.stroke({ width: 1, color: 0x4a5d85, alpha: 0.9, pixelLine: true })
    this.spokes.stroke({ width: 1, color: 0x4a5d85, alpha: 0.9, pixelLine: true })
    for (const s of w.galaxy.systems) {
      const halo = new Sprite(glow)
      halo.anchor.set(0.5)
      halo.position.set(s.pos.x, s.pos.y)
      halo.blendMode = 'add'
      halo.alpha = 0
      this.halos.push(halo)
      this.under.addChild(halo)
      const icon = new Sprite(glow)
      icon.anchor.set(0.5)
      icon.position.set(s.pos.x, s.pos.y)
      icon.tint = s.star.color
      icon.blendMode = 'add'
      this.icons.push(icon)
      this.over.addChild(icon)
      const name = new Text({ text: s.name.toUpperCase(), style: LABEL })
      name.anchor.set(0.5, 0)
      this.names.push(name)
      this.labels.addChild(name)
    }
    this.under.addChild(this.corridors, this.spokes, this.trade)
    this.over.addChild(this.rings)
  }

  update(w: World, cam: Camera, view: View, lods: LodInfo[]): void {
    const z = cam.zoom
    let focus = 0
    this.rings.clear()
    w.galaxy.systems.forEach((s, i) => {
      const L = lods[i]
      focus = Math.max(focus, L.approachAlpha)
      const far = 1 - L.approachAlpha
      const icon = this.icons[i]
      icon.scale.set(28 / 128 / z)
      icon.alpha = far
      const shares = territoryShares(w, s)
      const halo = this.halos[i]
      if (shares.length) {
        halo.tint = shares[0].color
        halo.scale.set(150 / 128 / z)
        halo.alpha = 0.35 * far
      } else {
        halo.alpha = 0
      }
      if (far > 0.01 && shares.length) {
        const R = 15 / z
        let a0 = -Math.PI / 2
        for (const sh of shares) {
          const a1 = a0 + sh.share * TAU
          this.rings
            .moveTo(s.pos.x + Math.cos(a0) * R, s.pos.y + Math.sin(a0) * R)
            .arc(s.pos.x, s.pos.y, R, a0, a1)
            .stroke({ width: 3 / z, color: sh.color, alpha: far })
          a0 = a1
        }
      }
      const sp = worldToScreen(cam, view, s.pos)
      const name = this.names[i]
      name.position.set(sp.x, sp.y + 18)
      name.alpha = (1 - L.systemAlpha) * 0.9
    })
    this.spokes.alpha = 1 - focus
    this.trade.alpha = 1 - focus
    let redraw = z !== this.tradeZ
    if (Math.abs(w.t - this.tradeAt) > 0.25) {
      this.tradeAt = w.t
      this.hopsSet = this.collectHops(w)
      redraw = true
    }
    if (redraw) {
      this.tradeZ = z
      this.drawTrade(w, z)
    }
  }

  /** бегущий пунктир по пути межсистемных караванов */
  private collectHops(w: World): Set<string> {
    const hopsSet = new Set<string>()
    for (const s of w.ships) {
      if (!s.alive || s.mission.type !== 'trade') continue
      const a = w.planets.get(s.mission.a)
      const b = w.planets.get(s.mission.b)
      if (!a || !b || a.systemId === b.systemId) continue
      let from = a.systemId
      for (const to of findPath(w.galaxy, a.systemId, b.systemId) ?? []) {
        hopsSet.add(from < to ? `${from}-${to}` : `${to}-${from}`)
        from = to
      }
    }
    return hopsSet
  }

  private drawTrade(w: World, z: number): void {
    this.trade.clear()
    const hopsSet = this.hopsSet
    if (!hopsSet.size) return
    const dash = 10 / z
    const gap = 8 / z
    const offset = ((w.t * 30) / z) % (dash + gap)
    for (const key of hopsSet) {
      const [i, j] = key.split('-').map(Number)
      const A = w.galaxy.systems[i].pos
      const B = w.galaxy.systems[j].pos
      const len = Math.hypot(B.x - A.x, B.y - A.y)
      const ux = (B.x - A.x) / len
      const uy = (B.y - A.y) / len
      for (let d = offset; d < len; d += dash + gap) {
        const e = Math.min(len, d + dash)
        this.trade.moveTo(A.x + ux * d, A.y + uy * d).lineTo(A.x + ux * e, A.y + uy * e)
      }
    }
    this.trade.stroke({ width: 2 / z, color: 0xe0c060, alpha: 0.75 })
  }
}
