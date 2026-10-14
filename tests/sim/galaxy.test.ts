import { describe, expect, test } from 'vitest'
import { GALAXY, ORBIT } from '../../src/sim/config'
import { assignRoles, buildCorridorEdges, generateGalaxy, isConnected } from '../../src/sim/galaxy'
import { createRng } from '../../src/sim/rng'

describe('buildCorridorEdges', () => {
  test('квадрат: четыре стороны без диагоналей', () => {
    const pts = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }]
    const edges = buildCorridorEdges(pts).map(([a, b]) => `${a}-${b}`).sort()
    expect(edges).toEqual(['0-1', '0-3', '1-2', '2-3'])
  })

  test('точки на одной прямой: цепочка, без лишних рёбер', () => {
    const pts = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }]
    expect(buildCorridorEdges(pts).map(([a, b]) => `${a}-${b}`).sort()).toEqual(['0-1', '1-2'])
  })
})

describe('assignRoles', () => {
  test('цепочка из 5: обитаемые 0, 2, 4 — максимально далеко друг от друга', () => {
    const edges: [number, number][] = [[0, 1], [1, 2], [2, 3], [3, 4]]
    const roles = assignRoles(createRng(1), 5, edges)
    expect(roles[0]).toBe('inhabited')
    expect(roles[2]).toBe('inhabited')
    expect(roles[4]).toBe('inhabited')
    expect([roles[1], roles[3]].sort()).toEqual(['ore', 'pit'])
  })
})

describe('generateGalaxy на 50 зёрнах', () => {
  const galaxies = Array.from({ length: 50 }, (_, i) => generateGalaxy(createRng(1000 + i)))

  test('5–7 систем, центры не ближе 22 000', () => {
    for (const g of galaxies) {
      expect(g.systems.length).toBeGreaterThanOrEqual(5)
      expect(g.systems.length).toBeLessThanOrEqual(7)
      for (const a of g.systems) for (const b of g.systems) {
        if (a.id < b.id) expect(Math.hypot(a.pos.x - b.pos.x, a.pos.y - b.pos.y)).toBeGreaterThanOrEqual(GALAXY.minDist)
      }
    }
  })

  test('граф коридоров связный, степень ≤ 4', () => {
    for (const g of galaxies) {
      const edges = g.corridors.map((c) => [c.a, c.b] as [number, number])
      expect(isConnected(g.systems.length, edges)).toBe(true)
      for (const s of g.systems) expect(s.gates.length).toBeLessThanOrEqual(GALAXY.maxDegree)
    }
  })

  test('роли: одна рудная, одна «Яма», 3 обитаемые при 5 системах, иначе 4', () => {
    for (const g of galaxies) {
      const count = (r: string) => g.systems.filter((s) => s.role === r).length
      expect(count('ore')).toBe(1)
      expect(count('pit')).toBe(1)
      expect(count('inhabited')).toBe(g.systems.length === 5 ? 3 : 4)
      expect(count('nebula')).toBe(g.systems.length === 7 ? 1 : 0)
    }
  })

  test('мест для цивилизаций 8–10, по 2–3 на обитаемую систему', () => {
    for (const g of galaxies) {
      const slots = g.systems.filter((s) => s.role === 'inhabited').map((s) => s.civSlots)
      for (const n of slots) expect(n === 2 || n === 3).toBe(true)
      const total = slots.reduce((a, b) => a + b, 0)
      expect(total).toBeGreaterThanOrEqual(8)
      expect(total).toBeLessThanOrEqual(10)
    }
  })

  test('транзит 60–120 с; самый короткий коридор — 60, самый длинный — 120', () => {
    for (const g of galaxies) {
      const ts = g.corridors.map((c) => c.transit)
      for (const t of ts) {
        expect(t).toBeGreaterThanOrEqual(GALAXY.transitMin - 1e-9)
        expect(t).toBeLessThanOrEqual(GALAXY.transitMax + 1e-9)
      }
      const shortest = g.corridors.reduce((a, b) => (b.length < a.length ? b : a))
      const longest = g.corridors.reduce((a, b) => (b.length > a.length ? b : a))
      if (shortest !== longest) {
        expect(shortest.transit).toBeCloseTo(60)
        expect(longest.transit).toBeCloseTo(120)
      }
    }
  })

  test('врата на краю системы, смотрят на соседа', () => {
    for (const g of galaxies) {
      for (const s of g.systems) {
        for (const gate of s.gates) {
          const to = g.systems[gate.toSystem]
          expect(Math.hypot(gate.pos.x, gate.pos.y)).toBeCloseTo(s.radius + ORBIT.gatePad, 3)
          const dx = to.pos.x - s.pos.x
          const dy = to.pos.y - s.pos.y
          const cos = (gate.pos.x * dx + gate.pos.y * dy) / (Math.hypot(gate.pos.x, gate.pos.y) * Math.hypot(dx, dy))
          expect(cos).toBeGreaterThan(0.999)
        }
      }
    }
  })

  test('одно зерно — одна галактика', () => {
    expect(JSON.stringify(generateGalaxy(createRng(5)))).toBe(JSON.stringify(generateGalaxy(createRng(5))))
  })
})

describe('generateGalaxy: свойства по зёрнам', () => {
  test('seed 1..200: есть петля, степень ≤ 4, граф связный', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const g = generateGalaxy(createRng(seed))
      expect(g.corridors.length, `seed ${seed}`).toBeGreaterThanOrEqual(g.systems.length)
      for (const s of g.systems) expect(s.gates.length, `seed ${seed}`).toBeLessThanOrEqual(4)
      expect(isConnected(g.systems.length, g.corridors.map((c) => [c.a, c.b] as [number, number]))).toBe(true)
    }
  })

  test('seed 1..400: шестёрок больше, чем пятёрок и семёрок по отдельности', () => {
    const cnt: Record<number, number> = { 5: 0, 6: 0, 7: 0 }
    for (let seed = 1; seed <= 400; seed++) cnt[generateGalaxy(createRng(seed)).systems.length]++
    expect(cnt[6]).toBeGreaterThan(cnt[5])
    expect(cnt[6]).toBeGreaterThan(cnt[7])
  })
})
