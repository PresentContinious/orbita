import { describe, expect, it } from 'vitest'
import { Controller } from '../../src/app/controller'
import { pickFocus } from '../../src/app/director'
import { createClock } from '../../src/app/loop'
import { createCamera } from '../../src/render/camera'
import { strengthOf } from '../../src/render/battleGeom'
import { BATTLE } from '../../src/sim/combat-config'
import { SPEEDS } from '../../src/sim/config'
import { createArena, parseArena } from '../../src/sim/arena'
import type { Battle, BattleSide, GameEvent } from '../../src/sim/types'
import { UiModel } from '../../src/ui/model'
import { buildSnapshot } from '../../src/ui/snapshot'

function setup(query = 'seed=1&A=3bb,1cv&B=3bb,1cv') {
  const w = createArena(parseArena(query))
  const [fa, fb] = w.fleets
  const side = (f: typeof fa, role: 'attacker' | 'defender'): BattleSide =>
    ({ fleetIds: [f.id], civ: f.owner, role, strength0: 1, strength: 1 }) as unknown as BattleSide
  const battle = {
    id: 77, systemId: fa.systemId, startT: 0, phase: 'line', phaseSince: 0,
    sides: [side(fa, 'attacker'), side(fb, 'defender')],
    pressure: 1, pressureSince: 0, pressureFlips: 0, pressureState: 1, decisionDeadline: null, planetId: null, log: [],
  } as unknown as Battle
  w.battles.push(battle)
  const c = new Controller(w, createCamera(), createClock(1), () => ({ width: 1600, height: 900 }))
  c.flyToSystem(battle.systemId, 'system', true)
  c.toggleFollow(true)
  c.setSpeed(3)
  return { w, c, battle }
}

const ev = (id: number, pri: 0 | 1 | 2, at: GameEvent['at']): GameEvent => ({ id, t: 0, kind: 'x', pri, text: 't', civs: [], at, count: 1 })

describe('battleController', () => {
  it('автозамедление: слежка + бой силы ≥ 1 000 → speedIndex = индекс ×2, slowNote «битва — ×2»; малый бой (< 1 000) не замедляет', () => {
    const { w, c, battle } = setup()
    expect(strengthOf(w, battle.sides[0])).toBeGreaterThanOrEqual(BATTLE.strengthIcon)
    c.update(1, 0.016)
    expect(SPEEDS[c.ui.speedIndex]).toBe(2)
    expect(c.ui.slowNote).toBe('битва — ×2')
    const small = setup()
    for (const s of small.w.ships) if (s.combat) s.combat.hull = 1
    small.c.update(1, 0.016)
    expect(small.c.ui.speedIndex).toBe(3)
    expect(small.c.ui.slowNote).toBeNull()
    const noFollow = setup()
    noFollow.c.toggleFollow(false)
    noFollow.c.update(1, 0.016)
    expect(noFollow.c.ui.speedIndex).toBe(3)
  })

  it('setSpeed пользователем снимает замедление и подпись; повторно в том же бою не замедляет', () => {
    const { c } = setup()
    c.update(1, 0.016)
    c.setSpeed(4)
    expect(c.ui.slowNote).toBeNull()
    expect(c.ui.slowedFrom).toBeNull()
    c.update(2, 0.016)
    expect(c.ui.speedIndex).toBe(4)
  })

  it('бой over → скорость возвращается к прежней', () => {
    const { c, battle } = setup()
    c.update(1, 0.016)
    expect(c.ui.speedIndex).toBe(1)
    battle.phase = 'over'
    c.update(2, 0.016)
    expect(c.ui.speedIndex).toBe(3)
    expect(c.ui.slowNote).toBeNull()
  })

  it('flyToEvent с at.battle летит к бою и выбирает его; с завершённым боем — к системе', () => {
    const { c, battle } = setup()
    c.select(null)
    c.flyToEvent(ev(1, 0, { system: battle.systemId, battle: battle.id }))
    expect(c.ui.selected).toEqual({ type: 'battle', id: battle.id })
    c.select(null)
    battle.phase = 'over'
    c.flyToEvent(ev(2, 0, { system: battle.systemId, battle: battle.id }))
    expect(c.ui.selected).toBeNull()
  })

  it('пикфокус слежки выбирает событие боя P0 раньше P1 колонизации', () => {
    const r = pickFocus([ev(5, 1, { system: 0, planet: 'p' }), ev(4, 0, { system: 0, battle: 1 })], 100, null)
    expect(r.event!.at.battle).toBe(1)
  })

  it('buildSnapshot: slowNote заполняется; без замедления — null', () => {
    const { w, c } = setup()
    const model = new UiModel()
    expect(buildSnapshot(w, c, model).slowNote).toBeNull()
    c.update(1, 0.016)
    expect(buildSnapshot(w, c, model).slowNote).toBe('битва — ×2')
  })

  it('SPEEDS содержит 2, индексы кнопок не ломают старые тесты TimeControls', () => {
    expect([...SPEEDS]).toEqual([1, 2, 5, 20, 50])
  })
})
