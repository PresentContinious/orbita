import { describe, expect, test } from 'vitest'
import { ledgerBalance, report } from '../../src/sim/economy'
import { spawnStressShips } from '../../src/sim/stress'
import { createWorld, stepWorld } from '../../src/sim/world'
import { snapshot } from '../helpers'

describe('долгие прогоны', () => {
  test('одно зерно через 10 минут — одинаковое состояние, разные зёрна — разное', () => {
    const a = createWorld(77)
    const b = createWorld(77)
    const c = createWorld(78)
    for (let i = 0; i < 6000; i++) {
      stepWorld(a)
      stepWorld(b)
      stepWorld(c)
    }
    expect(snapshot(a)).toBe(snapshot(b))
    expect(snapshot(a)).not.toBe(snapshot(c))
  }, 300_000)

  test('3 зерна × 10 минут: журнал сходится, нет NaN, никто не в звезде, журнал событий ≤ 500', () => {
    for (const seed of [1, 2, 3]) {
      const w = createWorld(seed)
      for (let i = 1; i <= 6000; i++) {
        stepWorld(w)
        if (i % 600 === 0) {
          for (const c of w.civs) {
            expect(Number.isFinite(c.treasury)).toBe(true)
            expect(Math.abs(ledgerBalance(c) - c.treasury)).toBeLessThan(1e-6 * Math.max(1, Math.abs(c.treasury)) + 1e-6)
            const r = report(c)
            for (const v of [r.grossPerMin, r.upkeepPerMin, r.netPerMin, r.reserveMin, r.runwaySec]) expect(Number.isNaN(v)).toBe(false)
          }
        }
        if (i % 50 === 0) {
          for (const s of w.ships) {
            if (!s.transit) expect(Math.hypot(s.pos.x, s.pos.y)).toBeGreaterThan(w.galaxy.systems[s.systemId].star.radius)
          }
        }
      }
      expect(w.events.length).toBeLessThanOrEqual(500)
      expect(w.ships.every((s) => s.alive)).toBe(true)
    }
  }, 600_000)

  test('нагрузка: 2000 кораблей, 600 в одной системе, летают и не исчезают', () => {
    const w = createWorld(1)
    const heavy = spawnStressShips(w, 2000, 600)
    for (let i = 0; i < 100; i++) stepWorld(w)
    expect(w.ships.filter((s) => s.mission.type === 'patrol').length).toBe(2000)
    expect(w.ships.filter((s) => s.mission.type === 'patrol' && s.systemId === heavy && !s.transit).length).toBe(600)
  }, 120_000)
})
