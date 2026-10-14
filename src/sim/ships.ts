import { isCombatKind, isCraft, newCombat, type CombatKind } from './classes'
import { MOVE, SHIP_KINDS, SIM_DT, type ShipKind } from './config'
import { speedMul } from './damage'
import { buy,shipPrice, shipUpkeepOf } from './economy'
import { addToFleet } from './fleet'
import { TAU, ZERO } from './math'
import { checkColonize, missionGoal } from './missions'
import { advanceTransit, avoidStar, gateGoal, shipSpeed, steer } from './nav'
import { planetPos, planetVel } from './system'
import type { Civ, Fleet, Mission, Planet, Ship, World } from './types'

export function spawnShip(w: World, civ: Civ, kind: ShipKind, from: Planet, mission: Mission, price: number): Ship {
  const p = planetPos(from, w.t)
  const a = w.rng.float(0, TAU)
  const off = from.radius + MOVE.dockPad + 10
  const pos = { x: p.x + Math.cos(a) * off, y: p.y + Math.sin(a) * off }
  const ship: Ship = {
    id: w.nextId++,
    kind,
    owner: civ.id,
    price,
    systemId: from.systemId,
    pos,
    prevPos: { ...pos },
    vel: planetVel(from, w.t),
    route: [],
    transit: null,
    mission,
    alive: true,
    combat: isCombatKind(kind) ? newCombat(kind, w.t) : null,
    fleetId: null,
  }
  w.ships.push(ship)
  w.shipIndex.set(ship.id, w.ships.length - 1)
  return ship
}

export function shipById(w: World, id: number): Ship | undefined {
  const i = w.shipIndex.get(id)
  return i === undefined ? undefined : w.ships[i]
}

/** боевой корабль за деньги конверта war; без флота (fleet = null) летит домой в миссии return */
export function spawnWarship(w: World, civ: Civ, kind: CombatKind, from: Planet, fleet: Fleet | null): Ship | null {
  const price = shipPrice(civ, kind)
  if (!buy(civ, 'warship', price, 'war', shipUpkeepOf(civ, kind))) return null
  const mission: Mission = fleet ? { type: 'fleet', fleetId: fleet.id } : { type: 'return', planetId: from.id }
  const ship = spawnShip(w, civ, kind, from, mission, price)
  ship.combat!.mothballed = fleet?.mission.type === 'dock'
  if (fleet) addToFleet(w, fleet, ship)
  return ship
}

/** нос к want не быстрее SHIP_KINDS.turn; по умолчанию want — по скорости */
export function turnHeading(ship: Ship, want?: number, dt = SIM_DT): void {
  const c = ship.combat
  if (!c) return
  if (want === undefined) {
    if (Math.hypot(ship.vel.x, ship.vel.y) <= 1) return
    want = Math.atan2(ship.vel.y, ship.vel.x)
  }
  let d = (want - c.heading) % TAU
  if (d > Math.PI) d -= TAU
  if (d < -Math.PI) d += TAU
  const max = ((SHIP_KINDS[ship.kind].turn * Math.PI) / 180) * dt
  c.heading += Math.max(-max, Math.min(max, d))
}

const scratch: number[] = []

export function stepShips(w: World): void {
  buildGrids(w)
  moveShips(w)
  compactShips(w)
}

export function buildGrids(w: World): void {
  for (const g of w.grids) g.clear()
  for (let i = 0; i < w.ships.length; i++) {
    const s = w.ships[i]
    if (s.alive && !s.transit) w.grids[s.systemId].insert(i, s.pos.x, s.pos.y)
  }
}

export function moveShips(w: World): void {
  for (let i = 0; i < w.ships.length; i++) {
    const ship = w.ships[i]
    if (!ship.alive) continue
    ship.prevPos.x = ship.pos.x
    ship.prevPos.y = ship.pos.y
    if (ship.transit) {
      advanceTransit(w, ship)
      continue
    }
    if (ship.route.length && ship.mission.type === 'colonize') checkColonize(w, ship)
    const goal = ship.route.length ? gateGoal(w, ship) : missionGoal(w, ship)
    if (!goal) continue
    const sys = w.galaxy.systems[ship.systemId]
    const near = Math.hypot(goal.pos.x - ship.pos.x, goal.pos.y - ship.pos.y)
    const frame = near < goal.frameR ? goal.vel : ZERO
    steer(ship, avoidStar(ship.pos, goal.pos, sys.star.radius), shipSpeed(w, ship) * speedMul(ship), SHIP_KINDS[ship.kind].accel, frame, SIM_DT)
    if (ship.mission.type !== 'fleet' && !isCraft(ship.kind)) separate(w, ship, i)
    turnHeading(ship)
    if (Math.hypot(goal.pos.x - ship.pos.x, goal.pos.y - ship.pos.y) < goal.dockR) goal.onReach(w, ship)
  }
}

export function compactShips(w: World): void {
  let j = 0
  for (let i = 0; i < w.ships.length; i++) {
    const s = w.ships[i]
    if (s.alive) w.ships[j++] = s
    else w.shipIndex.delete(s.id)
  }
  w.ships.length = j
  for (let i = 0; i < j; i++) w.shipIndex.set(w.ships[i].id, i)
}

/** корабли не слипаются: лёгкое отталкивание от соседей */
function separate(w: World, ship: Ship, self: number): void {
  const r = MOVE.separation
  for (const j of w.grids[ship.systemId].query(ship.pos.x, ship.pos.y, r, scratch)) {
    if (j === self) continue
    const o = w.ships[j]
    if (!o.alive || o.transit || o.systemId !== ship.systemId) continue
    const dx = ship.pos.x - o.pos.x
    const dy = ship.pos.y - o.pos.y
    const d = Math.hypot(dx, dy)
    if (d > 1e-6 && d < r) {
      const k = (((r - d) / r) * MOVE.separationForce * SIM_DT) / d
      ship.vel.x += dx * k
      ship.vel.y += dy * k
    }
  }
}
