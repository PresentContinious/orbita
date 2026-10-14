import { describe, expect, test } from 'vitest'
import { Controller } from '../../src/app/controller'
import { createClock } from '../../src/app/loop'
import { createCamera } from '../../src/render/camera'
import { capitalOf } from '../../src/sim/query'
import { SIM_DT } from '../../src/sim/config'
import { planetPos } from '../../src/sim/system'
import { stepWorld } from '../../src/sim/world'
import { quietWorld } from '../helpers'

function setup() {
  const w = quietWorld(4815)
  const c = new Controller(w, createCamera(), createClock(1), () => ({ width: 1600, height: 900 }))
  c.flyToGalaxy(true)
  return { w, c }
}

describe('Controller', () => {
  test('хлебные крошки: галактика → система → планета', () => {
    const { w, c } = setup()
    expect(c.crumbs().map((x) => x.label)).toEqual(['Галактика'])
    const home = capitalOf(w, w.civs[0])!
    const sys = w.galaxy.systems[home.systemId]
    c.flyToSystem(sys.id, 'approach', true)
    expect(c.level()).toBe('approach')
    expect(c.crumbs().map((x) => x.label)).toEqual(['Галактика', sys.name])
    c.flyToPlanet(home.id, true)
    expect(c.level()).toBe('system')
    expect(c.crumbs().map((x) => x.label)).toEqual(['Галактика', sys.name, home.name])
  })

  test('камера следует за выбранной планетой, пока она летит по орбите', () => {
    const { w, c } = setup()
    const home = capitalOf(w, w.civs[0])!
    c.flyToPlanet(home.id, true)
    for (let i = 0; i < 100; i++) stepWorld(w)
    c.update(10, 0.016)
    const s = w.galaxy.systems[home.systemId]
    const q = planetPos(home, w.t - SIM_DT)
    expect(c.cam.x).toBeCloseTo(s.pos.x + q.x)
    expect(c.cam.y).toBeCloseTo(s.pos.y + q.y)
  })

  test('слежка за планетой использует сглаженное время кадра', () => {
    const { w, c } = setup()
    const home = capitalOf(w, w.civs[0])!
    c.flyToPlanet(home.id, true)
    for (let i = 0; i < 100; i++) stepWorld(w)
    c.clock.acc = SIM_DT / 2
    c.update(10, 0.016)
    const s = w.galaxy.systems[home.systemId]
    const q = planetPos(home, w.t - SIM_DT / 2)
    expect(c.cam.x).toBeCloseTo(s.pos.x + q.x)
    expect(c.cam.y).toBeCloseTo(s.pos.y + q.y)
  })

  test('Esc при включённой слежке и без выбора выключает слежку', () => {
    const { c } = setup()
    c.toggleFollow(true)
    c.back()
    expect(c.ui.follow).toBe(false)
  })

  test('Esc по шагам: снять выбор → обзор системы → галактика', () => {
    const { w, c } = setup()
    const home = capitalOf(w, w.civs[0])!
    c.flyToPlanet(home.id, true)
    c.back()
    expect(c.ui.selected).toBeNull()
    expect(c.cam.follow).toBeNull()
    c.update(0, 0)
    c.back()
    c.update(5, 0)
    expect(c.level()).toBe('approach')
    c.back()
    c.update(10, 0)
    expect(c.level()).toBe('galaxy')
  })

  test('скорость и пауза управляют часами', () => {
    const { c } = setup()
    c.setSpeed(4)
    c.update(0, 0)
    expect(c.clock.speed).toBe(50)
    c.togglePause()
    c.update(0, 0)
    expect(c.clock.speed).toBe(0)
  })

  test('ручное движение камеры выключает слежку', () => {
    const { w, c } = setup()
    c.toggleFollow(true)
    c.flyToPlanet(capitalOf(w, w.civs[0])!.id, true)
    c.userMoved()
    expect(c.ui.follow).toBe(false)
    expect(c.cam.follow).toBeNull()
  })
})

describe("Controller: лимит юнитов", () => {
  test("setUnitCap меняет world.unitCap", () => {
    const { w, c } = setup()
    c.setUnitCap(1000)
    expect(w.unitCap).toBe(1000)
  })
})
