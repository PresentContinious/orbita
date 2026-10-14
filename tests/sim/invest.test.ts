import { describe, expect, test } from 'vitest'
import { shipPrice, shipUpkeep, taxOf } from '../../src/sim/economy'
import { tryInfra, tryProject, tryResearch, tryStation } from '../../src/sim/invest'
import { capOf, capitalOf } from '../../src/sim/query'
import type { Civ, World } from '../../src/sim/types'
import { quietWorld, run } from '../helpers'

function rich(seed = 1): { w: World; civ: Civ } {
  const w = quietWorld(seed)
  const civ = w.civs[0]
  civ.treasury = 10_000
  civ.eco.envelopes = { expand: 5000, develop: 5000, trade: 5000, reserve: 0 }
  return { w, civ }
}

describe('инфраструктура', () => {
  test('уровень I строится 40 с, даёт +30% налога и +10% потолка', () => {
    const { w, civ } = rich()
    const home = capitalOf(w, civ)!
    const cap0 = capOf(home, civ)
    expect(tryInfra(civ, home)).toBe(true)
    expect(civ.eco.ledger.expense.infra).toBe(120)
    run(w, 39.9)
    expect(home.infra).toBe(0)
    run(w, 0.2)
    expect(home.infra).toBe(1)
    expect(home.build).toBeNull()
    expect(capOf(home, civ)).toBeCloseTo(cap0 * 1.1)
    expect(taxOf(home, civ)).toBeCloseTo(0.12 * home.pop * 1.3)
  })

  test('нельзя: чужая планета, идёт стройка, уже уровень III', () => {
    const { w, civ } = rich()
    const home = capitalOf(w, civ)!
    const other = w.planets.get(w.civs[1].capital)!
    expect(tryInfra(civ, other)).toBe(false)
    expect(tryInfra(civ, home)).toBe(true)
    expect(tryInfra(civ, home)).toBe(false)
    home.build = null
    home.infra = 3
    expect(tryInfra(civ, home)).toBe(false)
  })
})

describe('станции', () => {
  test('на непригодной свободной планете; доход после 40 с стройки', () => {
    const { w, civ } = rich()
    const p = w.galaxy.systems.find((s) => s.role === 'pit')!.planets.find((x) => x.habitability < 0.5)!
    expect(tryStation(civ, p)).toBe(true)
    expect(p.owner).toBe(civ.id)
    expect(p.station).toBe(true)
    // стройка завершается в конце 400-го шага, доход — со следующего
    run(w, 40)
    expect(p.build).toBeNull()
    expect(civ.eco.ledger.income.station).toBe(0)
    run(w, 1)
    expect(civ.eco.ledger.income.station).toBeGreaterThan(0)
  })

  test('на пригодной или занятой — нельзя', () => {
    const { w, civ } = rich()
    const good = w.galaxy.systems.flatMap((s) => s.planets).find((p) => p.owner === null && p.habitability >= 0.5)!
    expect(tryStation(civ, good)).toBe(false)
    expect(tryStation(civ, w.planets.get(w.civs[1].capital)!)).toBe(false)
  })
})

describe('порт и верфь', () => {
  test('верфь за 80 с: корабли дешевле на 25%, содержание −30%', () => {
    const { w, civ } = rich()
    expect(tryProject(civ, 'shipyard')).toBe(true)
    expect(tryProject(civ, 'port')).toBe(false)
    run(w, 80.1)
    expect(civ.shipyard).toBe(true)
    expect(civ.project).toBeNull()
    expect(shipPrice(civ, 'caravan')).toBeCloseTo(37.5)
    expect(shipUpkeep(civ, 'caravan')).toBeCloseTo(0.035)
    expect(w.events.some((e) => e.kind === 'shipyard' && e.pri === 1)).toBe(true)
    expect(tryProject(civ, 'shipyard')).toBe(false)
  })
})

describe('исследования', () => {
  test('Логистика I за 90 с, II за 120 с; третий уровень — последний', () => {
    const { w, civ } = rich()
    expect(tryResearch(civ, 'logistics')).toBe(true)
    expect(tryResearch(civ, 'admin')).toBe(false)
    run(w, 90.1)
    expect(civ.research.logistics).toBe(1)
    expect(w.events.some((e) => e.kind === 'research' && e.text.includes('Логистика I'))).toBe(true)
    expect(tryResearch(civ, 'logistics')).toBe(true)
    expect(civ.eco.ledger.expense.research).toBe(300 + 500)
    civ.researchJob = null
    civ.research.logistics = 3
    expect(tryResearch(civ, 'logistics')).toBe(false)
  })
})

describe('кризис', () => {
  test('в кризисе стройки стоят', () => {
    const { w, civ } = rich()
    const home = capitalOf(w, civ)!
    tryInfra(civ, home)
    const left = home.build!.remaining
    civ.eco.stage = 'crisis'
    civ.treasury = -1
    civ.eco.deficitSince = w.t
    run(w, 5)
    expect(home.build!.remaining).toBeCloseTo(left)
  })
})
