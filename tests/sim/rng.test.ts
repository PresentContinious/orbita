import { describe, expect, test } from 'vitest'
import { createRng, hashString } from '../../src/sim/rng'

describe('rng', () => {
  test('одно зерно — одна и та же последовательность', () => {
    const a = createRng(4815)
    const b = createRng(4815)
    const xs = Array.from({ length: 5 }, () => a.next())
    const ys = Array.from({ length: 5 }, () => b.next())
    expect(xs).toEqual(ys)
  })

  test('разные зёрна дают разные числа', () => {
    expect(createRng(1).next()).not.toBe(createRng(2).next())
  })

  test('int включает обе границы и не выходит за них', () => {
    const r = createRng(7)
    const seen = new Set<number>()
    for (let i = 0; i < 2000; i++) {
      const v = r.int(2, 4)
      expect(v).toBeGreaterThanOrEqual(2)
      expect(v).toBeLessThanOrEqual(4)
      seen.add(v)
    }
    expect([...seen].sort()).toEqual([2, 3, 4])
  })

  test('float лежит в полуинтервале [a, b)', () => {
    const r = createRng(9)
    for (let i = 0; i < 2000; i++) {
      const v = r.float(5, 6)
      expect(v).toBeGreaterThanOrEqual(5)
      expect(v).toBeLessThan(6)
    }
  })

  test('fork не зависит от того, сколько чисел уже взяли', () => {
    const a = createRng(42)
    const b = createRng(42)
    b.next()
    b.next()
    expect(a.fork('galaxy').next()).toBe(b.fork('galaxy').next())
    expect(a.fork('galaxy').next()).not.toBe(a.fork('civs').next())
  })

  test('pick из пустого списка — ошибка, а не undefined', () => {
    expect(() => createRng(1).pick([])).toThrow()
  })

  test('shuffle переставляет те же элементы', () => {
    expect(createRng(3).shuffle([1, 2, 3, 4, 5]).sort()).toEqual([1, 2, 3, 4, 5])
  })

  test('hashString различает строки и стабилен', () => {
    expect(hashString('galaxy')).toBe(hashString('galaxy'))
    expect(hashString('a')).not.toBe(hashString('b'))
  })
})
