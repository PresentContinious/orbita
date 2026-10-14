import { Container, Graphics, Sprite, Text, type Texture } from 'pixi.js'
import { asteroidPos } from '../sim/belts'
import { TAU } from '../sim/math'
import { civById } from '../sim/query'
import { planetPos } from '../sim/system'
import type { Planet, StarSystem, World } from '../sim/types'
import { worldToScreen, type Camera, type LodInfo, type View } from './camera'
import { PLANET_DISC, planetTexture } from './textures'

interface PlanetView {
  p: Planet
  sprite: Sprite
  halo: Sprite
  label: Text
}

interface SystemView {
  s: StarSystem
  root: Container
  belt: Graphics
  marks: Graphics
  planets: PlanetView[]
}

const LABEL = { fontFamily: 'JetBrains Mono, monospace', fontSize: 11, fill: 0xdce8ff, letterSpacing: 1 }

/** раскрытые системы: звезда, орбиты, планеты в цвет владельца, пояса, врата, стройки */
export class SystemLayer {
  readonly root = new Container()
  readonly labels = new Container()
  private readonly views: SystemView[] = []

  constructor(w: World, private readonly glow: Texture) {
    for (const s of w.galaxy.systems) this.views.push(this.build(s))
  }

  private build(s: StarSystem): SystemView {
    const root = new Container()
    root.position.set(s.pos.x, s.pos.y)
    root.visible = false
    const orbits = new Graphics()
    for (const p of s.planets) orbits.circle(0, 0, p.orbit)
    orbits.stroke({ width: 1, color: 0x1f2a44, alpha: 1, pixelLine: true })
    for (const b of s.belts) orbits.circle(0, 0, b.orbit)
    orbits.stroke({ width: 1, color: 0x2a3348, alpha: 0.6, pixelLine: true })
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
      const halo = new Sprite(this.glow)
      halo.anchor.set(0.5)
      halo.blendMode = 'add'
      halo.alpha = 0
      const sprite = new Sprite(planetTexture(p))
      sprite.anchor.set(0.5)
      const label = new Text({ text: p.name.toUpperCase(), style: LABEL })
      label.anchor.set(0.5, 0)
      label.visible = false
      this.labels.addChild(label)
      return { p, sprite, halo, label }
    })
    root.addChild(orbits, belt, corona, disc, gates, ...planets.map((v) => v.halo), ...planets.map((v) => v.sprite), marks)
    this.root.addChild(root)
    return { s, root, belt, marks, planets }
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

      v.belt.clear()
      const dot = 1.5 / z
      for (const a of v.s.asteroids) {
        const q = asteroidPos(a, t)
        v.belt.circle(q.x, q.y, Math.max(a.size, dot))
      }
      v.belt.fill({ color: 0x8a8f99, alpha: 0.85 })

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
        if (owner) {
          pv.halo.tint = owner.color
          pv.halo.alpha = p.pop > 0 ? 0.22 : 0.1
          pv.halo.position.set(q.x, q.y)
          pv.halo.scale.set(((p.radius * 3 + 100) * 2) / 128)
        } else {
          pv.halo.alpha = 0
        }
        const color = owner?.color ?? 0xffffff
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
        if (p.id === selected) v.marks.circle(q.x, q.y, r + 14 / z).stroke({ width: 1.5 / z, color: 0x8cbeff, alpha: 0.9 })
        const sp = worldToScreen(cam, view, { x: v.s.pos.x + q.x, y: v.s.pos.y + q.y })
        pv.label.position.set(sp.x, sp.y + r * z + 6)
        pv.label.alpha = labelA * L.approachAlpha
      }
    })
  }
}
