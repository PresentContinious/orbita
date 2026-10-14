import { ECON, RESEARCH, SIM_DT, type ResearchBranch } from './config'
import { buy } from './economy'
import { pushEvent } from './events'
import { capitalSystem, planetsOf } from './query'
import type { Civ, Planet, World } from './types'

const ROMAN = ['', 'I', 'II', 'III']

export function tryInfra(civ: Civ, p: Planet): boolean {
  if (p.owner !== civ.id || p.pop <= 0 || p.infra >= 3 || p.build) return false
  const level = p.infra + 1
  if (!buy(civ, 'infra', ECON.infraPrice[level - 1], 'develop')) return false
  p.build = { kind: 'infra', level, remaining: ECON.infraBuild[level - 1], total: ECON.infraBuild[level - 1] }
  return true
}

export function tryStation(civ: Civ, p: Planet): boolean {
  if (p.owner !== null || p.habitability >= ECON.stationMaxHab) return false
  if (!buy(civ, 'station', ECON.stationPrice, 'trade', ECON.stationUpkeep)) return false
  p.owner = civ.id
  p.station = true
  p.build = { kind: 'station', level: 1, remaining: ECON.stationBuild, total: ECON.stationBuild }
  return true
}

export function tryProject(civ: Civ, kind: 'port' | 'shipyard'): boolean {
  if (civ.project || civ[kind]) return false
  const price = kind === 'port' ? ECON.portPrice : ECON.shipyardPrice
  if (!buy(civ, kind, price, 'develop')) return false
  const time = kind === 'port' ? ECON.portBuild : ECON.shipyardBuild
  civ.project = { kind, remaining: time, total: time }
  return true
}

export function tryResearch(civ: Civ, branch: ResearchBranch): boolean {
  if (civ.researchJob) return false
  const level = civ.research[branch] + 1
  if (level > 3) return false
  if (!buy(civ, 'research', ECON.researchPrice[level - 1], 'develop')) return false
  civ.researchJob = { branch, level, remaining: ECON.researchTime[level - 1], total: ECON.researchTime[level - 1] }
  return true
}

/** стройки и исследования идут, пока держава не в кризисе */
export function advanceJobs(w: World, civ: Civ): void {
  if (civ.eco.stage === 'crisis' || civ.eco.stage === 'bankrupt') return
  const dt = SIM_DT
  for (const p of planetsOf(w, civ)) {
    if (!p.build) continue
    p.build.remaining -= dt
    if (p.build.remaining > 1e-9) continue
    const b = p.build
    p.build = null
    if (b.kind === 'infra') {
      p.infra = b.level
      pushEvent(w, {
        kind: 'infra',
        pri: 2,
        text: `🏗 ${civ.name} подняло инфраструктуру ${p.name} до ${ROMAN[b.level]}`,
        textMany: (n) => `🏗 ${civ.name} достроило инфраструктуру на ${n} планетах`,
        civs: [civ.id],
        at: { system: p.systemId, planet: p.id },
      })
    } else {
      pushEvent(w, {
        kind: 'station',
        pri: 2,
        text: `🛰 ${civ.name} построило станцию на ${p.name}`,
        textMany: (n) => `🛰 ${civ.name} построило ${n} станций`,
        civs: [civ.id],
        at: { system: p.systemId, planet: p.id },
      })
    }
  }
  if (civ.project) {
    civ.project.remaining -= dt
    if (civ.project.remaining <= 1e-9) {
      const kind = civ.project.kind
      civ.project = null
      civ[kind] = true
      const text = kind === 'port' ? `⚓ ${civ.name} открыло торговый порт` : `🛠 ${civ.name} построило верфь`
      pushEvent(w, { kind, pri: 1, text, civs: [civ.id], at: { system: capitalSystem(w, civ), planet: civ.capital } })
    }
  }
  if (civ.researchJob) {
    civ.researchJob.remaining -= dt
    if (civ.researchJob.remaining <= 1e-9) {
      const { branch, level } = civ.researchJob
      civ.researchJob = null
      civ.research[branch] = level
      pushEvent(w, {
        kind: 'research',
        pri: 1,
        text: `🔬 ${civ.name} открыло ${RESEARCH[branch].label} ${ROMAN[level]}`,
        civs: [civ.id],
        at: { system: capitalSystem(w, civ), planet: civ.capital },
      })
    }
  }
}
