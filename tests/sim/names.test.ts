import { expect, test } from 'vitest'
import { uniqueName } from '../../src/sim/names'
import { createRng } from '../../src/sim/rng'

test('uniqueName не повторяется на 300 вызовах', () => {
  const r = createRng(5)
  const used = new Set<string>()
  const names = Array.from({ length: 300 }, () => uniqueName(r, used))
  expect(new Set(names).size).toBe(300)
})
