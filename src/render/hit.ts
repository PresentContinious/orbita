import type { Vec } from '../sim/math'
import { planetPos } from '../sim/system'
import type { World } from '../sim/types'
import { lodOf, screenToWorld, type Camera, type View } from './camera'

export type Pick = { type: 'ship'; id: number } | { type: 'planet'; id: string } | { type: 'system'; id: number }

/** что под курсором; корабль важнее планеты, планета — системы */
export function pickAt(w: World, cam: Camera, view: View, screen: Vec): Pick | null {
  const z = cam.zoom
  const wp = screenToWorld(cam, view, screen)
  let ship: { id: number; d: number } | null = null
  let planet: { id: string; d: number } | null = null
  let star: { id: number; d: number } | null = null
  for (const s of w.galaxy.systems) {
    const L = lodOf(s.radius, z)
    const lx = wp.x - s.pos.x
    const ly = wp.y - s.pos.y
    if (L.approachAlpha < 0.5) {
      const ds = Math.hypot(lx, ly) * z
      if (ds < 18 && (!star || ds < star.d)) star = { id: s.id, d: ds }
      continue
    }
    if (Math.hypot(lx, ly) > s.radius + 500) continue
    if (L.approachAlpha >= 0.5) {
      for (const sh of w.ships) {
        if (!sh.alive || sh.transit || sh.systemId !== s.id) continue
        const d = Math.hypot(sh.pos.x - lx, sh.pos.y - ly) * z
        if (d < 10 && (!ship || d < ship.d)) ship = { id: sh.id, d }
      }
    }
    for (const p of s.planets) {
      const q = planetPos(p, w.t)
      const d = Math.hypot(q.x - lx, q.y - ly) * z
      if (d < Math.max(p.radius * z, 6) + 4 && (!planet || d < planet.d)) planet = { id: p.id, d }
    }
  }
  if (ship) return { type: 'ship', id: ship.id }
  if (planet) return { type: 'planet', id: planet.id }
  if (star) return { type: 'system', id: star.id }
  return null
}
