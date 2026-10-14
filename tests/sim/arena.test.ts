import { describe, expect, it } from 'vitest'
import { createArena, parseArena, parseSide, runArena } from '../../src/sim/arena'
import { BATTLE } from '../../src/sim/combat-config'
import { SHIP_KINDS } from '../../src/sim/config'

const spec = (q: string) => parseArena(q)

describe('арена', () => {
  it('parseSide: 3bb,1cv:16,6co → счётчики, машины 16', () => {
    const s = parseSide('3bb,1cv:16,6co')
    expect(s.counts).toEqual({ battleship: 3, carrier: 1, corvette: 6 })
    expect(s.craft).toBe(16)
  })

  it('createArena: два флота по строке, все корабли в одной системе, нападающий с миссией show', () => {
    const w = createArena(spec('A=3bb,2co&B=2bb,2ff&seed=1'))
    expect(w.fleets.length).toBe(2)
    expect(w.ships.length).toBe(9)
    expect(new Set(w.ships.map((s) => s.systemId))).toEqual(new Set([w.arenaSystem]))
    expect(w.fleets[0].mission.type).toBe('show')
    expect(w.fleets[1].mission.type).toBe('defend')
    expect(w.fleets[0].shipIds.length).toBe(5)
    expect(w.fleets[1].shipIds.length).toBe(4)
    expect(w.fleets[0].owner).not.toBe(w.fleets[1].owner)
    const d = Math.hypot(w.fleets[0].anchor.x - w.fleets[1].anchor.x, w.fleets[0].anchor.y - w.fleets[1].anchor.y)
    expect(d).toBeGreaterThanOrEqual(BATTLE.detect + 100)
  })

  it('одно зерно дважды — побитово одинаковый positionsHash на 3 000 шагов', () => {
    const run = () => runArena(createArena(spec('A=3bb,1cv,3ff,6co&B=2bb,2ff,1cv,4tb&seed=3')), 3000)
    const a = run()
    const b = run()
    expect(a.positionsHash).toBe(b.positionsHash)
    expect(a.positionsHash.length).toBeGreaterThan(0)
  })

  it('орбита: якорь защитника на r + 200 от планеты, frame = planet.id', () => {
    const w = createArena(spec('A=2bb&B=2bb&terrain=orbit&seed=1'))
    const fb = w.fleets[1]
    expect(fb.mission.type).toBe('defend')
    expect(fb.order).toBe('orbit')
    const planet = w.planets.get((fb.mission as { planetId: string }).planetId)!
    expect(fb.frame).toBe(planet.id)
    expect(Math.hypot(fb.anchor.x, fb.anchor.y)).toBeCloseTo(planet.radius + 200, 5) // якорь в системе отсчёта планеты — локальный
    expect(planet.owner).toBe(fb.owner)
  })

  it('runArena: losses считаются по живым кораблям, а не по сохранённым суммам', () => {
    const w = createArena(spec('A=2bb,1co&B=2bb&seed=1'))
    const victim = w.ships.find((s) => s.owner === w.fleets[0].owner && s.kind === 'corvette')!
    victim.alive = false
    const r = runArena(w, 1)
    expect(r.losses).toEqual([victim.price, 0])
    expect(r.alive).toEqual([2, 2])
  })

  it('минимальная дистанция корпусов на старте ≥ 2 длины', () => {
    for (const terrain of ['empty', 'belt', 'orbit', 'gate']) {
      const w = createArena(spec(`A=4bb,3ff,6co&B=3bb,2cv,4tb&terrain=${terrain}&seed=2`))
      const r = runArena(w, 0)
      const maxLen = Math.max(...w.ships.map((s) => SHIP_KINDS[s.kind].length))
      expect(Number.isFinite(r.minHullDist)).toBe(true)
      expect(r.minHullDist).toBeGreaterThanOrEqual(2 * maxLen)
    }
  })
})
