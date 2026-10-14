import { Container, Graphics, Sprite, Text, type Texture } from 'pixi.js'
import { asteroidPos } from '../sim/belts'
import { TAU } from '../sim/math'
import { civById } from '../sim/query'
import { periodOf, planetPos } from '../sim/system'
import type { Planet, StarSystem, World } from '../sim/types'
import { worldToScreen, type Camera, type LodInfo, type View } from './camera'
import { beltDust, type Dust } from './noise'
import { PLANET_DISC, planetTexture, type PlanetVariant } from './textures'

interface PlanetView {
  p: Planet
  sprite: Sprite
  label: Text
}

interface DustView {
  c: Container
  w: number
  bins: Graphics[]
  pts: Dust[]
  orbit: number
  width: number
  /** масштаб, при котором крошка нарисована */
  z: number
}

function drawDust(d: DustView, z: number): void {
  d.z = z
  d.bins.forEach((g) => g.clear())
  for (const p of d.pts) {
    const r = d.orbit + p.off * d.width
    d.bins[Math.min(3, Math.floor(p.light * 4))].circle(Math.cos(p.a) * r, Math.sin(p.a) * r, (p.size * 0.9) / z)
  }
  d.bins.forEach((g, k) => g.fill({ color: k < 2 ? 0xa08e72 : 0xc4ae8a, alpha: 0.4 + k * 0.17 }))
}

interface SystemView {
  s: StarSystem
  root: Container
  belt: Graphics
  dust: DustView[]
  marks: Graphics
  planets: PlanetView[]
}

const LABEL = { fontFamily: 'JetBrains Mono, monospace', fontSize: 11, fill: 0xdce8ff, letterSpacing: 1 }

/** раскрытые системы: звезда, орбиты, планеты в цвет владельца, пояса, врата, стройки */
export class SystemLayer {
  readonly root = new Container()
  readonly labels = new Container()
  private readonly views: SystemView[] = []

  constructor(w: World, private readonly glow: Texture, private readonly variant: PlanetVariant = 'a') {
    for (const s of w.galaxy.systems) this.views.push(this.build(s))
  }

  private build(s: StarSystem): SystemView {
    const root = new Container()
    root.position.set(s.pos.x, s.pos.y)
    root.visible = false
    const orbits = new Graphics()
    for (const p of s.planets) orbits.circle(0, 0, p.orbit)
    orbits.stroke({ width: 1, color: 0x1f2a44, alpha: 1, pixelLine: true })
    // пояс — каменная крошка в своём контейнере: контейнер медленно вращается,
    // точки перерисовываются только при заметной смене масштаба (размер крошки — в пикселях экрана)
    const dust: DustView[] = s.belts.map((b, bi) => {
      const c = new Container()
      const n = Math.round(Math.min(1800, Math.max(600, b.orbit * 1.2)))
      const bins = [0, 1, 2, 3].map(() => new Graphics())
      bins.forEach((g) => c.addChild(g))
      return { c, w: TAU / periodOf(b.orbit), bins, pts: beltDust(s.id * 131 + bi + 1, n), orbit: b.orbit, width: b.width, z: 0 }
    })
    const corona = new Sprite(this.glow)
    corona.anchor.set(0.5)
    corona.tint = s.star.color
    corona.blendMode = 'add'
    corona.scale.set((s.star.radius * 7) / 128)
    const disc = new Graphics().circle(0, 0, s.star.radius).fill({ color: s.star.color })
    const gates = new Graphics()
    for (const g of s.gates) gates.circle(g.pos.x, g.pos.y, 30)
    gates.stroke({ width: 4, color: 0x7df0ff, alpha: 0.85 })
    const belt = new Graphics()
    const marks = new Graphics()
    const planets = s.planets.map((p) => {
      const sprite = new Sprite(planetTexture(p, this.variant))
      sprite.anchor.set(0.5)
      const label = new Text({ text: p.name.toUpperCase(), style: LABEL })
      label.anchor.set(0.5, 0)
      label.visible = false
      this.labels.addChild(label)
      return { p, sprite, label }
    })
    root.addChild(orbits, ...dust.map((d) => d.c), belt, corona, disc, gates, ...planets.map((v) => v.sprite), marks)
    this.root.addChild(root)
    return { s, root, belt, dust, marks, planets }
  }

  update(w: World, cam: Camera, view: View, lods: LodInfo[], t: number, selected: string | null): void {
    const z = cam.zoom
    this.views.forEach((v, i) => {
      const L = lods[i]
      const on = L.approachAlpha > 0.01
      v.root.visible = on
      for (const pv of v.planets) pv.label.visible = on
      if (!on) return
      v.root.alpha = L.approachAlpha

      for (const d of v.dust) {
        d.c.rotation = d.w * t
        if (Math.abs(Math.log(z / (d.z || 1e-6))) > 0.3) drawDust(d, z)
      }
      v.belt.clear()
      const dot = 1.5 / z
      for (const a of v.s.asteroids) {
        const q = asteroidPos(a, t)
        v.belt.circle(q.x, q.y, Math.max(a.size, dot))
      }
      v.belt.fill({ color: 0xc2ad8c, alpha: 0.85 })

      v.marks.clear()
      const labelA = Math.min(1, Math.max(0, (v.s.radius * z - 400) / 150))
      for (const pv of v.planets) {
        const p = pv.p
        const q = planetPos(p, t)
        const r = Math.max(p.radius, 2.5 / z)
        pv.sprite.position.set(q.x, q.y)
        pv.sprite.scale.set(r / PLANET_DISC)
        pv.sprite.rotation = Math.atan2(-q.y, -q.x) - Math.PI
        const owner = p.owner === null ? undefined : civById(w, p.owner)
        const color = owner?.color ?? 0xffffff
        if (owner) v.marks.circle(q.x, q.y, r + Math.max(2.5 / z, r * 0.04)).stroke({ width: Math.max(1.5 / z, r * 0.02), color, alpha: p.pop > 0 ? 0.9 : 0.45 })
        if (p.build) {
          const frac = 1 - p.build.remaining / p.build.total
          const rr = r + 8 / z
          v.marks.moveTo(q.x + rr, q.y).arc(q.x, q.y, rr, 0, frac * TAU).stroke({ width: 2 / z, color, alpha: 0.9 })
        }
        if (p.station && !p.build) {
          const s = 5 / z
          const cx = q.x + r + 10 / z
          const cy = q.y - r - 10 / z
          v.marks.poly([cx, cy - s, cx + s, cy, cx, cy + s, cx - s, cy]).fill({ color })
        }
        if (p.id === selected) v.marks.circle(q.x, q.y, r + 14 / z).stroke({ width: 2 / z, color: 0xffffff, alpha: 1 })
        const sp = worldToScreen(cam, view, { x: v.s.pos.x + q.x, y: v.s.pos.y + q.y })
        pv.label.position.set(sp.x, sp.y + r * z + 6)
        pv.label.alpha = labelA * L.approachAlpha
      }
    })
  }
}
