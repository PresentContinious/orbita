import { describe, expect, it } from 'vitest'
import { CLASSES, type CombatKind } from '../../src/sim/classes'
import { BATTLE, HIT } from '../../src/sim/combat-config'
import { SIM_DT } from '../../src/sim/config'
import { addToFleet, createFleet } from '../../src/sim/fleet'
import { allocProjectile, stepProjectiles } from '../../src/sim/projectiles'
import { capitalOf } from '../../src/sim/query'
import { buildGrids, compactShips, spawnShip } from '../../src/sim/ships'
import type { Battle, Ship, World } from '../../src/sim/types'
import {
  autocannonTarget, fireWeapons, flakTarget, hitChance, interceptorTarget, markGroups, pickTargets, screenTarget, setChannel,
} from '../../src/sim/weapons'
import { quietWorld } from '../helpers'

const X = 1000
const Y = 1000
const BID = 9100

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
    id: BID, log: [], damage: {}, rng: w.rng.fork('battle:' + BID), metrics: { lastEventT: 0 },
    phase: 'over', sides: [{ fleetIds: [fleetA.id], hullDealt: [] }, { fleetIds: [fleetB.id], hullDealt: [] }],
  } as unknown as Battle
  w.battles.push(battle)
  fleetA.battleId = BID
  fleetB.battleId = BID
  const put = (owner: 'a' | 'b', kind: CombatKind, x: number, y: number, inFleet = true): Ship => {
    const s = spawnShip(w, owner === 'a' ? a : b, kind, home, { type: 'return', planetId: home.id }, 0)
    s.systemId = sys
    s.pos = { x, y }
    s.prevPos = { x, y }
    s.vel = { x: 0, y: 0 }
    if (inFleet) addToFleet(w, owner === 'a' ? fleetA : fleetB, s)
    return s
  }
  /** снаряд-заглушка в пуле и в сетке снарядов */
  const proj = (kind: 'missile' | 'torpedo' | 'decoy', owner: number, x: number, y: number) => {
    const p = allocProjectile(w, kind)!
    p.alive = true
    p.owner = owner
    p.x = x
    p.y = y
    p.hp = 5
    p.systemId = sys
    const idx = w.projectiles.indexOf(p)
    w.projGrids[sys].insert(idx, x, y)
    return { p, ref: -(idx + 1) }
  }
  return { w, a, b, home, sys, fleetA, fleetB, battle, put, proj }
}

const wpOf = (kind: CombatKind, i: number) => CLASSES[kind].weapons[i]

function tickAt(w: World, n: number): void {
  w.tick = n
  buildGrids(w)
}

const beams = (w: World) => w.projectiles.filter((p) => p.alive && p.kind === 'beam').length

describe('оружие', () => {
  it('перенацеливание расслоено: корабль меняет цель только на шаге id % 10 === tick % 10', () => {
    const { w, put } = setup()
    const s = put('a', 'corvette', X, Y)
    put('b', 'corvette', X + 30, Y)
    for (let t = 0; t < 10; t++) {
      s.combat!.targetId = null
      tickAt(w, t)
      pickTargets(w)
      if (t === s.id % 10) expect(s.combat!.targetId).not.toBeNull()
      else expect(s.combat!.targetId).toBeNull()
    }
  })

  it('зенитка: торпеда раньше ракеты, ракета раньше машины, машина раньше корпуса; внутри класса — ближайшая к якорю, не к стрелку', () => {
    const { w, put, proj, fleetA, b } = setup()
    const s = put('a', 'corvette', X, Y)
    fleetA.anchor = { x: X - 500, y: Y }
    const hull = put('b', 'corvette', X + 10, Y, false)
    const wp = wpOf('corvette', 0)
    buildGrids(w)
    expect(flakTarget(w, s, wp)).toBe(hull.id)
    const craft = put('b', 'interceptor', X + 40, Y, false)
    buildGrids(w)
    expect(flakTarget(w, s, wp)).toBe(craft.id)
    const m = proj('missile', b.id, X + 50, Y)
    expect(flakTarget(w, s, wp)).toBe(m.ref)
    const right = proj('torpedo', b.id, X + 60, Y + 10)
    expect(flakTarget(w, s, wp)).toBe(right.ref)
    // якорь слева: левая торпеда ближе к якорю, хотя обе на одном расстоянии от стрелка
    const left = proj('torpedo', b.id, X - 40, Y - 10)
    expect(flakTarget(w, s, wp)).toBe(left.ref)
    // якорь справа: выигрывает правая
    fleetA.anchor = { x: X + 500, y: Y }
    expect(flakTarget(w, s, wp)).toBe(right.ref)
  })

  it('луч бьёт только в секторе ±60° от носа; цель держится, пока жива и в секторе', () => {
    const { w, put } = setup()
    const s = put('a', 'battleship', X, Y)
    const behind = put('b', 'corvette', X - 50, Y, false)
    const front = put('b', 'corvette', X + 200, Y, false)
    s.combat!.heading = 0
    tickAt(w, s.id % 10)
    pickTargets(w)
    expect(s.combat!.targetId).toBe(front.id)
    // ближе появилась цель в секторе: старая держится
    put('b', 'corvette', X + 100, Y + 20, false)
    tickAt(w, s.id % 10)
    pickTargets(w)
    expect(s.combat!.targetId).toBe(front.id)
    // повернули нос: прежние цели вне сектора, выбирается та, что теперь спереди
    s.combat!.heading = Math.PI
    tickAt(w, s.id % 10)
    pickTargets(w)
    expect(s.combat!.targetId).toBe(behind.id)
    // луч не выпускается по цели вне сектора
    s.combat!.targetId = front.id
    fireWeapons(w)
    expect(beams(w)).toBe(0)
    s.combat!.heading = 0
    fireWeapons(w)
    expect(beams(w)).toBe(2)
  })

  it('группы метки: 7 линкоров → 3 + 2 + 2 (одиночка присоединён); группы бьют разные цели, при нехватке целей — с минимальным щитом', () => {
    const { w, put, fleetA } = setup()
    const mine: Ship[] = []
    for (let i = 0; i < 7; i++) {
      const s = put('a', 'battleship', X, Y + i * 8)
      s.combat!.slot = { kind: 'line', column: i, x: 0, y: i * 8, phase: 0 }
      mine.push(s)
    }
    const groups = markGroups(w, fleetA)
    expect(groups.map((g) => g.length)).toEqual([3, 2, 2])
    expect(groups[0]).toEqual(mine.slice(0, 3).map((s) => s.id))
    const f1 = put('b', 'battleship', X + 150, Y + 10, false)
    const f2 = put('b', 'battleship', X + 150, Y + 30, false)
    f1.combat!.shield = 100
    f2.combat!.shield = 50
    const run = () => {
      for (let t = 0; t < 10; t++) {
        tickAt(w, t)
        pickTargets(w)
      }
    }
    const targetOf = (id: number) => mine.find((s) => s.id === id)!.combat!.targetId
    run()
    const picked = groups.map((g) => targetOf(g[0]))
    groups.forEach((g, k) => {
      for (const id of g) expect(targetOf(id)).toBe(picked[k])
    })
    expect(new Set(picked)).toEqual(new Set([f1.id, f2.id]))
    // дважды выбранная цель: с минимальным щитом
    expect(picked.filter((p) => p === f2.id).length).toBe(2)
    // целей хватает на всех групп: три разных
    put('b', 'battleship', X + 150, Y + 50, false)
    f1.combat!.shield = 100
    f2.combat!.shield = 50
    for (const s of mine) s.combat!.targetId = null
    for (const s of mine) s.combat!.slot!.y += 0 // состав не менялся: группы те же
    // старые цели групп валидны, поэтому группы держат их; сбросим удержание гибелью целей
    f1.alive = false
    f2.alive = false
    const g1 = put('b', 'battleship', X + 150, Y + 10, false)
    const g2 = put('b', 'battleship', X + 150, Y + 30, false)
    run()
    const again = groups.map((g) => targetOf(g[0]))
    expect(new Set(again).size).toBe(3)
    expect([g1.id, g2.id].every((id) => again.includes(id))).toBe(true)
  })

  it('приоритет frigates: лучи выбирают фрегат, а не ближайший линкор', () => {
    const { w, put, fleetA } = setup()
    const s = put('a', 'battleship', X, Y)
    s.combat!.slot = { kind: 'line', column: 0, x: 0, y: 0, phase: 0 }
    const bs = put('b', 'battleship', X + 100, Y, false)
    const fr = put('b', 'frigate', X + 200, Y + 10, false)
    tickAt(w, s.id % 10)
    pickTargets(w)
    expect(s.combat!.targetId).toBe(bs.id)
    fleetA.targetPriority = 'frigates'
    s.combat!.targetId = bs.id
    s.combat!.targetId = null
    tickAt(w, s.id % 10)
    pickTargets(w)
    expect(s.combat!.targetId).toBe(fr.id)
  })

  it('залп ряда: 3 фрегата с разными кулдаунами стреляют в один такт; по готовности — врозь', () => {
    const { w, put, fleetA, battle } = setup()
    const foe = put('b', 'battleship', X + 200, Y, false)
    const fr = [0, 1, 2].map((i) => {
      const s = put('a', 'frigate', X, Y + i * 10)
      s.combat!.targetId = foe.id
      return s
    })
    const missiles = () => w.projectiles.filter((p) => p.alive && p.kind === 'missile').length
    const setCd = () => {
      fr[0].combat!.cooldown[0] = 0
      fr[1].combat!.cooldown[0] = 3
      fr[2].combat!.cooldown[0] = 6
    }
    buildGrids(w)
    fleetA.missiles = 'volley'
    setCd()
    w.t = 2
    fireWeapons(w)
    expect(missiles()).toBe(0)
    w.t = 6
    fireWeapons(w)
    expect(missiles()).toBe(3)
    expect(battle.log.some((e) => e.text === 'Залп ряда: 3 ракет')).toBe(true)
    for (const p of w.projectiles) p.alive = false
    fleetA.missiles = 'ready'
    setCd()
    w.t = 1
    fireWeapons(w)
    expect(missiles()).toBe(1)
    w.t = 3
    fireWeapons(w)
    expect(missiles()).toBe(2)
  })

  it('турели pd стреляют по ракетам, screen — по корветам в передней петле', () => {
    const { w, put, proj, fleetA, b } = setup()
    const s = put('a', 'battleship', X, Y)
    fleetA.heading = 0
    const m = proj('missile', b.id, X + 100, Y)
    const behind = put('b', 'corvette', X - 50, Y, false)
    const ahead = put('b', 'corvette', X + 120, Y, false)
    buildGrids(w)
    const wp = wpOf('battleship', 1)
    expect(flakTarget(w, s, wp)).toBe(m.ref)
    expect(screenTarget(w, s, wp)).toBe(ahead.id)
    expect(behind.alive).toBe(true)
  })

  it('турель по линкору: попадание всегда, урон 8 × 0.25; по корвету — 35 % на зерне (из 200 выстрелов 55–85)', () => {
    const { w, put } = setup()
    const s = put('a', 'battleship', X, Y)
    s.combat!.heading = Math.PI // лучи не достают: цель сзади
    const bs = put('b', 'battleship', X + 100, Y, false)
    bs.combat!.shield = 0
    buildGrids(w)
    s.combat!.cooldown = [0, 0]
    fireWeapons(w)
    expect(bs.combat!.hull).toBe(1500 - 4 * 8 * HIT.turret.capitalMul)
    bs.alive = false
    const cv = put('b', 'corvette', X + 100, Y, false)
    buildGrids(w)
    let hits = 0
    for (let i = 0; i < 50; i++) {
      cv.combat!.hull = 120
      s.combat!.cooldown = [0, 0]
      fireWeapons(w)
      hits += (120 - cv.combat!.hull) / 8
    }
    expect(hits).toBeGreaterThanOrEqual(55)
    expect(hits).toBeLessThanOrEqual(85)
  })

  it('автопушка и перехватчик не бьют цели со щитом > 0; перехватчик по машине ×2', () => {
    const { w, put } = setup()
    const fr = put('a', 'frigate', X, Y)
    const shielded = put('b', 'battleship', X + 80, Y, false)
    buildGrids(w)
    expect(autocannonTarget(w, fr, wpOf('frigate', 1))).toBe(0)
    fireWeapons(w)
    expect(shielded.combat!.shield).toBe(500)
    expect(shielded.combat!.hull).toBe(1500)
    const cv = put('b', 'corvette', X, Y + 90, false)
    buildGrids(w)
    expect(autocannonTarget(w, fr, wpOf('frigate', 1))).toBe(cv.id)
    w.t += HIT.retargetIdle
    fireWeapons(w)
    expect(cv.combat!.hull).toBe(120 - 10)

    const ic = put('a', 'interceptor', X, Y + 500)
    const near = put('b', 'corvette', X + 10, Y + 530, false)
    const bomber = put('b', 'bomber', X + 30, Y + 500, false)
    buildGrids(w)
    expect(interceptorTarget(w, ic, wpOf('interceptor', 0))).toBe(bomber.id)
    ic.combat!.targetId = bomber.id
    fireWeapons(w)
    expect(bomber.combat!.hull).toBe(35 - 2.5 * HIT.gun.craftMul)
    expect(near.combat!.hull).toBe(120)
  })

  it('ветеран ранга 3: шанс зенитки по ракете 0.79', () => {
    const { put, proj, b } = setup()
    const s = put('a', 'corvette', X, Y)
    s.combat!.rank = 3
    const m = proj('missile', b.id, X + 30, Y)
    expect(hitChance(wpOf('corvette', 0), m.p, s)).toBeCloseTo(0.79, 10)
    s.combat!.rank = 0
    expect(hitChance(wpOf('corvette', 0), m.p, s)).toBeCloseTo(0.7, 10)
  })

  it('катер без цели от адмирала не стреляет', () => {
    const { w, put } = setup()
    const boat = put('a', 'torpedo', X, Y)
    const foe = put('b', 'corvette', X + 30, Y, false)
    buildGrids(w)
    tickAt(w, boat.id % 10)
    pickTargets(w)
    fireWeapons(w)
    expect(boat.combat!.targetId).toBeNull()
    expect(w.projectiles.some((p) => p.alive)).toBe(false)
    expect(boat.combat!.ammo).toBe(2)
    boat.combat!.targetId = foe.id
    fireWeapons(w)
    expect(w.projectiles.some((p) => p.alive && p.kind === 'torpedo')).toBe(true)
    expect(boat.combat!.ammo).toBe(1)
  })

  it('fireMul 0 (горящий с выбитыми турелями) — турели молчат, лучи стреляют с кулдауном ×2', () => {
    const { w, put } = setup()
    const s = put('a', 'battleship', X, Y)
    const foe = put('b', 'corvette', X + 120, Y, false)
    s.combat!.modules.turrets = 0
    s.combat!.burning = 0
    s.combat!.targetId = foe.id
    buildGrids(w)
    w.t = 10
    fireWeapons(w)
    expect(foe.combat!.hull).toBe(120)
    expect(s.combat!.cooldown[1]).toBe(0)
    expect(beams(w)).toBe(2)
    expect(s.combat!.cooldown[0]).toBeCloseTo(10 + 4 / 0.5, 10)
  })

  it('детерминизм: 300 шагов стрельбы двух миров — одинаковые hull у всех', () => {
    const build = () => {
      const t = setup(3)
      const kinds: CombatKind[] = ['battleship', 'battleship', 'frigate', 'corvette', 'corvette', 'torpedo']
      kinds.forEach((k, i) => {
        const s = t.put('a', k, X, Y + i * 20)
        if (k === 'battleship') s.combat!.slot = { kind: 'line', column: i, x: 0, y: i * 20, phase: 0 }
        t.put('b', k, X + 180, Y + i * 20 + 5)
      })
      return t.w
    }
    const step = (w: World) => {
      w.t += SIM_DT
      w.tick++
      buildGrids(w)
      pickTargets(w)
      fireWeapons(w)
      stepProjectiles(w)
      compactShips(w)
    }
    const w1 = build()
    const w2 = build()
    for (let i = 0; i < 300; i++) {
      step(w1)
      step(w2)
    }
    const hulls = (w: World) => w.ships.map((s) => [s.id, s.combat!.hull, s.combat!.shield])
    expect(hulls(w1)).toEqual(hulls(w2))
  })

  it('без цели второе оружие не опрашивает сетку каждый шаг', () => {
    const { w, put } = setup()
    const s = put('a', 'frigate', X, Y)
    buildGrids(w)
    w.t = 5
    fireWeapons(w)
    expect(s.combat!.cooldown[1]).toBeCloseTo(5 + HIT.retargetIdle, 10)
  })

  it('смена канала: не чаще кулдауна, пишет строку в журнал боя', () => {
    const { w, fleetA, battle } = setup()
    fleetA.channelSince = -100
    w.t = 0
    expect(setChannel(w, fleetA, 'turrets', 'screen', 'Корветы врага рядом')).toBe(true)
    expect(fleetA.turrets).toBe('screen')
    expect(fleetA.orderReason).toBe('Корветы врага рядом')
    expect(battle.log.at(-1)!.text).toBe('Корветы врага рядом')
    w.t = BATTLE.channelCooldown - 1
    expect(setChannel(w, fleetA, 'turrets', 'pd', 'x')).toBe(false)
    expect(fleetA.turrets).toBe('screen')
    w.t = BATTLE.channelCooldown + 1
    expect(setChannel(w, fleetA, 'turrets', 'pd', 'x')).toBe(true)
  })
})
