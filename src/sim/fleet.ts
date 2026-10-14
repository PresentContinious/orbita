import { createAdmiral } from './admiral'
import { BATTLE } from './combat-config'
import { MOVE } from './config'
import { uniqueName } from './names'
import type { Goal } from './nav'
import { planetPos, planetVel } from './system'
import type { Civ, Fleet, FleetMission, Planet, Ship, World } from './types'

export function createFleet(w: World, civ: Civ, planet: Planet, mission: FleetMission): Fleet {
  const id = w.nextId++
  const used = new Set<string>()
  for (const f of w.fleets) used.add(f.name)
  const rng = w.rng.fork('fleet:' + id)
  const admiral = createAdmiral(w, civ)
  const p = planetPos(planet, w.t)
  const off = planet.radius + MOVE.dockPad + 40
  const fleet: Fleet = {
    id,
    owner: civ.id,
    name: uniqueName(rng, used),
    admiralId: admiral.id,
    rng,
    systemId: planet.systemId,
    shipIds: [],
    reserveIds: [],
    flagshipId: null,
    anchor: { x: p.x + off, y: p.y },
    anchorVel: planetVel(planet, w.t),
    speed: 0,
    heading: 0,
    frame: null,
    columns: 1,
    width: 0,
    formation: 'wide',
    order: 'form',
    orderSince: w.t,
    orderReason: '',
    nextReview: w.t,
    lastReactT: w.t,
    targetPriority: 'nearest',
    prioritySince: w.t,
    missiles: 'ready',
    turrets: 'pd',
    channelSince: w.t,
    screenForward: null,
    finisher: false,
    flankIds: [],
    flankSince: null,
    cohesion: BATTLE.cohesion.start,
    dStar: BATTLE.dStar.line,
    dStarSince: w.t,
    driftSide: 1,
    driftSince: w.t,
    fallback: null,
    mission,
    battleId: null,
    waitingAtGate: null,
    route: [],
    gatherSince: null,
    reassignAt: null,
    lastLossT: w.t,
    columnSwapAt: {},
    flagSince: null,
    chargeSince: w.t,
    mothballedSince: null,
    mobilizedAt: w.t,
    decided: false,
    value0: 0,
    lossValue: 0,
  }
  w.fleets.push(fleet)
  return fleet
}

export function fleetById(w: World, id: number): Fleet | undefined {
  for (const f of w.fleets) if (f.id === id) return f
  return undefined
}

export function addToFleet(_w: World, fleet: Fleet, ship: Ship): void {
  if (!fleet.shipIds.includes(ship.id)) fleet.shipIds.push(ship.id)
  ship.fleetId = fleet.id
}

function drop(list: number[], id: number): void {
  const i = list.indexOf(id)
  if (i >= 0) list.splice(i, 1)
}

/** вычёркивает корабль; погиб последний — флот распущен (адмирал жив) */
export function removeFromFleet(w: World, fleet: Fleet, shipId: number): void {
  drop(fleet.shipIds, shipId)
  drop(fleet.reserveIds, shipId)
  drop(fleet.flankIds, shipId)
  if (!fleet.shipIds.length) disbandFleet(w, fleet)
}

export function disbandFleet(w: World, fleet: Fleet): void {
  const i = w.fleets.indexOf(fleet)
  if (i >= 0) w.fleets.splice(i, 1)
}

/** заглушка: тело — задача 7 */
export function stepFleets(_w: World): void {}

/** корабль без слота держит место */
export function fleetGoal(w: World, ship: Ship): Goal | null {
  if (ship.mission.type !== 'fleet') return null
  const fleet = fleetById(w, ship.mission.fleetId)
  return { pos: ship.pos, vel: fleet ? fleet.anchorVel : { x: 0, y: 0 }, frameR: Infinity, dockR: 0, onReach: () => {} }
}
