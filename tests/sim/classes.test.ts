import { describe, expect, test } from 'vitest'
import { CLASSES, COMBAT_KINDS, fullPrice, isCapital, isCraft, newCombat, pushable } from '../../src/sim/classes'
import { SHIP_KINDS } from '../../src/sim/config'

describe('классы', () => {
  test('у каждого боевого класса есть движение с поворотом и цена из спеки', () => {
    const price = { corvette: 60, torpedo: 80, frigate: 160, battleship: 600, carrier: 700, interceptor: 20, bomber: 35, trooper: 120, supply: 100, scout: 70 }
    for (const k of COMBAT_KINDS) {
      expect(SHIP_KINDS[k].turn).toBeGreaterThan(0)
      expect(CLASSES[k].price).toBe(price[k])
    }
    expect(SHIP_KINDS.battleship.turn).toBe(12)
    expect(SHIP_KINDS.carrier.length).toBe(14)
  })

  test('роли: капитальные, машины, кто участвует в push-out', () => {
    expect(isCapital('battleship')).toBe(true)
    expect(isCapital('frigate')).toBe(true)
    expect(isCapital('carrier')).toBe(true)
    expect(isCapital('corvette')).toBe(false)
    expect(isCraft('bomber')).toBe(true)
    expect(pushable('corvette')).toBe(true)
    expect(pushable('interceptor')).toBe(false)
    expect(pushable('caravan')).toBe(false)
  })

  test('newCombat: корпус, щит, модули, боезапас, ангар', () => {
    const bb = newCombat('battleship', 5)
    expect(bb.hull).toBe(1500)
    expect(bb.shieldMax).toBe(500)
    expect(bb.modules).toEqual({ engines: 1, turrets: 1, mainGun: 1 })
    expect(bb.cooldown.length).toBe(2)
    const fr = newCombat('frigate', 5)
    expect(fr.ammo).toBe(10)
    const cv = newCombat('carrier', 5)
    expect(cv.hangar?.bays.length).toBe(4)
    expect(cv.hangar?.torpedoes).toBe(24)
    expect(newCombat('corvette', 0).hangar).toBeNull()
  })

  test('полная цена носителя с машинами — 1 150', () => {
    expect(fullPrice('carrier')).toBe(700 + 12 * 20 + 6 * 35)
    expect(fullPrice('frigate')).toBe(160)
  })
})
