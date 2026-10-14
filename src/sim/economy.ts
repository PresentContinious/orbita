import { ECON, ENVELOPE_SHARES, RESEARCH, SHIP_KINDS, type Envelope, type ShipKind } from './config'
import { capitalSystem, populatedOf } from './query'
import type { Civ, CivEconomy, ExpenseCat, IncomeSource, Planet, Stage, StarSystem, World } from './types'

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
