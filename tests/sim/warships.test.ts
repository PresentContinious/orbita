import { describe, expect, it } from 'vitest'
import { createFleet, removeFromFleet } from '../../src/sim/fleet'
import { earn, ledgerBalance } from '../../src/sim/economy'
import { civById, capitalOf } from '../../src/sim/query'
import { compactShips, moveShips, buildGrids, spawnShip, spawnWarship, turnHeading } from '../../src/sim/ships'
import { quietWorld } from '../helpers'

function setup() {
  const w = quietWorld(1)
  const civ = w.civs[0]
  const home = capitalOf(w, civ)!
  return { w, civ, home }
}

describe('боевые корабли в мире', () => {
  it('spawnWarship: покупка через конверт war, combat и fleetId заполнены, журнал сходится', () => {
    const { w, civ, home } = setup()
    earn(civ, 2000, 'refund')
    civ.eco.envelopes.war = 700
    const fleet = createFleet(w, civ, home, { type: 'defend', planetId: home.id })
    const before = ledgerBalance(civ)
    const ship = spawnWarship(w, civ, 'battleship', home, fleet)
    expect(ship).not.toBeNull()
    expect(civ.eco.ledger.expense.warship).toBe(600)
    expect(ship!.combat!.hull).toBe(1500)
    expect(ship!.fleetId).toBe(fleet.id)
    expect(fleet.shipIds).toContain(ship!.id)
    expect(ship!.mission).toEqual({ type: 'fleet', fleetId: fleet.id })
    expect(ledgerBalance(civ)).toBeCloseTo(before - 600)
    expect(ledgerBalance(civ)).toBeCloseTo(civ.treasury)
  })

  it('не хватает конверта — null и ничего не создано', () => {
    const { w, civ, home } = setup()
    earn(civ, 2000, 'refund')
    civ.eco.envelopes.war = 100
    const n = w.ships.length
    expect(spawnWarship(w, civ, 'battleship', home, null)).toBeNull()
    expect(w.ships.length).toBe(n)
    expect(civ.eco.ledger.expense.warship ?? 0).toBe(0)
  })

  it('shipIndex совпадает с позицией после spawn и после compactShips с гибелью в середине', () => {
    const { w, civ, home } = setup()
    const made = [0, 1, 2, 3, 4].map(() => spawnShip(w, civ, 'caravan', home, { type: 'return', planetId: home.id }, 0))
    for (const s of made) expect(w.shipIndex.get(s.id)).toBe(w.ships.indexOf(s))
    made[1].alive = false
    compactShips(w)
    expect(w.shipIndex.has(made[1].id)).toBe(false)
    for (const s of w.ships) expect(w.shipIndex.get(s.id)).toBe(w.ships.indexOf(s))
  })

  it('civById через civIndex даёт ту же державу, что перебор', () => {
    const { w } = setup()
    for (const c of w.civs) expect(civById(w, c.id)).toBe(c)
    expect(civById(w, -5)).toBeUndefined()
  })

  it('корабль в миссии fleet без слота держит место 100 шагов', () => {
    const { w, civ, home } = setup()
    earn(civ, 5000, 'refund')
    civ.eco.envelopes.war = 5000
    const fleet = createFleet(w, civ, home, { type: 'defend', planetId: home.id })
    fleet.anchorVel = { x: 0, y: 0 }
    const s = spawnWarship(w, civ, 'frigate', home, fleet)!
    s.vel = { x: 0, y: 0 }
    const x = s.pos.x
    const y = s.pos.y
    for (let i = 0; i < 100; i++) {
      buildGrids(w)
      moveShips(w)
      compactShips(w)
    }
    expect(Math.hypot(s.pos.x - x, s.pos.y - y)).toBeLessThan(1)
  })

  it('два корабля рамки в 10 ед. не расталкиваются separate; два каравана — расталкиваются', () => {
    const { w, civ, home } = setup()
    earn(civ, 5000, 'refund')
    civ.eco.envelopes.war = 5000
    const fleet = createFleet(w, civ, home, { type: 'defend', planetId: home.id })
    fleet.anchorVel = { x: 0, y: 0 }
    const a = spawnWarship(w, civ, 'corvette', home, fleet)!
    const b = spawnWarship(w, civ, 'corvette', home, fleet)!
    const c = spawnShip(w, civ, 'caravan', home, { type: 'return', planetId: home.id }, 0)
    const d = spawnShip(w, civ, 'caravan', home, { type: 'return', planetId: home.id }, 0)
    for (const [p, q] of [[a, b], [c, d]]) {
      p.pos = { x: 5000, y: 5000 }
      q.pos = { x: 5010, y: 5000 }
      p.vel = { x: 0, y: 0 }
      q.vel = { x: 0, y: 0 }
    }
    c.mission = d.mission = { type: 'patrol', a: home.id, b: home.id, leg: 0 }
    buildGrids(w)
    moveShips(w)
    expect(a.vel.x).toBe(0)
    expect(b.vel.x).toBe(0)
    expect(Math.abs(c.vel.x) + Math.abs(d.vel.x)).toBeGreaterThan(0)
  })

  it('поворот носа за шаг ≤ turn·dt: линкор с want = π за шаг поворачивает на 1.2°', () => {
    const { w, civ, home } = setup()
    earn(civ, 5000, 'refund')
    civ.eco.envelopes.war = 5000
    const s = spawnWarship(w, civ, 'battleship', home, null)!
    s.combat!.heading = 0
    turnHeading(s, Math.PI, 0.1)
    expect(s.combat!.heading).toBeCloseTo((1.2 * Math.PI) / 180, 6)
  })

  it('погиб последний корабль — флот распущен, адмирал жив', () => {
    const { w, civ, home } = setup()
    earn(civ, 5000, 'refund')
    civ.eco.envelopes.war = 5000
    const fleet = createFleet(w, civ, home, { type: 'defend', planetId: home.id })
    const s = spawnWarship(w, civ, 'corvette', home, fleet)!
    removeFromFleet(w, fleet, s.id)
    expect(w.fleets).not.toContain(fleet)
    expect(w.admirals.find((a) => a.id === fleet.admiralId)?.alive).toBe(true)
  })
})
