import { MOVE, SHIP_KINDS, SIM_DT, type ShipKind } from './config'
import { TAU, ZERO } from './math'
import { checkColonize, missionGoal } from './missions'
import { advanceTransit, avoidStar, gateGoal, shipSpeed, steer } from './nav'
import { planetPos, planetVel } from './system'
import type { Civ, Mission, Planet, Ship, World } from './types'

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
  }
  w.ships.push(ship)
  return ship
}

const scratch: number[] = []

export function stepShips(w: World): void {
  for (const g of w.grids) g.clear()
  for (let i = 0; i < w.ships.length; i++) {
    const s = w.ships[i]
    if (s.alive && !s.transit) w.grids[s.systemId].insert(i, s.pos.x, s.pos.y)
  }
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
    steer(ship, avoidStar(ship.pos, goal.pos, sys.star.radius), shipSpeed(w, ship), SHIP_KINDS[ship.kind].accel, frame, SIM_DT)
    separate(w, ship, i)
    if (Math.hypot(goal.pos.x - ship.pos.x, goal.pos.y - ship.pos.y) < goal.dockR) goal.onReach(w, ship)
  }
  let j = 0
  for (let i = 0; i < w.ships.length; i++) if (w.ships[i].alive) w.ships[j++] = w.ships[i]
  w.ships.length = j
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
