import { BOT, ECON, MOVE, POP, RESEARCH, RESEARCH_BRANCHES, SHIP_KINDS, type Envelope, type ResearchBranch } from './config'
import { adminTotal, buy, colonyPrice, shipPrice, shipUpkeep, stationIncome, taxOf, tradeIncome } from './economy'
import { pushEvent } from './events'
import { tryInfra, tryProject, tryResearch, tryStation } from './invest'
import { setDestination } from './nav'
import { capOf, capitalOf, capitalSystem, colonyTargets, populatedOf, stationTargets } from './query'
import { findPath, hops } from './routing'
import { spawnShip } from './ships'
import { planetPos } from './system'
import type { Civ, Planet, World } from './types'

export type OptionKind = 'colony' | 'station' | 'infra' | 'port' | 'shipyard' | 'research' | 'caravan' | 'miner'

export interface Option {
  kind: OptionKind
  price: number
  envelope: Envelope
  /** прирост дохода, кр/с */
  dIncome: number
  /** прирост содержания, кр/с */
  dUpkeep: number
  planetId?: string
  partnerId?: string
  branch?: ResearchBranch
}

/** окупаемость: чистая прибыль в секунду на кредит цены */
export function score(o: Option): number {
  return (o.dIncome - o.dUpkeep) / o.price
}

export interface Route {
  a: Planet
  b: Planet
  internal: boolean
  /** маршрут между разными системами (свой слот) */
  inter: boolean
}

export function tradeRoutes(w: World, civ: Civ): Route[] {
  const out: Route[] = []
  for (const s of w.ships) {
    if (!s.alive || s.owner !== civ.id || s.mission.type !== 'trade') continue
    const a = w.planets.get(s.mission.a)
    const b = w.planets.get(s.mission.b)
    if (a && b) out.push({ a, b, internal: a.owner === civ.id && b.owner === civ.id, inter: a.systemId !== b.systemId })
  }
  return out
}

function legTime(w: World, a: Planet, b: Planet): number {
  const speed = SHIP_KINDS.caravan.speed
  if (a.systemId === b.systemId) {
    const pa = planetPos(a, w.t)
    const pb = planetPos(b, w.t)
    return Math.hypot(pa.x - pb.x, pa.y - pb.y) / speed + 10
  }
  const path = findPath(w.galaxy, a.systemId, b.systemId) ?? []
  let transit = 0
  let from = a.systemId
  for (const to of path) {
    const c = w.galaxy.corridors.find((k) => (k.a === from && k.b === to) || (k.b === from && k.a === to))
    transit += c?.transit ?? 0
    from = to
  }
  const sa = w.galaxy.systems[a.systemId]
  const sb = w.galaxy.systems[b.systemId]
  return (sa.radius + sb.radius) / speed + transit + MOVE.crossingCost * Math.max(0, path.length - 1)
}

type Slot = 'internal' | 'external' | 'inter'

function routeSlot(r: Route): Slot {
  return r.inter ? 'inter' : r.internal ? 'internal' : 'external'
}

function bestRoute(w: World, civ: Civ, slot: Slot, routes: Route[]): { a: Planet; b: Planet; rate: number } | null {
  const capSys = capitalSystem(w, civ)
  let best: { a: Planet; b: Planet; rate: number } | null = null
  for (const a of populatedOf(w, civ)) {
    for (const b of w.planets.values()) {
      if (b.id === a.id || b.pop <= 0 || b.owner === null) continue
      if ((a.systemId !== b.systemId) !== (slot === 'inter')) continue
      if (slot === 'internal' && (b.owner !== civ.id || b.id < a.id)) continue
      if (slot === 'external' && b.owner === civ.id) continue
      if (slot === 'inter' && hops(w.galaxy, capSys, b.systemId) > ECON.tradeMaxHops) continue
      if (routes.some((r) => (r.a.id === a.id && r.b.id === b.id) || (r.a.id === b.id && r.b.id === a.id))) continue
      const rate = tradeIncome(civ, a, b) / legTime(w, a, b)
      if (!best || rate > best.rate) best = { a, b, rate }
    }
  }
  return best
}

function minerBase(w: World, civ: Civ): { planet: Planet; rate: number } | null {
  let best: { planet: Planet; rate: number } | null = null
  for (const p of populatedOf(w, civ)) {
    const sys = w.galaxy.systems[p.systemId]
    if (!sys.belts.length || !sys.asteroids.some((a) => a.ore > 0)) continue
    const belt = sys.belts.reduce((x, y) => (Math.abs(y.orbit - p.orbit) < Math.abs(x.orbit - p.orbit) ? y : x))
    const trip = (2 * Math.abs(belt.orbit - p.orbit) + 400) / SHIP_KINDS.miner.speed + 20
    const rate = (ECON.minerCargo * ECON.orePrice) / trip
    if (!best || rate > best.rate) best = { planet: p, rate }
  }
  return best
}

function shipUpkeepTotal(w: World, civ: Civ): number {
  let s = 0
  for (const sh of w.ships) if (sh.alive && sh.owner === civ.id) s += shipUpkeep(civ, sh.kind)
  return s
}

function researchGain(w: World, civ: Civ, b: ResearchBranch, shipUp: number): number {
  switch (b) {
    case 'logistics':
      return RESEARCH.logistics.perLevel * shipUp
    case 'admin':
      return RESEARCH.admin.perLevel * adminTotal(w, civ)
    case 'agro':
      return RESEARCH.agro.perLevel * populatedOf(w, civ).reduce((s, p) => s + taxOf(p, civ), 0)
    case 'engines':
      return 0.5 * RESEARCH.engines.perLevel * civ.eco.tradeEma
  }
}

export function listOptions(w: World, civ: Civ): Option[] {
  const out: Option[] = []
  const capital = capitalOf(w, civ)
  if (!capital) return out
  const mine = populatedOf(w, civ)

  if (capital.pop >= POP.settlers + POP.capitalReserve) {
    const admin0 = adminTotal(w, civ)
    for (const p of colonyTargets(w, civ)) {
      out.push({
        kind: 'colony',
        price: colonyPrice(w, civ, p),
        envelope: 'expand',
        dIncome: ECON.taxPerPop * BOT.colonyMaturity * capOf(p, civ),
        dUpkeep: adminTotal(w, civ, p) - admin0,
        planetId: p.id,
      })
    }
  }

  for (const p of stationTargets(w, civ)) {
    out.push({ kind: 'station', price: ECON.stationPrice, envelope: 'trade', dIncome: stationIncome(w.galaxy.systems[p.systemId]), dUpkeep: ECON.stationUpkeep, planetId: p.id })
  }

  for (const p of mine) {
    if (p.infra < 3 && !p.build) {
      out.push({ kind: 'infra', price: ECON.infraPrice[p.infra], envelope: 'develop', dIncome: ECON.taxPerPop * p.pop * ECON.infraTax, dUpkeep: 0, planetId: p.id })
    }
  }

  const shipUp = shipUpkeepTotal(w, civ)
  if (!civ.project) {
    if (!civ.port) out.push({ kind: 'port', price: ECON.portPrice, envelope: 'develop', dIncome: (ECON.portTradeMul - 1) * civ.eco.tradeEma + 0.1, dUpkeep: 0 })
    if (!civ.shipyard) out.push({ kind: 'shipyard', price: ECON.shipyardPrice, envelope: 'develop', dIncome: (1 - ECON.shipyardUpkeepMul) * shipUp + 0.05, dUpkeep: 0 })
  }

  if (!civ.researchJob) {
    for (const b of RESEARCH_BRANCHES) {
      const lvl = civ.research[b]
      if (lvl < 3) out.push({ kind: 'research', price: ECON.researchPrice[lvl], envelope: 'develop', dIncome: researchGain(w, civ, b, shipUp), dUpkeep: 0, branch: b })
    }
  }

  const routes = tradeRoutes(w, civ)
  const routeLimit = 1 + (civ.port ? 1 : 0)
  for (const slot of ['internal', 'external', 'inter'] as const) {
    if (routes.filter((r) => routeSlot(r) === slot).length >= routeLimit) continue
    const best = bestRoute(w, civ, slot, routes)
    if (best) {
      out.push({ kind: 'caravan', price: shipPrice(civ, 'caravan'), envelope: 'trade', dIncome: best.rate, dUpkeep: shipUpkeep(civ, 'caravan'), planetId: best.a.id, partnerId: best.b.id })
    }
  }

  const miners = w.ships.filter((s) => s.alive && s.owner === civ.id && s.kind === 'miner').length
  if (miners < Math.min(BOT.minerMax, BOT.minerBase + Math.floor(mine.length / 2))) {
    const base = minerBase(w, civ)
    if (base) out.push({ kind: 'miner', price: shipPrice(civ, 'miner'), envelope: 'trade', dIncome: base.rate, dUpkeep: shipUpkeep(civ, 'miner'), planetId: base.planet.id })
  }

  return out
}

export function execute(w: World, civ: Civ, o: Option): boolean {
  switch (o.kind) {
    case 'colony': {
      const target = w.planets.get(o.planetId!)
      const capital = capitalOf(w, civ)
      if (!target || !capital || capital.pop < POP.settlers + POP.capitalReserve) return false
      if (!buy(civ, 'colony', o.price, 'expand', o.dUpkeep)) return false
      capital.pop -= POP.settlers
      const ship = spawnShip(w, civ, 'colony', capital, { type: 'colonize', planetId: target.id, settlers: POP.settlers, price: o.price }, o.price)
      setDestination(w, ship, target.systemId)
      return true
    }
    case 'station':
      return tryStation(civ, w.planets.get(o.planetId!)!)
    case 'infra':
      return tryInfra(civ, w.planets.get(o.planetId!)!)
    case 'port':
    case 'shipyard':
      return tryProject(civ, o.kind)
    case 'research':
      return tryResearch(civ, o.branch!)
    case 'caravan': {
      const a = w.planets.get(o.planetId!)!
      const b = w.planets.get(o.partnerId!)!
      const newLink = a.systemId !== b.systemId && !tradeRoutes(w, civ).some((r) => sameSystems(r, a, b))
      if (!buy(civ, 'caravan', o.price, 'trade', o.dUpkeep)) return false
      spawnShip(w, civ, 'caravan', a, { type: 'trade', a: a.id, b: b.id, leg: 0 }, o.price)
      if (newLink) {
        const sa = w.galaxy.systems[a.systemId]
        const sb = w.galaxy.systems[b.systemId]
        pushEvent(w, { kind: 'trade-route', pri: 1, text: `${civ.name} открыло торговую трассу ${sa.name} — ${sb.name}`, civs: [civ.id], at: { system: a.systemId } })
      }
      return true
    }
    case 'miner': {
      const p = w.planets.get(o.planetId!)!
      if (!buy(civ, 'miner', o.price, 'trade', o.dUpkeep)) return false
      spawnShip(w, civ, 'miner', p, { type: 'mine', phase: 'out', asteroidId: null, cargo: 0, idleT: 0 }, o.price)
      return true
    }
  }
}

function sameSystems(r: Route, a: Planet, b: Planet): boolean {
  return (r.a.systemId === a.systemId && r.b.systemId === b.systemId) || (r.a.systemId === b.systemId && r.b.systemId === a.systemId)
}
