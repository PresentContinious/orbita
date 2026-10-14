import { describe, expect, it } from 'vitest'
import { Controller } from '../../src/app/controller'
import { createClock } from '../../src/app/loop'
import { createCamera } from '../../src/render/camera'
import { createArena, parseArena } from '../../src/sim/arena'
import { CLASSES } from '../../src/sim/classes'
import type { Battle, BattleSide, World } from '../../src/sim/types'
import { battleCard, cardFor, fleetCard, orderName, phaseName, shipCard, traitName } from '../../src/ui/cards'
import { iconFor } from '../../src/ui/icons'
import { UiModel } from '../../src/ui/model'
import { buildSnapshot } from '../../src/ui/snapshot'

/** арена + бой, собранный руками (логики боя в ветке ещё нет) */
function arenaBattle(query = 'seed=1&A=3bb,1cv&B=2bb,2ff,1cv') {
  const w = createArena(parseArena(query))
  const [fa, fb] = w.fleets
  const classes0 = (fleetId: number) => {
    const out: Record<string, number> = {}
    for (const s of w.ships) if (s.fleetId === fleetId && s.combat) out[s.kind] = (out[s.kind] ?? 0) + 1
    return out
  }
  const side = (f: typeof fa, role: 'attacker' | 'defender'): BattleSide =>
    ({ fleetIds: [f.id], civ: f.owner, role, strength0: 1, strength: 1, classes0: classes0(f.id) }) as unknown as BattleSide
  const battle = {
    id: 77, systemId: fa.systemId, startT: 0, phase: 'line', phaseSince: 0,
    sides: [side(fa, 'attacker'), side(fb, 'defender')],
    pressure: 1.4, pressureSince: 0, pressureFlips: 0, pressureState: 1,
    decisionDeadline: null, planetId: null, log: [],
  } as unknown as Battle
  w.battles.push(battle)
  return { w, fa, fb, battle }
}

describe('battleCards', () => {
  it('battleCard: заголовок «Бой у <планета/система>», обе стороны с адмиралом и характером по-русски', () => {
    const { w, fa, battle } = arenaBattle()
    w.admirals.find((a) => a.id === fa.admiralId)!.trait = 'bold'
    const c = battleCard(w, battle.id)!
    expect(c.kind).toBe('battle')
    expect(c.title).toBe(`Бой у ${w.galaxy.systems[battle.systemId].name}`)
    battle.planetId = [...w.planets.keys()][0]
    expect(battleCard(w, battle.id)!.title).toBe(`Бой у ${w.planets.get(battle.planetId)!.name}`)
    expect(c.sections).toHaveLength(2)
    const adm = c.sections![0].rows.find((r) => r.label === 'адмирал')!.value
    expect(adm).toContain(' — Напористый')
    expect(c.sections![1].rows.some((r) => r.label === 'адмирал')).toBe(true)
    expect(traitName('careful')).toBe('Осторожный')
    expect(phaseName('line')).toBe('линия')
  })

  it('battleCard: таблица классов «было / живы / горят» сходится с живыми кораблями; «было» — из classes0', () => {
    const { w, battle, fa } = arenaBattle()
    battle.sides[0].classes0 = { ...battle.sides[0].classes0, battleship: 5 }
    const victim = w.ships.find((s) => s.fleetId === fa.id && s.kind === 'battleship')!
    victim.alive = false
    const burning = w.ships.find((s) => s.fleetId === fa.id && s.kind === 'battleship' && s.alive)!
    burning.combat!.burning = w.t
    const t = battleCard(w, battle.id)!.table!
    expect(t.head[0]).toBe('класс')
    const row = t.rows.find((r) => r[0] === 'Линкор')!
    // сторона 0: было 5 (из classes0), живы 2, горит 1
    expect(row.slice(1, 4)).toEqual(['5', '2', '1'])
    // сторона 1: 2 линкора, как в classes0
    expect(row.slice(4, 7)).toEqual(['2', '2', '0'])
  })

  it('battleCard: приказ с причиной из orderReason; давление и стрелка; залпы «N из 10»; крыло «в воздухе / на палубе / потеряно»', () => {
    const { w, fa, fb, battle } = arenaBattle('seed=1&A=2bb,1cv&B=2ff,1bb')
    fa.order = 'push'
    fa.orderReason = 'враг слабее на левом фланге'
    for (const id of fb.shipIds) {
      const s = w.ships[w.shipIndex.get(id)!]
      if (s.kind === 'frigate') s.combat!.ammo = CLASSES.frigate.ammo / 2
    }
    battle.sides[0].classes0 = { ...battle.sides[0].classes0, interceptor: 6, bomber: 6 }
    const c = battleCard(w, battle.id)!
    const a = c.sections![0].rows
    expect(a.find((r) => r.label === 'приказ')!.value).toBe(orderName('push'))
    expect(a.find((r) => r.label === 'причина')!.value).toBe('враг слабее на левом фланге')
    expect(c.rows.find((r) => r.label === 'давление')!.value).toMatch(/^давит /)
    expect(c.meter![0].value).toBeGreaterThan(0.5)
    expect(c.sections![1].rows.find((r) => r.label === 'залпы')!.value).toBe('5 из 10')
    const wing = a.find((r) => r.label === 'крыло')!.value
    expect(wing).toMatch(/^\d+ в воздухе \/ \d+ на палубе \/ \d+ потеряно$/)
  })

  it('battleCard: таймер решения появляется в фазе decision; лента — последние 30 строк', () => {
    const { w, battle } = arenaBattle()
    expect(battleCard(w, battle.id)!.subtitle).toBe('линия')
    battle.phase = 'decision'
    battle.decisionDeadline = w.t + 12
    expect(battleCard(w, battle.id)!.subtitle).toBe('решение · 12 с')
    battle.log = Array.from({ length: 45 }, (_, i) => ({ t: i, kind: 'x', text: 'строка ' + i }))
    const log = battleCard(w, battle.id)!.log!
    expect(log).toHaveLength(30)
    expect(log[29].text).toBe('строка 44')
  })

  it('fleetCard: миссия, приказ, состав, сплочённость; в консервации — пометка; при мобилизации — обратный отсчёт', () => {
    const { w, fa } = arenaBattle()
    fa.order = 'line'
    fa.orderReason = 'держим линию'
    fa.cohesion = 64
    fa.mobilizedAt = w.t - 1000
    let c = fleetCard(w, fa.id)!
    const get = (l: string) => c.rows.find((r) => r.label === l)?.value
    expect(c.kind).toBe('fleet')
    expect(c.title).toBe(fa.name)
    expect(get('миссия')).toMatch(/^показывает силу у /)
    expect(get('приказ')).toBe('линия')
    expect(get('причина')).toBe('держим линию')
    expect(get('состав')).toContain('Линкор 3')
    expect(get('сплочённость')).toBe('64')
    expect(get('состояние')).toBeUndefined()
    fa.mothballedSince = w.t
    c = fleetCard(w, fa.id)!
    expect(get('состояние')).toBe('в консервации')
    fa.mothballedSince = null
    fa.mobilizedAt = w.t
    c = fleetCard(w, fa.id)!
    expect(get('состояние')).toMatch(/^мобилизация \d+ с$/)
  })

  it('shipCard: корпус, щит, модули, ранг римскими, флот; горящий — «горит»', () => {
    const { w, fa } = arenaBattle()
    const ship = w.ships.find((s) => s.fleetId === fa.id && s.kind === 'battleship')!
    ship.combat!.hull = 1200
    ship.combat!.rank = 2
    ship.combat!.modules.engines = 0.5
    let c = shipCard(w, ship.id)!
    const get = (l: string) => c.rows.find((r) => r.label === l)?.value
    expect(get('корпус')).toBe('1 200 / 1 500')
    expect(get('щит')).toBe('500 / 500')
    expect(get('модули')).toBe('двигатели повреждены')
    expect(get('ранг')).toBe('II')
    expect(get('флот')).toBe(fa.name)
    expect(get('состояние')).toBeUndefined()
    ship.combat!.burning = w.t
    c = shipCard(w, ship.id)!
    expect(get('состояние')).toBe('горит')
  })

  it('cardFor({ type: battle }) и ({ type: fleet }) дают карточки; незнакомый id — null', () => {
    const { w, fa, battle } = arenaBattle()
    expect(cardFor(w, { type: 'battle', id: battle.id })!.kind).toBe('battle')
    expect(cardFor(w, { type: 'fleet', id: fa.id })!.kind).toBe('fleet')
    expect(cardFor(w, { type: 'battle', id: 9999 })).toBeNull()
    expect(cardFor(w, { type: 'fleet', id: 9999 })).toBeNull()
  })
})

function ctl(w: World) {
  const c = new Controller(w, createCamera(), createClock(1), () => ({ width: 1600, height: 900 }))
  c.flyToGalaxy(true)
  return c
}

describe('battleCards: снимок и контроллер', () => {
  it('buildSnapshot: battles содержит текущий бой с label и силами; slowNote null', () => {
    const { w, battle } = arenaBattle()
    const s = buildSnapshot(w, ctl(w), new UiModel())
    expect(s.battles).toHaveLength(1)
    const b = s.battles[0]
    expect(b.id).toBe(battle.id)
    expect(b.label).toContain(w.galaxy.systems[battle.systemId].name)
    expect(b.strength[0]).toBeGreaterThan(0)
    expect(b.strength[1]).toBeGreaterThan(0)
    expect(b.colors[0]).toMatch(/^#[0-9a-f]{6}$/)
    expect(b.phase).toBe('line')
    expect(s.slowNote).toBeNull()
  })

  it('controller.flyToBattle выбирает бой, камера летит к середине между якорями, crumbs заканчиваются «Бой»', () => {
    const { w, fa, fb, battle } = arenaBattle()
    const c = ctl(w)
    c.flyToBattle(battle.id, true)
    expect(c.ui.selected).toEqual({ type: 'battle', id: battle.id })
    const sys = w.galaxy.systems[battle.systemId]
    expect(c.cam.x).toBeCloseTo(sys.pos.x + (fa.anchor.x + fb.anchor.x) / 2)
    expect(c.cam.y).toBeCloseTo(sys.pos.y + (fa.anchor.y + fb.anchor.y) / 2)
    expect(c.cam.follow).toBeNull()
    const labels = c.crumbs().map((x) => x.label)
    expect(labels[labels.length - 1]).toBe('Бой')
    expect(labels).toContain(sys.name)
  })

  it('iconFor(battle) и iconFor(verdict) — свои значки, не other', () => {
    expect(iconFor('battle')).toBe('battle')
    expect(iconFor('verdict')).toBe('verdict')
    expect(iconFor('shipLost')).toBe('crisis')
    expect(iconFor('zzz')).toBe('other')
  })
})
