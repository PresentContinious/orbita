import { Container, Graphics, Sprite, Text, type Texture } from 'pixi.js'
import { TAU } from '../sim/math'
import { findPath, gateGalaxyPos, gateTo } from '../sim/routing'
import type { World } from '../sim/types'
import { worldToScreen, type Camera, type LodInfo, type View } from './camera'
import { territoryShares, type Share } from './territory'
import { cloudSpots, pieceEdges, systemPieces, zoneRadius, type Sector } from './zones'

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
  /** вариант отрисовки территорий: a — карта с границами, b — облака (?territory=a|b) */
  private readonly mode: 'a' | 'b' =
    typeof location !== 'undefined' && new URLSearchParams(location.search).get('territory') === 'b' ? 'b' : 'a'
  private readonly zoneGfx = new Graphics()
  private readonly cloudBox = new Container()
  private readonly clouds: Sprite[][] = []
  private readonly glow: Texture
  private readonly sites: { x: number; y: number }[]
  private readonly radii: number[]
  private shares: Share[][] = []
  private sig = ''
  private sharesAt = -Infinity

  constructor(w: World, glow: Texture) {
    this.glow = glow
    this.sites = w.galaxy.systems.map((s) => s.pos)
    this.radii = this.sites.map((_, i) => zoneRadius(this.sites, i))
    this.shares = w.galaxy.systems.map(() => [])
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
    this.under.addChildAt(this.mode === 'a' ? this.zoneGfx : this.cloudBox, 0)
    this.under.addChild(this.corridors, this.spokes, this.trade)
    this.over.addChild(this.rings)
  }

  update(w: World, cam: Camera, view: View, lods: LodInfo[]): void {
    const z = cam.zoom
    let focus = 0
    this.rings.clear()
    this.refreshZones(w)
    w.galaxy.systems.forEach((s, i) => {
      const L = lods[i]
      focus = Math.max(focus, L.approachAlpha)
      const far = 1 - L.approachAlpha
      const icon = this.icons[i]
      icon.scale.set(28 / 128 / z)
      icon.alpha = far
      const shares = this.shares[i]
      const halo = this.halos[i]
      if (shares.length) {
        halo.tint = shares[0].color
        halo.scale.set(150 / 128 / z)
        halo.alpha = 0.2 * far
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
    this.zoneGfx.alpha = 1 - focus
    this.cloudBox.alpha = 1 - focus
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

  /** доли держав — не чаще раза в 0.5 с игры; геометрия зон пересчитывается только при смене владения */
  private refreshZones(w: World): void {
    if (Math.abs(w.t - this.sharesAt) < 0.5) return
    this.sharesAt = w.t
    let sig = ''
    const counts: number[] = []
    w.galaxy.systems.forEach((s, i) => {
      const sh = territoryShares(w, s)
      this.shares[i] = sh
      let n = 0
      for (const p of s.planets) if (p.owner !== null && (p.pop > 0 || p.station)) n++
      counts.push(n)
      for (const x of sh) sig += `${x.civ}:${x.share.toFixed(2)},`
      sig += `${n}|`
    })
    if (sig === this.sig) return
    this.sig = sig
    if (this.mode === 'a') this.buildMap()
    else this.buildClouds(counts)
  }

  private buildMap(): void {
    const g = this.zoneGfx
    g.clear()
    const parts = this.shares.map((sh, i) => systemPieces(this.sites, i, sh, this.radii[i]))
    const sectors: Sector[][] = parts.map((p) => p.sectors)
    for (const { pieces } of parts) {
      for (const pc of pieces) {
        const flat: number[] = []
        for (const v of pc.poly) flat.push(v.x, v.y)
        g.poly(flat).fill({ color: pc.color, alpha: 0.22 })
      }
    }
    for (let i = 0; i < parts.length; i++) {
      const wd = this.radii[i] * 0.025
      for (const pc of parts[i].pieces) {
        for (const e of pieceEdges(this.sites, sectors, pc)) {
          g.moveTo(e.ax, e.ay).lineTo(e.bx, e.by)
          if (e.bright) g.stroke({ width: wd * 0.7, color: 0xe6eeff, alpha: 0.6 })
          else g.stroke({ width: wd * 1.6, color: pc.color, alpha: 0.4 })
        }
      }
    }
  }

  private buildClouds(counts: number[]): void {
    for (let i = 0; i < this.sites.length; i++) {
      let pool = this.clouds[i]
      if (!pool) {
        pool = this.clouds[i] = []
        for (let k = 0; k < 4; k++) {
          const sp = new Sprite(this.glow)
          sp.anchor.set(0.5)
          sp.blendMode = 'normal'
          this.cloudBox.addChild(sp)
          pool.push(sp)
        }
      }
      const spots = cloudSpots(this.sites[i], this.shares[i].slice(0, pool.length), counts[i], this.radii[i])
      for (let k = 0; k < pool.length; k++) {
        const sp = pool[k]
        const c = spots[k]
        if (!c) {
          sp.visible = false
          continue
        }
        sp.visible = true
        sp.position.set(c.x, c.y)
        sp.scale.set((c.r * 2) / 128)
        sp.tint = c.color
        sp.alpha = c.alpha
      }
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
