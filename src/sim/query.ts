import { ECON, POP, RESEARCH } from './config'
import { hops } from './routing'
import type { Civ, Planet, World } from './types'

export function civById(w: World, id: number): Civ | undefined {
  return w.civIndex.get(id)
}

export function planetsOf(w: World, civ: Civ): Planet[] {
  const out: Planet[] = []
  for (const s of w.galaxy.systems) for (const p of s.planets) if (p.owner === civ.id) out.push(p)
  return out
}

export function populatedOf(w: World, civ: Civ): Planet[] {
  return planetsOf(w, civ).filter((p) => p.pop > 0)
}

export function capOf(p: Planet, civ: Civ): number {
  return POP.capPerRadius * p.radius * p.habitability * (1 + ECON.infraCap * p.infra) * (1 + RESEARCH.agro.perLevel * civ.research.agro)
}

/** столица: родная планета, пока она своя и населена; иначе — самая населённая */
export function capitalOf(w: World, civ: Civ): Planet | null {
  const home = w.planets.get(civ.capital)
  if (home && home.owner === civ.id && home.pop > 0) return home
  const mine = populatedOf(w, civ)
  if (!mine.length) return null
  const cap = mine.reduce((b, p) => (p.pop > b.pop ? p : b), mine[0])
  civ.capital = cap.id
  return cap
}

export function capitalSystem(w: World, civ: Civ): number {
  return capitalOf(w, civ)?.systemId ?? civ.homeSystem
}

/** системы не дальше ECON.tradeMaxHops коридоров от столицы */
export function reachableSystems(w: World, civ: Civ): number[] {
  const from = capitalSystem(w, civ)
  return w.galaxy.systems.filter((s) => hops(w.galaxy, from, s.id) <= ECON.tradeMaxHops).map((s) => s.id)
}

/** куда уже летят свои колонисты */
export function claimedTargets(w: World, civ: Civ): Set<string> {
  const out = new Set<string>()
  for (const s of w.ships) if (s.alive && s.owner === civ.id && s.mission.type === 'colonize') out.add(s.mission.planetId)
  return out
}

/** свободные пригодные планеты в досягаемых системах, куда ещё не летят свои */
export function colonyTargets(w: World, civ: Civ): Planet[] {
  const claimed = claimedTargets(w, civ)
  const out: Planet[] = []
  for (const sid of reachableSystems(w, civ)) {
    for (const p of w.galaxy.systems[sid].planets) {
      if (p.owner === null && p.habitability > 0 && !claimed.has(p.id)) out.push(p)
    }
  }
  return out
}

/** свободные непригодные (пригодность ниже порога) планеты в досягаемых системах */
export function stationTargets(w: World, civ: Civ): Planet[] {
  const out: Planet[] = []
  for (const sid of reachableSystems(w, civ)) {
    for (const p of w.galaxy.systems[sid].planets) {
      if (p.owner === null && p.habitability < ECON.stationMaxHab) out.push(p)
    }
  }
  return out
}
