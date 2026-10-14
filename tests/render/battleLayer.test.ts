import { describe, expect, it } from 'vitest'
import {
  battleLabel, beamSegment, burnTint, drawBudget, frameRect, frontLine, headingOf, lodBattle, markRing, projTexture,
  pulse, shipScreenLen, shouldDraw, strengthOf,
} from '../../src/render/battleGeom'
import { lodOf } from '../../src/render/camera'
import { FRAME } from '../../src/sim/combat-config'
import { addToFleet, createFleet } from '../../src/sim/fleet'
import { capitalOf } from '../../src/sim/query'
import { spawnShip } from '../../src/sim/ships'
import { planetPos } from '../../src/sim/system'
import type { Battle, BattleSide, Fleet, Projectile } from '../../src/sim/types'
import { quietWorld } from '../helpers'
import type { ShipKind } from '../../src/sim/config'
import type { IconKind } from '../../src/render/textures'
import type { Ship } from '../../src/sim/types'

describe('battleGeom', () => {
  it('shipScreenLen: машина при любом зуме ≥ 3 px, капитальный ≥ 6 px, в настоящем размере при крупном зуме', () => {
    expect(shipScreenLen('interceptor', 0.01)).toBe(3)
    expect(shipScreenLen('bomber', 0.01)).toBe(3)
    expect(shipScreenLen('battleship', 0.01)).toBe(6)
    expect(shipScreenLen('corvette', 0.01)).toBe(6)
    expect(shipScreenLen('battleship', 10)).toBeCloseTo(12 * 10)
  })

  it('headingOf: боевой — combat.heading, мирный — по скорости', () => {
    const war = { combat: { heading: 1.25 }, vel: { x: 0, y: -5 } } as unknown as Ship
    const civil = { combat: null, vel: { x: 0, y: 5 } } as unknown as Ship
    expect(headingOf(war)).toBe(1.25)
    expect(headingOf(civil)).toBeCloseTo(Math.PI / 2)
  })

  it('drawBudget: 5 000 снарядов → k = 3, ≤ 2 000 рисуются; 1 000 → k = 1', () => {
    const k = drawBudget(5000)
    expect(k).toBe(3)
    let drawn = 0
    for (let i = 0; i < 5000; i++) if (shouldDraw(i, k)) drawn++
    expect(drawn).toBeLessThanOrEqual(2000)
    expect(drawBudget(1000)).toBe(1)
  })

  it('shouldDraw детерминирован по индексу: одни и те же снаряды пропускаются каждый кадр', () => {
    const a = Array.from({ length: 50 }, (_, i) => shouldDraw(i, 3))
    const b = Array.from({ length: 50 }, (_, i) => shouldDraw(i, 3))
    expect(a).toEqual(b)
    expect(a.filter(Boolean).length).toBeLessThan(50)
  })

  it('projTexture: ракета/приманка/торпеда → свои текстуры; луч не рисуется частицей', () => {
    expect(projTexture('missile')).toBe('missile')
    expect(projTexture('decoy')).toBe('decoy')
    expect(projTexture('torpedo')).toBe('torpedo')
    expect(projTexture('beam')).toBeNull()
  })

  it('burnTint теплее исходного цвета (R растёт, B падает)', () => {
    const c = 0x4080c0
    const t = burnTint(c)
    expect((t >> 16) & 255).toBeGreaterThan((c >> 16) & 255)
    expect(t & 255).toBeLessThan(c & 255)
  })

  it('IconKind покрывает все ShipKind (typecheck через satisfies Record<ShipKind, …>)', () => {
    const map = {
      colony: 'colony', caravan: 'caravan', miner: 'miner',
      corvette: 'corvette', torpedo: 'torpedo', frigate: 'frigate', battleship: 'battleship', carrier: 'carrier',
      interceptor: 'interceptor', bomber: 'bomber', trooper: 'trooper', supply: 'supply', scout: 'scout',
    } satisfies Record<ShipKind, IconKind>
    expect(Object.keys(map)).toHaveLength(13)
  })
})

function arenaLike() {
  const w = quietWorld(7)
  const a = w.civs[0]
  const b = w.civs[1]
  const home = capitalOf(w, a)!
  const fa = createFleet(w, a, home, { type: 'defend', planetId: home.id })
  const fb = createFleet(w, b, home, { type: 'defend', planetId: home.id })
  fa.frame = null
  fb.frame = null
  fa.anchor = { x: 0, y: 0 }
  fb.anchor = { x: 400, y: 0 }
  const side = (f: Fleet, civ: number): BattleSide => ({ fleetIds: [f.id], civ, role: 'attacker' }) as unknown as BattleSide
  const battle = {
    id: 1, systemId: fa.systemId, sides: [side(fa, a.id), side(fb, b.id)],
    pressure: 1, pressureSince: 0, pressureFlips: 0, phase: 'line',
  } as unknown as Battle
  return { w, a, b, home, fa, fb, battle }
}

describe('battleGeom: бой', () => {
  it('strengthOf: 1 линкор с половиной корпуса — 300', () => {
    const { w, a, home, fa, battle } = arenaLike()
    const s = spawnShip(w, a, 'battleship', home, { type: 'fleet', fleetId: fa.id }, 600)
    addToFleet(w, fa, s)
    s.combat!.hull = s.combat!.hullMax / 2
    expect(strengthOf(w, battle.sides[0])).toBeCloseTo(300)
  })

  it('battleLabel: «Орри · Велдон 140 : 95 Касрий» из сил и имён', () => {
    const { w, a, b, home, fa, fb, battle } = arenaLike()
    for (let i = 0; i < 2; i++) addToFleet(w, fa, spawnShip(w, a, 'corvette', home, { type: 'fleet', fleetId: fa.id }, 60))
    addToFleet(w, fb, spawnShip(w, b, 'corvette', home, { type: 'fleet', fleetId: fb.id }, 60))
    expect(battleLabel(w, battle)).toBe(`${w.galaxy.systems[battle.systemId].name} · ${a.name} 120 : 60 ${b.name}`)
  })

  it('frameRect: ширина W, глубина от −170 до +45, угол = heading; у планеты — со смещением планеты', () => {
    const { w, fa } = arenaLike()
    fa.columns = 4
    fa.width = 120
    fa.heading = 0
    const r = frameRect(w, fa)
    expect(r.w).toBe(120)
    expect(r.h).toBe(FRAME.frontCx + FRAME.frontB - FRAME.rows.boat)
    expect(r.angle).toBe(0)
    expect(r.x).toBeCloseTo((FRAME.rows.boat + FRAME.frontCx + FRAME.frontB) / 2)
    const planet = [...w.planets.values()][0]
    fa.frame = planet.id
    const pp = planetPos(planet, w.t)
    const r2 = frameRect(w, fa)
    expect(r2.x).toBeCloseTo(r.x + pp.x)
    expect(r2.y).toBeCloseTo(r.y + pp.y)
  })

  it('frontLine делит линию якорей по давлению: 1.0 — середина, 2.0 — ближе к теснимому', () => {
    const { w, battle } = arenaLike()
    const mid = frontLine(w, battle)
    expect(mid[0].x).toBeCloseTo(200)
    expect(mid[1].x).toBeCloseTo(200)
    expect(mid[0].y).toBeCloseTo(-mid[1].y)
    battle.pressure = 2
    const p = frontLine(w, battle)
    expect(p[0].x).toBeCloseTo(266.67, 1)
  })

  it('beamSegment: от точки выстрела по курсу на длину луча', () => {
    const [a, b] = beamSegment({ x: 10, y: 20, heading: Math.PI / 2, length: 250 } as Projectile)
    expect(a).toEqual({ x: 10, y: 20 })
    expect(b.x).toBeCloseTo(10)
    expect(b.y).toBeCloseTo(270)
  })

  it('markRing: центр на цели группы, линии от каждого линкора группы', () => {
    const { w, a, b, home, fa, fb } = arenaLike()
    const mine = [0, 1, 2].map((i) => {
      const s = spawnShip(w, a, 'battleship', home, { type: 'fleet', fleetId: fa.id }, 600)
      s.pos = { x: 0, y: i * 40 }
      addToFleet(w, fa, s)
      return s
    })
    const enemy = spawnShip(w, b, 'battleship', home, { type: 'fleet', fleetId: fb.id }, 600)
    enemy.pos = { x: 250, y: 40 }
    addToFleet(w, fb, enemy)
    for (const s of mine) s.combat!.targetId = enemy.id
    const ring = markRing(w, fa)!
    expect(ring.center).toEqual({ x: 250, y: 40 })
    expect(ring.lines).toHaveLength(3)
    expect(ring.r).toBeGreaterThan(0)
    expect(markRing(w, fb)).toBeNull()
  })

  it('lodBattle: 100 → icon, 400 → approach, 900 → system', () => {
    expect(lodBattle(lodOf(100, 1))).toBe('icon')
    expect(lodBattle(lodOf(400, 1))).toBe('approach')
    expect(lodBattle(lodOf(900, 1))).toBe('system')
  })

  it('pulse > 0 только 2 с после переворота давления', () => {
    const b = { pressureFlips: 1, pressureSince: 10 } as Battle
    expect(pulse(b, 10.5)).toBeGreaterThan(0)
    expect(pulse(b, 12.5)).toBe(0)
    expect(pulse({ pressureFlips: 0, pressureSince: 10 } as Battle, 10.5)).toBe(0)
  })
})
