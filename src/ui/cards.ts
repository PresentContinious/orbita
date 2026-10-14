import type { Pick } from '../render/hit'
import { territoryShares } from '../render/territory'
import { ECON, RESEARCH, RESEARCH_BRANCHES } from '../sim/config'
import { report, stationIncome, taxOf } from '../sim/economy'
import { capOf, civById, planetsOf, populatedOf } from '../sim/query'
import type { Ship, World } from '../sim/types'
import { fmtCredits, fmtDuration, fmtPop, fmtRate, hex, roman } from './format'

export interface CardRow {
  label: string
  value: string
  tone?: 'good' | 'bad' | 'muted'
}

export interface CardData {
  kind: 'planet' | 'system' | 'civ' | 'ship'
  title: string
  subtitle?: string
  color?: string
  rows: CardRow[]
}

const KIND_RU = { rocky: 'каменистая', ice: 'ледяной гигант', gas: 'газовый гигант', dwarf: 'карлик' }
const ZONE_RU = { hot: 'горячая', temperate: 'умеренная', cold: 'холодная' }
const ROLE_RU = { inhabited: 'обитаемая', ore: 'рудная', pit: 'астероидная «Яма»', nebula: 'туманность' }
const STAGE_RU = { ok: 'в норме', deficit: 'дефицит', crisis: 'кризис', bankrupt: 'банкрот' }
const SHIP_RU = { colony: 'Колонисты', caravan: 'Караван', miner: 'Шахтёр' }

export function planetCard(w: World, id: string): CardData | null {
  const p = w.planets.get(id)
  if (!p) return null
  const owner = p.owner === null ? undefined : civById(w, p.owner)
  const t = p.tempK - 273
  const rows: CardRow[] = [
    { label: 'тип', value: `${KIND_RU[p.kind]}, ${ZONE_RU[p.zone]} зона` },
    { label: 'температура', value: `${t > 0 ? '+' : ''}${t} °C` },
  ]
  if (owner && p.pop > 0) {
    rows.push({ label: 'население', value: `${fmtPop(p.pop)} / ${fmtPop(capOf(p, owner))}` })
    rows.push({ label: 'инфраструктура', value: p.infra ? roman(p.infra) : '—' })
    rows.push({ label: 'налог', value: fmtRate(taxOf(p, owner) * 60) })
  } else if (p.station) {
    rows.push({ label: 'станция', value: p.build ? 'строится' : fmtRate(stationIncome(w.galaxy.systems[p.systemId]) * 60) })
  } else if (p.owner === null) {
    rows.push({ label: 'пригодность', value: p.habitability > 0 ? `×${p.habitability}` : 'непригодна', tone: p.habitability >= 1 ? 'good' : 'muted' })
  }
  if (p.build) {
    const what = p.build.kind === 'infra' ? `инфраструктура ${roman(p.build.level)}` : 'станция'
    rows.push({ label: 'стройка', value: `${what} · ${fmtDuration(p.build.remaining)}` })
  }
  const caravans = w.ships.filter((s) => s.alive && s.mission.type === 'trade' && (s.mission.a === id || s.mission.b === id)).length
  if (caravans) rows.push({ label: 'караваны', value: String(caravans) })
  return {
    kind: 'planet',
    title: p.name,
    subtitle: owner ? `${owner.name}${owner.capital === p.id ? ' · столица' : ''}` : 'ничья',
    color: owner ? hex(owner.color) : undefined,
    rows,
  }
}

export function systemCard(w: World, id: number): CardData | null {
  const s = w.galaxy.systems[id]
  if (!s) return null
  const rows: CardRow[] = [{ label: 'планет', value: String(s.planets.length) }]
  for (const sh of territoryShares(w, s)) {
    const c = civById(w, sh.civ)!
    rows.push({ label: c.name, value: `${Math.round(sh.share * 100)}%` })
  }
  const neighbours = s.gates.map((g) => w.galaxy.systems[g.toSystem].name).join(', ')
  rows.push({ label: 'коридоры', value: neighbours || '—' })
  return { kind: 'system', title: s.name, subtitle: `${ROLE_RU[s.role]} · звезда ${s.star.type}`, rows }
}

export function civCard(w: World, id: number): CardData | null {
  const civ = civById(w, id)
  if (!civ) return null
  const r = report(civ)
  const mine = populatedOf(w, civ)
  const stations = planetsOf(w, civ).filter((p) => p.station).length
  const research = RESEARCH_BRANCHES.filter((b) => civ.research[b] > 0).map((b) => `${RESEARCH[b].label} ${roman(civ.research[b])}`)
  const rows: CardRow[] = [
    { label: 'казна', value: fmtCredits(civ.treasury), tone: civ.treasury < 0 ? 'bad' : undefined },
    { label: 'доход', value: fmtRate(r.grossPerMin) },
    { label: 'содержание', value: fmtRate(-r.upkeepPerMin) },
    { label: 'чистый доход', value: fmtRate(r.netPerMin), tone: r.netPerMin >= 0 ? 'good' : 'bad' },
    { label: 'запас', value: fmtDuration(r.runwaySec) },
    { label: 'стадия', value: STAGE_RU[civ.eco.stage], tone: civ.eco.stage === 'ok' ? 'good' : 'bad' },
    { label: 'планет', value: `${mine.length}${stations ? ` + ${stations} станц.` : ''}` },
    { label: 'население', value: fmtPop(mine.reduce((s, p) => s + p.pop, 0)) },
    { label: 'исследования', value: research.length ? research.join(', ') : '—' },
    { label: 'верфь / порт', value: `${civ.shipyard ? 'есть' : 'нет'} / ${civ.port ? 'есть' : 'нет'}` },
  ]
  if (civ.researchJob) rows.push({ label: 'исследует', value: `${RESEARCH[civ.researchJob.branch].label} ${roman(civ.researchJob.level)} · ${fmtDuration(civ.researchJob.remaining)}` })
  if (civ.project) rows.push({ label: 'строит', value: `${civ.project.kind === 'port' ? 'порт' : 'верфь'} · ${fmtDuration(civ.project.remaining)}` })
  return { kind: 'civ', title: civ.name, color: hex(civ.color), rows }
}

export function missionText(w: World, ship: Ship): string {
  if (ship.transit) {
    const to = w.galaxy.systems[ship.transit.to].name
    return `в коридоре → ${to} · ${fmtDuration(ship.transit.duration - ship.transit.elapsed)}`
  }
  const name = (id: string) => w.planets.get(id)?.name ?? '?'
  const m = ship.mission
  switch (m.type) {
    case 'colonize':
      return `везёт колонистов → ${name(m.planetId)}`
    case 'trade':
      return `торгует: ${name(m.a)} ↔ ${name(m.b)}`
    case 'mine':
      if (m.phase === 'back') return `везёт руду домой (+${Math.round(m.cargo * ECON.orePrice)} кр)`
      return m.asteroidId === null && m.idleT > 0 ? 'ждёт руду у планеты' : 'летит к астероиду'
    case 'return':
      return 'возвращается в док'
    case 'patrol':
      return 'патрулирует'
  }
}

export function shipCard(w: World, id: number): CardData | null {
  const ship = w.ships.find((s) => s.id === id)
  if (!ship) return null
  const owner = civById(w, ship.owner)
  const where = ship.transit ? 'в коридоре' : w.galaxy.systems[ship.systemId].name
  return {
    kind: 'ship',
    title: SHIP_RU[ship.kind],
    subtitle: owner?.name,
    color: owner ? hex(owner.color) : undefined,
    rows: [
      { label: 'задача', value: missionText(w, ship) },
      { label: 'где', value: where },
    ],
  }
}

export function cardFor(w: World, pick: Pick | null): CardData | null {
  if (!pick) return null
  if (pick.type === 'planet') return planetCard(w, pick.id)
  if (pick.type === 'system') return systemCard(w, pick.id)
  return shipCard(w, pick.id)
}
