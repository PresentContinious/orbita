import { describe, expect, test } from 'vitest'
import { Controller } from '../../src/app/controller'
import { pickFocus } from '../../src/app/director'
import { createClock } from '../../src/app/loop'
import { createCamera } from '../../src/render/camera'
import { pushEvent } from '../../src/sim/events'
import { capitalOf } from '../../src/sim/query'
import type { GameEvent } from '../../src/sim/types'
import { quietWorld } from '../helpers'

const ev = (id: number, pri: 0 | 1 | 2): GameEvent => ({ id, t: 0, kind: 'x', pri, text: '', civs: [], at: { system: 0 }, count: 1 })

describe('pickFocus', () => {
  test('важное важнее свежего, среди равных — самое новое', () => {
    expect(pickFocus([ev(1, 1), ev(2, 0), ev(3, 1)], 0, null).event!.id).toBe(2)
    expect(pickFocus([ev(1, 1), ev(3, 1)], 0, null).event!.id).toBe(3)
  })

  test('камера задерживается минимум на 8 с', () => {
    const first = pickFocus([ev(1, 1)], 10, null)
    expect(pickFocus([ev(2, 0)], 15, first.focus).event).toBeNull()
    expect(pickFocus([ev(2, 0)], 18.5, first.focus).event!.id).toBe(2)
  })

  test('нового нет — остаёмся где были', () => {
    const f = { eventId: 1, since: 0 }
    expect(pickFocus([], 100, f)).toEqual({ focus: f, event: null })
  })
})

describe('слежка в контроллере', () => {
  test('новое событие на планете — камера летит туда и следует за планетой, не выделяя её', () => {
    const w = quietWorld(4815)
    const c = new Controller(w, createCamera(), createClock(1), () => ({ width: 1600, height: 900 }))
    c.flyToGalaxy(true)
    c.toggleFollow(true)
    c.update(0, 0)
    const home = capitalOf(w, w.civs[0])!
    pushEvent(w, { kind: 'colony', pri: 0, text: 'тест', civs: [w.civs[0].id], at: { system: home.systemId, planet: home.id } })
    c.update(1, 0)
    expect(c.cam.follow).toBe(home.id)
    expect(c.cam.fly).not.toBeNull()
    expect(c.ui.selected).toBeNull()
  })
})
