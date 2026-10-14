import { describe, expect, it } from 'vitest'
import type { CombatKind } from '../../src/sim/classes'
import { FRAME } from '../../src/sim/combat-config'
import {
  addToFleet, assignSlots, closeRanks, createFleet, fleetWidth, markDamaged, ovalPoint, removeFromFleet,
  slotLocal, slotWorld,
} from '../../src/sim/fleet'
import { capitalOf } from '../../src/sim/query'
import { spawnShip } from '../../src/sim/ships'
import { planetPos } from '../../src/sim/system'
import type { Fleet, Ship, Slot, Vec, World } from '../../src/sim/types'
import { quietWorld } from '../helpers'

function setup() {
  const w = quietWorld(1)
  const civ = w.civs[0]
  const home = capitalOf(w, civ)!
  const fleet = createFleet(w, civ, home, { type: 'defend', planetId: home.id })
  fleet.anchor = { x: 0, y: 0 }
  fleet.heading = 0
  const add = (kind: CombatKind, lat: number, price?: number): Ship => {
    const s = spawnShip(w, civ, kind, home, { type: 'fleet', fleetId: fleet.id }, price ?? 100)
    s.pos = { x: 0, y: lat }
    addToFleet(w, fleet, s)
    return s
  }
  return { w, civ, home, fleet, add }
}

const slotOf = (s: Ship): Slot => s.combat!.slot!
const v = (): Vec => ({ x: 0, y: 0 })
const dist = (a: Vec, b: Vec) => Math.hypot(a.x - b.x, a.y - b.y)

describe('рамка флота: геометрия', () => {
  it('слоты капитальных не ближе 3 длин: 6 линкоров + 3 фрегата + носитель, все пары ≥ 36', () => {
    const { w, fleet, add } = setup()
    const ships: Ship[] = []
    for (let i = 0; i < 6; i++) ships.push(add('battleship', i * 10))
    for (let i = 0; i < 3; i++) ships.push(add('frigate', i * 10))
    ships.push(add('carrier', 0))
    assignSlots(w, fleet)
    for (let i = 0; i < ships.length; i++) {
      for (let j = i + 1; j < ships.length; j++) {
        const a = slotOf(ships[i])
        const b = slotOf(ships[j])
        expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThanOrEqual(36)
      }
    }
  })

  it('двойная линия: чётные в ряду 0, нечётные в −50 со сдвигом 20; широкая — все в ряду 0', () => {
    const { w, fleet, add } = setup()
    const ships = [0, 1, 2, 3, 4, 5].map((i) => add('battleship', i * 10))
    assignSlots(w, fleet)
    expect(ships.every((s) => slotOf(s).x === 0)).toBe(true)
    fleet.formation = 'double'
    assignSlots(w, fleet)
    const second = ships.filter((s) => slotOf(s).kind === 'second')
    const first = ships.filter((s) => slotOf(s).kind === 'line')
    expect(second.length).toBe(3)
    expect(first.length).toBe(3)
    for (const s of first) expect(slotOf(s).x).toBe(FRAME.rows.line)
    for (const s of second) {
      expect(slotOf(s).x).toBe(FRAME.rows.second)
      expect(Math.abs(slotOf(s).y % FRAME.grid)).toBe(FRAME.grid / 2)
    }
  })

  it('распределение монотонно: линкоры, стоящие слева направо, получают колонны по возрастанию — пути к слотам не пересекаются', () => {
    const { w, fleet, add } = setup()
    const lats = [50, -80, 10, 200, -30, 120, -150]
    const ships = lats.map((l) => add('battleship', l))
    assignSlots(w, fleet)
    for (let i = 0; i < ships.length; i++) {
      for (let j = i + 1; j < ships.length; j++) {
        const dl = ships[i].pos.y - ships[j].pos.y
        const ds = slotOf(ships[i]).y - slotOf(ships[j]).y
        // флагман (первый, id меньше при равной цене) занимает центр и в проверке не участвует
        if (ships[i].id === fleet.flagshipId || ships[j].id === fleet.flagshipId) continue
        expect(dl * ds).toBeGreaterThan(0)
      }
    }
  })

  it('флагман — самый дорогой (при равенстве меньший id), слот — центр линии или второй ряд центральной колонны', () => {
    const { w, fleet, add } = setup()
    const a = add('battleship', -40, 600)
    const b = add('battleship', 0, 650)
    const c = add('battleship', 40, 650)
    const d = add('battleship', 80, 600)
    assignSlots(w, fleet)
    expect(fleet.flagshipId).toBe(b.id)
    expect(slotOf(b).column).toBe(0)
    expect(slotOf(a).y).toBeLessThan(slotOf(c).y)
    expect(slotOf(c).y).toBeLessThan(slotOf(d).y)
    // двойная линия: флагман — второй ряд колонны 0
    fleet.formation = 'double'
    assignSlots(w, fleet)
    expect(slotOf(b).kind).toBe('second')
    expect(slotOf(b).column).toBe(0)
  })

  it('овал корветов: точки в y ∈ [W/2 + 28, W/2 + 52], x ∈ [−100, +40]; 6 корветов равномерно по фазе; левое крыло против часовой, правое по часовой', () => {
    const { w, fleet, add } = setup()
    for (let i = 0; i < 6; i++) add('battleship', i * 10)
    const cor = [0, 1, 2, 3, 4, 5].map((i) => add('corvette', i * 3))
    assignSlots(w, fleet)
    const W = fleet.width
    const p = v()
    for (const s of cor) {
      for (let t = 0; t < 40; t += 0.7) {
        slotLocal(fleet, slotOf(s), t, p)
        expect(Math.abs(p.y)).toBeGreaterThanOrEqual(W / 2 + 28 - 1e-6)
        expect(Math.abs(p.y)).toBeLessThanOrEqual(W / 2 + 52 + 1e-6)
        expect(p.x).toBeGreaterThanOrEqual(-100 - 1e-6)
        expect(p.x).toBeLessThanOrEqual(40 + 1e-6)
      }
    }
    const L = cor.filter((s) => slotOf(s).column < 0).map((s) => slotOf(s).phase).sort()
    expect(L.length).toBe(3)
    expect(L[1] - L[0]).toBeCloseTo(1 / 3)
    expect(L[2] - L[1]).toBeCloseTo(1 / 3)
    // направление: левое крыло — угол растёт (против часовой), правое — убывает
    const ang = (side: -1 | 1, t: number) => {
      const q = ovalPoint(fleet, side, 0, t, v())
      return Math.atan2((q.y - side * (W / 2 + FRAME.wingPad)) / FRAME.ovalB, (q.x - FRAME.ovalCx) / FRAME.ovalA)
    }
    expect(ang(-1, 0.2)).toBeGreaterThan(ang(-1, 0))
    expect(ang(1, 0.2)).toBeLessThan(ang(1, 0))
  })

  it('малый флот (2 линкора, W = 40): овал длиной ≥ 200', () => {
    const { w, fleet, add } = setup()
    add('battleship', -20)
    add('battleship', 20)
    assignSlots(w, fleet)
    expect(fleet.width).toBe(fleetWidth(2))
    let lo = Infinity
    let hi = -Infinity
    const p = v()
    for (let t = 0; t < 30; t += 0.05) {
      ovalPoint(fleet, -1, 0, t, p)
      lo = Math.min(lo, p.x)
      hi = Math.max(hi, p.x)
    }
    expect(hi - lo).toBeGreaterThanOrEqual(199)
  })

  it('завеса вперёд: точки передней петли x ∈ [+15, +45] вдоль всей ширины', () => {
    const { w, fleet, add } = setup()
    for (let i = 0; i < 6; i++) add('battleship', i * 10)
    assignSlots(w, fleet)
    fleet.screenForward = w.t
    const W = fleet.width
    const p = v()
    let ymin = Infinity
    let ymax = -Infinity
    for (let t = 0; t < 60; t += 0.1) {
      ovalPoint(fleet, -1, 0, t, p)
      expect(p.x).toBeGreaterThanOrEqual(15 - 1e-6)
      expect(p.x).toBeLessThanOrEqual(45 + 1e-6)
      ymin = Math.min(ymin, p.y)
      ymax = Math.max(ymax, p.y)
    }
    expect(ymax - ymin).toBeGreaterThan(W)
  })

  it('катера на крыльях x = −170, y = ±(W/2 + 40); резерв −80, ±(W/2 + 80)', () => {
    const { w, fleet, add } = setup()
    for (let i = 0; i < 4; i++) add('battleship', i * 10)
    const b1 = add('torpedo', -5)
    const b2 = add('torpedo', 5)
    const r1 = add('frigate', -5)
    const r2 = add('frigate', 5)
    fleet.reserveIds.push(r1.id, r2.id)
    assignSlots(w, fleet)
    const W = fleet.width
    expect(slotOf(b1).x).toBe(-170)
    expect(slotOf(b1).y).toBe(-(W / 2 + 40))
    expect(slotOf(b2).y).toBe(W / 2 + 40)
    expect(slotOf(r1).x).toBe(-80)
    expect(slotOf(r1).y).toBe(-(W / 2 + 80))
    expect(slotOf(r2).y).toBe(W / 2 + 80)
  })

  it('slotWorld: поворот рамки на 90° переводит колонну y = 40 в x-смещение; у планеты прибавляется её положение', () => {
    const { w, fleet, home } = setup()
    fleet.anchor = { x: 1000, y: 500 }
    fleet.heading = Math.PI / 2
    const slot: Slot = { kind: 'line', column: 1, x: 0, y: 40, phase: 0 }
    const out = slotWorld(w, fleet, slot, v())
    expect(out.x).toBeCloseTo(960)
    expect(out.y).toBeCloseTo(500)
    fleet.frame = home.id
    fleet.anchor = { x: 300, y: 0 }
    fleet.heading = 0
    const pp = planetPos(home, w.t)
    const o2 = slotWorld(w, fleet, { kind: 'line', column: 0, x: 0, y: 0, phase: 0 }, v())
    expect(o2.x).toBeCloseTo(pp.x + 300)
    expect(o2.y).toBeCloseTo(pp.y)
  })

  it('слот в теле планеты + 30 сдвигается вдоль орбиты', () => {
    const { w, fleet, home } = setup()
    fleet.frame = home.id
    fleet.anchor = { x: 0, y: 0 }
    const pp = planetPos(home, w.t)
    const out = slotWorld(w, fleet, { kind: 'line', column: 0, x: 5, y: 0, phase: 0 }, v())
    expect(dist(out, pp)).toBeGreaterThanOrEqual(home.radius + FRAME.planetSlotPad - 1e-6)
  })

  it('гибель линкора: колонна пуста 30 с, затем крайние с дальней стороны сдвигаются по одному за 10 с, W пересчитан', () => {
    const { w, fleet, add } = setup()
    const ships = [0, 1, 2, 3, 4].map((i) => add('battleship', (i - 2) * 40, i === 2 ? 700 : 600))
    assignSlots(w, fleet)
    expect(fleet.width).toBe(160)
    const dead = ships[2]
    dead.alive = false
    w.t = 100
    removeFromFleet(w, fleet, dead.id)
    expect(fleet.reassignAt).toBe(130)
    const before = ships.map((s) => slotOf(s).column)
    w.t = 130
    closeRanks(w, fleet)
    const after = ships.map((s) => slotOf(s).column)
    expect(after.filter((c, i) => c !== before[i]).length).toBe(1)
    expect(fleet.reassignAt).toBe(140)
    w.t = 140
    closeRanks(w, fleet)
    expect(fleet.reassignAt).toBeNull()
    expect(fleet.columns).toBe(4)
    expect(fleet.width).toBe(fleetWidth(4))
  })

  it('markDamaged: линкор — своя колонна k·40, фрегат — полуколонна k·40 + 20, ряд −150', () => {
    const { w, fleet, add } = setup()
    const bs = [0, 1, 2].map((i) => add('battleship', i * 40))
    const fr = [0, 1].map((i) => add('frigate', i * 40))
    assignSlots(w, fleet)
    const bsY = slotOf(bs[2]).y
    const frY = slotOf(fr[1]).y
    markDamaged(fleet, bs[2])
    markDamaged(fleet, fr[1])
    expect(slotOf(bs[2]).kind).toBe('damaged')
    expect(slotLocal(fleet, slotOf(bs[2]), 0, v())).toEqual({ x: -150, y: bsY })
    expect(bsY % 40).toBe(0)
    expect(slotLocal(fleet, slotOf(fr[1]), 0, v())).toEqual({ x: -150, y: frY })
    expect(Math.abs(frY % 40)).toBe(20)
    // повторная раздача не трогает подбитых
    assignSlots(w, fleet)
    expect(slotOf(bs[2]).y).toBe(bsY)
  })
})

export type { Fleet, World }
