import { stepAsteroids } from './belts'
import { stepBots } from './bot'
import { stepUnitCap } from './cap'
import { createCivs, stepPopulation } from './civ'
import { stepEconomy } from './economy'
import { EVENTS, SIM_DT } from './config'
import { generateGalaxy } from './galaxy'
import { createRng } from './rng'
import { clampOptions, SETUP, setupOf, type GalaxyOptions } from './setup'
import { stepCombatState, stepDebris } from './damage'
import { pushOut, stepFleets } from './fleet'
import { initPools, stepProjectiles } from './projectiles'
import { buildGrids, compactShips, moveShips } from './ships'
import { SpatialGrid } from './spatial'
import { fireWeapons, pickTargets } from './weapons'
import type { Planet, World } from './types'

export function createWorld(seed: number, opts: GalaxyOptions = {}): World {
  const o = clampOptions(opts)
  const root = createRng(seed)
  const galaxy = generateGalaxy(root.fork('galaxy'), o)
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
    settings: setupOf(galaxy, o),
    unitCap: o.unitCap ?? SETUP.unitCap.def,
    civIndex: new Map(),
    shipIndex: new Map(),
    fleets: [],
    admirals: [],
    battles: [],
    projectiles: [],
    projGrids: galaxy.systems.map(() => new SpatialGrid(50)),
    debris: [],
    hostility: new Map(),
    fxBattle: [],
    pushOuts: 0,
    skirmish: { nextAt: 0, lastTo: new Map(), recentBig: [], nextBot: 0 },
  }
  createCivs(w, root.fork('civs'))
  for (const c of w.civs) w.civIndex.set(c.id, c)
  initPools(w)
  return w
}

export function stepWorld(w: World): void {
  w.t += SIM_DT
  w.tick++
  w.fxBattle.length = 0
  w.pushOuts = 0
  stepPopulation(w)
  stepEconomy(w)
  stepBots(w)
  stepUnitCap(w)
  stepFleets(w)
  buildGrids(w)
  moveShips(w)
  pushOut(w)
  pickTargets(w)
  fireWeapons(w)
  stepProjectiles(w)
  stepCombatState(w)
  compactShips(w)
  stepDebris(w)
  stepAsteroids(w)
  while (w.fx.length && w.t - w.fx[0].t > EVENTS.fxLife) w.fx.shift()
}
