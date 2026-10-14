import { Particle, ParticleContainer, type Texture } from 'pixi.js'
import { PROJ, DAMAGE } from '../sim/combat-config'
import { SIM_DT } from '../sim/config'
import { civById } from '../sim/query'
import type { World } from '../sim/types'
import type { Camera, LodInfo, View } from './camera'
import { debrisAlpha, drawBudget, projTexture, shouldDraw } from './battleGeom'
import { FX_CELL, type FxKind } from './textures'

const DEBRIS_MAX = 200
const TRACER_TINT = 0xffe9b0
/** экранный размер тела снаряда, px */
const PROJ_PX: Record<'missile' | 'decoy' | 'torpedo', number> = { missile: 11, decoy: 6, torpedo: 12 }

/** снаряды, трассеры и обломки — вторым ParticleContainer, один атлас, пул частиц фиксирован */
export class BattleLayer {
  readonly root = new ParticleContainer({ dynamicProperties: { position: true, rotation: true, color: true, vertex: true, uvs: true } })
  private readonly pool: Particle[] = []
  private attached = 0

  constructor(private readonly fx: Record<FxKind, Texture>) {
    const n = PROJ.pool.missile + PROJ.pool.decoy + PROJ.pool.torpedo + PROJ.tracersMax + DEBRIS_MAX
    for (let i = 0; i < n; i++) this.pool.push(new Particle({ texture: fx.missile, anchorX: 0.5, anchorY: 0.5 }))
  }

  /** следующая частица пула; null — пул исчерпан */
  private take(used: number): Particle | null {
    if (used >= this.pool.length) return null
    if (used >= this.attached) {
      this.root.addParticle(this.pool[used])
      this.attached++
    }
    return this.pool[used]
  }

  update(w: World, cam: Camera, _view: View, lods: LodInfo[], alpha: number): void {
    const z = cam.zoom
    const systems = w.galaxy.systems
    let used = 0
    // снаряды: каждый k-й, если их больше бюджета
    let n = 0
    for (const p of w.projectiles) if (p.alive && p.kind !== 'beam' && lods[p.systemId].systemAlpha > 0) n++
    const k = drawBudget(n)
    let idx = 0
    for (const p of w.projectiles) {
      if (!p.alive || p.kind === 'beam') continue
      const a = lods[p.systemId].systemAlpha
      if (a <= 0) continue
      if (!shouldDraw(idx++, k)) continue
      const part = this.take(used)
      if (!part) break
      used++
      const tex = projTexture(p.kind)!
      const sys = systems[p.systemId]
      part.texture = this.fx[tex]
      part.x = sys.pos.x + p.x + p.vx * SIM_DT * alpha
      part.y = sys.pos.y + p.y + p.vy * SIM_DT * alpha
      part.rotation = p.heading
      const sc = PROJ_PX[p.kind as 'missile' | 'decoy' | 'torpedo'] / z / FX_CELL
      part.scaleX = sc
      part.scaleY = sc
      part.tint = civById(w, p.owner)?.color ?? 0xffffff
      part.alpha = a
    }
    // трассеры: короткие частицы на один кадр
    for (const f of w.fxBattle) {
      if (f.kind !== 'tracer') continue
      const a = lods[f.systemId].systemAlpha
      if (a <= 0) continue
      const part = this.take(used)
      if (!part) break
      used++
      const sys = systems[f.systemId]
      const dx = f.x1 - f.x0
      const dy = f.y1 - f.y0
      part.texture = this.fx.tracer
      part.x = sys.pos.x + (f.x0 + f.x1) / 2
      part.y = sys.pos.y + (f.y0 + f.y1) / 2
      part.rotation = Math.atan2(dy, dx)
      part.scaleX = Math.hypot(dx, dy) / FX_CELL
      part.scaleY = 1.2 / z / 4
      part.tint = TRACER_TINT
      part.alpha = a * (f.hit ? 1 : 0.6)
    }
    // обломки
    let nd = 0
    for (const d of w.debris) {
      if (nd >= DEBRIS_MAX) break
      const a = lods[d.systemId].systemAlpha
      if (a <= 0) continue
      const part = this.take(used)
      if (!part) break
      used++
      nd++
      const sys = systems[d.systemId]
      part.texture = this.fx.debris
      part.x = sys.pos.x + d.pos.x
      part.y = sys.pos.y + d.pos.y
      part.rotation = d.id * 1.7
      const sc = Math.max(d.r * 0.8, 3 / z) / FX_CELL
      part.scaleX = sc
      part.scaleY = sc
      part.tint = civById(w, d.owner)?.color ?? 0x888888
      part.alpha = a * 0.7 * debrisAlpha(w.t - d.bornT, DAMAGE.debrisLife)
    }
    // лишние частицы снимаем с контейнера
    while (this.attached > used) {
      this.attached--
      this.root.removeParticle(this.pool[this.attached])
    }
  }
}
