import { describe, expect, test } from 'vitest'
import { advanceTransit, setDestination, transitDuration } from '../../src/sim/nav'
import { capitalOf } from '../../src/sim/query'
import { findPath, gateTo, hops, transitGalaxyPos } from '../../src/sim/routing'
import { spawnShip } from '../../src/sim/ships'
import type { Galaxy, StarSystem } from '../../src/sim/types'
import { stepWorld } from '../../src/sim/world'
import { quietWorld } from '../helpers'

function sys(id: number, x: number): StarSystem {
  return { id, pos: { x, y: 0 }, gates: [], radius: 100 } as unknown as StarSystem
}

// 0 —60— 1 —60— 2 —60— 3, напрямую 0 —200— 2; система 4 ни с кем не связана
const g: Galaxy = {
  systems: [sys(0, 0), sys(1, 1000), sys(2, 2000), sys(3, 3000), sys(4, 9000)],
  corridors: [
    { id: 0, a: 0, b: 1, length: 1, transit: 60 },
    { id: 1, a: 1, b: 2, length: 1, transit: 60 },
    { id: 2, a: 0, b: 2, length: 1, transit: 200 },
    { id: 3, a: 2, b: 3, length: 1, transit: 60 },
  ],
}

describe('findPath и hops', () => {
  test('выбирает быстрый путь через 1, а не прямой длинный коридор', () => {
    expect(findPath(g, 0, 3)).toEqual([1, 2, 3])
  })
  test('в ту же систему — пустой путь; в несвязанную — null', () => {
    expect(findPath(g, 2, 2)).toEqual([])
    expect(findPath(g, 0, 4)).toBeNull()
  })
  test('hops считает коридоры, а не время', () => {
    expect(hops(g, 0, 3)).toBe(2)
    expect(hops(g, 0, 4)).toBe(Infinity)
  })
})

describe('транзит', () => {
  test('позиция в коридоре: от врат до врат', () => {
    const A = sys(0, 0)
    const B = sys(1, 1000)
    A.gates.push({ corridorId: 0, toSystem: 1, pos: { x: 300, y: 0 } })
    B.gates.push({ corridorId: 0, toSystem: 0, pos: { x: -300, y: 0 } })
    const gal: Galaxy = { systems: [A, B], corridors: [{ id: 0, a: 0, b: 1, length: 400, transit: 80 }] }
    expect(transitGalaxyPos(gal, { corridorId: 0, from: 0, to: 1, elapsed: 0, duration: 80 })).toEqual({ x: 300, y: 0 })
    expect(transitGalaxyPos(gal, { corridorId: 0, from: 0, to: 1, elapsed: 40, duration: 80 })).toEqual({ x: 500, y: 0 })
    expect(transitGalaxyPos(gal, { corridorId: 0, from: 0, to: 1, elapsed: 80, duration: 80 })).toEqual({ x: 700, y: 0 })
  })

  test('Двигатели сокращают транзит на 15% за уровень', () => {
    const w = quietWorld(1)
    const civ = w.civs[0]
    const ship = spawnShip(w, civ, 'caravan', capitalOf(w, civ)!, { type: 'return', planetId: civ.capital }, 50)
    expect(transitDuration(w, ship, 100)).toBeCloseTo(100)
    civ.research.engines = 2
    expect(transitDuration(w, ship, 100)).toBeCloseTo(70)
  })

  test('по окончании транзита корабль выходит из ответных врат в новой системе', () => {
    const w = quietWorld(2)
    const civ = w.civs[0]
    const home = capitalOf(w, civ)!
    const from = w.galaxy.systems[home.systemId]
    const gate = from.gates[0]
    const ship = spawnShip(w, civ, 'caravan', home, { type: 'return', planetId: home.id }, 50)
    ship.route = [gate.toSystem]
    ship.transit = { corridorId: gate.corridorId, from: from.id, to: gate.toSystem, elapsed: 0, duration: 0.25 }
    for (let i = 0; i < 3; i++) advanceTransit(w, ship)
    const back = gateTo(w.galaxy.systems[gate.toSystem], from.id)!
    expect(ship.transit).toBeNull()
    expect(ship.systemId).toBe(gate.toSystem)
    expect(ship.route).toEqual([])
    expect(ship.pos.x).toBeCloseTo(back.pos.x * 0.97)
    expect(ship.pos.y).toBeCloseTo(back.pos.y * 0.97)
  })
})

describe('перелёт через два коридора', () => {
  test('корабль долетает до планеты в системе через 2 коридора, проходя каждый коридор маршрута', () => {
    // первое зерно, где у столицы первой державы есть система в двух коридорах
    let w = quietWorld(9)
    for (let seed = 9; seed < 60; seed++) {
      w = quietWorld(seed)
      const h = capitalOf(w, w.civs[0])!.systemId
      if (w.galaxy.systems.some((s) => hops(w.galaxy, h, s.id) === 2)) break
    }
    const civ = w.civs[0]
    const home = capitalOf(w, civ)!
    const dest = w.galaxy.systems.find((s) => hops(w.galaxy, home.systemId, s.id) === 2)!
    const target = dest.planets[0]
    const ship = spawnShip(w, civ, 'caravan', home, { type: 'return', planetId: target.id }, 50)
    setDestination(w, ship, dest.id)
    const corridors = ship.route.length
    let transits = 0
    let inTransit = false
    for (let i = 0; i < 20_000 && ship.alive; i++) {
      stepWorld(w)
      if (ship.transit && !inTransit) transits++
      inTransit = !!ship.transit
      if (!ship.transit && ship.alive) {
        const s = w.galaxy.systems[ship.systemId]
        expect(Math.hypot(ship.pos.x, ship.pos.y)).toBeGreaterThan(s.star.radius)
      }
    }
    expect(ship.alive).toBe(false)
    expect(corridors).toBeGreaterThanOrEqual(2)
    expect(transits).toBe(corridors)
  })
})
