import { describe, expect, it } from 'vitest'
import { parseSetup, setupQuery } from '../../src/app/setup'

describe('parseSetup', () => {
  it('parseSetup ↔ setupQuery туда-обратно', () => {
    const opts = { systems: 8, civs: 12, perSystem: 2, ore: 2, pits: 3, links: 0.5, size: 1.2, treasury: 100, unitCap: 1000 }
    const r = parseSetup(setupQuery(77, opts))
    expect(r.seed).toBe(77)
    expect(r.opts).toEqual(opts)
    expect(r.stress).toBe(0)
  })
  it('мусор и выход за пределы — зажаты или не заданы', () => {
    const r = parseSetup('?seed=5&systems=abc&civs=999&size=-3&money=&cap=lots&ore=2.6')
    expect(r.opts.systems).toBeUndefined()
    expect(r.opts.civs).toBe(24)
    expect(r.opts.size).toBe(0.6)
    expect(r.opts.treasury).toBeUndefined()
    expect(r.opts.unitCap).toBeUndefined()
    expect(r.opts.ore).toBe(3)
  })
  it('stress=1 → 2000, stress=5000 → 5000', () => {
    expect(parseSetup('?seed=1&stress=1').stress).toBe(2000)
    expect(parseSetup('?seed=1&stress=5000').stress).toBe(5000)
    expect(parseSetup('?seed=1').stress).toBe(0)
  })
  it('нет seed → seed: null', () => {
    expect(parseSetup('').seed).toBeNull()
    expect(parseSetup('?seed=zzz').seed).toBeNull()
  })
})
