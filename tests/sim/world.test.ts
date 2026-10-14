import { describe, expect, test } from 'vitest'
import { CIVS } from '../../src/sim/config'
import { capitalOf, capOf } from '../../src/sim/query'
import { createWorld } from '../../src/sim/world'
import { quietWorld, run, snapshot } from '../helpers'

describe('createWorld', () => {
  test('8–10 держав на пригодных планетах обитаемых систем', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const w = createWorld(seed)
      expect(w.civs.length).toBeGreaterThanOrEqual(8)
      expect(w.civs.length).toBeLessThanOrEqual(10)
      for (const c of w.civs) {
        const home = w.planets.get(c.capital)!
        expect(home.owner).toBe(c.id)
        expect(home.habitability).toBeGreaterThanOrEqual(1)
        expect(home.pop).toBeGreaterThanOrEqual(1.6)
        expect(home.pop).toBeLessThan(2.4)
        expect(c.treasury).toBe(CIVS.startTreasury)
        expect(w.galaxy.systems[home.systemId].role).toBe('inhabited')
      }
      expect(new Set(w.civs.map((c) => c.name)).size).toBe(w.civs.length)
      expect(new Set(w.civs.map((c) => c.color)).size).toBe(w.civs.length)
      for (const s of w.galaxy.systems) {
        const here = w.civs.filter((c) => w.planets.get(c.capital)!.systemId === s.id).length
        expect(here).toBe(s.civSlots)
      }
    }
  })

  test('одно зерно — одна история', () => {
    const a = createWorld(31)
    const b = createWorld(31)
    run(a, 30)
    run(b, 30)
    expect(snapshot(a)).toBe(snapshot(b))
  })
})

describe('население', () => {
  test('растёт по логистической кривой', () => {
    const w = quietWorld(2)
    const civ = w.civs[0]
    const home = capitalOf(w, civ)!
    const K = capOf(home, civ)
    const P0 = 2
    home.pop = P0
    run(w, 300)
    const expected = K / (1 + ((K - P0) / P0) * Math.exp(-0.012 * 300))
    expect(home.pop).toBeGreaterThan(expected * 0.99)
    expect(home.pop).toBeLessThan(expected * 1.01)
  })

  test('потолок населения: 0.5 · радиус · пригодность', () => {
    const w = quietWorld(2)
    const civ = w.civs[0]
    const home = capitalOf(w, civ)!
    expect(capOf(home, civ)).toBeCloseTo(0.5 * home.radius * home.habitability)
  })

  test('потерянная столица переезжает на самую населённую планету', () => {
    const w = quietWorld(3)
    const civ = w.civs[0]
    const old = capitalOf(w, civ)!
    const other = w.galaxy.systems[old.systemId].planets.find((p) => p.owner === null)!
    other.owner = civ.id
    other.pop = 1
    old.owner = null
    old.pop = 0
    expect(capitalOf(w, civ)!.id).toBe(other.id)
    expect(civ.capital).toBe(other.id)
  })
})

describe('имена держав', () => {
  test('seed 1..200: имя державы не совпадает с именем планеты или системы', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const w = createWorld(seed)
      const taken = new Set([...w.planets.values()].map((p) => p.name).concat(w.galaxy.systems.map((s) => s.name)))
      for (const c of w.civs) expect(taken.has(c.name), `seed ${seed}: ${c.name}`).toBe(false)
    }
  })
})
