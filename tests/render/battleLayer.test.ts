import { describe, expect, it } from 'vitest'
import { burnTint, drawBudget, headingOf, projTexture, shipScreenLen, shouldDraw } from '../../src/render/battleGeom'
import type { ShipKind } from '../../src/sim/config'
import type { IconKind } from '../../src/render/textures'
import type { Ship } from '../../src/sim/types'

describe('battleGeom', () => {
  it('shipScreenLen: машина при любом зуме ≥ 3 px, капитальный ≥ 6 px, в настоящем размере при крупном зуме', () => {
    expect(shipScreenLen('interceptor', 0.01)).toBe(3)
    expect(shipScreenLen('bomber', 0.01)).toBe(3)
    expect(shipScreenLen('battleship', 0.01)).toBe(6)
    expect(shipScreenLen('corvette', 0.01)).toBe(6)
    expect(shipScreenLen('battleship', 10)).toBeCloseTo(12 * 10)
  })

  it('headingOf: боевой — combat.heading, мирный — по скорости', () => {
    const war = { combat: { heading: 1.25 }, vel: { x: 0, y: -5 } } as unknown as Ship
    const civil = { combat: null, vel: { x: 0, y: 5 } } as unknown as Ship
    expect(headingOf(war)).toBe(1.25)
    expect(headingOf(civil)).toBeCloseTo(Math.PI / 2)
  })

  it('drawBudget: 5 000 снарядов → k = 3, ≤ 2 000 рисуются; 1 000 → k = 1', () => {
    const k = drawBudget(5000)
    expect(k).toBe(3)
    let drawn = 0
    for (let i = 0; i < 5000; i++) if (shouldDraw(i, k)) drawn++
    expect(drawn).toBeLessThanOrEqual(2000)
    expect(drawBudget(1000)).toBe(1)
  })

  it('shouldDraw детерминирован по индексу: одни и те же снаряды пропускаются каждый кадр', () => {
    const a = Array.from({ length: 50 }, (_, i) => shouldDraw(i, 3))
    const b = Array.from({ length: 50 }, (_, i) => shouldDraw(i, 3))
    expect(a).toEqual(b)
    expect(a.filter(Boolean).length).toBeLessThan(50)
  })

  it('projTexture: ракета/приманка/торпеда → свои текстуры; луч не рисуется частицей', () => {
    expect(projTexture('missile')).toBe('missile')
    expect(projTexture('decoy')).toBe('decoy')
    expect(projTexture('torpedo')).toBe('torpedo')
    expect(projTexture('beam')).toBeNull()
  })

  it('burnTint теплее исходного цвета (R растёт, B падает)', () => {
    const c = 0x4080c0
    const t = burnTint(c)
    expect((t >> 16) & 255).toBeGreaterThan((c >> 16) & 255)
    expect(t & 255).toBeLessThan(c & 255)
  })

  it('IconKind покрывает все ShipKind (typecheck через satisfies Record<ShipKind, …>)', () => {
    const map = {
      colony: 'colony', caravan: 'caravan', miner: 'miner',
      corvette: 'corvette', torpedo: 'torpedo', frigate: 'frigate', battleship: 'battleship', carrier: 'carrier',
      interceptor: 'interceptor', bomber: 'bomber', trooper: 'trooper', supply: 'supply', scout: 'scout',
    } satisfies Record<ShipKind, IconKind>
    expect(Object.keys(map)).toHaveLength(13)
  })
})
