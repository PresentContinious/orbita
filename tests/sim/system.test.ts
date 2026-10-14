import { describe, expect, test } from 'vitest'
import { ORBIT, PLANET_KINDS, STAR_TYPES } from '../../src/sim/config'
import { createRng } from '../../src/sim/rng'
import { generateSystem, periodOf, planetPos, planetVel, tempKOf, zoneOf } from '../../src/sim/system'
import type { SystemRole } from '../../src/sim/types'

const ROLES: SystemRole[] = ['inhabited', 'ore', 'pit', 'nebula']

describe('орбиты', () => {
  test('период по Кеплеру: 700 → 120 с, 2800 → 960 с', () => {
    expect(periodOf(700)).toBeCloseTo(120)
    expect(periodOf(2800)).toBeCloseTo(960)
  })

  test('зоны: 900 и 2800 — границы зоны жизни при L=1, при L=4 вдвое дальше', () => {
    expect(zoneOf(899, 1)).toBe('hot')
    expect(zoneOf(900, 1)).toBe('temperate')
    expect(zoneOf(2800, 1)).toBe('temperate')
    expect(zoneOf(2801, 1)).toBe('cold')
    expect(zoneOf(1799, 4)).toBe('hot')
    expect(zoneOf(1800, 4)).toBe('temperate')
  })

  test('температура 288 K на опорной орбите и не ниже 3 K вдали', () => {
    expect(tempKOf(1500, 1)).toBeCloseTo(288)
    expect(tempKOf(1e12, 1)).toBe(3)
  })

  test('позиция — функция времени, через период возвращается', () => {
    const p = { orbit: 1000, period: 200, phase: 0.5 }
    const a = planetPos(p, 0)
    expect(a.x).toBeCloseTo(Math.cos(0.5) * 1000)
    expect(a.y).toBeCloseTo(Math.sin(0.5) * 1000)
    const b = planetPos(p, 200)
    expect(b.x).toBeCloseTo(a.x)
    expect(b.y).toBeCloseTo(a.y)
  })

  test('скорость перпендикулярна радиусу, модуль 2πr/T', () => {
    const p = { orbit: 1000, period: 200, phase: 1 }
    const pos = planetPos(p, 3)
    const v = planetVel(p, 3)
    expect(pos.x * v.x + pos.y * v.y).toBeCloseTo(0, 6)
    expect(Math.hypot(v.x, v.y)).toBeCloseTo((2 * Math.PI * 1000) / 200)
  })
})

describe('generateSystem', () => {
  test('обитаемой системе хватает пригодных планет на всех и ещё на одну', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const sys = generateSystem(createRng(seed), 0, 'inhabited', 3, { x: 0, y: 0 }, new Set())
      expect(sys.planets.filter((p) => p.habitability >= 1).length).toBeGreaterThanOrEqual(4)
    }
  })

  test('орбиты растут с зазором ≥ 350, первая не ближе 6 радиусов звезды', () => {
    for (const role of ROLES) {
      for (let seed = 1; seed <= 15; seed++) {
        const sys = generateSystem(createRng(seed), 1, role, role === 'inhabited' ? 2 : 0, { x: 0, y: 0 }, new Set())
        expect(sys.planets[0].orbit).toBeGreaterThanOrEqual(sys.star.radius * ORBIT.firstMul)
        for (let i = 1; i < sys.planets.length; i++) {
          expect(sys.planets[i].orbit - sys.planets[i - 1].orbit).toBeGreaterThanOrEqual(ORBIT.gapMin - 1)
        }
      }
    }
  })

  test('радиус и пригодность планеты — из таблицы её типа и зоны', () => {
    const sys = generateSystem(createRng(3), 2, 'ore', 0, { x: 0, y: 0 }, new Set())
    for (const p of sys.planets) {
      const k = PLANET_KINDS[p.kind]
      expect(p.radius).toBeGreaterThanOrEqual(k.rMin)
      expect(p.radius).toBeLessThanOrEqual(k.rMax)
      expect(p.habitability).toBe(k.hab[p.zone])
      expect(p.zone).toBe(zoneOf(p.orbit, STAR_TYPES[sys.star.type].lum))
    }
  })

  test('радиус системы — за последней орбитой и поясом с запасом 600', () => {
    for (let seed = 1; seed <= 15; seed++) {
      const sys = generateSystem(createRng(seed), 0, 'pit', 0, { x: 0, y: 0 }, new Set())
      const edge = Math.max(...sys.planets.map((p) => p.orbit), ...sys.belts.map((b) => b.orbit + b.width / 2))
      expect(sys.radius).toBe(Math.round(edge + ORBIT.edgePad))
    }
  })

  test('астероиды лежат в своих поясах, на старте у каждого есть руда', () => {
    const sys = generateSystem(createRng(8), 0, 'ore', 0, { x: 0, y: 0 }, new Set())
    expect(sys.asteroids.length).toBe(sys.asteroidTarget)
    for (const a of sys.asteroids) {
      const belt = sys.belts[a.belt]
      expect(Math.abs(a.orbit - belt.orbit)).toBeLessThanOrEqual(belt.width / 2)
      expect(a.ore).toBeGreaterThan(0)
    }
  })

  test('одно зерно — одна и та же система', () => {
    const a = generateSystem(createRng(77), 0, 'inhabited', 2, { x: 5, y: 6 }, new Set())
    const b = generateSystem(createRng(77), 0, 'inhabited', 2, { x: 5, y: 6 }, new Set())
    expect(JSON.stringify(a)).toBe(JSON.stringify(b))
  })

  test('если пригодных планет не хватает, систему перегенерируют, а не падают', () => {
    // 3 цивилизации требуют 4 пригодных; на 200 зёрнах генерация ни разу не бросает исключение
    for (let seed = 100; seed < 300; seed++) {
      expect(() => generateSystem(createRng(seed), 0, 'inhabited', 3, { x: 0, y: 0 }, new Set())).not.toThrow()
    }
  })
})
