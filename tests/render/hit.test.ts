import { describe, expect, test } from 'vitest'
import { Controller } from '../../src/app/controller'
import { createClock } from '../../src/app/loop'
import { createCamera, worldToScreen } from '../../src/render/camera'
import { pickAt } from '../../src/render/hit'
import { battleIconPos } from '../../src/render/battleGeom'
import { addToFleet, createFleet } from '../../src/sim/fleet'
import type { Battle } from '../../src/sim/types'
import { capitalOf } from '../../src/sim/query'
import { spawnShip } from '../../src/sim/ships'
import { planetPos } from '../../src/sim/system'
import { quietWorld } from '../helpers'

const view = { width: 1600, height: 900 }

function setup() {
  const w = quietWorld(4815)
  const c = new Controller(w, createCamera(), createClock(1), () => view)
  c.flyToGalaxy(true)
  return { w, c }
}

describe('pickAt', () => {
  test('на общем плане клик по звезде выбирает систему', () => {
    const { w, c } = setup()
    const s = w.galaxy.systems[2]
    expect(pickAt(w, c.cam, view, worldToScreen(c.cam, view, s.pos))).toEqual({ type: 'system', id: s.id })
  })

  test('крупно клик по планете выбирает планету', () => {
    const { w, c } = setup()
    const home = capitalOf(w, w.civs[0])!
    c.flyToPlanet(home.id, true)
    expect(pickAt(w, c.cam, view, { x: 800, y: 450 })).toEqual({ type: 'planet', id: home.id })
  })

  test('корабль у планеты важнее планеты', () => {
    const { w, c } = setup()
    const civ = w.civs[0]
    const home = capitalOf(w, civ)!
    c.flyToPlanet(home.id, true)
    const ship = spawnShip(w, civ, 'caravan', home, { type: 'return', planetId: home.id }, 50)
    const q = planetPos(home, w.t)
    ship.pos = { x: q.x + 3, y: q.y }
    const s = w.galaxy.systems[home.systemId]
    const at = worldToScreen(c.cam, view, { x: s.pos.x + ship.pos.x, y: s.pos.y + ship.pos.y })
    expect(pickAt(w, c.cam, view, at)).toEqual({ type: 'ship', id: ship.id })
  })

  test('летящий корабль выбирается там, где нарисован (со сглаживанием)', () => {
    const { w, c } = setup()
    const civ = w.civs[0]
    const home = capitalOf(w, civ)!
    c.flyToPlanet(home.id, true)
    const ship = spawnShip(w, civ, 'caravan', home, { type: 'return', planetId: home.id }, 50)
    const q = planetPos(home, w.t)
    ship.prevPos = { x: q.x + 100, y: q.y + 200 }
    ship.pos = { x: q.x + 140, y: q.y + 200 }
    c.cam.zoom = 3
    const s = w.galaxy.systems[home.systemId]
    const mid = worldToScreen(c.cam, view, { x: s.pos.x + q.x + 120, y: s.pos.y + q.y + 200 })
    expect(pickAt(w, c.cam, view, mid, 0.5)).toEqual({ type: 'ship', id: ship.id })
    expect(pickAt(w, c.cam, view, mid)).not.toEqual({ type: 'ship', id: ship.id })
  })

  test('пустота — ничего', () => {
    const { w, c } = setup()
    expect(pickAt(w, c.cam, view, { x: 3, y: 3 })).toBeNull()
  })

  test('на уровне галактики клик по значку битвы даёт { type: battle }; раньше системы', () => {
    const { w, c } = setup()
    const s = w.galaxy.systems[2]
    const home = capitalOf(w, w.civs[0])!
    const f1 = createFleet(w, w.civs[0], home, { type: 'defend', planetId: home.id })
    w.battles.push({ id: 99, systemId: s.id, phase: 'line', sides: [{ fleetIds: [f1.id], civ: 0 }, { fleetIds: [], civ: 1 }], pressure: 1 } as unknown as Battle)
    const at = worldToScreen(c.cam, view, battleIconPos(s, c.cam.zoom))
    expect(pickAt(w, c.cam, view, at)).toEqual({ type: 'battle', id: 99 })
    expect(pickAt(w, c.cam, view, worldToScreen(c.cam, view, s.pos))).toEqual({ type: 'system', id: s.id })
  })

  test('на подлёте клик внутри рамки даёт { type: fleet }; корабль важнее рамки', () => {
    const { w, c } = setup()
    const civ = w.civs[0]
    const home = capitalOf(w, civ)!
    for (const s of w.ships) s.alive = false
    const fleet = createFleet(w, civ, home, { type: 'defend', planetId: home.id })
    fleet.frame = null
    fleet.anchor = { x: 700, y: 0 }
    fleet.heading = 0
    fleet.columns = 3
    fleet.width = 80
    const ship = spawnShip(w, civ, 'battleship', home, { type: 'fleet', fleetId: fleet.id }, 600)
    ship.pos = { x: 700, y: 0 }
    ship.prevPos = { x: 700, y: 0 }
    addToFleet(w, fleet, ship)
    const s = w.galaxy.systems[home.systemId]
    c.cam.x = s.pos.x + 700
    c.cam.y = s.pos.y
    c.cam.zoom = 400 / s.radius
    const inside = worldToScreen(c.cam, view, { x: s.pos.x + 700 - 150, y: s.pos.y })
    expect(pickAt(w, c.cam, view, inside)).toEqual({ type: 'fleet', id: fleet.id })
    const onShip = worldToScreen(c.cam, view, { x: s.pos.x + 700, y: s.pos.y })
    expect(pickAt(w, c.cam, view, onShip)).toEqual({ type: 'ship', id: ship.id })
  })
})
