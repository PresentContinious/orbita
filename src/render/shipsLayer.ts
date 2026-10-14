import { Container, Particle, ParticleContainer, Text } from 'pixi.js'
import { SHIP_KINDS } from '../sim/config'
import { lerp } from '../sim/math'
import { civById } from '../sim/query'
import { transitGalaxyPos } from '../sim/routing'
import type { Fx, World } from '../sim/types'
import { worldToScreen, type Camera, type LodInfo, type View } from './camera'
import { ICON_BODY, type Atlas } from './textures'

interface Popup {
  text: Text
  x: number
  y: number
  born: number
}

const POPUP = { fontFamily: 'JetBrains Mono, monospace', fontSize: 12, fill: 0xffd97a, fontWeight: '700' as const }

/** каждый корабль — отдельная частица; на дальнем зуме — значок постоянного экранного размера */
export class ShipsLayer {
  readonly root = new ParticleContainer({ dynamicProperties: { position: true, rotation: true, color: true, vertex: true, uvs: true } })
  readonly popups = new Container()
  private readonly parts = new Map<number, Particle>()
  private readonly seen = new Map<number, number>()
  private readonly consumed = new WeakSet<Fx>()
  private frame = 0
  private live: Popup[] = []

  constructor(private readonly atlas: Atlas) {}

  update(w: World, cam: Camera, view: View, lods: LodInfo[], alpha: number, now: number): void {
    const z = cam.zoom
    this.frame++
    for (const s of w.ships) {
      if (!s.alive) continue
      let p = this.parts.get(s.id)
      if (!p) {
        p = new Particle({ texture: this.atlas[s.kind], anchorX: 0.5, anchorY: 0.5 })
        this.root.addParticle(p)
        this.parts.set(s.id, p)
      }
      this.seen.set(s.id, this.frame)
      p.tint = civById(w, s.owner)?.color ?? 0xffffff
      if (s.transit) {
        const g = transitGalaxyPos(w.galaxy, s.transit, alpha)
        p.texture = this.atlas.dot
        p.x = g.x
        p.y = g.y
        p.rotation = 0
        const sc = 6 / z / ICON_BODY
        p.scaleX = sc
        p.scaleY = sc
        p.alpha = 1
        continue
      }
      const lod = lods[s.systemId]
      if (lod.approachAlpha <= 0) {
        p.alpha = 0
        continue
      }
      const sys = w.galaxy.systems[s.systemId]
      p.texture = this.atlas[s.kind]
      p.x = sys.pos.x + lerp(s.prevPos.x, s.pos.x, alpha)
      p.y = sys.pos.y + lerp(s.prevPos.y, s.pos.y, alpha)
      p.rotation = Math.atan2(s.vel.y, s.vel.x)
      const screenLen = Math.max(SHIP_KINDS[s.kind].length * z, 6)
      const sc = screenLen / z / ICON_BODY
      p.scaleX = sc
      p.scaleY = sc
      p.alpha = lod.approachAlpha
    }
    for (const [id, p] of this.parts) {
      if (this.seen.get(id) === this.frame) continue
      this.root.removeParticle(p)
      this.parts.delete(id)
      this.seen.delete(id)
    }
    this.updatePopups(w, cam, view, lods, now)
  }

  private updatePopups(w: World, cam: Camera, view: View, lods: LodInfo[], now: number): void {
    for (const f of w.fx) {
      if (this.consumed.has(f)) continue
      this.consumed.add(f)
      if (lods[f.systemId].systemAlpha < 0.5) continue
      const sys = w.galaxy.systems[f.systemId]
      const text = new Text({ text: `+${Math.round(f.amount)} кр`, style: POPUP })
      text.anchor.set(0.5, 1)
      this.popups.addChild(text)
      this.live.push({ text, x: sys.pos.x + f.x, y: sys.pos.y + f.y, born: now })
      if (this.live.length > 40) this.live.shift()!.text.destroy()
    }
    this.live = this.live.filter((pp) => {
      const age = now - pp.born
      if (age > 1.6) {
        pp.text.destroy()
        return false
      }
      const sp = worldToScreen(cam, view, { x: pp.x, y: pp.y })
      pp.text.position.set(sp.x, sp.y - 14 - age * 22)
      pp.text.alpha = 1 - age / 1.6
      return true
    })
  }
}
