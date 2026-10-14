import { describe, expect, it } from 'vitest'
import type { CombatKind } from '../../src/sim/classes'
import { PROJ } from '../../src/sim/combat-config'
import { SIM_DT } from '../../src/sim/config'
import {
  allocProjectile, fireBeam, fireMissile, fireTorpedo, stepProjectiles, traceShot,
} from '../../src/sim/projectiles'
import { capitalOf } from '../../src/sim/query'
import { buildGrids, spawnShip } from '../../src/sim/ships'
import type { Ship, World } from '../../src/sim/types'
import { quietWorld } from '../helpers'

const X = 1000
const Y = 1000

function arena(seed = 1) {
  const w = quietWorld(seed)
  const a = w.civs[0]
  const b = w.civs[1]
  const home = capitalOf(w, a)!
  const sys = home.systemId
  w.galaxy.systems[sys].asteroids = []
  const put = (owner: 'a' | 'b', kind: CombatKind, x: number, y: number): Ship => {
    const civ = owner === 'a' ? a : b
    const s = spawnShip(w, civ, kind, home, { type: 'return', planetId: home.id }, 0)
    s.systemId = sys
    s.pos = { x, y }
    s.prevPos = { x, y }
    s.vel = { x: 0, y: 0 }
    return s
  }
  return { w, a, b, sys, put }
}

/** шаг снарядов: сначала фаза, потом время (первый вызов — в момент выстрела) */
function step(w: World, n = 1): void {
  for (let i = 0; i < n; i++) {
    buildGrids(w)
    stepProjectiles(w)
    w.t += SIM_DT
    w.tick++
  }
}

describe('снаряды-объекты', () => {
  it('луч не бьёт своих: свой корвет на пути прозрачен, чужой линкор за ним получает 8 за шаг и 40 за луч', () => {
    const { w, put } = arena()
    const shooter = put('a', 'battleship', X, Y)
    const own = put('a', 'corvette', X + 100, Y)
    const foe = put('b', 'battleship', X + 200, Y)
    const beam = fireBeam(w, shooter, foe, 0)!
    expect(beam).not.toBeNull()
    step(w)
    expect(foe.combat!.hull).toBe(1500 - 8)
    step(w, 4)
    expect(foe.combat!.hull).toBe(1500 - 40)
    expect(own.combat!.hull).toBe(120)
    expect(beam.alive).toBe(false)
    step(w, 3)
    expect(foe.combat!.hull).toBe(1500 - 40)
  })

  it('корвет на пути чужой торпеды принимает её на себя, линкор-цель цел', () => {
    const { w, put } = arena()
    const shooter = put('a', 'battleship', X, Y)
    const cover = put('b', 'corvette', X + 30, Y)
    const target = put('b', 'battleship', X + 100, Y)
    fireTorpedo(w, shooter, target, false)
    step(w, 10)
    expect(cover.alive).toBe(false)
    expect(target.combat!.hull).toBe(1500)
  })

  it('чужой обломок гасит луч; свой обломок прозрачен', () => {
    const { w, put, sys, a, b } = arena()
    const shooter = put('a', 'battleship', X, Y)
    const foe = put('b', 'battleship', X + 200, Y)
    w.debris.push({ id: 900, systemId: sys, pos: { x: X + 100, y: Y }, value: 10, owner: b.id, bornT: 0, holder: null, r: 10, kind: 'corvette' })
    fireBeam(w, shooter, foe, 0)
    step(w, 5)
    expect(foe.combat!.hull).toBe(1500)
    w.debris[0].owner = a.id
    fireBeam(w, shooter, foe, 0)
    step(w, 5)
    expect(foe.combat!.hull).toBe(1500 - 40)
  })

  it('камень пояса гасит ракету', () => {
    const { w, put, sys } = arena()
    w.galaxy.systems[sys].asteroids = [{ id: 1, belt: 0, orbit: 1000, phase: 0, period: 1e12, ore: 5, size: 10 }]
    const shooter = put('a', 'frigate', 900, 0)
    const foe = put('b', 'battleship', 1100, 0)
    fireMissile(w, shooter, foe, 100)
    step(w, 30)
    expect(foe.combat!.hull).toBe(1500)
    expect(w.projectiles.some((p) => p.alive)).toBe(false)
  })

  it('ракета без цели перенацеливается на ближайшего чужого в 80; дальше 80 — летит прямо и гаснет через 4 с', () => {
    const near = arena()
    const s1 = near.put('a', 'frigate', X, Y)
    const t1 = near.put('b', 'battleship', X + 500, Y)
    const e1 = near.put('b', 'corvette', X + 6, Y + 60)
    fireMissile(near.w, s1, t1, 100)
    t1.alive = false
    step(near.w)
    const m1 = near.w.projectiles.find((p) => p.alive && p.kind === 'missile')!
    expect(m1.targetId).toBe(e1.id)

    const far = arena()
    const s2 = far.put('a', 'frigate', X, Y)
    const t2 = far.put('b', 'battleship', X + 500, Y)
    far.put('b', 'corvette', X + 6, Y + 100)
    fireMissile(far.w, s2, t2, 100)
    t2.alive = false
    step(far.w, 39)
    const m2 = far.w.projectiles.find((p) => p.alive && p.kind === 'missile')!
    expect(m2).toBeDefined()
    expect(m2.targetId).toBe(t2.id)
    expect(m2.y).toBeCloseTo(Y, 3)
    step(far.w)
    expect(far.w.projectiles.some((p) => p.alive && p.kind === 'missile')).toBe(false)
  })

  it('приманки летят рядом с тяжёлой и наносят 10, тяжёлая — 100', () => {
    const { w, put } = arena()
    const shooter = put('a', 'frigate', X, Y)
    const foe = put('b', 'battleship', X + 100, Y)
    fireMissile(w, shooter, foe, 100)
    const live = w.projectiles.filter((p) => p.alive)
    expect(live.map((p) => p.kind).sort()).toEqual(['decoy', 'decoy', 'decoy', 'missile'])
    expect(Math.max(...live.map((p) => p.y)) - Math.min(...live.map((p) => p.y))).toBeCloseTo(2 * PROJ.decoy.spread)
    step(w, 20)
    expect(foe.combat!.hull).toBe(1500 - 100 - 3 * 10)
  })

  it('торпеда поворачивает не быстрее 25°/с и живёт 3 с', () => {
    const { w, put } = arena()
    const shooter = put('a', 'bomber' as CombatKind, X, Y)
    const foe = put('b', 'battleship', X + 300, Y)
    fireTorpedo(w, shooter, foe, false)
    const t = w.projectiles.find((p) => p.alive && p.kind === 'torpedo')!
    foe.pos = { x: X, y: Y + 300 }
    let prev = t.heading
    let maxTurn = 0
    for (let i = 0; i < 29; i++) {
      step(w)
      maxTurn = Math.max(maxTurn, Math.abs(t.heading - prev))
      prev = t.heading
    }
    expect(maxTurn).toBeLessThanOrEqual((25 * Math.PI) / 180 * SIM_DT + 1e-9)
    expect(maxTurn).toBeGreaterThan(0.04)
    expect(t.alive).toBe(true)
    step(w)
    expect(t.alive).toBe(false)
  })

  it('пул исчерпан — allocProjectile даёт null, w.projectiles.length не растёт', () => {
    const { w } = arena()
    const len = w.projectiles.length
    let n = 0
    for (;;) {
      const p = allocProjectile(w, 'beam')
      if (!p) break
      p.alive = true
      n++
    }
    expect(n).toBe(PROJ.pool.beam)
    expect(w.projectiles.length).toBe(len)
    expect(allocProjectile(w, 'missile')).not.toBeNull()
  })

  it('1 000 трассировок на арене 40 кораблей ≤ 50 мс', () => {
    const { w, put } = arena()
    const as: Ship[] = []
    const bs: Ship[] = []
    for (let i = 0; i < 20; i++) {
      as.push(put('a', 'corvette', X + (i % 5) * 12, Y + Math.floor(i / 5) * 12))
      bs.push(put('b', 'corvette', X + 300 + (i % 5) * 12, Y + Math.floor(i / 5) * 12))
    }
    buildGrids(w)
    // лучший из трёх прогонов: на загруженной машине один прогон может выбиться
    let ms = Infinity
    for (let round = 0; round < 3; round++) {
      const t0 = performance.now()
      for (let i = 0; i < 1000; i++) {
        for (const s of bs) s.combat!.hull = 120
        traceShot(w, as[i % 20], bs[(i * 7) % 20], 0, 'flak')
        w.fxBattle.length = 0
      }
      ms = Math.min(ms, performance.now() - t0)
    }
    console.log('1000 трассировок, мс:', ms.toFixed(1))
    expect(ms).toBeLessThanOrEqual(50)
  })

  it('трассер бьёт первого чужого на пути, не цель', () => {
    const { w, put } = arena()
    const shooter = put('a', 'corvette', X, Y)
    const front = put('b', 'corvette', X + 30, Y)
    const back = put('b', 'corvette', X + 60, Y)
    buildGrids(w)
    expect(traceShot(w, shooter, back, 50, 'flak')).toBe(true)
    expect(front.combat!.hull).toBe(70)
    expect(back.combat!.hull).toBe(120)
    expect(w.fxBattle[0]).toMatchObject({ kind: 'tracer', hit: true })
  })

  it('детерминизм: два мира, по 100 одинаковых выстрелов — одинаковые позиции снарядов', () => {
    const run = () => {
      const { w, put } = arena(3)
      const a = put('a', 'battleship', X, Y)
      const b = put('b', 'battleship', X + 200, Y + 40)
      const f = put('a', 'frigate', X, Y + 30)
      for (let i = 0; i < 100; i++) {
        if (i % 3 === 0) fireMissile(w, f, b, 100)
        else if (i % 3 === 1) fireTorpedo(w, a, b, i % 2 === 0)
        else fireBeam(w, a, b, 0)
        step(w)
      }
      return JSON.stringify(w.projectiles.filter((p) => p.alive).map((p) => [p.kind, p.x, p.y, p.heading]))
    }
    expect(run()).toBe(run())
  })
})
