import { describe, expect, test } from 'vitest'
import { newCombat } from '../../src/sim/classes'
import { WAR } from '../../src/sim/combat-config'
import { buy, earn, ledgerBalance, shipPrice, shipUpkeep, shipUpkeepOf } from '../../src/sim/economy'
import { capitalOf } from '../../src/sim/query'
import { spawnShip } from '../../src/sim/ships'
import type { Ship } from '../../src/sim/types'
import { quietWorld, run } from '../helpers'

function setup() {
  const w = quietWorld(1)
  const civ = w.civs[0]
  const home = capitalOf(w, civ)!
  const base = spawnShip(w, civ, 'caravan', home, { type: 'return', planetId: home.id }, 0)
  const ship = (kind: Ship['kind']): Ship => ({ ...base, kind, combat: kind === 'caravan' ? null : newCombat(kind as never, w.t) })
  return { w, civ, ship }
}

describe('цены и содержание войны', () => {
  test('цена класса из таблицы, верфь −25 %', () => {
    const { civ } = setup()
    expect(shipPrice(civ, 'battleship')).toBe(600)
    expect(shipPrice(civ, 'caravan')).toBe(50)
    civ.shipyard = true
    expect(shipPrice(civ, 'battleship')).toBe(450)
  })

  test('содержание: класс, консервация ×0.3, машины 0, сироты 0.015, носитель +0.01 за машину', () => {
    const { civ, ship } = setup()
    const bb = ship('battleship')
    expect(shipUpkeep(civ, bb)).toBeCloseTo(0.2)
    bb.combat!.mothballed = true
    expect(shipUpkeep(civ, bb)).toBeCloseTo(0.06)
    const craft = ship('bomber')
    craft.combat!.wing = { phase: 'air', since: 0, targetId: null }
    expect(shipUpkeep(civ, craft)).toBe(0)
    craft.combat!.wing.phase = 'orphan'
    expect(shipUpkeep(civ, craft)).toBeCloseTo(WAR.orphanUpkeep)
    const cv = ship('carrier')
    cv.combat!.hangar!.craft = 12
    expect(shipUpkeep(civ, cv)).toBeCloseTo(0.25 + 0.12)
    expect(shipUpkeepOf(civ, 'corvette')).toBeCloseTo(0.03)
    expect(shipUpkeep(civ, ship('caravan'))).toBeCloseTo(0.05)
  })

  test('покупка корабля — через конверт war, лом — доход salvage, журнал сходится', () => {
    const { civ } = setup()
    civ.eco.ledger.start += 2000 - civ.treasury
    civ.treasury = 2000
    civ.eco.grossEma = 1
    civ.eco.envelopes.war = 700
    expect(buy(civ, 'warship', 600, 'war', 0.2)).toBe(true)
    expect(civ.eco.ledger.expense.warship).toBe(600)
    expect(civ.eco.envelopes.war).toBe(100)
    expect(buy(civ, 'fighter', 35, 'war')).toBe(true)
    expect(civ.eco.ledger.expense.fighter).toBe(35)
    expect(buy(civ, 'warship', 600, 'war')).toBe(false)
    earn(civ, 120, 'salvage')
    expect(civ.eco.ledger.income.salvage).toBe(120)
    expect(ledgerBalance(civ)).toBeCloseTo(civ.treasury, 9)
  })

  test('конверт war получает 20 % чистого дохода и не растёт выше лимита', () => {
    const { w, civ } = setup()
    const home = capitalOf(w, civ)!
    home.pop = 20
    civ.treasury = 100_000
    civ.eco.envelopes = { expand: 0, develop: 0, trade: 0, reserve: 0, war: 0 }
    run(w, 10)
    expect(civ.eco.envelopes.war).toBeGreaterThan(0)
    expect(civ.eco.envelopes.war).toBeCloseTo(civ.eco.envelopes.expand * (0.2 / 0.3), 3)
    civ.eco.envelopes.war = 1.5 * WAR.envelopeCap - 1
    run(w, 10)
    expect(civ.eco.envelopes.war).toBeCloseTo(1.5 * WAR.envelopeCap, 6)
  })
})
