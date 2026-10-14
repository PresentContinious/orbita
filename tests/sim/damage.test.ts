import { describe, expect, it } from 'vitest'
import { CLASSES, type CombatKind } from '../../src/sim/classes'
import { DAMAGE } from '../../src/sim/combat-config'
import { EVENTS, SIM_DT } from '../../src/sim/config'
import {
  applyHit, beamsOf, canLaunch, canVolley, fireMul, rollModule, speedMul, stepCombatState, stepDebris, turretsOk,
} from '../../src/sim/damage'
import { ledgerBalance } from '../../src/sim/economy'
import { addToFleet, createFleet } from '../../src/sim/fleet'
import { logBattle } from '../../src/sim/battle'
import { fireBeam, stepProjectiles } from '../../src/sim/projectiles'
import { capitalOf } from '../../src/sim/query'
import { buildGrids, compactShips, spawnShip } from '../../src/sim/ships'
import type { Battle, Module, Ship, World } from '../../src/sim/types'
import { run, quietWorld } from '../helpers'
import { stepWorld } from '../../src/sim/world'

const X = 1000
const Y = 1000
const BID = 9001

function setup(seed = 1) {
  const w = quietWorld(seed)
  const a = w.civs[0]
  const b = w.civs[1]
  const home = capitalOf(w, a)!
  const sys = home.systemId
  w.galaxy.systems[sys].asteroids = []
  const fleetA = createFleet(w, a, home, { type: 'defend', planetId: home.id })
  const fleetB = createFleet(w, b, home, { type: 'defend', planetId: home.id })
  const battle = {
    id: BID,
    log: [],
    damage: {},
    rng: w.rng.fork('battle:' + BID),
    metrics: { lastEventT: 0 },
    sides: [{ fleetIds: [fleetA.id] }, { fleetIds: [fleetB.id] }],
  } as unknown as Battle
  w.battles.push(battle)
  fleetA.battleId = BID
  fleetB.battleId = BID
  const put = (owner: 'a' | 'b', kind: CombatKind, x: number, y: number, inFleet = true): Ship => {
    const civ = owner === 'a' ? a : b
    const s = spawnShip(w, civ, kind, home, { type: 'return', planetId: home.id }, CLASSES[kind].price)
    s.systemId = sys
    s.pos = { x, y }
    s.prevPos = { x, y }
    s.vel = { x: 0, y: 0 }
    if (inFleet) addToFleet(w, owner === 'a' ? fleetA : fleetB, s)
    return s
  }
  return { w, a, b, home, sys, fleetA, fleetB, battle, put }
}

/** фаза состояния боя как в stepWorld (без движения) */
function tick(w: World, n = 1): void {
  for (let i = 0; i < n; i++) {
    w.t += SIM_DT
    w.tick++
    buildGrids(w)
    stepCombatState(w)
    compactShips(w)
    stepDebris(w)
  }
}

describe('урон', () => {
  it('урон идёт в щит до 0, остаток — в корпус', () => {
    const { w, put } = setup()
    const s = put('b', 'battleship', X, Y)
    applyHit(w, s, 120, 'collision', 0)
    expect(s.combat!.shield).toBe(380)
    expect(s.combat!.hull).toBe(1500)
    applyHit(w, s, 600, 'collision', 0)
    expect(s.combat!.shield).toBe(0)
    expect(s.combat!.hull).toBe(1280)
  })

  it('щит не растёт 5 с после попадания, потом 12/с; при приказе orbit — 24/с', () => {
    const { w, put, fleetB } = setup()
    const s = put('b', 'battleship', X, Y)
    applyHit(w, s, 300, 'collision', 0)
    expect(s.combat!.shield).toBe(200)
    tick(w, 49)
    expect(s.combat!.shield).toBe(200)
    // прошло ≥ 5 с: ровно одна секунда регена
    s.combat!.lastHitT = w.t - 10
    tick(w, 10)
    expect(s.combat!.shield).toBeCloseTo(212, 6)
    fleetB.order = 'orbit'
    s.combat!.lastHitT = w.t - 10
    tick(w, 10)
    expect(s.combat!.shield).toBeCloseTo(236, 6)
  })

  it('торпеда 150 по голому корпусу выбивает модуль ≈ 35 % (200 бросков на зерне 1: 55–85)', () => {
    const { w, put } = setup(1)
    const s = put('b', 'battleship', X, Y, false)
    s.combat!.shield = 0
    let knocked = 0
    for (let i = 0; i < 200; i++) {
      s.combat!.hull = 1500
      s.combat!.modules = { engines: 1, turrets: 1, mainGun: 1 }
      applyHit(w, s, 150, 'torpedo', 0)
      if (Object.values(s.combat!.modules).some((v) => v === 0)) knocked++
    }
    expect(knocked).toBeGreaterThanOrEqual(55)
    expect(knocked).toBeLessThanOrEqual(85)
  })

  it('луч: один бросок на 40 за 5 шагов, а не пять; трассер и автопушка модулей не выбивают', () => {
    const { w, put, battle } = setup()
    let calls = 0
    battle.rng = { ...battle.rng, chance: () => (calls++, false) }
    const shooter = put('a', 'battleship', X, Y)
    const foe = put('b', 'battleship', X + 200, Y)
    foe.combat!.shield = 0
    fireBeam(w, shooter, foe, 0)
    for (let i = 0; i < 8; i++) {
      buildGrids(w)
      stepProjectiles(w)
      w.t += SIM_DT
      w.tick++
    }
    expect(foe.combat!.hull).toBe(1500 - 40)
    expect(calls).toBe(1)
    calls = 0
    applyHit(w, foe, 10, 'autocannon', shooter.id)
    applyHit(w, foe, 8, 'turret', shooter.id)
    applyHit(w, foe, 6, 'flak', shooter.id)
    applyHit(w, foe, 40, 'gun', shooter.id)
    expect(calls).toBe(0)
  })

  it('выбитые двигатели: speedMul 0.5; выбитый модуль не выбирается снова', () => {
    const { w, put } = setup()
    const s = put('b', 'battleship', X, Y)
    expect(speedMul(s)).toBe(1)
    expect(beamsOf(s)).toBe(2)
    const hit = new Set<Module>()
    for (let i = 0; i < 3; i++) {
      rollModule(w, s, 1)
      for (const m of ['engines', 'turrets', 'mainGun'] as Module[]) if (s.combat!.modules[m] === 0) hit.add(m)
      expect(hit.size).toBe(i + 1)
    }
    rollModule(w, s, 1)
    expect(hit.size).toBe(3)
    expect(speedMul(s)).toBe(DAMAGE.engineMul)
    expect(speedMul(s)).toBe(0.5)
    expect(beamsOf(s)).toBe(1)
    expect(turretsOk(s)).toBe(false)
    const car = put('b', 'carrier', X, Y)
    car.combat!.modules.hangar = 0
    expect(canLaunch(car)).toBe(false)
    expect(canVolley(car)).toBe(true)
  })

  it('корпус < 40 % → горит 30 с: −0.5 %/с, speedMul 0.6, fireMul 0.5; через 30 с не горит', () => {
    const { w, put } = setup()
    const s = put('b', 'battleship', X, Y)
    const c = s.combat!
    c.hull = 590
    tick(w, 1)
    expect(c.burning).not.toBeNull()
    expect(speedMul(s)).toBeCloseTo(0.6, 9)
    expect(fireMul(s)).toBe(0.5)
    tick(w, 100)
    // 7.5 ед/с (0.5 % от 1500)
    expect(590 - c.hull).toBeCloseTo(7.5 * 10.1, 0)
    tick(w, 210)
    expect(c.burning).toBeNull()
    expect(speedMul(s)).toBe(1)
    expect(fireMul(s)).toBe(1)
    const after = c.hull
    expect(590 - after).toBeCloseTo(7.5 * 30, 0)
    tick(w, 100)
    expect(c.burning).toBeNull()
    expect(c.hull).toBe(after)
  })

  it('гибель: alive=false, обломок 20 % цены и r = 1.5 длины, событие P1 с at.battle, battle.damage «battleship→corvette» > 0', () => {
    const { w, put, battle, fleetB } = setup()
    const killer = put('a', 'battleship', X, Y)
    const victim = put('b', 'corvette', X + 100, Y)
    put('b', 'corvette', X + 100, Y + 20)
    applyHit(w, victim, 1000, 'beam', killer.id)
    expect(victim.alive).toBe(false)
    expect(w.debris).toHaveLength(1)
    expect(w.debris[0].value).toBeCloseTo(0.2 * 60, 9)
    expect(w.debris[0].r).toBeCloseTo(1.5 * 5, 9)
    const ev = w.events.find((e) => e.kind === 'shipLost')!
    expect(ev.pri).toBe(1)
    expect(ev.at.battle).toBe(BID)
    expect(battle.damage['battleship→corvette']).toBeGreaterThan(0)
    expect(fleetB.shipIds).not.toContain(victim.id)
    expect(battle.log.some((l) => l.kind === 'death')).toBe(true)
    // повторное попадание по мёртвому ничего не меняет
    applyHit(w, victim, 1000, 'beam', killer.id)
    expect(w.debris).toHaveLength(1)
  })

  it('лом: корабль с миссией salvage собирает за 8 с, earn salvage, ledgerBalance сходится, обломок исчез', () => {
    const { w, put, a } = setup()
    const dead = put('b', 'battleship', X, Y, false)
    applyHit(w, dead, 99999, 'beam', 0)
    const d = w.debris[0]
    expect(d.value).toBeCloseTo(120, 9)
    const sal = put('a', 'frigate', d.pos.x, d.pos.y, false)
    sal.mission = { type: 'salvage', debrisId: d.id, startT: null }
    const before = a.eco.ledger.income.salvage
    run(w, 7)
    expect(w.debris).toHaveLength(1)
    expect(a.eco.ledger.income.salvage).toBe(before)
    run(w, 1.5)
    expect(w.debris).toHaveLength(0)
    expect(a.eco.ledger.income.salvage).toBeCloseTo(before + 120, 9)
    expect(sal.mission.type).toBe('return')
    expect(w.fx.some((f) => f.amount === 120)).toBe(true)
    expect(ledgerBalance(a)).toBeCloseTo(a.treasury, 6)
  })

  it('лом: корабль ушёл от обломка и вернулся — сбор начинается заново, 8 с', () => {
    const { w, put, a } = setup()
    const dead = put('b', 'battleship', X, Y, false)
    applyHit(w, dead, 99999, 'beam', 0)
    const d = w.debris[0]
    const sal = put('a', 'frigate', d.pos.x, d.pos.y, false)
    sal.mission = { type: 'salvage', debrisId: d.id, startT: null }
    run(w, 5)
    expect(sal.mission.type === 'salvage' && sal.mission.startT).not.toBeNull()
    sal.pos = { x: d.pos.x + d.r + 50, y: d.pos.y }
    sal.vel = { x: 0, y: 0 }
    run(w, 0.1)
    expect(sal.mission.type === 'salvage' && sal.mission.startT).toBeNull()
    sal.pos = { x: d.pos.x, y: d.pos.y }
    sal.vel = { x: 0, y: 0 }
    run(w, 5)
    expect(w.debris).toHaveLength(1)
    expect(a.eco.ledger.income.salvage).toBe(0)
    run(w, 4)
    expect(w.debris).toHaveLength(0)
  })

  it('обломок держит держава без врагов на 800 в течение 30 с; истекает через 720 с', () => {
    const { w, put } = setup()
    const dead = put('b', 'corvette', X, Y, false)
    applyHit(w, dead, 9999, 'beam', 0)
    const d = w.debris[0]
    const mine = put('a', 'corvette', X + 500, Y, false)
    tick(w, 250)
    expect(d.holder).toBeNull()
    tick(w, 60)
    expect(d.holder).toBe(mine.owner)
    // чужой корабль в 300 — поле спорное
    put('b', 'corvette', X + 300, Y, false)
    tick(w, 20)
    expect(d.holder).toBeNull()
    // срок: ещё живёт на 715-й секунде, на 721-й — нет
    d.bornT = w.t - 715
    tick(w, 20)
    expect(w.debris).toHaveLength(1)
    tick(w, 60)
    expect(w.debris).toHaveLength(0)
  })

  it('гибель в шаге не сбивает сетку: stepDebris после compactShips видит настоящего соседа', () => {
    const { w, put } = setup()
    const dead = put('b', 'corvette', X, Y, false)
    applyHit(w, dead, 9999, 'beam', 0)
    const victim = put('b', 'corvette', X + 5000, Y, false)
    const mine = put('a', 'corvette', X + 500, Y, false)
    compactShips(w)
    const d = w.debris[0]
    while ((w.tick + 1) % 10 !== 0) w.tick++
    w.t += SIM_DT
    w.tick++
    buildGrids(w)
    // корабль с меньшим индексом гибнет в этом шаге — индексы сдвигаются при сжатии
    victim.alive = false
    compactShips(w)
    stepDebris(w)
    expect(d.holdCiv).toBe(mine.owner)
  })

  it('мирный корабль от попадания гибнет через killShip: событие и обломок', () => {
    const { w, a, home, sys } = setup()
    const caravan = spawnShip(w, a, 'caravan', home, { type: 'return', planetId: home.id }, 50)
    caravan.systemId = sys
    caravan.pos = { x: X, y: Y }
    const events = w.events.length
    applyHit(w, caravan, 10, 'beam', 0)
    expect(caravan.alive).toBe(false)
    expect(w.debris).toHaveLength(1)
    expect(w.events.length).toBeGreaterThan(events)
  })

  it('журнал боя не длиннее 200 строк', () => {
    const { w, battle } = setup()
    for (let i = 0; i < 300; i++) logBattle(w, battle, 'x', 'строка ' + i)
    expect(battle.log).toHaveLength(EVENTS.battleLog)
    expect(battle.log[battle.log.length - 1].text).toBe('строка 299')
  })

  it('бросок на модуль — из battle.rng: два мира с одним зерном дают одинаковые модули', () => {
    const modulesAfter = () => {
      const { w, put } = setup(3)
      const out: string[] = []
      for (let i = 0; i < 40; i++) {
        const s = put('b', 'battleship', X, Y)
        s.combat!.shield = 0
        applyHit(w, s, 150, 'torpedo', 0)
        applyHit(w, s, 100, 'missile', 0)
        out.push(JSON.stringify(s.combat!.modules))
      }
      return out.join('|')
    }
    const first = modulesAfter()
    expect(first).toContain('0')
    expect(modulesAfter()).toBe(first)
  })

  it('мировой шаг: stepWorld зовёт горение и обломки без падений', () => {
    const { w, put } = setup()
    const s = put('b', 'battleship', X, Y)
    s.mission = { type: 'fleet', fleetId: s.fleetId! }
    s.combat!.hull = 500
    stepWorld(w)
    expect(s.combat!.burning).not.toBeNull()
  })
})
