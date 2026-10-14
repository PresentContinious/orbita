import { describe, expect, test } from 'vitest'
import { ledgerBalance, stepEconomy } from '../../src/sim/economy'
import { capOf, capitalOf } from '../../src/sim/query'
import { spawnShip } from '../../src/sim/ships'
import type { Civ, World } from '../../src/sim/types'
import { quietWorld, run } from '../helpers'

/** держава с одной планетой на потолке населения — доход постоянен; астероидов в системе нет */
function steadyCiv(seed = 1): { w: World; civ: Civ; tax: number } {
  const w = quietWorld(seed)
  const civ = w.civs[0]
  const home = capitalOf(w, civ)!
  home.pop = capOf(home, civ)
  const sys = w.galaxy.systems[home.systemId]
  sys.asteroids = []
  sys.asteroidTarget = 0
  return { w, civ, tax: 0.12 * home.pop }
}

/** корабли, которые ничего не зарабатывают: «шахтёры» в системе без астероидов */
function idleShips(w: World, civ: Civ, n: number, kind: 'caravan' | 'colony' = 'caravan') {
  const home = capitalOf(w, civ)!
  const out = []
  for (let i = 0; i < n; i++) {
    const s = spawnShip(w, civ, kind, home, { type: 'mine', phase: 'out', asteroidId: null, cargo: 0, idleT: 0 }, 50)
    out.push(s)
  }
  return out
}

describe('доходы и расходы по шагам', () => {
  test('налог за 10 с = 0.12 · население · 10', () => {
    const { w, civ, tax } = steadyCiv()
    const before = civ.treasury
    run(w, 10)
    expect(civ.treasury - before).toBeCloseTo(tax * 10, 6)
    expect(civ.eco.grossEma).toBeCloseTo(tax, 6)
  })

  test('караван стоит 0.05 кр/с', () => {
    const { w, civ, tax } = steadyCiv()
    idleShips(w, civ, 1)
    const before = civ.treasury
    run(w, 10)
    expect(civ.treasury - before).toBeCloseTo((tax - 0.05) * 10, 6)
  })

  test('станция в рудной системе: +0.5 и −0.05 кр/с', () => {
    const { w, civ, tax } = steadyCiv()
    const ore = w.galaxy.systems.find((s) => s.role === 'ore')!
    const p = ore.planets.find((x) => x.owner === null)!
    p.owner = civ.id
    p.station = true
    const before = civ.treasury
    run(w, 10)
    expect(civ.treasury - before).toBeCloseTo((tax + 0.5 - 0.05) * 10, 6)
  })

  test('журнал сходится с казной', () => {
    const { w, civ } = steadyCiv()
    idleShips(w, civ, 3)
    run(w, 60)
    expect(Math.abs(ledgerBalance(civ) - civ.treasury)).toBeLessThan(1e-9)
  })
})

describe('конверты', () => {
  test('чистый доход раскладывается 35/35/20/10', () => {
    const { w, civ, tax } = steadyCiv()
    civ.eco.envelopes = { expand: 0, develop: 0, trade: 0, reserve: 0 }
    civ.treasury = 10_000
    run(w, 10)
    expect(civ.eco.envelopes.expand).toBeCloseTo(tax * 10 * 0.35, 6)
    expect(civ.eco.envelopes.develop).toBeCloseTo(tax * 10 * 0.35, 6)
    expect(civ.eco.envelopes.trade).toBeCloseTo(tax * 10 * 0.2, 6)
    expect(civ.eco.envelopes.reserve).toBeCloseTo(tax * 10 * 0.1, 6)
  })

  test('без целей для колоний доля расширения идёт в развитие', () => {
    const { w, civ, tax } = steadyCiv()
    for (const s of w.galaxy.systems) for (const p of s.planets) if (p.owner === null && p.habitability > 0) p.owner = 999
    civ.eco.envelopes = { expand: 0, develop: 0, trade: 0, reserve: 0 }
    civ.treasury = 10_000
    run(w, 10)
    expect(civ.eco.envelopes.expand).toBe(0)
    expect(civ.eco.envelopes.develop).toBeCloseTo(tax * 10 * 0.7, 6)
  })

  test('конверт развития не растёт выше 1200, излишек уходит в резерв', () => {
    const { w, civ } = steadyCiv()
    civ.eco.envelopes = { expand: 0, develop: 1199, trade: 0, reserve: 0 }
    civ.treasury = 10_000
    run(w, 10)
    expect(civ.eco.envelopes.develop).toBeCloseTo(1200, 6)
    expect(civ.eco.envelopes.reserve).toBeGreaterThan(0)
  })

  test('сумма конвертов не больше казны', () => {
    const { w, civ } = steadyCiv()
    civ.eco.envelopes = { expand: 100, develop: 100, trade: 100, reserve: 100 }
    civ.treasury = 50
    stepEconomy(w)
    const e = civ.eco.envelopes
    expect(e.expand + e.develop + e.trade + e.reserve).toBeLessThanOrEqual(civ.treasury + 1e-9)
  })
})

describe('долги', () => {
  test('дефицит → кризис → банкротство; списываются корабли, но не колонисты', () => {
    const { w, civ } = steadyCiv()
    const colonists = idleShips(w, civ, 1, 'colony')[0]
    idleShips(w, civ, 100)
    const stages: string[] = []
    for (let i = 0; i < 1500; i++) {
      run(w, 0.1)
      if (stages[stages.length - 1] !== civ.eco.stage) stages.push(civ.eco.stage)
    }
    expect(stages).toEqual(['ok', 'deficit', 'crisis', 'bankrupt'])
    expect(colonists.alive).toBe(true)
    expect(civ.eco.ledger.income.refund).toBeGreaterThan(0)
    expect(w.events.some((e) => e.kind === 'bankrupt' && e.pri === 0)).toBe(true)
    expect(w.events.some((e) => e.kind === 'decommission')).toBe(true)
  })

  test('банкрот без кораблей продаёт станцию, а без станций — ничего не ломается', () => {
    const { w, civ } = steadyCiv()
    const p = w.galaxy.systems.find((s) => s.role === 'pit')!.planets[0]
    p.owner = civ.id
    p.station = true
    civ.treasury = -1e6
    civ.eco.grossEma = 1
    stepEconomy(w)
    expect(civ.eco.stage).toBe('bankrupt')
    expect(p.station).toBe(false)
    expect(p.owner).toBeNull()
    expect(() => run(w, 30)).not.toThrow()
    expect(Number.isFinite(civ.treasury)).toBe(true)
  })

  test('30 с плюса при неотрицательной казне — выход из долгов', () => {
    const { w, civ } = steadyCiv()
    civ.eco.stage = 'deficit'
    civ.eco.deficitSince = 0
    civ.treasury = 10
    run(w, 29)
    expect(civ.eco.stage).toBe('deficit')
    run(w, 2)
    expect(civ.eco.stage).toBe('ok')
    expect(w.events.some((e) => e.kind === 'recovered')).toBe(true)
  })
})
