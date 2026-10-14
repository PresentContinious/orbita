// Снаряды-объекты: пулы, полёт, самонаведение, «первый чужой на пути», лучи, трассеры (спека 2А, §10.1).
import { CLASSES, radiusOf, type WeaponKind } from './classes'
import { PROJ } from './combat-config'
import { SHIP_KINDS, SIM_DT, type ShipKind } from './config'
import { applyHit, onBeamEnd } from './damage'
import { TAU } from './math'
import { shipById } from './ships'
import type { Projectile, ProjectileKind, Ship, World } from './types'

const DEG = Math.PI / 180
const EPS = 1e-9

/** порядок диапазонов пула фиксирован; индекс = порядок обхода */
const KINDS: ProjectileKind[] = ['missile', 'decoy', 'torpedo', 'beam']
const START: Record<ProjectileKind, number> = { missile: 0, decoy: 0, torpedo: 0, beam: 0 }
const END: Record<ProjectileKind, number> = { missile: 0, decoy: 0, torpedo: 0, beam: 0 }
{
  let at = 0
  for (const k of KINDS) {
    START[k] = at
    at += PROJ.pool[k]
    END[k] = at
  }
}

/** самый большой корпус + зазор попадания: радиус запроса к сетке */
let maxHitR = 0
for (const k of Object.keys(SHIP_KINDS) as ShipKind[]) maxHitR = Math.max(maxHitR, radiusOf(k) + PROJ.hitPad)
/** сетки строятся до движения — запас на смещение за шаг */
const GRID_PAD = PROJ.missile.speed * SIM_DT
const TORP_R = PROJ.hitPad * 2

export interface Hit {
  kind: 'ship' | 'debris' | 'rock' | 'torpedo'
  index: number
  t: number
}

const scratch: Hit = { kind: 'ship', index: -1, t: 0 }
const cand: number[] = []
const near: number[] = []

function blank(kind: ProjectileKind): Projectile {
  return {
    kind, owner: 0, shooterId: 0, targetId: 0, x: 0, y: 0, vx: 0, vy: 0, heading: 0, speed: 0, turn: 0,
    damage: 0, hp: 0, bornT: 0, life: 0, systemId: 0, alive: false, dealt: 0, dealtTo: 0, length: 0,
  }
}

export function initPools(w: World): void {
  w.projectiles.length = 0
  for (const k of KINDS) for (let i = 0; i < PROJ.pool[k]; i++) w.projectiles.push(blank(k))
}

export function allocProjectile(w: World, kind: ProjectileKind): Projectile | null {
  const end = Math.min(END[kind], w.projectiles.length)
  for (let i = START[kind]; i < end; i++) {
    const p = w.projectiles[i]
    if (!p.alive) return p
  }
  return null
}

function launch(
  w: World, p: Projectile, shooter: Ship, targetId: number, x: number, y: number, heading: number,
  speed: number, turnDeg: number, life: number, hp: number, damage: number,
): void {
  p.owner = shooter.owner
  p.shooterId = shooter.id
  p.targetId = targetId
  p.x = x
  p.y = y
  p.heading = heading
  p.speed = speed
  p.vx = Math.cos(heading) * speed
  p.vy = Math.sin(heading) * speed
  p.turn = turnDeg * DEG
  p.life = life
  p.hp = hp
  p.damage = damage
  p.bornT = w.t
  p.systemId = shooter.systemId
  p.dealt = 0
  p.dealtTo = 0
  p.length = 0
  p.alive = true
}

/** тяжёлая ракета и приманки рядом с ней (сдвиг поперёк курса) */
export function fireMissile(w: World, shooter: Ship, target: Ship, damage: number): void {
  const h = Math.atan2(target.pos.y - shooter.pos.y, target.pos.x - shooter.pos.x)
  const r = radiusOf(shooter.kind)
  const cx = Math.cos(h)
  const cy = Math.sin(h)
  const m = allocProjectile(w, 'missile')
  if (m) {
    const M = PROJ.missile
    launch(w, m, shooter, target.id, shooter.pos.x + cx * r, shooter.pos.y + cy * r, h, M.speed, M.turn, M.life, M.hp, damage)
  }
  const D = PROJ.decoy
  for (let i = 0; i < D.count; i++) {
    const d = allocProjectile(w, 'decoy')
    if (!d) return
    const off = (i - (D.count - 1) / 2) * D.spread
    launch(w, d, shooter, target.id, shooter.pos.x + cx * r - cy * off, shooter.pos.y + cy * r + cx * off, h, D.speed, D.turn, D.life, D.hp, D.damage)
  }
}

export function fireTorpedo(w: World, shooter: Ship, target: Ship, light: boolean): void {
  const p = allocProjectile(w, 'torpedo')
  if (!p) return
  const T = light ? PROJ.lightTorpedo : PROJ.torpedo
  const dmg = (light ? CLASSES.torpedo : CLASSES.bomber).weapons[0].damage
  const h = Math.atan2(target.pos.y - shooter.pos.y, target.pos.x - shooter.pos.x)
  const r = radiusOf(shooter.kind)
  launch(w, p, shooter, target.id, shooter.pos.x + Math.cos(h) * r, shooter.pos.y + Math.sin(h) * r, h, T.speed, T.turn, T.life, T.hp, dmg)
}

export function fireBeam(w: World, shooter: Ship, target: Ship, _weaponIdx: number): Projectile | null {
  const p = allocProjectile(w, 'beam')
  if (!p) return null
  const B = PROJ.beam
  const h = Math.atan2(target.pos.y - shooter.pos.y, target.pos.x - shooter.pos.x)
  launch(w, p, shooter, target.id, shooter.pos.x, shooter.pos.y, h, 0, B.aim, B.steps * SIM_DT, 0, B.perStep)
  p.length = B.length
  return p
}

/** t ∈ [0,1] входа отрезка в круг (0, если начало внутри) или −1 */
function circleT(x0: number, y0: number, dx: number, dy: number, cx: number, cy: number, r: number): number {
  const fx = x0 - cx
  const fy = y0 - cy
  const c = fx * fx + fy * fy - r * r
  if (c <= 0) return 0
  const a = dx * dx + dy * dy
  if (a < EPS) return -1
  const b = fx * dx + fy * dy
  const disc = b * b - a * c
  if (disc < 0) return -1
  const t = (-b - Math.sqrt(disc)) / a
  return t >= 0 && t <= 1 ? t : -1
}

/**
 * Первый чужой на отрезке: корабли (сетка), чужие обломки, камни, чужие торпеды (если withProj).
 * Свои корабли и свои обломки прозрачны. Единственная трассировка проекта.
 */
export function firstForeignOnSegment(
  w: World, systemId: number, owner: number, x0: number, y0: number, x1: number, y1: number, out: Hit, withProj = true,
): boolean {
  const dx = x1 - x0
  const dy = y1 - y0
  const len = Math.hypot(dx, dy)
  let bestT = Infinity
  let bestKind: Hit['kind'] = 'ship'
  let bestIdx = -1

  const n = Math.max(1, Math.ceil(len / PROJ.traceStep))
  const qr = PROJ.traceStep / 2 + maxHitR + GRID_PAD
  const grid = w.grids[systemId]
  const pgrid = w.projGrids[systemId]
  for (let i = 0; i <= n; i++) {
    const sx = x0 + (dx * i) / n
    const sy = y0 + (dy * i) / n
    grid.query(sx, sy, qr, cand)
    for (let j = 0; j < cand.length; j++) {
      const idx = cand[j]
      const s = w.ships[idx]
      if (!s || !s.alive || s.owner === owner || s.transit || s.systemId !== systemId) continue
      const ox = s.pos.x - sx
      const oy = s.pos.y - sy
      if (ox * ox + oy * oy > qr * qr) continue
      const t = circleT(x0, y0, dx, dy, s.pos.x, s.pos.y, radiusOf(s.kind) + PROJ.hitPad)
      if (t >= 0 && t < bestT) {
        bestT = t
        bestKind = 'ship'
        bestIdx = idx
      }
    }
    if (withProj) {
      pgrid.query(sx, sy, qr, near)
      for (let j = 0; j < near.length; j++) {
        const idx = near[j]
        const p = w.projectiles[idx]
        if (!p.alive || p.kind !== 'torpedo' || p.owner === owner) continue
        const t = circleT(x0, y0, dx, dy, p.x, p.y, TORP_R)
        if (t >= 0 && t < bestT) {
          bestT = t
          bestKind = 'torpedo'
          bestIdx = idx
        }
      }
    }
  }

  for (let i = 0; i < w.debris.length; i++) {
    const d = w.debris[i]
    if (d.systemId !== systemId || d.owner === owner) continue
    const t = circleT(x0, y0, dx, dy, d.pos.x, d.pos.y, d.r)
    if (t >= 0 && t < bestT) {
      bestT = t
      bestKind = 'debris'
      bestIdx = i
    }
  }

  // камни: сначала дешёвый отсев по кольцу орбиты, потом точная проверка
  const rocks = w.galaxy.systems[systemId].asteroids
  if (rocks.length) {
    const a = dx * dx + dy * dy
    const u = a < EPS ? 0 : Math.max(0, Math.min(1, -(x0 * dx + y0 * dy) / a))
    const dMin = Math.hypot(x0 + dx * u, y0 + dy * u)
    const dMax = Math.max(Math.hypot(x0, y0), Math.hypot(x1, y1))
    for (let i = 0; i < rocks.length; i++) {
      const r = rocks[i]
      if (r.orbit + r.size < dMin || r.orbit - r.size > dMax) continue
      const ang = r.phase + (TAU * w.t) / r.period
      const t = circleT(x0, y0, dx, dy, Math.cos(ang) * r.orbit, Math.sin(ang) * r.orbit, r.size)
      if (t >= 0 && t < bestT) {
        bestT = t
        bestKind = 'rock'
        bestIdx = i
      }
    }
  }

  if (bestIdx < 0) return false
  out.kind = bestKind
  out.index = bestIdx
  out.t = bestT
  return true
}

export function hitProjectile(_w: World, proj: Projectile, dmg: number): void {
  proj.hp -= dmg
  if (proj.hp <= 0) proj.alive = false
}

/** мгновенный выстрел: первый чужой на пути стрелок → цель получает урон */
export function traceShot(w: World, shooter: Ship, target: Ship, damage: number, source: WeaponKind): boolean {
  const x0 = shooter.pos.x
  const y0 = shooter.pos.y
  const x1 = target.pos.x
  const y1 = target.pos.y
  const found = firstForeignOnSegment(w, shooter.systemId, shooter.owner, x0, y0, x1, y1, scratch)
  let hit = false
  let ex = x1
  let ey = y1
  if (found) {
    ex = x0 + (x1 - x0) * scratch.t
    ey = y0 + (y1 - y0) * scratch.t
    if (scratch.kind === 'ship') {
      applyHit(w, w.ships[scratch.index], damage, source, shooter.id)
      hit = true
    } else if (scratch.kind === 'torpedo') {
      hitProjectile(w, w.projectiles[scratch.index], damage)
      hit = true
    }
  }
  if (w.fxBattle.length < PROJ.tracersMax) {
    w.fxBattle.push({ kind: 'tracer', systemId: shooter.systemId, x0, y0, x1: ex, y1: ey, hit })
  }
  return hit
}

function angDiff(a: number, b: number): number {
  let d = (a - b) % TAU
  if (d > Math.PI) d -= TAU
  else if (d < -Math.PI) d += TAU
  return d
}

function liveTarget(w: World, p: Projectile): Ship | undefined {
  const t = shipById(w, p.targetId)
  return t && t.alive && !t.transit && t.systemId === p.systemId ? t : undefined
}

function retarget(w: World, p: Projectile): Ship | undefined {
  const R = PROJ.missile.retarget
  w.grids[p.systemId].query(p.x, p.y, R + GRID_PAD, cand)
  let best: Ship | undefined
  let bd = R * R
  for (let j = 0; j < cand.length; j++) {
    const s = w.ships[cand[j]]
    if (!s || !s.alive || s.owner === p.owner || s.transit || s.systemId !== p.systemId) continue
    const d = (s.pos.x - p.x) ** 2 + (s.pos.y - p.y) ** 2
    if (d <= bd) {
      bd = d
      best = s
    }
  }
  if (best) p.targetId = best.id
  return best
}

/** результат последней трассировки (scratch) → урон кораблю или торпеде; камень и обломок просто гасят */
function strike(w: World, p: Projectile, source: WeaponKind | 'beam', dmg: number): void {
  if (scratch.kind === 'ship') applyHit(w, w.ships[scratch.index], dmg, source, p.shooterId)
  else if (scratch.kind === 'torpedo') hitProjectile(w, w.projectiles[scratch.index], dmg)
}

function stepBeam(w: World, p: Projectile): void {
  const shooter = shipById(w, p.shooterId)
  if (!shooter || !shooter.alive) {
    p.alive = false
    onBeamEnd(w, p)
    return
  }
  const target = liveTarget(w, p)
  if (target) {
    const want = Math.atan2(target.pos.y - shooter.pos.y, target.pos.x - shooter.pos.x)
    const max = p.turn * SIM_DT
    p.heading += Math.max(-max, Math.min(max, angDiff(want, p.heading)))
  }
  const r = radiusOf(shooter.kind)
  const c = Math.cos(p.heading)
  const s = Math.sin(p.heading)
  p.x = shooter.pos.x + c * r
  p.y = shooter.pos.y + s * r
  if (firstForeignOnSegment(w, p.systemId, p.owner, p.x, p.y, p.x + c * p.length, p.y + s * p.length, scratch)) {
    if (scratch.kind === 'ship') {
      const victim = w.ships[scratch.index]
      if (p.dealtTo !== victim.id) {
        p.dealtTo = victim.id
        p.dealt = 0
      }
      p.dealt += p.damage
    }
    strike(w, p, 'beam', p.damage)
  }
  // луч живёт `steps` шагов подряд: первый вызов — в момент выстрела
  if (w.t - p.bornT + SIM_DT + EPS >= p.life) {
    p.alive = false
    onBeamEnd(w, p)
  }
}

export function stepProjectiles(w: World): void {
  for (const g of w.projGrids) g.clear()
  for (let i = 0; i < w.projectiles.length; i++) {
    const p = w.projectiles[i]
    if (p.alive && p.kind !== 'beam') w.projGrids[p.systemId].insert(i, p.x, p.y)
  }
  for (let i = 0; i < w.projectiles.length; i++) {
    const p = w.projectiles[i]
    if (!p.alive) continue
    if (p.kind === 'beam') {
      stepBeam(w, p)
      continue
    }
    let target = liveTarget(w, p)
    if (!target && p.kind === 'missile') target = retarget(w, p)
    if (target) {
      const want = Math.atan2(target.pos.y - p.y, target.pos.x - p.x)
      const max = p.turn * SIM_DT
      p.heading += Math.max(-max, Math.min(max, angDiff(want, p.heading)))
      p.vx = Math.cos(p.heading) * p.speed
      p.vy = Math.sin(p.heading) * p.speed
    }
    const nx = p.x + p.vx * SIM_DT
    const ny = p.y + p.vy * SIM_DT
    if (firstForeignOnSegment(w, p.systemId, p.owner, p.x, p.y, nx, ny, scratch, false)) {
      const src: WeaponKind = p.kind === 'torpedo' ? (p.speed === PROJ.lightTorpedo.speed ? 'lightTorpedo' : 'torpedo') : 'missile'
      strike(w, p, src, p.damage)
      p.alive = false
      continue
    }
    p.x = nx
    p.y = ny
    if (w.t - p.bornT + SIM_DT + EPS >= p.life) p.alive = false
  }
}
