import { createCivs, stepPopulation } from './civ'
import { stepEconomy } from './economy'
import { SIM_DT } from './config'
import { generateGalaxy } from './galaxy'
import { createRng } from './rng'
import { stepShips } from './ships'
import { SpatialGrid } from './spatial'
import type { Planet, World } from './types'

export function createWorld(seed: number): World {
  const root = createRng(seed)
  const galaxy = generateGalaxy(root.fork('galaxy'))
  const planets = new Map<string, Planet>()
  for (const s of galaxy.systems) for (const p of s.planets) planets.set(p.id, p)
  const w: World = {
    seed,
    t: 0,
    tick: 0,
    galaxy,
    civs: [],
    ships: [],
    events: [],
    fx: [],
    grids: galaxy.systems.map(() => new SpatialGrid(50)),
    rng: root.fork('sim'),
    nextId: 1,
    planets,
  }
  createCivs(w, root.fork('civs'))
  return w
}

export function stepWorld(w: World): void {
  w.t += SIM_DT
  w.tick++
  stepPopulation(w)
  stepEconomy(w)
  stepShips(w)
}
