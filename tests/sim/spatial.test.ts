import { describe, expect, test } from 'vitest'
import { createRng } from '../../src/sim/rng'
import { SpatialGrid } from '../../src/sim/spatial'

describe('SpatialGrid', () => {
  const rng = createRng(11)
  const pts = Array.from({ length: 300 }, () => ({ x: rng.float(-2000, 2000), y: rng.float(-2000, 2000) }))

  test('все точки в радиусе попадают в кандидаты, далёкие — нет', () => {
    const g = new SpatialGrid(50)
    pts.forEach((p, i) => g.insert(i, p.x, p.y))
    const out: number[] = []
    for (let q = 0; q < 20; q++) {
      const c = pts[q * 7]
      const r = 120
      const got = new Set(g.query(c.x, c.y, r, out))
      pts.forEach((p, i) => {
        const d = Math.hypot(p.x - c.x, p.y - c.y)
        if (d <= r) expect(got.has(i)).toBe(true)
        if (d > r + 2 * 50 * Math.SQRT2) expect(got.has(i)).toBe(false)
      })
    }
  })

  test('отрицательные координаты попадают в свои клетки', () => {
    const g = new SpatialGrid(50)
    g.insert(1, -10, -10)
    g.insert(2, 10, 10)
    expect(g.query(-10, -10, 5, []).sort()).toEqual([1])
    expect(g.query(-500, -500, 5, [])).toEqual([])
  })

  test('clear очищает сетку, повторное заполнение работает', () => {
    const g = new SpatialGrid(50)
    g.insert(1, 0, 0)
    g.clear()
    expect(g.query(0, 0, 10, [])).toEqual([])
    g.insert(3, 0, 0)
    expect(g.query(0, 0, 10, [])).toEqual([3])
  })
})
