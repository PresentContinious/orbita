import { describe, expect, it } from 'vitest'
import { civShare, liveShips, stepUnitCap, trafficAllowed } from '../../src/sim/cap'
import { ledgerBalance } from '../../src/sim/economy'
import { listOptions } from '../../src/sim/options'
import { spawnShip } from '../../src/sim/ships'
import { spawnStressShips } from '../../src/sim/stress'
import { createWorld } from '../../src/sim/world'
import { quietWorld, run, snapshot } from '../helpers'

function addTraffic(w: ReturnType<typeof createWorld>, civIdx: number, n: number, kind: 'caravan' | 'miner' = 'caravan') {
  const civ = w.civs[civIdx]
  const home = w.planets.get(civ.capital)!
  for (let i = 0; i < n; i++) spawnShip(w, civ, kind, home, { type: 'patrol', a: home.id, b: home.id, leg: 0 }, 100)
}

describe('лимит юнитов', () => {
  it('лимит 2000 по умолчанию ничего не меняет в обычной игре за 30 минут', () => {
    const a = createWorld(11)
    const b = createWorld(11)
    b.unitCap = Infinity
    run(a, 1800)
    run(b, 1800)
    expect(snapshot(a)).toBe(snapshot(b))
  })

  it('стресс 2000 кораблей, лимит 500 — через 20 с живых ≤ 500, колонисты целы', () => {
    const w = createWorld(5)
    spawnStressShips(w, 2000, 600)
    const civ = w.civs[0]
    const home = w.planets.get(civ.capital)!
    for (let i = 0; i < 3; i++) spawnShip(w, civ, 'colony', home, { type: 'patrol', a: home.id, b: home.id, leg: 0 }, 50)
    w.unitCap = 500
    for (const c of w.civs) c.nextDecision = Infinity
    run(w, 20)
    expect(liveShips(w)).toBeLessThanOrEqual(500)
    expect(w.ships.filter((s) => s.alive && s.kind === 'colony').length).toBe(3)
  })

  it('списание возвращает 25 % цены через earn, журнал сходится', () => {
    const w = quietWorld(3)
    addTraffic(w, 0, 30)
    w.unitCap = 10
    const civ = w.civs[0]
    const before = civ.eco.ledger.income.refund
    w.tick = 10
    stepUnitCap(w)
    const retired = w.ships.filter((s) => !s.alive).length
    expect(retired).toBe(20)
    expect(civ.eco.ledger.income.refund - before).toBeCloseTo(retired * 25)
    expect(Math.abs(ledgerBalance(civ) - civ.treasury)).toBeLessThan(1e-6)
  })

  it('над лимитом держава не покупает караван и шахтёра; под лимитом — покупает', () => {
    const w = createWorld(8)
    const civ = w.civs[0]
    const kinds = () => listOptions(w, civ).map((o) => o.kind)
    w.unitCap = 2000
    run(w, 400)
    w.unitCap = 0
    expect(trafficAllowed(w, civ)).toBe(false)
    expect(kinds()).not.toContain('caravan')
    expect(kinds()).not.toContain('miner')
    w.unitCap = 100000
    expect(trafficAllowed(w, civ)).toBe(true)
  })

  it('доля державы: при 10 державах и лимите 50 у державы не больше 5 караванов + шахтёров', () => {
    const w = createWorld(2, { systems: 8, civs: 10, perSystem: 3 })
    expect(w.civs.length).toBe(10)
    w.unitCap = 50
    expect(civShare(w)).toBe(5)
    run(w, 900)
    for (const c of w.civs) {
      const n = w.ships.filter((s) => s.alive && s.owner === c.id && (s.kind === 'caravan' || s.kind === 'miner')).length
      expect(n).toBeLessThanOrEqual(5)
    }
  })

  it('лимит подняли обратно — списание прекращается, покупки возобновляются', () => {
    const w = quietWorld(3)
    addTraffic(w, 0, 60)
    w.unitCap = 10
    run(w, 1)
    const afterOne = liveShips(w)
    expect(afterOne).toBeLessThan(60)
    w.unitCap = 5000
    run(w, 5)
    expect(liveShips(w)).toBe(afterOne)
    expect(trafficAllowed(w, w.civs[0])).toBe(true)
  })

  it('детерминизм: два мира, одна последовательность смен лимита — одинаковый snapshot', () => {
    const mk = () => {
      const w = createWorld(6)
      for (const cap of [30, 500, 20, 2000]) {
        w.unitCap = cap
        run(w, 120)
      }
      return snapshot(w)
    }
    expect(mk()).toBe(mk())
  })
})
