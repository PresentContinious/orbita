import { expect, test } from 'vitest'
import { beltDust, fbm3, hashString, seeded } from '../../src/render/noise'

test('шум и крошка детерминированы', () => {
  expect(fbm3(7, 1.3, 2.1, 0.4)).toBe(fbm3(7, 1.3, 2.1, 0.4))
  expect(fbm3(7, 1.3, 2.1, 0.4)).not.toBe(fbm3(8, 1.3, 2.1, 0.4))
  expect(beltDust(5, 100)).toEqual(beltDust(5, 100))
  expect(seeded(3)()).toBe(seeded(3)())
  expect(hashString('a')).not.toBe(hashString('b'))
})

test('крошка в пределах пояса и плотнее к центру', () => {
  const d = beltDust(1, 2000)
  expect(d.every((p) => Math.abs(p.off) <= 1 && p.size >= 0.5 && p.size <= 1.6)).toBe(true)
  expect(d.filter((p) => Math.abs(p.off) < 0.5).length).toBeGreaterThan(d.length * 0.6)
})
