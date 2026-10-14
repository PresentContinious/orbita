import { describe, expect, it } from 'vitest'
import { GALAXY } from '../../src/sim/config'
import { ledgerBalance } from '../../src/sim/economy'
import { buildCorridorEdges, generateGalaxy, isConnected, placeSystems } from '../../src/sim/galaxy'
import { createRng } from '../../src/sim/rng'
import { clampOptions, setupOf, type GalaxyOptions } from '../../src/sim/setup'
import { createWorld } from '../../src/sim/world'
import { run, snapshot } from '../helpers'

const gen = (seed: number, o: GalaxyOptions = {}) => generateGalaxy(createRng(seed), clampOptions(o))

describe('настройки галактики', () => {
  it('без настроек и с {} — побайтно та же галактика и тот же мир через 600 шагов', () => {
    for (let s = 1; s <= 20; s++) {
      expect(JSON.stringify(generateGalaxy(createRng(s), {}))).toBe(JSON.stringify(generateGalaxy(createRng(s))))
    }
    const a = createWorld(7)
    const b = createWorld(7, {})
    run(a, 60)
    run(b, 60)
    expect(snapshot(a)).toBe(snapshot(b))
  })

  it('крайние значения строятся на 30 зёрнах: 4 и 12 систем, 2 и 24 державы, в системе 1 и 3, ore/pits 0 и 4, links 0 и 1, size 0.6 и 1.6', () => {
    const cases: GalaxyOptions[] = [
      { systems: 4 }, { systems: 12 }, { civs: 2 }, { civs: 24 }, { perSystem: 1 }, { perSystem: 3 },
      { ore: 0 }, { ore: 4 }, { pits: 0 }, { pits: 4 }, { links: 0 }, { links: 1 }, { size: 0.6 }, { size: 1.6 },
      { systems: 12, civs: 24, links: 1, size: 1.6, ore: 4, pits: 4 },
      { systems: 4, civs: 24, perSystem: 1, ore: 4, pits: 4 },
    ]
    for (const o of cases) {
      for (let s = 1; s <= 30; s++) {
        const g = gen(s, o)
        const n = g.systems.length
        const edges = g.corridors.map((c) => [c.a, c.b] as [number, number])
        expect(isConnected(n, edges)).toBe(true)
        const deg = new Array(n).fill(0)
        for (const [a, b] of edges) {
          deg[a]++
          deg[b]++
        }
        expect(Math.max(...deg)).toBeLessThanOrEqual(GALAXY.maxDegree)
        const names = g.systems.map((x) => x.name).concat(g.systems.flatMap((x) => x.planets.map((p) => p.name)))
        expect(new Set(names).size).toBe(names.length)
        for (const sys of g.systems.filter((x) => x.role === 'inhabited')) {
          expect(sys.planets.filter((p) => p.habitability >= 1).length).toBeGreaterThanOrEqual(sys.civSlots + 1)
        }
      }
    }
  })

  it('systems: 9 → 9 систем; civs: 12, perSystem 2 → 6 обитаемых и 12 держав', () => {
    for (let s = 1; s <= 5; s++) {
      expect(gen(s, { systems: 9 }).systems.length).toBe(9)
      const st = setupOf(gen(s, { systems: 10, civs: 12, perSystem: 2 }), {})
      expect(st.inhabited).toBe(6)
      expect(st.civs).toBe(12)
    }
  })

  it('держав больше, чем влезает (24 при 4 системах) — урезано до (n−1)·perSystem, setupOf показывает, что вышло', () => {
    const o = clampOptions({ systems: 4, civs: 24 })
    const st = setupOf(generateGalaxy(createRng(3), o), o)
    expect(st.systems).toBe(4)
    expect(st.inhabited).toBe(3)
    expect(st.civs).toBe(9)
    expect(createWorld(3, o).civs.length).toBe(9)
  })

  it('links 1 даёт больше коридоров, чем links 0, на тех же точках; коридоры не пересекаются', () => {
    let more = 0
    type P = { x: number; y: number }
    const cr = (o: P, a: P, b: P) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x)
    for (let s = 1; s <= 10; s++) {
      const pts = placeSystems(createRng(s), 9)
      const e0 = buildCorridorEdges(pts)
      const e1 = buildCorridorEdges(pts, 5)
      expect(e1.length).toBeGreaterThanOrEqual(e0.length)
      if (e1.length > e0.length) more++
      for (const [a, b] of e1) {
        for (const [c, d] of e1) {
          if (a === c || a === d || b === c || b === d) continue
          const cross =
            cr(pts[a], pts[b], pts[c]) * cr(pts[a], pts[b], pts[d]) < 0 && cr(pts[c], pts[d], pts[a]) * cr(pts[c], pts[d], pts[b]) < 0
          expect(cross).toBe(false)
        }
      }
    }
    expect(more).toBeGreaterThan(0)
  })

  it('size 1.6 — галактика шире и перелёты дольше, чем size 0.6', () => {
    const width = (g: ReturnType<typeof gen>) =>
      Math.max(...g.systems.map((s) => s.pos.x)) - Math.min(...g.systems.map((s) => s.pos.x))
    const small = gen(5, { size: 0.6 })
    const big = gen(5, { size: 1.6 })
    expect(width(big)).toBeGreaterThan(width(small))
    expect(Math.max(...big.corridors.map((c) => c.transit))).toBeGreaterThan(Math.max(...small.corridors.map((c) => c.transit)))
  })

  it('treasury 200 — у всех держав 200 на старте, журнал сходится', () => {
    const w = createWorld(4, { treasury: 200 })
    for (const c of w.civs) {
      expect(c.treasury).toBe(200)
      expect(ledgerBalance(c)).toBe(200)
    }
    expect(w.settings.treasury).toBe(200)
  })

  it('clampOptions: 99 систем → 12, NaN → не задано, 2.6 → 3', () => {
    expect(clampOptions({ systems: 99 }).systems).toBe(12)
    expect('civs' in clampOptions({ civs: NaN })).toBe(false)
    expect(clampOptions({ perSystem: 2.6 }).perSystem).toBe(3)
  })
})
