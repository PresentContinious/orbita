import { MOVE, RESEARCH, SHIP_KINDS } from './config'
import { clamp, type Vec } from './math'
import { civById } from './query'
import { planetPos, planetVel } from './system'
import type { Ship, World } from './types'

/** куда лететь и что делать по прибытии */
export interface Goal {
  pos: Vec
  /** скорость цели: вблизи корабль летит в её системе отсчёта */
  vel: Vec
  frameR: number
  dockR: number
  onReach: (w: World, ship: Ship) => void
}

export type Body = { pos: Vec; vel: Vec }

/** путевая точка, которая уводит путь от звезды (звезда — в начале координат системы) */
export function avoidStar(pos: Vec, target: Vec, starR: number): Vec {
  const safe = starR * MOVE.starSafetyMul
  const push = safe * MOVE.waypointPush
  const d = Math.hypot(pos.x, pos.y)
  if (d < safe) {
    if (d < 1e-9) return { x: push, y: 0 }
    return { x: (pos.x / d) * push, y: (pos.y / d) * push }
  }
  const dx = target.x - pos.x
  const dy = target.y - pos.y
  const len2 = dx * dx + dy * dy || 1
  const u = clamp(-(pos.x * dx + pos.y * dy) / len2, 0, 1)
  const cx = pos.x + dx * u
  const cy = pos.y + dy * u
  const cd = Math.hypot(cx, cy)
  if (cd >= safe) return target
  if (cd < 1e-6) {
    const nl = Math.hypot(dx, dy) || 1
    return { x: (-dy / nl) * push, y: (dx / nl) * push }
  }
  return { x: (cx / cd) * push, y: (cy / cd) * push }
}

/** руление с ограниченным ускорением; у цели — торможение до её скорости */
export function steer(body: Body, waypoint: Vec, maxSpeed: number, accel: number, frameVel: Readonly<Vec>, dt: number): void {
  const dx = waypoint.x - body.pos.x
  const dy = waypoint.y - body.pos.y
  const d = Math.hypot(dx, dy)
  const k = d > 1e-6 ? (maxSpeed * Math.min(1, d / MOVE.arriveRadius)) / d : 0
  let ax = frameVel.x + dx * k - body.vel.x
  let ay = frameVel.y + dy * k - body.vel.y
  const al = Math.hypot(ax, ay)
  const lim = accel * dt
  if (al > lim) {
    ax *= lim / al
    ay *= lim / al
  }
  body.vel.x += ax
  body.vel.y += ay
  body.pos.x += body.vel.x * dt
  body.pos.y += body.vel.y * dt
}

export function shipSpeed(w: World, ship: Ship): number {
  const civ = civById(w, ship.owner)
  return SHIP_KINDS[ship.kind].speed * (1 + RESEARCH.engines.perLevel * (civ?.research.engines ?? 0))
}

export function planetGoal(w: World, ship: Ship, planetId: string, onReach: Goal['onReach']): Goal | null {
  const p = w.planets.get(planetId)
  if (!p || p.systemId !== ship.systemId) return null
  return {
    pos: planetPos(p, w.t),
    vel: planetVel(p, w.t),
    frameR: p.radius * MOVE.frameMatchMul + MOVE.frameMatchPad,
    dockR: p.radius + MOVE.dockPad,
    onReach,
  }
}
