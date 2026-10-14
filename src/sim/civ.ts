import { CIVS, PALETTE, POP, SIM_DT } from './config'
import { newEconomy } from './economy'
import { uniqueName } from './names'
import { capOf, civById } from './query'
import type { Rng } from './rng'
import type { Civ, World } from './types'

export function createCivs(w: World, rng: Rng): void {
  const used = new Set<string>()
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
        treasury: CIVS.startTreasury,
        eco: newEconomy(CIVS.startTreasury),
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
