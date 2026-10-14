import { describe, expect, test } from 'vitest'
import { stepAsteroids } from '../../src/sim/belts'
import { capOf, capitalOf } from '../../src/sim/query'
import { hops } from '../../src/sim/routing'
import { spawnShip } from '../../src/sim/ships'
import type { Civ, Planet, Ship, World } from '../../src/sim/types'
import { stepWorld } from '../../src/sim/world'
import { quietWorld, run } from '../helpers'

function until(w: World, cond: () => boolean, maxSeconds: number): boolean {
  for (let i = 0; i < maxSeconds * 10; i++) {
    if (cond()) return true
    stepWorld(w)
  }
  return cond()
}

function colonist(w: World, civ: Civ, target: Planet): Ship {
  const home = capitalOf(w, civ)!
  return spawnShip(w, civ, 'colony', home, { type: 'colonize', planetId: target.id, settlers: 0.5, price: 160 }, 160)
}

describe('колонизация', () => {
  test('колонисты основывают колонию в своей системе: событие P1', () => {
    const w = quietWorld(1)
    const civ = w.civs[0]
    const home = capitalOf(w, civ)!
    const target = w.galaxy.systems[home.systemId].planets.find((p) => p.owner === null && p.habitability > 0)!
    const ship = colonist(w, civ, target)
    expect(until(w, () => !ship.alive, 900)).toBe(true)
    expect(target.owner).toBe(civ.id)
    expect(target.pop).toBeGreaterThanOrEqual(0.5)
    expect(w.events.some((e) => e.kind === 'colony' && e.pri === 1 && e.at.planet === target.id)).toBe(true)
  })

  test('колония в соседней системе — событие P0', () => {
    const w = quietWorld(5)
    const civ = w.civs[0]
    const home = capitalOf(w, civ)!
    const target = w.galaxy.systems
      .filter((s) => hops(w.galaxy, home.systemId, s.id) === 1)
      .flatMap((s) => s.planets)
      .find((p) => p.owner === null && p.habitability > 0)!
    const ship = colonist(w, civ, target)
    expect(until(w, () => !ship.alive, 1500)).toBe(true)
    expect(target.owner).toBe(civ.id)
    expect(w.events.some((e) => e.kind === 'colony' && e.pri === 0)).toBe(true)
  })

  test('цель заняли — колонисты летят к другой', () => {
    const w = quietWorld(3)
    const civ = w.civs[0]
    const home = capitalOf(w, civ)!
    const target = w.galaxy.systems[home.systemId].planets.find((p) => p.owner === null && p.habitability > 0)!
    const ship = colonist(w, civ, target)
    target.owner = w.civs[1].id
    target.pop = 1
    stepWorld(w)
    expect(ship.alive).toBe(true)
    expect(ship.mission.type).toBe('colonize')
    expect((ship.mission as { planetId: string }).planetId).not.toBe(target.id)
  })

  test('цель заняли, пока колонист в пути, — перенацеливается на свободную планету текущей системы', () => {
    const w = quietWorld(5)
    const civ = w.civs[0]
    const home = capitalOf(w, civ)!
    const target = w.galaxy.systems
      .filter((s) => hops(w.galaxy, home.systemId, s.id) === 1)
      .flatMap((s) => s.planets)
      .find((p) => p.owner === null && p.habitability > 0)!
    const local = w.galaxy.systems[home.systemId].planets.filter((p) => p.owner === null && p.habitability > 0)
    expect(local.length).toBeGreaterThan(0)
    const ship = colonist(w, civ, target)
    stepWorld(w)
    expect(ship.route.length).toBeGreaterThan(0)
    target.owner = w.civs[1].id
    target.pop = 1
    stepWorld(w)
    const m = ship.mission as { planetId: string }
    expect(m.planetId).not.toBe(target.id)
    expect(local.map((p) => p.id)).toContain(m.planetId)
    expect(ship.route).toEqual([])
  })

  test('лететь больше некуда — половина цены возвращается, корабль идёт домой', () => {
    const w = quietWorld(4)
    const civ = w.civs[0]
    const home = capitalOf(w, civ)!
    const target = w.galaxy.systems[home.systemId].planets.find((p) => p.owner === null && p.habitability > 0)!
    const ship = colonist(w, civ, target)
    for (const s of w.galaxy.systems) for (const p of s.planets) if (p.owner === null && p.habitability > 0) p.owner = 999
    const before = civ.eco.ledger.income.refund
    stepWorld(w)
    expect(civ.eco.ledger.income.refund - before).toBeCloseTo(80)
    expect(ship.mission.type).toBe('return')
  })
})

describe('добыча', () => {
  test('шахтёр привозит 20 руды = 16 кр, астероид беднеет на 20', () => {
    const w = quietWorld(5)
    const civ = w.civs[0]
    const home = capitalOf(w, civ)!
    const sys = w.galaxy.systems[home.systemId]
    const oreBefore = sys.asteroids.reduce((s, a) => s + a.ore, 0)
    spawnShip(w, civ, 'miner', home, { type: 'mine', phase: 'out', asteroidId: null, cargo: 0, idleT: 0 }, 45)
    expect(until(w, () => civ.eco.ledger.income.mining > 0, 900)).toBe(true)
    expect(civ.eco.ledger.income.mining).toBeCloseTo(16)
    expect(oreBefore - sys.asteroids.reduce((s, a) => s + a.ore, 0)).toBeCloseTo(20)
  })

  test('без астероидов шахтёр ждёт у планеты, а не исчезает', () => {
    const w = quietWorld(5)
    const civ = w.civs[0]
    const home = capitalOf(w, civ)!
    const sys = w.galaxy.systems[home.systemId]
    sys.asteroids = []
    sys.asteroidTarget = 0
    const ship = spawnShip(w, civ, 'miner', home, { type: 'mine', phase: 'out', asteroidId: null, cargo: 0, idleT: 0 }, 45)
    run(w, 60)
    expect(ship.alive).toBe(true)
    expect((ship.mission as { idleT: number }).idleT).toBeGreaterThan(50)
  })

  test('выработанные астероиды отрастают по одному раз в 30 с', () => {
    const w = quietWorld(6)
    const sys = w.galaxy.systems[0]
    const full = sys.asteroids.length
    sys.asteroids.splice(0, 3)
    for (let i = 0; i < 300; i++) {
      w.t += 0.1
      stepAsteroids(w)
    }
    expect(sys.asteroids.length).toBe(full - 2)
    for (let i = 0; i < 600; i++) {
      w.t += 0.1
      stepAsteroids(w)
    }
    expect(sys.asteroids.length).toBe(full)
  })
})

describe('торговля', () => {
  function tradeSetup(seed: number, partnerCiv: boolean) {
    const w = quietWorld(seed)
    const civ = w.civs[0]
    const a = capitalOf(w, civ)!
    a.pop = capOf(a, civ)
    let b: Planet
    if (partnerCiv) {
      const other = w.civs.find((c) => c.id !== civ.id && w.planets.get(c.capital)!.systemId === a.systemId) ?? w.civs[1]
      b = capitalOf(w, other)!
      b.pop = capOf(b, other)
    } else {
      b = w.galaxy.systems[a.systemId].planets.find((p) => p.owner === null && p.habitability >= 1)!
      b.owner = civ.id
      b.pop = capOf(b, civ)
    }
    const ship = spawnShip(w, civ, 'caravan', a, { type: 'trade', a: a.id, b: b.id, leg: 0 }, 50)
    return { w, civ, a, b, ship }
  }

  test('доставка приносит 6 + 0.6·√(popA·popB) и рисует «+N»', () => {
    const { w, civ, a, b } = tradeSetup(7, false)
    const expected = Math.min(30, 6 + 0.6 * Math.sqrt(a.pop * b.pop))
    expect(until(w, () => civ.eco.ledger.income.trade > 0, 900)).toBe(true)
    expect(civ.eco.ledger.income.trade).toBeCloseTo(expected, 3)
    expect(w.fx.some((f) => f.kind === 'income' && Math.abs(f.amount - expected) < 1e-3)).toBe(true)
  })

  test('партнёр-держава получает половину выручки', () => {
    const { w, civ, b } = tradeSetup(8, true)
    expect(until(w, () => civ.eco.ledger.income.trade > 0, 1500)).toBe(true)
    const partner = w.civs.find((c) => c.id === b.owner)!
    expect(partner.eco.ledger.income.tradePartner).toBeCloseTo(civ.eco.ledger.income.trade * 0.5, 6)
    expect(w.civs.filter((c) => c.eco.ledger.income.tradePartner > 0).length).toBe(1)
  })

  test('подсказки «+N кр» живут не дольше 5 с', () => {
    const { w, civ } = tradeSetup(7, false)
    until(w, () => civ.eco.ledger.income.trade > 0, 900)
    run(w, 6)
    expect(w.fx.every((f) => w.t - f.t <= 5)).toBe(true)
  })
})
