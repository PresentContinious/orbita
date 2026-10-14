// Арена: мир из одной системы с двумя флотами по строке состава; прогон без экрана (спека 2А, §13.2).
import { COMBAT_KINDS, DEFAULT_WING, isCapital, isCraft, radiusOf, type CombatKind } from './classes'
import { BATTLE, FRAME } from './combat-config'
import { SHIP_KINDS, SIM_DT } from './config'
import { earn } from './economy'
import { anchorAbs, assignSlots, createFleet, fleetById, slotLocal, slotWorld } from './fleet'
import { buildGrids, shipById, spawnWarship } from './ships'
import { planetPos } from './system'
import type { Vec } from './math'
import type { Fleet, Planet, Trait, World } from './types'
import { createWorld, stepWorld } from './world'

export type Terrain = 'empty' | 'belt' | 'orbit' | 'gate'

export interface SideSpec {
  counts: Partial<Record<CombatKind, number>>
  /** машин у носителя */
  craft: number
  trait: Trait
  rank: 0 | 1 | 2 | 3
}

export interface ArenaSpec {
  seed: number
  a: SideSpec
  b: SideSpec
  terrain: Terrain
  targetValue: 'low' | 'high'
}

export interface ArenaResult {
  steps: number
  durationS: number
  battleId: number | null
  /** потери по сторонам, в цене кораблей */
  losses: [number, number]
  alive: [number, number]
  /** минимальный зазор между корпусами (от борта до борта) за прогон */
  minHullDist: number
  /** то же, но только между капитальными (линия, фрегаты, тыл) */
  minCapitalDist: number
  pushOuts: number
  /** доля времени капитальных дальше 15 ед. от слота (0..1); пока фаз нет — считается всегда */
  capitalOffSlotT: number
  /** случаев |Δvel| за шаг > accel·dt */
  minSpeedViolations: number
  positionsHash: string
}

const CODES: Record<string, CombatKind> = { bb: 'battleship', cv: 'carrier', ff: 'frigate', co: 'corvette', tb: 'torpedo', tr: 'trooper', su: 'supply', sc: 'scout' }
const TRAIT_NAMES: Trait[] = ['bold', 'careful', 'methodical', 'dashing']
const TERRAINS: Terrain[] = ['empty', 'belt', 'orbit', 'gate']
const WING_DEFAULT = DEFAULT_WING.reduce((s, x) => s + x.n, 0)

/** '3bb,1cv:16,6co' → счётчики; `:N` у носителя — машин */
export function parseSide(s: string): SideSpec {
  const counts: Partial<Record<CombatKind, number>> = {}
  let craft: number | null = null
  for (const part of s.split(',').map((x) => x.trim()).filter(Boolean)) {
    const m = /^(\d+)([a-z]{2})(?::(\d+))?$/.exec(part)
    if (!m || !CODES[m[2]]) throw new Error('не понял состав: ' + part)
    const kind = CODES[m[2]]
    counts[kind] = (counts[kind] ?? 0) + Number(m[1])
    if (m[3] !== undefined) craft = Number(m[3])
  }
  return { counts, craft: craft ?? ((counts.carrier ?? 0) > 0 ? WING_DEFAULT : 0), trait: 'methodical', rank: 0 }
}

function pickTrait(v: string | null, def: Trait): Trait {
  return v && (TRAIT_NAMES as string[]).includes(v) ? (v as Trait) : def
}

function pickRank(v: string | null): 0 | 1 | 2 | 3 {
  return Math.max(0, Math.min(3, Math.round(Number(v ?? 0)) || 0)) as 0 | 1 | 2 | 3
}

export function parseArena(query: string | URLSearchParams): ArenaSpec {
  const q = typeof query === 'string' ? new URLSearchParams(query) : query
  const a = parseSide(q.get('A') ?? '3bb')
  const b = parseSide(q.get('B') ?? '3bb')
  a.trait = pickTrait(q.get('traitA'), a.trait)
  b.trait = pickTrait(q.get('traitB'), b.trait)
  a.rank = pickRank(q.get('rankA'))
  b.rank = pickRank(q.get('rankB'))
  const terrain = q.get('terrain') as Terrain | null
  return {
    seed: Number(q.get('seed') ?? 1) || 1,
    a,
    b,
    terrain: terrain && TERRAINS.includes(terrain) ? terrain : 'empty',
    targetValue: q.get('value') === 'high' ? 'high' : 'low',
  }
}

/** кто был на арене в начале: потери считаются по живым кораблям, а не по сохранённым суммам */
interface Roster {
  ids: [number[], number[]]
  prices: Map<number, number>
  owners: [number, number]
}
const rosters = new WeakMap<World, Roster>()

function sideKinds(side: SideSpec): CombatKind[] {
  const out: CombatKind[] = []
  for (const k of COMBAT_KINDS) for (let i = 0; i < (side.counts[k] ?? 0); i++) out.push(k)
  return out
}

/** выставляет корабли решёткой за якорем лицом к врагу; корабли стоят (скорость 0) */
function place(w: World, fleet: Fleet, heading: number, spacing: number): void {
  const cos = Math.cos(heading)
  const sin = Math.sin(heading)
  fleet.heading = heading
  fleet.anchorVel = { x: 0, y: 0 }
  fleet.shipIds.forEach((id, k) => {
    const ship = shipById(w, id)!
    const lx = -Math.floor(k / 5) * spacing
    const ly = ((k % 5) - 2) * spacing
    ship.pos = { x: fleet.anchor.x + lx * cos - ly * sin, y: fleet.anchor.y + lx * sin + ly * cos }
    ship.prevPos = { ...ship.pos }
    ship.vel = { x: 0, y: 0 }
    ship.combat!.heading = heading
  })
}

/** разброс при старте: слоты, растянутые от якоря в STAGE_SPREAD раз; пути к слотам не пересекаются (задача 7) */
const STAGE_SPREAD = 2
const STAGE = { wing: 60 }

function stage(w: World, fleet: Fleet): void {
  assignSlots(w, fleet)
  const a = anchorAbs(w, fleet, { x: 0, y: 0 })
  const c = Math.cos(fleet.heading)
  const s = Math.sin(fleet.heading)
  const local: Vec = { x: 0, y: 0 }
  for (const id of fleet.shipIds) {
    const ship = shipById(w, id)!
    const slot = ship.combat!.slot
    if (!slot) continue
    slotLocal(fleet, slot, w.t, local)
    // овал корветов — целиком на крыло наружу (смещение одинаково, ряд не перемешивается)
    const oval = slot.kind === 'oval'
    const side = slot.column < 0 ? -1 : 1
    const cy = side * (fleet.width / 2 + FRAME.wingPad)
    const lx = local.x * STAGE_SPREAD
    const ly = oval ? cy + (local.y - cy) * STAGE_SPREAD + side * STAGE.wing : local.y * STAGE_SPREAD
    ship.pos = { x: a.x + lx * c - ly * s, y: a.y + lx * s + ly * c }
    ship.prevPos = { ...ship.pos }
  }
}

export function createArena(spec: ArenaSpec): World {
  const w = createWorld(spec.seed)
  for (const c of w.civs) c.nextDecision = Infinity
  w.ships.length = 0
  w.shipIndex.clear()

  const systems = w.galaxy.systems
  const sys = systems.find((s) => s.belts.length > 0 && s.planets.length >= 2) ?? systems.find((s) => s.planets.length >= 2)
  if (!sys) throw new Error('нет системы с двумя планетами')
  w.arenaSystem = sys.id
  const [civA, civB] = [w.civs[0], w.civs[1]]

  // защитнику временно отдаём самую большую не-столичную планету; нападающий рождается у другой
  const capitals = new Set(w.civs.map((c) => c.capital))
  const bySize = [...sys.planets].sort((p, q) => q.radius - p.radius)
  const target: Planet = bySize.find((p) => !capitals.has(p.id)) ?? bySize[0]
  const home: Planet = sys.planets.find((p) => p.id !== target.id)!
  if (!capitals.has(target.id)) target.owner = civB.id
  target.pop = spec.targetValue === 'high' ? BATTLE.highValuePop * 2 : BATTLE.highValuePop / 3

  for (const civ of [civA, civB]) {
    earn(civ, 1e6, 'refund')
    civ.eco.envelopes.war = 1e6
  }

  const fleetA = createFleet(w, civA, home, { type: 'show', systemId: sys.id, planetId: target.id })
  const fleetB = createFleet(w, civB, target, { type: 'defend', planetId: target.id })
  const roster: Roster = { ids: [[], []], prices: new Map(), owners: [civA.id, civB.id] }
  const sides: [Fleet, SideSpec, number][] = [[fleetA, spec.a, 0], [fleetB, spec.b, 1]]
  for (const [fleet, side, i] of sides) {
    const civ = i === 0 ? civA : civB
    for (const kind of sideKinds(side)) {
      const ship = spawnWarship(w, civ, kind, i === 0 ? home : target, fleet)
      if (!ship) throw new Error('арена: не удалось купить ' + kind)
      ship.combat!.rank = side.rank
      roster.ids[i].push(ship.id)
      roster.prices.set(ship.id, ship.price)
    }
    w.admirals.find((a) => a.id === fleet.admiralId)!.trait = side.trait
  }
  rosters.set(w, roster)

  // якоря: A — нападающий, на BATTLE.detect + 300 от B
  const gap = BATTLE.detect + 300
  const tp = planetPos(target, w.t)
  const out = Math.atan2(tp.y, tp.x)
  const tangent = out + Math.PI / 2
  const pad = target.radius + BATTLE.orbitPad
  let anchorB: Vec = { x: tp.x + Math.cos(out) * pad, y: tp.y + Math.sin(out) * pad }
  let anchorA: Vec = { x: anchorB.x + Math.cos(tangent) * gap, y: anchorB.y + Math.sin(tangent) * gap }
  if (spec.terrain === 'orbit') {
    fleetB.order = 'orbit'
    fleetB.frame = target.id
    fleetB.orderReason = 'на орбите'
  } else if (spec.terrain === 'belt' && sys.belts[0]) {
    const belt = sys.belts[0]
    anchorB = { x: belt.orbit - belt.width / 2 - 150, y: 0 }
    anchorA = { x: belt.orbit + belt.width / 2 + 150, y: 0 }
  } else if (spec.terrain === 'gate') {
    const gp: Vec = sys.gates[0] ? sys.gates[0].pos : { x: sys.radius * 0.9, y: 0 }
    const inward = Math.atan2(-gp.y, -gp.x)
    anchorA = { x: gp.x, y: gp.y }
    anchorB = { x: gp.x + Math.cos(inward) * gap, y: gp.y + Math.sin(inward) * gap }
  }
  fleetA.anchor = anchorA
  fleetB.anchor = anchorB
  const toB = Math.atan2(anchorB.y - anchorA.y, anchorB.x - anchorA.x)
  let maxLen = 1
  for (const s of w.ships) maxLen = Math.max(maxLen, SHIP_KINDS[s.kind].length)
  const spacing = 4 * maxLen
  place(w, fleetA, toB, spacing)
  place(w, fleetB, toB + Math.PI, spacing)
  // в системе отсчёта планеты якорь хранится относительно неё (иначе слоты считались бы со сдвигом)
  if (fleetB.frame === target.id) fleetB.anchor = { x: anchorB.x - tp.x, y: anchorB.y - tp.y }
  stage(w, fleetA)
  stage(w, fleetB)
  buildGrids(w)
  return w
}

const near: number[] = []
/** капитальный дальше этого от слота — «вне слота» (метрика capitalOffSlotT) */
const OFF_SLOT = 15

/** минимальный зазор между корпусами (машины не считаем) в системе арены; через сетку, радиус 3 длины */
function hullGap(w: World, capitalOnly = false): number {
  const sys = w.arenaSystem ?? 0
  const grid = w.grids[sys]
  let min = Infinity
  for (let i = 0; i < w.ships.length; i++) {
    const a = w.ships[i]
    if (!a.alive || a.systemId !== sys || isCraft(a.kind) || (capitalOnly && !isCapital(a.kind))) continue
    const ra = radiusOf(a.kind)
    for (const j of grid.query(a.pos.x, a.pos.y, 3 * SHIP_KINDS[a.kind].length + 40, near)) {
      if (j <= i) continue
      const b = w.ships[j]
      if (!b || !b.alive || b.systemId !== sys || isCraft(b.kind) || (capitalOnly && !isCapital(b.kind))) continue
      const d = Math.hypot(a.pos.x - b.pos.x, a.pos.y - b.pos.y) - ra - radiusOf(b.kind)
      if (d < min) min = d
    }
  }
  return min
}

function hashOf(w: World): string {
  let out = ''
  for (const s of w.ships) if (s.alive) out += s.id + ',' + s.pos.x + ',' + s.pos.y + ';'
  return out
}

export function runArena(w: World, steps: number, onStep?: (w: World) => void): ArenaResult {
  const t0 = w.t
  let pushOuts = 0
  let battleId: number | null = null
  buildGrids(w)
  let minHullDist = hullGap(w)
  let minCapitalDist = hullGap(w, true)
  const prevVel = new Map<number, Vec>()
  for (const s of w.ships) prevVel.set(s.id, { x: s.vel.x, y: s.vel.y })
  let violations = 0
  let offSlot = 0
  let capSteps = 0
  const spot: Vec = { x: 0, y: 0 }
  for (let i = 0; i < steps; i++) {
    stepWorld(w)
    pushOuts += w.pushOuts
    for (const s of w.ships) {
      if (!s.alive || s.transit) continue
      const pv = prevVel.get(s.id)
      if (pv) {
        if (Math.hypot(s.vel.x - pv.x, s.vel.y - pv.y) > SHIP_KINDS[s.kind].accel * SIM_DT + 1e-6) violations++
        pv.x = s.vel.x
        pv.y = s.vel.y
      } else prevVel.set(s.id, { x: s.vel.x, y: s.vel.y })
      const sl = s.combat?.slot
      if (sl && isCapital(s.kind) && s.fleetId !== null) {
        const f = fleetById(w, s.fleetId)
        if (f) {
          capSteps++
          slotWorld(w, f, sl, spot)
          if (Math.hypot(spot.x - s.pos.x, spot.y - s.pos.y) > OFF_SLOT) offSlot++
        }
      }
    }
    if (battleId === null && w.battles.length) battleId = w.battles[0].id
    if (i % 10 === 9) {
      minHullDist = Math.min(minHullDist, hullGap(w))
      minCapitalDist = Math.min(minCapitalDist, hullGap(w, true))
    }
    onStep?.(w)
  }
  const losses: [number, number] = [0, 0]
  const alive: [number, number] = [0, 0]
  const roster = rosters.get(w)
  if (roster) {
    for (let side = 0; side < 2; side++) {
      for (const id of roster.ids[side]) {
        const ship = shipById(w, id)
        if (!ship || !ship.alive) losses[side] += roster.prices.get(id) ?? 0
      }
    }
    for (const s of w.ships) {
      if (!s.alive) continue
      if (s.owner === roster.owners[0]) alive[0]++
      else if (s.owner === roster.owners[1]) alive[1]++
    }
  }
  return { steps, durationS: w.t - t0, battleId, losses, alive, minHullDist, minCapitalDist, pushOuts, capitalOffSlotT: capSteps ? offSlot / capSteps : 0, minSpeedViolations: violations, positionsHash: hashOf(w) }
}
