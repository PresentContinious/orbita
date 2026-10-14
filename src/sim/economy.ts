import { ECON, ENVELOPE_SHARES, RESEARCH, SHIP_KINDS, SIM_DT, type Envelope, type ShipKind } from './config'
import { pushEvent } from './events'
import { advanceJobs } from './invest'
import { capitalSystem, civById, colonyTargets, planetsOf, populatedOf } from './query'
import type { Civ, CivEconomy, ExpenseCat, IncomeSource, Planet, Ship, Stage, StarSystem, World } from './types'

export function newEconomy(start: number): CivEconomy {
  return {
    ledger: {
      start,
      income: { tax: 0, trade: 0, tradePartner: 0, mining: 0, station: 0, refund: 0 },
      expense: { colony: 0, caravan: 0, miner: 0, station: 0, infra: 0, port: 0, shipyard: 0, research: 0, upkeep: 0, admin: 0 },
    },
    envelopes: {
      expand: start * ENVELOPE_SHARES.expand,
      develop: start * ENVELOPE_SHARES.develop,
      trade: start * ENVELOPE_SHARES.trade,
      reserve: start * ENVELOPE_SHARES.reserve,
    },
    stage: 'ok',
    grossEma: 0,
    upkeepEma: 0,
    tradeEma: 0,
    earnedStep: 0,
    upkeepStep: 0,
    tradeStep: 0,
    deficitSince: null,
    positiveSince: null,
    lastDecommission: -ECON.bankruptEvery,
  }
}

// ---------- журнал: единственное место, где меняется казна ----------

export function earn(civ: Civ, amount: number, source: IncomeSource): void {
  if (!(amount > 0)) return
  civ.treasury += amount
  civ.eco.ledger.income[source] += amount
  // разовые возвраты (списание, отменённая экспедиция) не считаются доходом в средних
  if (source !== 'refund') civ.eco.earnedStep += amount
  if (source === 'trade') civ.eco.tradeStep += amount
}

export function spend(civ: Civ, amount: number, cat: ExpenseCat): void {
  if (!(amount > 0)) return
  civ.treasury -= amount
  civ.eco.ledger.expense[cat] += amount
  if (cat === 'upkeep' || cat === 'admin') civ.eco.upkeepStep += amount
}

export function ledgerBalance(civ: Civ): number {
  const l = civ.eco.ledger
  let b = l.start
  for (const v of Object.values(l.income)) b += v
  for (const v of Object.values(l.expense)) b -= v
  return b
}

export const creditLine = (civ: Civ): number => civ.eco.grossEma * 60
export const netPerSec = (civ: Civ): number => civ.eco.grossEma - civ.eco.upkeepEma

/** правило запаса: после покупки остаётся ≥ 0.5 мин дохода, а при минусе денег хватает на 300 с */
export function canAfford(civ: Civ, price: number, dUpkeep = 0): boolean {
  const after = civ.treasury - price
  if (after < ECON.reserveMin * civ.eco.grossEma * 60) return false
  const net = netPerSec(civ) - dUpkeep
  if (net < 0 && after / -net < ECON.runwayMin) return false
  return true
}

export function buy(civ: Civ, cat: ExpenseCat, price: number, envelope: Envelope, dUpkeep = 0): boolean {
  if (civ.eco.stage !== 'ok') return false
  if (civ.eco.envelopes[envelope] < price) return false
  if (!canAfford(civ, price, dUpkeep)) return false
  spend(civ, price, cat)
  civ.eco.envelopes[envelope] -= price
  return true
}

export interface EconomyReport {
  grossPerMin: number
  upkeepPerMin: number
  netPerMin: number
  treasury: number
  /** казна в минутах валового дохода */
  reserveMin: number
  /** на сколько секунд хватит казны с кредитной линией; Infinity при плюсе */
  runwaySec: number
  stage: Stage
}

export function report(civ: Civ): EconomyReport {
  const g = civ.eco.grossEma * 60
  const u = civ.eco.upkeepEma * 60
  const n = g - u
  return {
    grossPerMin: g,
    upkeepPerMin: u,
    netPerMin: n,
    treasury: civ.treasury,
    reserveMin: g > 0 ? civ.treasury / g : 0,
    runwaySec: n >= 0 ? Infinity : Math.max(0, (civ.treasury + creditLine(civ)) / (-n / 60)),
    stage: civ.eco.stage,
  }
}

// ---------- формулы ----------

export function shipPrice(civ: Civ, kind: 'caravan' | 'miner'): number {
  const base = kind === 'caravan' ? ECON.caravanPrice : ECON.minerPrice
  return base * (civ.shipyard ? ECON.shipyardPriceMul : 1)
}

export function shipUpkeep(civ: Civ, kind: ShipKind): number {
  return SHIP_KINDS[kind].upkeep * (civ.shipyard ? ECON.shipyardUpkeepMul : 1) * (1 - RESEARCH.logistics.perLevel * civ.research.logistics)
}

export function taxOf(p: Planet, civ: Civ): number {
  const hard = civ.eco.stage === 'crisis' || civ.eco.stage === 'bankrupt'
  return ECON.taxPerPop * p.pop * (1 + ECON.infraTax * p.infra) * (hard ? ECON.crisisTax : 1)
}

export function stationIncome(sys: StarSystem): number {
  return ECON.stationIncome * (sys.role === 'ore' ? ECON.stationOreMul : 1)
}

/** администрация некапитальных населённых планет; extra — «а если колонизировать ещё и эту» */
export function adminTotal(w: World, civ: Civ, extra?: Planet): number {
  const planets = populatedOf(w, civ)
  if (extra) planets.push(extra)
  const n = planets.length
  const capSys = capitalSystem(w, civ)
  let sum = 0
  for (const p of planets) {
    if (p.id === civ.capital) continue
    sum += (ECON.adminBase + ECON.adminPerPlanet * (n - 2)) * (p.systemId !== capSys ? ECON.adminOtherSystem : 1)
  }
  return sum * (1 - RESEARCH.admin.perLevel * civ.research.admin)
}

export function colonyPrice(w: World, civ: Civ, target: Planet): number {
  const n = populatedOf(w, civ).length
  const base = ECON.colonyBase + ECON.colonyPerPlanet * Math.max(0, n - 1)
  const other = target.systemId !== capitalSystem(w, civ)
  return base * (other ? ECON.colonyOtherSystem : 1) * (civ.shipyard ? ECON.shipyardPriceMul : 1)
}

export function tradeIncome(owner: Civ, a: Planet, b: Planet): number {
  const raw = ECON.tradeBase + ECON.tradeK * Math.sqrt(Math.max(0, a.pop) * Math.max(0, b.pop))
  return Math.min(ECON.tradeMax, raw) * (owner.port ? ECON.portTradeMul : 1)
}

// ---------- шаг экономики ----------

const ENVELOPES: Envelope[] = ['expand', 'develop', 'trade', 'reserve']
const BADNESS: Record<Stage, number> = { ok: 0, deficit: 1, crisis: 2, bankrupt: 3 }

export function stepEconomy(w: World): void {
  const dt = SIM_DT
  // доходы планет и станций; торговля и добыча уже пришли от кораблей в прошлом шаге
  for (const sys of w.galaxy.systems) {
    for (const p of sys.planets) {
      if (p.owner === null) continue
      const civ = civById(w, p.owner)
      if (!civ) continue
      if (p.pop > 0) earn(civ, taxOf(p, civ) * dt, 'tax')
      if (p.station) {
        if (!p.build) earn(civ, stationIncome(sys) * dt, 'station')
        spend(civ, ECON.stationUpkeep * dt, 'upkeep')
      }
    }
  }
  for (const ship of w.ships) {
    if (!ship.alive) continue
    const civ = civById(w, ship.owner)
    if (civ) spend(civ, shipUpkeep(civ, ship.kind) * dt, 'upkeep')
  }
  for (const civ of w.civs) {
    spend(civ, adminTotal(w, civ) * dt, 'admin')
    updateEma(civ, dt)
    fillEnvelopes(w, civ)
    updateStage(w, civ)
    advanceJobs(w, civ)
    civ.eco.earnedStep = 0
    civ.eco.upkeepStep = 0
    civ.eco.tradeStep = 0
  }
}

function updateEma(civ: Civ, dt: number): void {
  const e = civ.eco
  const a = dt / ECON.emaWindow
  const gross = e.earnedStep / dt
  const upkeep = e.upkeepStep / dt
  e.grossEma = e.grossEma === 0 ? gross : e.grossEma + a * (gross - e.grossEma)
  e.upkeepEma = e.upkeepEma === 0 ? upkeep : e.upkeepEma + a * (upkeep - e.upkeepEma)
  e.tradeEma += a * (e.tradeStep / dt - e.tradeEma)
}

function maxColonyPrice(w: World, civ: Civ): number {
  const n = populatedOf(w, civ).length
  return (ECON.colonyBase + ECON.colonyPerPlanet * Math.max(0, n - 1)) * ECON.colonyOtherSystem * (civ.shipyard ? ECON.shipyardPriceMul : 1)
}

function fillEnvelopes(w: World, civ: Civ): void {
  const e = civ.eco
  const net = e.earnedStep - e.upkeepStep
  if (net > 0) {
    const hasTargets = colonyTargets(w, civ).length > 0
    const caps: Record<Envelope, number> = {
      expand: ECON.envelopeCapMul * maxColonyPrice(w, civ),
      develop: ECON.envelopeCapMul * Math.max(ECON.researchPrice[2], ECON.infraPrice[2], ECON.portPrice, ECON.shipyardPrice),
      trade: ECON.envelopeCapMul * ECON.stationPrice,
      reserve: Infinity,
    }
    let overflow = 0
    const add = (k: Envelope, v: number) => {
      const put = Math.max(0, Math.min(v, caps[k] - e.envelopes[k]))
      e.envelopes[k] += put
      overflow += v - put
    }
    add('expand', hasTargets ? net * ENVELOPE_SHARES.expand : 0)
    add('develop', net * (ENVELOPE_SHARES.develop + (hasTargets ? 0 : ENVELOPE_SHARES.expand)))
    add('trade', net * ENVELOPE_SHARES.trade)
    add('reserve', net * ENVELOPE_SHARES.reserve)
    // излишек — в развитие, а если и там полно — в резерв
    const spill = overflow
    overflow = 0
    add('develop', spill)
    e.envelopes.reserve += overflow
  }
  const total = ENVELOPES.reduce((s, k) => s + e.envelopes[k], 0)
  if (civ.treasury <= 0) {
    for (const k of ENVELOPES) e.envelopes[k] = 0
  } else if (total > civ.treasury) {
    const k = civ.treasury / total
    for (const key of ENVELOPES) e.envelopes[key] *= k
  }
}

function updateStage(w: World, civ: Civ): void {
  const e = civ.eco
  const line = creditLine(civ)
  const net = e.earnedStep - e.upkeepStep
  const was = e.stage
  if (civ.treasury < 0) {
    e.positiveSince = null
    if (e.deficitSince === null) e.deficitSince = w.t
    // стадии в минусе только ухудшаются: банкрот остаётся банкротом, пока казна не выйдет в плюс
    if (civ.treasury <= -line || e.stage === 'bankrupt') e.stage = 'bankrupt'
    else if (e.stage === 'crisis') e.stage = 'crisis'
    else if (w.t - e.deficitSince > ECON.deficitToCrisis || civ.treasury < ECON.crisisReserve * line) e.stage = 'crisis'
    else e.stage = 'deficit'
  } else if (e.stage !== 'ok') {
    if (net > 0) {
      if (e.positiveSince === null) e.positiveSince = w.t
      if (w.t - e.positiveSince >= ECON.recoverAfter) {
        e.stage = 'ok'
        e.deficitSince = null
        e.positiveSince = null
      }
    } else {
      e.positiveSince = null
    }
  }
  if (e.stage !== was) stageEvent(w, civ, was)
  if (e.stage === 'bankrupt' && w.t - e.lastDecommission >= ECON.bankruptEvery) {
    e.lastDecommission = w.t
    decommission(w, civ)
  }
}

function stageEvent(w: World, civ: Civ, was: Stage): void {
  const now = civ.eco.stage
  const at = { system: capitalSystem(w, civ), planet: civ.capital }
  if (now === 'ok') {
    pushEvent(w, { kind: 'recovered', pri: 1, text: `💰 ${civ.name} выбралось из долгов`, civs: [civ.id], at })
    return
  }
  if (BADNESS[now] <= BADNESS[was]) return
  if (now === 'deficit') pushEvent(w, { kind: 'deficit', pri: 1, text: `💸 ${civ.name} не сводит бюджет`, civs: [civ.id], at })
  if (now === 'crisis') pushEvent(w, { kind: 'crisis', pri: 1, text: `📉 ${civ.name}: финансовый кризис — стройки встали`, civs: [civ.id], at })
  if (now === 'bankrupt') pushEvent(w, { kind: 'bankrupt', pri: 0, text: `🏚 ${civ.name} обанкротилось — корабли идут на слом`, civs: [civ.id], at })
}

/** банкрот списывает самый дорогой в содержании корабль (кроме колонистов), а без кораблей — продаёт станцию */
function decommission(w: World, civ: Civ): void {
  let victim: Ship | null = null
  for (const s of w.ships) {
    if (!s.alive || s.owner !== civ.id || s.kind === 'colony') continue
    if (!victim) {
      victim = s
      continue
    }
    const a = shipUpkeep(civ, s.kind)
    const b = shipUpkeep(civ, victim.kind)
    if (a > b || (a === b && s.id > victim.id)) victim = s
  }
  if (victim) {
    victim.alive = false
    earn(civ, victim.price * ECON.decommissionRefund, 'refund')
    pushEvent(w, {
      kind: 'decommission',
      pri: 2,
      text: `✂️ ${civ.name} списывает корабль за долги`,
      textMany: (n) => `✂️ ${civ.name} списало ${n} кораблей за долги`,
      civs: [civ.id],
      at: { system: victim.systemId },
    })
    return
  }
  const station = planetsOf(w, civ).find((p) => p.station)
  if (!station) return
  station.station = false
  station.owner = null
  station.build = null
  earn(civ, ECON.stationPrice * ECON.decommissionRefund, 'refund')
  pushEvent(w, {
    kind: 'station-sold',
    pri: 2,
    text: `✂️ ${civ.name} продаёт станцию на ${station.name}`,
    textMany: (n) => `✂️ ${civ.name} продало ${n} станций за долги`,
    civs: [civ.id],
    at: { system: station.systemId, planet: station.id },
  })
}
