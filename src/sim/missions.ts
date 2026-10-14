import { asteroidPos, asteroidVel, nearestAsteroid } from './belts'
import { bestColonyTarget, colonyValue } from './civ'
import { ECON, MOVE, SIM_DT } from './config'
import { salvageGoal } from './damage'
import { earn, tradeIncome } from './economy'
import { fleetGoal } from './fleet'
import { pushEvent } from './events'
import type { Vec } from './math'
import { planetGoal, type Goal } from './nav'
import { capitalOf, civById, claimedTargets, colonyTargets, populatedOf } from './query'
import { planetPos, planetVel } from './system'
import type { Civ, Mission, Planet, Ship, World } from './types'

type Of<T extends Mission['type']> = Extract<Mission, { type: T }>

export function missionGoal(w: World, ship: Ship): Goal | null {
  switch (ship.mission.type) {
    case 'return':
      return planetGoal(w, ship, ship.mission.planetId, dock)
    case 'colonize':
      return colonizeGoal(w, ship)
    case 'trade':
      return tradeGoal(w, ship)
    case 'mine':
      return mineGoal(w, ship)
    case 'patrol':
      return planetGoal(w, ship, ship.mission.leg === 0 ? ship.mission.b : ship.mission.a, turnAround)
    case 'fleet':
      return fleetGoal(w, ship)
    case 'wing':
      return null
    case 'salvage':
      return salvageGoal(w, ship)
  }
}

/** патруль: долетел — развернулся к другой планете, без денег и событий */
function turnAround(_w: World, ship: Ship): void {
  const m = ship.mission as Of<'patrol'>
  m.leg = m.leg === 0 ? 1 : 0
}

/** пристыковался к своей планете — корабль уходит в док */
function dock(_w: World, ship: Ship): void {
  ship.alive = false
}

function goHome(w: World, ship: Ship): void {
  const civ = civById(w, ship.owner)
  const home = civ ? capitalOf(w, civ) : null
  if (!home) {
    ship.alive = false
    return
  }
  ship.mission = { type: 'return', planetId: home.id }
  ship.route = []
}

function fx(w: World, p: Planet, amount: number): void {
  const pos = planetPos(p, w.t)
  w.fx.push({ kind: 'income', t: w.t, systemId: p.systemId, x: pos.x, y: pos.y, amount })
}

// ---------- колонизация ----------

function colonizeGoal(w: World, ship: Ship): Goal | null {
  const m = ship.mission as Of<'colonize'>
  const target = w.planets.get(m.planetId)
  if (!target || target.owner !== null) {
    retarget(w, ship)
    return null
  }
  return planetGoal(w, ship, target.id, settle)
}

/** цель колонизации уже занята — перенацелить (вызывается и в пути, пока route не пуст) */
export function checkColonize(w: World, ship: Ship): void {
  const m = ship.mission as Of<'colonize'>
  const target = w.planets.get(m.planetId)
  if (!target || target.owner !== null) retarget(w, ship)
}

function retarget(w: World, ship: Ship): void {
  const m = ship.mission as Of<'colonize'>
  const civ = civById(w, ship.owner)
  if (!civ) {
    ship.alive = false
    return
  }
  let next: Planet | null = null
  let bestV = -Infinity
  for (const p of colonyTargets(w, civ)) {
    if (p.systemId !== ship.systemId) continue
    const v = colonyValue(w, civ, p)
    if (v > bestV) {
      next = p
      bestV = v
    }
  }
  next ??= bestColonyTarget(w, civ, claimedTargets(w, civ))
  if (next) {
    m.planetId = next.id
    ship.route = []
    return
  }
  earn(civ, m.price * ECON.colonyRefund, 'refund')
  goHome(w, ship)
}

function settle(w: World, ship: Ship): void {
  const m = ship.mission as Of<'colonize'>
  const p = w.planets.get(m.planetId)!
  const civ = civById(w, ship.owner)
  ship.alive = false
  if (!civ || p.owner !== null) return
  p.owner = civ.id
  p.pop = m.settlers
  p.infra = 0
  p.station = false
  const sys = w.galaxy.systems[p.systemId]
  const at = { system: p.systemId, planet: p.id }
  if (p.systemId !== civ.homeSystem) {
    pushEvent(w, { kind: 'colony', pri: 0, text: `${civ.name} основало колонию в системе ${sys.name}: ${p.name}`, civs: [civ.id], at })
  } else {
    pushEvent(w, { kind: 'colony', pri: 1, text: `${civ.name} основало колонию на ${p.name}`, civs: [civ.id], at })
  }
}

// ---------- торговля ----------

function tradeGoal(w: World, ship: Ship): Goal | null {
  const m = ship.mission as Of<'trade'>
  const a = w.planets.get(m.a)
  const b = w.planets.get(m.b)
  if (!a || !b || a.pop <= 0 || b.pop <= 0 || a.owner === null || b.owner === null) {
    goHome(w, ship)
    return null
  }
  return planetGoal(w, ship, m.leg === 0 ? b.id : a.id, deliver)
}

function deliver(w: World, ship: Ship): void {
  const m = ship.mission as Of<'trade'>
  const civ = civById(w, ship.owner)
  if (!civ) return
  const a = w.planets.get(m.a)!
  const b = w.planets.get(m.b)!
  const amount = tradeIncome(civ, a, b)
  earn(civ, amount, 'trade')
  const partnerId = a.owner !== civ.id ? a.owner : b.owner !== civ.id ? b.owner : null
  if (partnerId !== null) {
    const partner = civById(w, partnerId)
    if (partner) earn(partner, amount * ECON.tradePartnerShare, 'tradePartner')
  }
  fx(w, m.leg === 0 ? b : a, amount)
  m.leg = m.leg === 0 ? 1 : 0
}

// ---------- добыча ----------

function nearestOwn(w: World, civ: Civ, systemId: number, pos: Vec): Planet | null {
  let best: Planet | null = null
  let bd = Infinity
  for (const p of populatedOf(w, civ)) {
    if (p.systemId !== systemId) continue
    const q = planetPos(p, w.t)
    const d = Math.hypot(q.x - pos.x, q.y - pos.y)
    if (d < bd) {
      bd = d
      best = p
    }
  }
  return best
}

function mineGoal(w: World, ship: Ship): Goal | null {
  const m = ship.mission as Of<'mine'>
  const civ = civById(w, ship.owner)
  if (!civ) {
    ship.alive = false
    return null
  }
  const sys = w.galaxy.systems[ship.systemId]
  if (m.phase === 'out') {
    let ast = m.asteroidId === null ? undefined : sys.asteroids.find((a) => a.id === m.asteroidId && a.ore > 0)
    if (!ast) {
      ast = nearestAsteroid(sys, ship.pos, w.t)
      m.asteroidId = ast?.id ?? null
    }
    if (!ast) return idleGoal(w, ship, civ)
    return { pos: asteroidPos(ast, w.t), vel: asteroidVel(ast, w.t), frameR: ast.size + 150, dockR: ast.size + 10, onReach: dig }
  }
  const home = nearestOwn(w, civ, ship.systemId, ship.pos)
  if (!home) {
    goHome(w, ship)
    return null
  }
  return planetGoal(w, ship, home.id, unload)
}

/** руды нет — ждём у своей планеты */
function idleGoal(w: World, ship: Ship, civ: Civ): Goal | null {
  const m = ship.mission as Of<'mine'>
  m.idleT += SIM_DT
  const home = nearestOwn(w, civ, ship.systemId, ship.pos)
  if (!home) {
    goHome(w, ship)
    return null
  }
  const p = planetPos(home, w.t)
  return {
    pos: { x: p.x + home.radius + 40, y: p.y },
    vel: planetVel(home, w.t),
    frameR: home.radius * MOVE.frameMatchMul + MOVE.frameMatchPad,
    dockR: 0,
    onReach: () => {},
  }
}

function dig(w: World, ship: Ship): void {
  const m = ship.mission as Of<'mine'>
  const sys = w.galaxy.systems[ship.systemId]
  const i = sys.asteroids.findIndex((a) => a.id === m.asteroidId)
  if (i < 0) {
    m.asteroidId = null
    return
  }
  const ast = sys.asteroids[i]
  const take = Math.min(ECON.minerCargo, ast.ore)
  ast.ore -= take
  if (ast.ore <= 1e-9) sys.asteroids.splice(i, 1)
  m.cargo = take
  m.phase = 'back'
  m.asteroidId = null
}

function unload(w: World, ship: Ship): void {
  const m = ship.mission as Of<'mine'>
  const civ = civById(w, ship.owner)
  if (civ && m.cargo > 0) {
    const amount = m.cargo * ECON.orePrice
    earn(civ, amount, 'mining')
    const home = nearestOwn(w, civ, ship.systemId, ship.pos)
    if (home) fx(w, home, amount)
  }
  m.cargo = 0
  m.phase = 'out'
}
