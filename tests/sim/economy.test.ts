import { describe, expect, test } from 'vitest'
import {
  adminTotal, buy, canAfford, colonyPrice, earn, ledgerBalance, report, shipPrice, shipUpkeep, spend, stationIncome, taxOf, tradeIncome,
} from '../../src/sim/economy'
import { CIVS } from '../../src/sim/config'
import { capitalOf } from '../../src/sim/query'
import type { Planet, StarSystem } from '../../src/sim/types'
import { quietWorld } from '../helpers'

function freshCiv() {
  const w = quietWorld(1)
  return { w, civ: w.civs[0] }
}

describe('журнал денег', () => {
  test('доходы и расходы меняют казну и пишутся по статьям', () => {
    const { civ } = freshCiv()
    earn(civ, 30, 'tax')
    spend(civ, 20, 'infra')
    expect(civ.treasury).toBe(CIVS.startTreasury + 10)
    expect(civ.eco.ledger.income.tax).toBe(30)
    expect(civ.eco.ledger.expense.infra).toBe(20)
    expect(ledgerBalance(civ)).toBe(CIVS.startTreasury + 10)
  })

  test('отрицательные и NaN-суммы игнорируются', () => {
    const { civ } = freshCiv()
    earn(civ, -5, 'tax')
    earn(civ, Number.NaN, 'tax')
    spend(civ, -5, 'infra')
    expect(civ.treasury).toBe(CIVS.startTreasury)
  })
})

describe('buy', () => {
  test('покупка списывает казну, конверт и пишет расход', () => {
    const { civ } = freshCiv()
    civ.eco.grossEma = 1
    civ.treasury = 200
    civ.eco.envelopes.develop = 150
    expect(buy(civ, 'infra', 120, 'develop')).toBe(true)
    expect(civ.treasury).toBe(80)
    expect(civ.eco.envelopes.develop).toBe(30)
    expect(civ.eco.ledger.expense.infra).toBe(120)
  })

  test('не в нормальной стадии — отказ', () => {
    const { civ } = freshCiv()
    civ.eco.envelopes.develop = 1000
    civ.eco.stage = 'deficit'
    expect(buy(civ, 'infra', 10, 'develop')).toBe(false)
  })

  test('в конверте не хватает — отказ', () => {
    const { civ } = freshCiv()
    civ.eco.envelopes.develop = 50
    expect(buy(civ, 'infra', 60, 'develop')).toBe(false)
  })

  test('после покупки должно остаться полминуты дохода', () => {
    const { civ } = freshCiv()
    civ.eco.grossEma = 1
    civ.treasury = 140
    civ.eco.envelopes.develop = 1000
    expect(canAfford(civ, 120)).toBe(false)
    civ.treasury = 150
    expect(canAfford(civ, 120)).toBe(true)
  })

  test('при минусовом чистом доходе денег должно хватить на 300 с', () => {
    const { civ } = freshCiv()
    civ.eco.grossEma = 1
    civ.eco.upkeepEma = 1.5
    civ.treasury = 200
    expect(canAfford(civ, 120)).toBe(false)
    civ.treasury = 300
    expect(canAfford(civ, 120)).toBe(true)
  })

  test('содержание покупки учитывается в правиле запаса', () => {
    const { civ } = freshCiv()
    civ.eco.grossEma = 1
    civ.eco.upkeepEma = 0.9
    civ.treasury = 160
    expect(canAfford(civ, 120, 0.2)).toBe(true)
    expect(canAfford(civ, 120, 0.3)).toBe(false)
  })
})

describe('report', () => {
  test('без дохода — нули и бесконечный запас, без NaN', () => {
    const { civ } = freshCiv()
    const r = report(civ)
    expect(r.grossPerMin).toBe(0)
    expect(r.reserveMin).toBe(0)
    expect(r.runwaySec).toBe(Infinity)
    expect(Object.values(r).some((v) => typeof v === 'number' && Number.isNaN(v))).toBe(false)
  })

  test('при минусе показывает, на сколько секунд хватит казны с учётом кредитной линии', () => {
    const { civ } = freshCiv()
    civ.eco.grossEma = 1
    civ.eco.upkeepEma = 2
    civ.treasury = 40
    expect(report(civ).runwaySec).toBeCloseTo(100)
  })
})

describe('формулы', () => {
  function ownPlanets(n: number, otherSystem = 0) {
    const { w, civ } = freshCiv()
    const home = capitalOf(w, civ)!
    const sys = w.galaxy.systems[home.systemId]
    const free = sys.planets.filter((p) => p.owner === null)
    const others = w.galaxy.systems.filter((s) => s.id !== sys.id).flatMap((s) => s.planets.filter((p) => p.owner === null))
    const picked: Planet[] = [...free.slice(0, n - 1 - otherSystem), ...others.slice(0, otherSystem)]
    for (const p of picked) {
      p.owner = civ.id
      p.pop = 1
    }
    return { w, civ }
  }

  test('администрация: 3 планеты — 0.30, 5 — 1.00 кр/с', () => {
    const a = ownPlanets(3)
    expect(adminTotal(a.w, a.civ)).toBeCloseTo(0.3)
    const b = ownPlanets(5)
    expect(adminTotal(b.w, b.civ)).toBeCloseTo(1.0)
  })

  test('колония в чужой системе дороже в администрации в 1.5 раза, исследование снижает на 15%', () => {
    const { w, civ } = ownPlanets(3, 1)
    expect(adminTotal(w, civ)).toBeCloseTo(0.15 + 0.15 * 1.5)
    civ.research.admin = 1
    expect(adminTotal(w, civ)).toBeCloseTo((0.15 + 0.15 * 1.5) * 0.85)
  })

  test('цена колонии: 160, в чужую систему ×1.4, с верфью ×0.75, растёт на 50 за планету', () => {
    const { w, civ } = freshCiv()
    const home = capitalOf(w, civ)!
    const near = w.galaxy.systems[home.systemId].planets.find((p) => p.owner === null)!
    const far = w.galaxy.systems.find((s) => s.id !== home.systemId)!.planets[0]
    expect(colonyPrice(w, civ, near)).toBe(160)
    expect(colonyPrice(w, civ, far)).toBeCloseTo(224)
    civ.shipyard = true
    expect(colonyPrice(w, civ, near)).toBeCloseTo(120)
    const b = ownPlanets(3)
    const bHome = capitalOf(b.w, b.civ)!
    const t2 = b.w.galaxy.systems[bHome.systemId].planets.find((p) => p.owner === null)!
    expect(colonyPrice(b.w, b.civ, t2)).toBe(260)
  })

  test('выручка каравана: 6 + 0.6·√(popA·popB), не больше 30, порт ×1.4', () => {
    const { civ } = freshCiv()
    const a = { pop: 9 } as Planet
    const b = { pop: 16 } as Planet
    expect(tradeIncome(civ, a, b)).toBeCloseTo(13.2)
    civ.port = true
    expect(tradeIncome(civ, a, b)).toBeCloseTo(18.48)
    expect(tradeIncome(civ, { pop: 10_000 } as Planet, { pop: 10_000 } as Planet)).toBeCloseTo(42)
  })

  test('содержание и цена кораблей: верфь и логистика', () => {
    const { civ } = freshCiv()
    expect(shipUpkeep(civ, 'caravan')).toBeCloseTo(0.05)
    expect(shipPrice(civ, 'caravan')).toBe(50)
    civ.shipyard = true
    expect(shipUpkeep(civ, 'caravan')).toBeCloseTo(0.035)
    expect(shipPrice(civ, 'miner')).toBeCloseTo(33.75)
    civ.research.logistics = 2
    expect(shipUpkeep(civ, 'caravan')).toBeCloseTo(0.028)
  })

  test('налог: 0.12 за тысячу × (1 + 0.3·инфраструктура), в кризисе ×0.9', () => {
    const { civ } = freshCiv()
    const p = { pop: 10, infra: 2 } as Planet
    expect(taxOf(p, civ)).toBeCloseTo(1.92)
    civ.eco.stage = 'crisis'
    expect(taxOf(p, civ)).toBeCloseTo(1.728)
  })

  test('станция в рудной системе приносит вдвое больше', () => {
    expect(stationIncome({ role: 'ore' } as StarSystem)).toBeCloseTo(0.5)
    expect(stationIncome({ role: 'pit' } as StarSystem)).toBeCloseTo(0.25)
  })
})
