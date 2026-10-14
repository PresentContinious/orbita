import { expect, test } from 'vitest'
import { territoryShares } from '../../src/render/territory'
import { quietWorld } from '../helpers'

test('доли держав: населённая планета — 1, станция — 0.5', () => {
  const w = quietWorld(1)
  const sys = w.galaxy.systems.find((s) => s.role === 'pit')!
  const [A, B] = w.civs
  const ps = sys.planets
  ps[0].owner = A.id
  ps[0].pop = 1
  ps[1].owner = A.id
  ps[1].pop = 2
  ps[2].owner = B.id
  ps[2].pop = 1
  if (ps[3]) {
    ps[3].owner = B.id
    ps[3].station = true
  }
  const shares = territoryShares(w, sys)
  const bWeight = ps[3] ? 1.5 : 1
  expect(shares.map((s) => s.civ)).toEqual([A.id, B.id])
  expect(shares[0].share).toBeCloseTo(2 / (2 + bWeight))
  expect(shares[1].share).toBeCloseTo(bWeight / (2 + bWeight))
  expect(shares[0].color).toBe(A.color)
})

test('ничья система — пустой список', () => {
  const w = quietWorld(1)
  expect(territoryShares(w, w.galaxy.systems.find((s) => s.role === 'nebula' || s.role === 'ore')!)).toEqual([])
})
