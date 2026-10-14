import { Container, Graphics, Particle, ParticleContainer, Text, type Texture } from 'pixi.js'
import { PROJ, DAMAGE } from '../sim/combat-config'
import { SIM_DT, SHIP_KINDS } from '../sim/config'
import { civById } from '../sim/query'
import type { World } from '../sim/types'
import { worldToScreen, type Camera, type LodInfo, type View } from './camera'
import {
  battleIconPos, battleLabel, debrisAlpha, drawBudget, frameRect, frontLine, markRings, orderName, projTexture, pulse,
  shouldDraw, strengthOf,
} from './battleGeom'
import type { Pick } from './hit'
import { FX_CELL, type FxKind } from './textures'

const DEBRIS_MAX = 200
const SMOKE_MAX = 240
const TRACER_TINT = 0xffe9b0
/** экранный размер тела снаряда, px */
const PROJ_PX: Record<'missile' | 'decoy' | 'torpedo', number> = { missile: 11, decoy: 6, torpedo: 12 }
const LABEL = { fontFamily: 'JetBrains Mono, monospace', fontSize: 11, fill: 0xcfe0ff, letterSpacing: 1 }
const SELECT = 0xffe08a

function lighten(c: number, k: number): number {
  const r = (c >> 16) & 255
  const g = (c >> 8) & 255
  const b = c & 255
  return (Math.round(r + (255 - r) * k) << 16) | (Math.round(g + (255 - g) * k) << 8) | Math.round(b + (255 - b) * k)
}

/** снаряды, трассеры, обломки, вспышки и дым — ParticleContainer; лучи, метка, рамки, фронт, значки — Graphics */
export class BattleLayer {
  readonly root = new ParticleContainer({ dynamicProperties: { position: true, rotation: true, color: true, vertex: true, uvs: true } })
  /** графика в мировых координатах: рамки, фронт, метка, лучи, значки битв */
  readonly gfx = new Container()
  /** подписи в экранных координатах: флажки приказов, имена флагманов, подписи значков */
  readonly labels = new Container()
  readonly frames = new Graphics()
  readonly front = new Graphics()
  readonly marks = new Graphics()
  readonly beams = new Graphics()
  readonly icons = new Graphics()
  private readonly pool: Particle[] = []
  private attached = 0
  private readonly drawn = new Set<Graphics>()
  private readonly texts = new Map<string, Text>()
  private readonly seen = new Set<string>()

  constructor(private readonly fx: Record<FxKind, Texture>) {
    const n = PROJ.pool.missile + PROJ.pool.decoy + PROJ.pool.torpedo + PROJ.tracersMax + DEBRIS_MAX + SMOKE_MAX
    for (let i = 0; i < n; i++) this.pool.push(new Particle({ texture: fx.missile, anchorX: 0.5, anchorY: 0.5 }))
    this.gfx.addChild(this.frames, this.front, this.marks, this.beams, this.icons)
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

  /** очищает Graphics; false — рисовать не нужно (и один раз очистили то, что рисовали раньше) */
  private begin(g: Graphics, on: boolean): boolean {
    if (!on) {
      if (this.drawn.delete(g)) g.clear()
      return false
    }
    g.clear()
    this.drawn.add(g)
    return true
  }

  private text(key: string, str: string, color: number): Text {
    let t = this.texts.get(key)
    if (!t) {
      t = new Text({ text: str, style: { ...LABEL, fill: color } })
      t.anchor.set(0.5, 1)
      this.texts.set(key, t)
      this.labels.addChild(t)
    }
    if (t.text !== str) t.text = str
    t.style.fill = color
    t.visible = true
    this.seen.add(key)
    return t
  }

  update(w: World, cam: Camera, view: View, lods: LodInfo[], alpha: number, picked: Pick | null = null): void {
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
    // трассеры, вспышки щитов и взрывы: живут один шаг (всего ≤ PROJ.tracersMax)
    const fade = 1 - alpha
    for (const f of w.fxBattle) {
      const a = lods[f.systemId].systemAlpha
      if (a <= 0) continue
      const part = this.take(used)
      if (!part) break
      used++
      const sys = systems[f.systemId]
      if (f.kind === 'tracer') {
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
      } else {
        // вспышка-пузырь на щите или взрыв: растёт и гаснет за шаг
        const boom = f.kind === 'boom'
        part.texture = boom ? this.fx.boom : this.fx.shield
        part.x = sys.pos.x + f.x
        part.y = sys.pos.y + f.y
        part.rotation = 0
        const size = Math.max(f.r * (boom ? 1 + alpha : 1.4), 8 / z)
        part.scaleX = size / FX_CELL
        part.scaleY = size / FX_CELL
        part.tint = boom ? 0xffb060 : 0x9fd0ff
        part.alpha = a * (boom ? fade : 0.35 + 0.65 * fade)
      }
    }
    // дым горящих кораблей: три клуба на корабль уходят назад и растут
    let smoke = 0
    for (const s of w.ships) {
      if (smoke >= SMOKE_MAX) break
      const c = s.combat
      if (!s.alive || !c || c.burning === null || s.transit) continue
      const a = lods[s.systemId].systemAlpha
      if (a <= 0) continue
      const sys = systems[s.systemId]
      const len = SHIP_KINDS[s.kind].length
      const px = s.prevPos.x + (s.pos.x - s.prevPos.x) * alpha
      const py = s.prevPos.y + (s.pos.y - s.prevPos.y) * alpha
      for (let i = 0; i < 3; i++) {
        const part = this.take(used)
        if (!part) break
        used++
        smoke++
        const ph = (w.t * 0.6 + i / 3 + s.id * 0.137) % 1
        const wob = Math.sin(s.id + i * 2.1 + w.t) * len * 0.3
        part.texture = this.fx.smoke
        part.x = sys.pos.x + px - Math.cos(c.heading) * len * (0.3 + ph * 2) - Math.sin(c.heading) * wob
        part.y = sys.pos.y + py - Math.sin(c.heading) * len * (0.3 + ph * 2) + Math.cos(c.heading) * wob
        part.rotation = 0
        const size = Math.max(len * (0.5 + ph * 1.2), 4 / z)
        part.scaleX = size / FX_CELL
        part.scaleY = size / FX_CELL
        part.tint = 0x8a7a70
        part.alpha = a * 0.7 * (1 - ph)
      }
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
    this.seen.clear()
    this.drawBeams(w, lods, z)
    this.drawMarks(w, lods, z)
    this.drawFrames(w, cam, view, lods, picked)
    this.drawFront(w, lods, z, picked)
    this.drawIcons(w, cam, view, lods, picked)
    for (const [key, t] of this.texts) if (!this.seen.has(key)) t.visible = false
  }

  /** лучи: два прохода — широкий полупрозрачный и узкий яркий; ≤ PROJ.pool.beam отрезков */
  private drawBeams(w: World, lods: LodInfo[], z: number): void {
    let any = false
    for (const p of w.projectiles) if (p.alive && p.kind === 'beam' && lods[p.systemId].systemAlpha > 0) any = true
    if (!this.begin(this.beams, any)) return
    const g = this.beams
    let count = 0
    for (let pass = 0; pass < 2; pass++) {
      count = 0
      for (const p of w.projectiles) {
        if (!p.alive || p.kind !== 'beam') continue
        const a = lods[p.systemId].systemAlpha
        if (a <= 0) continue
        if (++count > PROJ.pool.beam) break
        const sys = w.galaxy.systems[p.systemId]
        const si = w.shipIndex.get(p.shooterId)
        const shooter = si === undefined ? undefined : w.ships[si]
        // без главного калибра луч тусклый
        const dim = shooter?.combat && shooter.combat.modules.mainGun !== undefined && shooter.combat.modules.mainGun <= 0 ? 0.4 : 1
        const color = civById(w, p.owner)?.color ?? 0xffffff
        const x0 = sys.pos.x + p.x
        const y0 = sys.pos.y + p.y
        const x1 = x0 + Math.cos(p.heading) * p.length
        const y1 = y0 + Math.sin(p.heading) * p.length
        if (pass === 0) g.moveTo(x0, y0).lineTo(x1, y1).stroke({ width: 7 / z, color, alpha: 0.22 * a * dim })
        else g.moveTo(x0, y0).lineTo(x1, y1).stroke({ width: 1.6 / z, color: lighten(color, 0.7), alpha: 0.95 * a * dim })
      }
    }
  }

  /** метка: кольцо на цели группы и линии огня от стрелков */
  private drawMarks(w: World, lods: LodInfo[], z: number): void {
    let any = false
    for (const f of w.fleets) if (f.shipIds.length && lods[f.systemId].systemAlpha > 0) any = true
    if (!this.begin(this.marks, any)) return
    const g = this.marks
    for (const f of w.fleets) {
      const a = lods[f.systemId].systemAlpha
      if (a <= 0 || !f.shipIds.length) continue
      const sys = w.galaxy.systems[f.systemId]
      const color = civById(w, f.owner)?.color ?? 0xffffff
      for (const ring of markRings(w, f)) {
        for (const [p0, p1] of ring.lines) {
          g.moveTo(sys.pos.x + p0.x, sys.pos.y + p0.y).lineTo(sys.pos.x + p1.x, sys.pos.y + p1.y)
        }
        g.stroke({ width: 1 / z, color, alpha: 0.3 * a })
        g.circle(sys.pos.x + ring.center.x, sys.pos.y + ring.center.y, ring.r).stroke({ width: 1.5 / z, color: lighten(color, 0.5), alpha: 0.85 * a })
      }
    }
  }

  /** рамки флотов в цвет державы, флажок приказа; при полном виде системы — имя флагмана */
  private drawFrames(w: World, cam: Camera, view: View, lods: LodInfo[], picked: Pick | null): void {
    const z = cam.zoom
    let any = false
    for (const f of w.fleets) if (f.shipIds.length && lods[f.systemId].approachAlpha > 0) any = true
    if (!this.begin(this.frames, any)) return
    const g = this.frames
    const pad = 6 / z
    for (const f of w.fleets) {
      if (!f.shipIds.length) continue
      const L = lods[f.systemId]
      if (L.approachAlpha <= 0) continue
      const sys = w.galaxy.systems[f.systemId]
      const color = civById(w, f.owner)?.color ?? 0xffffff
      const sel = picked?.type === 'fleet' && picked.id === f.id
      const a = L.approachAlpha * (1 - 0.6 * L.systemAlpha)
      const r = frameRect(w, f)
      const c = Math.cos(r.angle)
      const s = Math.sin(r.angle)
      const hw = r.w / 2 + pad
      const hh = r.h / 2 + pad
      const pts: number[] = []
      for (const [u, v] of [[-hh, -hw], [hh, -hw], [hh, hw], [-hh, hw]]) {
        pts.push(sys.pos.x + r.x + u * c - v * s, sys.pos.y + r.y + u * s + v * c)
      }
      g.poly(pts).fill({ color, alpha: (sel ? 0.18 : 0.08) * a }).stroke({ width: (sel ? 3 : 1.5) / z, color: sel ? SELECT : color, alpha: (sel ? 1 : 0.7) * a })
      // флажок приказа над носом рамки
      const nose = worldToScreen(cam, view, { x: sys.pos.x + r.x + c * hh, y: sys.pos.y + r.y + s * hh })
      const flag = this.text('o' + f.id, orderName(f.order), color)
      flag.position.set(nose.x, nose.y - 4)
      flag.alpha = a
      // имя флагмана при подробном виде
      if (L.systemAlpha > 0 && f.flagshipId !== null) {
        const si = w.shipIndex.get(f.flagshipId)
        const fs = si === undefined ? undefined : w.ships[si]
        if (fs && fs.alive && !fs.transit) {
          const sp = worldToScreen(cam, view, { x: sys.pos.x + fs.pos.x, y: sys.pos.y + fs.pos.y })
          const nm = this.text('n' + f.id, f.name, color)
          nm.position.set(sp.x, sp.y - 14)
          nm.alpha = L.systemAlpha * 0.9
        }
      }
    }
  }

  /** линия фронта между якорями: делит расстояние по давлению */
  private drawFront(w: World, lods: LodInfo[], z: number, picked: Pick | null): void {
    let any = false
    for (const b of w.battles) if (b.phase !== 'over' && lods[b.systemId].approachAlpha > 0) any = true
    if (!this.begin(this.front, any)) return
    const g = this.front
    for (const b of w.battles) {
      const L = lods[b.systemId]
      if (b.phase === 'over' || L.approachAlpha <= 0) continue
      const sys = w.galaxy.systems[b.systemId]
      const [p0, p1] = frontLine(w, b)
      const a = L.approachAlpha * (1 - 0.5 * L.systemAlpha)
      const pl = pulse(b, w.t)
      const sel = picked?.type === 'battle' && picked.id === b.id
      g.moveTo(sys.pos.x + p0.x, sys.pos.y + p0.y).lineTo(sys.pos.x + p1.x, sys.pos.y + p1.y)
        .stroke({ width: (2 + 3 * pl) / z, color: sel ? SELECT : 0xe8eeff, alpha: (0.45 + 0.4 * pl) * a })
    }
  }

  /** значок битвы у звезды на общем плане: знак, полоска сил двух держав, подпись */
  private drawIcons(w: World, cam: Camera, view: View, lods: LodInfo[], picked: Pick | null): void {
    const z = cam.zoom
    let any = false
    for (const b of w.battles) if (b.phase !== 'over' && lods[b.systemId].approachAlpha < 0.99) any = true
    if (!this.begin(this.icons, any)) return
    const g = this.icons
    const k = 1 / z
    for (const b of w.battles) {
      if (b.phase === 'over') continue
      const far = 1 - lods[b.systemId].approachAlpha
      if (far <= 0.01) continue
      const sys = w.galaxy.systems[b.systemId]
      const ip = battleIconPos(sys, z)
      const sel = picked?.type === 'battle' && picked.id === b.id
      const ink = sel ? SELECT : 0xdfe8ff
      const pl = pulse(b, w.t)
      // знак: кольцо и два скрещённых клинка
      g.circle(ip.x, ip.y, 11 * k).fill({ color: 0x0a1020, alpha: 0.75 * far }).stroke({ width: 1.5 * k, color: ink, alpha: far })
      g.moveTo(ip.x - 5 * k, ip.y - 5 * k).lineTo(ip.x + 5 * k, ip.y + 5 * k)
        .moveTo(ip.x + 5 * k, ip.y - 5 * k).lineTo(ip.x - 5 * k, ip.y + 5 * k)
        .stroke({ width: 2 * k, color: ink, alpha: far })
      if (pl > 0) g.circle(ip.x, ip.y, (11 + 14 * (1 - pl)) * k).stroke({ width: 2 * k, color: ink, alpha: pl * far })
      // полоска сил
      const s0 = strengthOf(w, b.sides[0])
      const s1 = strengthOf(w, b.sides[1])
      const share = s0 + s1 > 0 ? s0 / (s0 + s1) : 0.5
      const bw = 40 * k
      const bx = ip.x - bw / 2
      const by = ip.y + 15 * k
      const c0 = civById(w, b.sides[0].civ)?.color ?? 0xffffff
      const c1 = civById(w, b.sides[1].civ)?.color ?? 0xffffff
      g.rect(bx, by, bw * share, 4 * k).fill({ color: c0, alpha: far })
      g.rect(bx + bw * share, by, bw * (1 - share), 4 * k).fill({ color: c1, alpha: far })
      const sp = worldToScreen(cam, view, ip)
      const label = this.text('b' + b.id, battleLabel(w, b), ink)
      label.position.set(sp.x, sp.y - 15)
      label.alpha = far
    }
  }
}
