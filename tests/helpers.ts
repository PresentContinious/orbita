import { SIM_DT } from '../src/sim/config'
import type { World } from '../src/sim/types'
import { createWorld, stepWorld } from '../src/sim/world'

export function run(w: World, seconds: number): void {
  const n = Math.round(seconds / SIM_DT)
  for (let i = 0; i < n; i++) stepWorld(w)
}

/** состояние, по которому сравниваем два прогона */
export function snapshot(w: World): string {
  return JSON.stringify({
    t: w.t,
    civs: w.civs.map((c) => [c.id, c.treasury, c.capital, c.eco.stage]),
    planets: [...w.planets.values()].map((p) => [p.id, p.owner, p.pop, p.infra, p.station]),
    ships: w.ships.map((s) => [s.id, s.kind, s.owner, s.systemId, s.pos.x, s.pos.y]),
    events: w.events.length,
  })
}

/** мир, в котором боты ничего не покупают — для проверки одной механики */
export function quietWorld(seed: number): World {
  const w = createWorld(seed)
  for (const c of w.civs) c.nextDecision = Infinity
  return w
}
