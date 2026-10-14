import { describe, expect, test } from 'vitest'
import { Controller } from '../../src/app/controller'
import { createClock } from '../../src/app/loop'
import { createCamera, worldToScreen } from '../../src/render/camera'
import { pickAt } from '../../src/render/hit'
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
})
