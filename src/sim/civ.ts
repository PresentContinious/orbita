import { BOT, CIVS, ECON, PALETTE, POP, SIM_DT } from './config'
import { adminTotal, colonyPrice, newEconomy } from './economy'
import { uniqueName } from './names'
import { capOf, civById, colonyTargets } from './query'
import type { Rng } from './rng'
import type { Civ, Planet, World } from './types'

export function createCivs(w: World, rng: Rng): void {
  const used = new Set<string>([...w.planets.values()].map((p) => p.name).concat(w.galaxy.systems.map((s) => s.name)))
  let color = 0
  for (const sys of w.galaxy.systems) {
    if (sys.role !== 'inhabited') continue
    const homes = rng.shuffle(sys.planets.filter((p) => p.habitability >= 1))
    for (let i = 0; i < sys.civSlots; i++) {
      const home = homes[i]
      const civ: Civ = {
        id: w.nextId++,
        name: uniqueName(rng, used),
        color: PALETTE[color++ % PALETTE.length],
        capital: home.id,
        homeSystem: sys.id,
        treasury: w.settings.treasury,
        eco: newEconomy(w.settings.treasury),
        research: { logistics: 0, admin: 0, agro: 0, engines: 0 },
        researchJob: null,
        port: false,
        shipyard: false,
        project: null,
        nextDecision: rng.float(1, 4),
      }
      home.owner = civ.id
      home.pop = rng.float(CIVS.startPopMin, CIVS.startPopMax)
      w.civs.push(civ)
    }
  }
}

export function stepPopulation(w: World): void {
  for (const sys of w.galaxy.systems) {
    for (const p of sys.planets) {
      if (p.owner === null || p.pop <= 0) continue
      const civ = civById(w, p.owner)
      if (!civ) continue
      const cap = capOf(p, civ)
      if (cap <= 0) continue
      p.pop += POP.growth * p.pop * (1 - p.pop / cap) * SIM_DT
    }
  }
}

/** выгода колонии: налог при «зрелой» колонии минус прирост администрации, на кредит цены */
export function colonyValue(w: World, civ: Civ, p: Planet): number {
  const income = ECON.taxPerPop * BOT.colonyMaturity * capOf(p, civ)
  const dAdmin = adminTotal(w, civ, p) - adminTotal(w, civ)
  return (income - dAdmin) / colonyPrice(w, civ, p)
}

export function bestColonyTarget(w: World, civ: Civ, exclude: Set<string>): Planet | null {
  let best: Planet | null = null
  let bestV = -Infinity
  for (const p of colonyTargets(w, civ)) {
    if (exclude.has(p.id)) continue
    const v = colonyValue(w, civ, p)
    if (v > bestV) {
      best = p
      bestV = v
    }
  }
  return best
}
