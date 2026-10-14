import { CLASSES, isCraft } from '../sim/classes'
import { FRAME } from '../sim/combat-config'
import { SHIP_KINDS, type ShipKind } from '../sim/config'
import type { Vec } from '../sim/math'
import { planetPos } from '../sim/system'
import type { Battle, BattleSide, Fleet, Order, ProjectileKind, Projectile, Ship, World } from '../sim/types'
import type { LodInfo } from './camera'
import type { FxKind } from './textures'

/** длина корабля на экране: машины ≥ 3 px, остальные ≥ 6 px, при крупном зуме — настоящий размер */
export function shipScreenLen(kind: ShipKind, z: number): number {
  return Math.max(SHIP_KINDS[kind].length * z, isCraft(kind) ? 3 : 6)
}

/** нос: у боевого — combat.heading, у мирного — по скорости */
export function headingOf(ship: Pick<Ship, 'combat' | 'vel'>): number {
  return ship.combat ? ship.combat.heading : Math.atan2(ship.vel.y, ship.vel.x)
}

/** шаг расслоения: рисуется каждый k-й снаряд, чтобы на кадр вышло ≤ max */
export function drawBudget(n: number, max = 2000): number {
  return n <= max ? 1 : Math.ceil(n / max)
}

export function shouldDraw(index: number, k: number): boolean {
  return index % k === 0
}

/** текстура снаряда; луч частицей не рисуется (его рисует Graphics) */
export function projTexture(kind: ProjectileKind): FxKind | null {
  return kind === 'beam' ? null : kind
}

/** горящий корабль: теплее исходного цвета (R растёт, B падает) */
export function burnTint(color: number): number {
  const r = (color >> 16) & 255
  const g = (color >> 8) & 255
  const b = color & 255
  const r2 = Math.min(255, Math.round(r + (255 - r) * 0.55))
  const g2 = Math.round(g * 0.75)
  const b2 = Math.round(b * 0.4)
  return (r2 << 16) | (g2 << 8) | b2
}

/** обломок гаснет в последнюю треть жизни */
export function debrisAlpha(age: number, life: number): number {
  if (life <= 0 || age >= life) return 0
  const t = age / life
  return t < 2 / 3 ? 1 : (1 - t) * 3
}

// ---------- бой: рамки, фронт, метка, значок ----------

/** значок битвы висит над звездой на этом расстоянии, px */
export const BATTLE_ICON_PX = 30

export function battleIconPos(sys: { pos: Vec }, zoom: number): Vec {
  return { x: sys.pos.x, y: sys.pos.y - BATTLE_ICON_PX / zoom }
}

function shipAt(w: World, id: number): Ship | undefined {
  const i = w.shipIndex.get(id)
  if (i === undefined) return undefined
  const s = w.ships[i]
  return s && s.id === id && s.alive ? s : undefined
}

function fleetIn(w: World, id: number): Fleet | undefined {
  for (const f of w.fleets) if (f.id === id) return f
  return undefined
}

/** сила стороны: Σ цена × доля корпуса живых кораблей её флотов */
export function strengthOf(w: World, side: BattleSide): number {
  let sum = 0
  for (const fid of side.fleetIds) {
    const f = fleetIn(w, fid)
    if (!f) continue
    for (const id of f.shipIds) {
      const s = shipAt(w, id)
      if (!s || !s.combat || s.combat.hullMax <= 0 || !(s.kind in CLASSES)) continue
      sum += CLASSES[s.kind as keyof typeof CLASSES].price * Math.max(0, s.combat.hull / s.combat.hullMax)
    }
  }
  return sum
}

/** «Орри · Велдон 140 : 95 Касрий» */
export function battleLabel(w: World, b: Battle): string {
  const sys = w.galaxy.systems[b.systemId]
  const [a, c] = b.sides
  const na = w.civs.find((x) => x.id === a.civ)?.name ?? '?'
  const nc = w.civs.find((x) => x.id === c.civ)?.name ?? '?'
  return `${sys.name} · ${na} ${Math.round(strengthOf(w, a))} : ${Math.round(strengthOf(w, c))} ${nc}`
}

/** начало системы отсчёта рамки в координатах системы (у планеты — плюс её положение) */
export function frameOrigin(w: World, fleet: Fleet): Vec {
  const pl = fleet.frame ? w.planets.get(fleet.frame) : undefined
  if (!pl) return { x: fleet.anchor.x, y: fleet.anchor.y }
  const pp = planetPos(pl, w.t)
  return { x: fleet.anchor.x + pp.x, y: fleet.anchor.y + pp.y }
}

export interface FrameRect {
  /** центр прямоугольника, координаты системы */
  x: number
  y: number
  /** ширина строя W, поперёк курса */
  w: number
  /** глубина вдоль курса */
  h: number
  angle: number
}

/** рамка флота: W × глубина (от ряда катеров до передней петли корветов) */
export function frameRect(w: World, fleet: Fleet): FrameRect {
  const back = FRAME.rows.boat
  const front = FRAME.frontCx + FRAME.frontB
  const cx = (back + front) / 2
  const o = frameOrigin(w, fleet)
  return { x: o.x + cx * Math.cos(fleet.heading), y: o.y + cx * Math.sin(fleet.heading), w: fleet.width, h: front - back, angle: fleet.heading }
}

/** точка внутри рамки (с запасом pad по краям) */
export function inFrame(r: FrameRect, p: Vec, pad: number): boolean {
  const dx = p.x - r.x
  const dy = p.y - r.y
  const c = Math.cos(r.angle)
  const s = Math.sin(r.angle)
  return Math.abs(dx * c + dy * s) <= r.h / 2 + pad && Math.abs(-dx * s + dy * c) <= r.w / 2 + pad
}

/** центр якорей стороны (координаты системы) */
function sideAnchor(w: World, side: BattleSide): Vec | null {
  let x = 0
  let y = 0
  let n = 0
  for (const fid of side.fleetIds) {
    const f = fleetIn(w, fid)
    if (!f) continue
    const o = frameOrigin(w, f)
    x += o.x
    y += o.y
    n++
  }
  return n ? { x: x / n, y: y / n } : null
}

const FRONT_HALF = 150

/**
 * линия фронта: перпендикуляр к линии якорей в точке, делящей расстояние по давлению.
 * p = давление стороны 0: доля пути от якоря 0 = p/(1+p), при p > 1 фронт ближе к стороне 1 (теснимой).
 */
export function frontLine(w: World, b: Battle): [Vec, Vec] {
  const a0 = sideAnchor(w, b.sides[0]) ?? { x: 0, y: 0 }
  const a1 = sideAnchor(w, b.sides[1]) ?? a0
  const p = Math.max(b.pressure, 0.01)
  const t = p / (1 + p)
  const mx = a0.x + (a1.x - a0.x) * t
  const my = a0.y + (a1.y - a0.y) * t
  const len = Math.hypot(a1.x - a0.x, a1.y - a0.y) || 1
  const nx = -(a1.y - a0.y) / len
  const ny = (a1.x - a0.x) / len
  return [
    { x: mx + nx * FRONT_HALF, y: my + ny * FRONT_HALF },
    { x: mx - nx * FRONT_HALF, y: my - ny * FRONT_HALF },
  ]
}

/** отрезок луча: от выстрела по курсу на длину */
export function beamSegment(p: Projectile): [Vec, Vec] {
  return [
    { x: p.x, y: p.y },
    { x: p.x + Math.cos(p.heading) * p.length, y: p.y + Math.sin(p.heading) * p.length },
  ]
}

export interface MarkRing {
  center: Vec
  r: number
  lines: [Vec, Vec][]
}

/** кольца метки: по одному на чужую цель, на которую наведены линкоры флота; линии — от стрелков */
export function markRings(w: World, fleet: Fleet): MarkRing[] {
  const byTarget = new Map<number, Vec[]>()
  for (const id of fleet.shipIds) {
    const s = shipAt(w, id)
    if (!s || s.kind !== 'battleship' || !s.combat || !s.combat.targetId) continue
    let list = byTarget.get(s.combat.targetId)
    if (!list) byTarget.set(s.combat.targetId, (list = []))
    list.push(s.pos)
  }
  const out: MarkRing[] = []
  for (const [tid, shooters] of byTarget) {
    const t = shipAt(w, tid)
    if (!t || t.owner === fleet.owner) continue
    const center = { x: t.pos.x, y: t.pos.y }
    out.push({ center, r: SHIP_KINDS[t.kind].length * 0.5 + 8, lines: shooters.map((p): [Vec, Vec] => [{ x: p.x, y: p.y }, center]) })
  }
  return out
}

export function markRing(w: World, fleet: Fleet): MarkRing | null {
  return markRings(w, fleet)[0] ?? null
}

/** пульс значка: 1 → 0 за 2 с после переворота давления */
export function pulse(b: Pick<Battle, 'pressureFlips' | 'pressureSince'>, now: number): number {
  if (b.pressureFlips <= 0) return 0
  const age = now - b.pressureSince
  return age >= 0 && age < 2 ? 1 - age / 2 : 0
}

export function lodBattle(l: LodInfo): 'icon' | 'approach' | 'system' {
  return l.level === 'galaxy' ? 'icon' : l.level
}

const ORDER_NAMES: Record<Order, string> = {
  form: 'строится', march: 'марш', line: 'линия', push: 'нажим', charge: 'бросок', flank: 'обход',
  orbit: 'орбита', retreat: 'отход', pursue: 'преследование', dock: 'в док',
}

export const orderName = (o: Order): string => ORDER_NAMES[o]
