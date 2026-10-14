import type { Vec } from '../sim/math'
import { SIM_DT } from '../sim/config'
import { planetPos } from '../sim/system'
import type { World } from '../sim/types'
import { battleIconPos, frameRect, inFrame } from './battleGeom'
import { lodOf, screenToWorld, type Camera, type View } from './camera'

export type Pick =
  | { type: 'ship'; id: number }
  | { type: 'planet'; id: string }
  | { type: 'system'; id: number }
  | { type: 'battle'; id: number }
  | { type: 'fleet'; id: number }

/** что под курсором; корабль важнее планеты, планета — системы */
export function pickAt(w: World, cam: Camera, view: View, screen: Vec, alpha = 1): Pick | null {
  const z = cam.zoom
  const t = w.t - SIM_DT * (1 - alpha)
  const wp = screenToWorld(cam, view, screen)
  let ship: { id: number; d: number } | null = null
  let planet: { id: string; d: number } | null = null
  let star: { id: number; d: number } | null = null
  let battle: { id: number; d: number } | null = null
  let fleet: { id: number } | null = null
  for (const s of w.galaxy.systems) {
    const L = lodOf(s.radius, z)
    const lx = wp.x - s.pos.x
    const ly = wp.y - s.pos.y
    if (L.approachAlpha < 0.5) {
      // значок битвы (радиус 14 px) раньше звезды
      const ip = battleIconPos(s, z)
      for (const b of w.battles) {
        if (b.systemId !== s.id || b.phase === 'over') continue
        const di = Math.hypot(wp.x - ip.x, wp.y - ip.y) * z
        if (di < 14 && (!battle || di < battle.d)) battle = { id: b.id, d: di }
      }
      const ds = Math.hypot(lx, ly) * z
      if (ds < 18 && (!star || ds < star.d)) star = { id: s.id, d: ds }
      continue
    }
    if (Math.hypot(lx, ly) > s.radius + 500) continue
    if (L.approachAlpha >= 0.5) {
      for (const sh of w.ships) {
        if (!sh.alive || sh.transit || sh.systemId !== s.id) continue
        const px = sh.prevPos.x + (sh.pos.x - sh.prevPos.x) * alpha
        const py = sh.prevPos.y + (sh.pos.y - sh.prevPos.y) * alpha
        const d = Math.hypot(px - lx, py - ly) * z
        if (d < 10 && (!ship || d < ship.d)) ship = { id: sh.id, d }
      }
    }
    // рамка флота: после кораблей, раньше планет (запас 10 px по краям)
    for (const f of w.fleets) {
      if (f.systemId !== s.id || !f.shipIds.length) continue
      if (inFrame(frameRect(w, f), { x: lx, y: ly }, 10 / z)) fleet = { id: f.id }
    }
    for (const p of s.planets) {
      const q = planetPos(p, t)
      const d = Math.hypot(q.x - lx, q.y - ly) * z
      if (d < Math.max(p.radius * z, 6) + 4 && (!planet || d < planet.d)) planet = { id: p.id, d }
    }
  }
  if (battle) return { type: 'battle', id: battle.id }
  if (ship) return { type: 'ship', id: ship.id }
  if (fleet) return { type: 'fleet', id: fleet.id }
  if (planet) return { type: 'planet', id: planet.id }
  if (star) return { type: 'system', id: star.id }
  return null
}
