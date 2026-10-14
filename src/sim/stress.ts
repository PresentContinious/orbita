import { earn } from './economy'
import { spawnShip } from './ships'
import type { World } from './types'

/** count патрульных кораблей, из них focus — в самой большой системе; возвращает её id */
export function spawnStressShips(w: World, count: number, focus: number): number {
  const civ = w.civs[0]
  // чтобы нагрузка не обанкротила державу, сразу оплачиваем содержание надолго
  earn(civ, 1e9, 'refund')
  const heavy = w.galaxy.systems.reduce((a, b) => (b.planets.length > a.planets.length ? b : a))
  const others = w.galaxy.systems.filter((s) => s.id !== heavy.id)
  for (let i = 0; i < count; i++) {
    const sys = i < focus ? heavy : others[i % others.length]
    const n = sys.planets.length
    const a = sys.planets[i % n]
    const b = sys.planets[(i + 1) % n]
    spawnShip(w, civ, 'caravan', a, { type: 'patrol', a: a.id, b: b.id, leg: 0 }, 0)
  }
  return heavy.id
}
