import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { expectedOutcome, pdShare } from '../../src/sim/battle'
import { CLASSES, type CombatKind } from '../../src/sim/classes'
import { capitalOf } from '../../src/sim/query'
import { spawnShip } from '../../src/sim/ships'
import type { Ship, World } from '../../src/sim/types'
import { quietWorld } from '../helpers'

function setup() {
  const w = quietWorld(1)
  const home = capitalOf(w, w.civs[0])!
  /** кораблей по составу `3bb,10co`: настоящие Ship с combat, без флота и без размещения (матрица читает только состав и состояние) */
  const mk = (spec: [number, CombatKind][]): Ship[] => {
    const out: Ship[] = []
    for (const [n, kind] of spec) {
      for (let i = 0; i < n; i++) out.push(spawnShip(w, w.civs[0], kind, home, { type: 'return', planetId: home.id }, CLASSES[kind].price))
    }
    return out
  }
  return { w, mk }
}

const D = 170

describe('expectedOutcome', () => {
  it('2 линкора против 10 корветов на линии 170 — для корветов ≈ 0.3 (0.2–0.4)', () => {
    const { w, mk } = setup()
    const v = expectedOutcome(w, mk([[10, 'corvette']]), mk([[2, 'battleship']]), D)
    expect(v).toBeGreaterThan(0.2)
    expect(v).toBeLessThan(0.4)
  })

  it('равные флоты — 1.0 ± 0.05', () => {
    const { w, mk } = setup()
    const comp: [number, CombatKind][] = [[3, 'battleship'], [3, 'frigate'], [6, 'corvette'], [1, 'carrier']]
    expect(expectedOutcome(w, mk(comp), mk(comp), D)).toBeCloseTo(1, 1)
    expect(Math.abs(expectedOutcome(w, mk(comp), mk(comp), D) - 1)).toBeLessThan(0.05)
  })

  it('«3 бб + 10 кв» против «2 бб + 2 фр + нос» на 170 — 0.8–1.2', () => {
    const { w, mk } = setup()
    const v = expectedOutcome(w, mk([[3, 'battleship'], [10, 'corvette']]), mk([[2, 'battleship'], [2, 'frigate'], [1, 'carrier']]), D)
    expect(v).toBeGreaterThan(0.8)
    expect(v).toBeLessThan(1.2)
  })

  it('симметрия: исход A против B — обратная величина исхода B против A', () => {
    const { w, mk } = setup()
    const a = mk([[3, 'battleship'], [4, 'corvette']])
    const b = mk([[2, 'battleship'], [3, 'frigate']])
    expect(expectedOutcome(w, a, b, D) * expectedOutcome(w, b, a, D)).toBeCloseTo(1, 6)
  })

  it('орбита защитника: щит ×1.5 снижает исход нападающего', () => {
    const { w, mk } = setup()
    const a = mk([[3, 'battleship']])
    const b = mk([[3, 'battleship']])
    expect(expectedOutcome(w, a, b, D, { orbitB: true })).toBeLessThan(expectedOutcome(w, a, b, D))
  })

  it('ПВО: 6 корветов против залпа 12 ракет дают долю дошедших 0.25–0.4', () => {
    const share = pdShare(6, 12)
    expect(share).toBeGreaterThanOrEqual(0.25)
    expect(share).toBeLessThanOrEqual(0.4)
    expect(pdShare(0, 12)).toBe(1)
    expect(pdShare(100, 12)).toBeGreaterThanOrEqual(0.2) // нижний предел
  })

  it('ПВО в матрице: корветы врага режут ракетный залп фрегатов', () => {
    const { w, mk } = setup()
    const ff = mk([[6, 'frigate']])
    const bare = mk([[3, 'battleship']])
    const screened = mk([[3, 'battleship'], [6, 'corvette']])
    // корветы добавляют и свой dps, поэтому смотрим на вклад ракет: исход фрегатов против голых линкоров выше, чем против прикрытых
    const vsBare = expectedOutcome(w, ff, bare, D)
    const vsScreened = expectedOutcome(w, ff, screened, D)
    expect(vsScreened).toBeLessThan(vsBare)
  })

  it('горящий и выбитый главный калибр снижают dps стороны', () => {
    const { w, mk } = setup()
    const enemy = mk([[3, 'battleship']])
    const base = expectedOutcome(w, mk([[3, 'battleship']]), enemy, D)
    const burning = mk([[3, 'battleship']])
    burning[0].combat!.burning = 0
    const noGun = mk([[3, 'battleship']])
    noGun[0].combat!.modules.mainGun = 0
    expect(expectedOutcome(w, burning, enemy, D)).toBeLessThan(base)
    expect(expectedOutcome(w, noGun, enemy, D)).toBeLessThan(base)
  })

  it('одна функция: expectedOutcome объявлена только в battle.ts', () => {
    const dir = join(__dirname, '../../src/sim')
    const defs: string[] = []
    for (const f of readdirSync(dir)) {
      if (!f.endsWith('.ts')) continue
      if (/function\s+expectedOutcome\s*\(/.test(readFileSync(join(dir, f), 'utf8'))) defs.push(f)
    }
    expect(defs).toEqual(['battle.ts'])
  })

  it('мир не нужен: w можно не передавать (null)', () => {
    const { mk } = setup()
    const w2: World | null = null
    expect(expectedOutcome(w2, mk([[2, 'battleship']]), mk([[2, 'battleship']]), D)).toBeCloseTo(1, 6)
  })
})
