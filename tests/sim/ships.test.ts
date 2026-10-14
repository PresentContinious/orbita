import { describe, expect, test } from 'vitest'
import { avoidStar, steer } from '../../src/sim/nav'
import { capitalOf } from '../../src/sim/query'
import { spawnShip } from '../../src/sim/ships'
import { stepWorld } from '../../src/sim/world'
import { quietWorld } from '../helpers'

describe('avoidStar', () => {
  test('путь через звезду уводит в обход на 1.2 · 3 радиуса', () => {
    const wp = avoidStar({ x: -1000, y: 10 }, { x: 1000, y: 10 }, 60)
    expect(wp).not.toEqual({ x: 1000, y: 10 })
    expect(Math.hypot(wp.x, wp.y)).toBeCloseTo(216, 6)
  })

  test('путь мимо звезды не меняется', () => {
    expect(avoidStar({ x: -1000, y: 500 }, { x: 1000, y: 500 }, 60)).toEqual({ x: 1000, y: 500 })
  })

  test('корабль внутри опасной зоны выталкивается наружу', () => {
    const wp = avoidStar({ x: 100, y: 0 }, { x: -1000, y: 0 }, 60)
    expect(wp.x).toBeCloseTo(216)
    expect(wp.y).toBeCloseTo(0)
  })

  test('путь точно через центр — обход по перпендикуляру', () => {
    const wp = avoidStar({ x: -1000, y: 0 }, { x: 1000, y: 0 }, 60)
    expect(Math.hypot(wp.x, wp.y)).toBeCloseTo(216)
    expect(Math.abs(wp.x)).toBeLessThan(1e-6)
  })
})

describe('steer', () => {
  test('за шаг 0.1 с при ускорении 40 скорость растёт не больше чем на 4', () => {
    const body = { pos: { x: 0, y: 0 }, vel: { x: 0, y: 0 } }
    steer(body, { x: 1000, y: 0 }, 80, 40, { x: 0, y: 0 }, 0.1)
    expect(Math.hypot(body.vel.x, body.vel.y)).toBeCloseTo(4)
    expect(body.pos.x).toBeCloseTo(0.4)
  })
})

describe('полёты внутри системы', () => {
  test('корабль долетает до любой планеты своей системы и не залетает в звезду', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const w = quietWorld(seed)
      const civ = w.civs[0]
      const home = capitalOf(w, civ)!
      const sys = w.galaxy.systems[home.systemId]
      const n = sys.planets.length
      const target = sys.planets[seed % n] === home ? sys.planets[(seed + 1) % n] : sys.planets[seed % n]
      const ship = spawnShip(w, civ, 'caravan', home, { type: 'return', planetId: target.id }, 50)
      let docked = false
      for (let i = 0; i < 6000 && !docked; i++) {
        stepWorld(w)
        if (!ship.alive) docked = true
        else expect(Math.hypot(ship.pos.x, ship.pos.y)).toBeGreaterThan(sys.star.radius)
      }
      expect(docked).toBe(true)
      expect(w.ships.includes(ship)).toBe(false)
    }
  })

  test('два корабля из одной точки к одной цели расходятся', () => {
    const w = quietWorld(4)
    const civ = w.civs[0]
    const home = capitalOf(w, civ)!
    const sys = w.galaxy.systems[home.systemId]
    const far = sys.planets.reduce((a, b) => (Math.abs(b.orbit - home.orbit) > Math.abs(a.orbit - home.orbit) ? b : a))
    const a = spawnShip(w, civ, 'caravan', home, { type: 'return', planetId: far.id }, 50)
    const b = spawnShip(w, civ, 'caravan', home, { type: 'return', planetId: far.id }, 50)
    b.pos.x = a.pos.x + 1
    b.pos.y = a.pos.y
    b.vel = { ...a.vel }
    for (let i = 0; i < 30; i++) stepWorld(w)
    expect(Math.hypot(a.pos.x - b.pos.x, a.pos.y - b.pos.y)).toBeGreaterThan(4)
  })
})
