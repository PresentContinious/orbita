import { describe, expect, it } from 'vitest'
import { createArena, parseArena, runArena } from '../../src/sim/arena'
import { FRAME } from '../../src/sim/combat-config'
import { SIM_DT } from '../../src/sim/config'
import { anchorAbs, frameTurnRate } from '../../src/sim/fleet'
import { shipById } from '../../src/sim/ships'
import { planetPos } from '../../src/sim/system'
import type { Vec, World } from '../../src/sim/types'
import { stepWorld } from '../../src/sim/world'

const COMP = '3bb,1cv,3ff,6co'
/** мир без стрельбы: проверяем именно движение (оружие задачи 8 иначе убивает корабли и меняет составы) */
const arena = (q: string): World => {
  const w = createArena(parseArena(q))
  for (const s of w.ships) s.combat!.mothballed = true
  return w
}
const standard = (seed = 1): World => arena(`A=${COMP}&B=${COMP}&seed=${seed}`)
const deg = (r: number): number => (r * 180) / Math.PI

describe('движение рамки и корабля в слоте', () => {
  it('изменение скорости любого корабля за шаг ≤ accel·SIM_DT на 600 шагах', () => {
    const r = runArena(standard(), 600)
    expect(r.minSpeedViolations).toBe(0)
  })

  it('якори двух враждебных флотов никогда не ближе 100', () => {
    const w = standard()
    const a: Vec = { x: 0, y: 0 }
    const b: Vec = { x: 0, y: 0 }
    // A едет прямо на якорь B (рубеж отхода поставлен руками), B стоит
    w.fleets[0].order = 'retreat'
    w.fleets[0].fallback = anchorAbs(w, w.fleets[1], { x: 0, y: 0 })
    let min = Infinity
    runArena(w, 2000, () => {
      anchorAbs(w, w.fleets[0], a)
      anchorAbs(w, w.fleets[1], b)
      min = Math.min(min, Math.hypot(a.x - b.x, a.y - b.y))
    })
    expect(min).toBeGreaterThanOrEqual(FRAME.anchorMinDist - 1e-6)
    // и они действительно сошлись, а не просто не двигались
    expect(min).toBeLessThan(FRAME.anchorMinDist + 60)
  })

  it('поворот рамки за шаг ≤ ω·dt; у 12 линкоров ω = 6°/с', () => {
    const w = arena('A=12bb&B=1bb&seed=1')
    stepWorld(w)
    const f = w.fleets[0]
    expect(f.width).toBeCloseTo(11 * FRAME.grid, 6)
    const omega = frameTurnRate(w, f)
    expect(deg(omega)).toBeCloseTo(6, 0)
    f.heading += 1 // развернули курс: рамка должна доворачиваться плавно
    const toWant = f.heading
    let prev = f.heading
    let maxStep = 0
    for (let i = 0; i < 200; i++) {
      stepWorld(w)
      maxStep = Math.max(maxStep, Math.abs(f.heading - prev))
      prev = f.heading
    }
    expect(maxStep).toBeLessThanOrEqual(omega * SIM_DT + 1e-9)
    expect(maxStep).toBeGreaterThan(omega * SIM_DT * 0.9) // поворот действительно шёл на предельной скорости
    expect(Math.abs(f.heading - toWant)).toBeGreaterThan(0.1)
  })

  it('капитальные занимают слоты: через 60 с все дальше 15 ед. от слота ≤ 10 % времени (capitalOffSlotT)', () => {
    const w = standard()
    runArena(w, 600)
    const r = runArena(w, 600)
    expect(r.capitalOffSlotT).toBeLessThanOrEqual(0.1)
  })

  it('минимальная дистанция корпусов ≥ 2 длины меньшего корабля пары (minHullRatio ≥ 1), push-out = 0: 5 зёрен × 3000 шагов, замер каждый шаг', () => {
    for (let seed = 1; seed <= 5; seed++) {
      const r = runArena(arena(`A=${COMP}&B=2bb,2ff,1cv,4tb&seed=${seed}`), 3000)
      expect(r.minHullRatio, 'зерно ' + seed).toBeGreaterThanOrEqual(1)
      expect(r.pushOuts, 'зерно ' + seed).toBe(0)
      expect(r.minSpeedViolations, 'зерно ' + seed).toBe(0)
    }
  })

  it('флот с чётной линией (2bb+4co, 4bb+6co), order line, 1500 шагов: ratio ≥ 1, push-out = 0', () => {
    for (const side of ['2bb,4co', '4bb,6co']) {
      const w = arena(`A=${side}&B=1bb&seed=1`)
      w.fleets[0].order = 'line'
      const r = runArena(w, 1500)
      expect(r.minHullRatio, side).toBeGreaterThanOrEqual(1)
      expect(r.pushOuts, side).toBe(0)
    }
  })

  it('проход горящего линкора по своей колонне в ряд −150 при соседях в k±1: push-out = 0, дистанция ≥ 2 длины', () => {
    const w = arena('A=5bb&B=1bb&seed=1')
    w.fleets[0].order = 'line' // рамка стоит: проверяем именно проход по колонне
    runArena(w, 300) // встали в слоты
    const f = w.fleets[0]
    const mid = f.shipIds.map((id) => shipById(w, id)!).find((s) => s.combat!.slot!.column === 0)!
    const col = mid.combat!.slot!.y
    mid.combat!.hull = mid.combat!.hullMax * 0.35
    mid.combat!.burning = w.t
    const r = runArena(w, 300)
    const sl = mid.combat!.slot!
    expect(sl.kind).toBe('damaged')
    expect(sl.y).toBe(col)
    expect(sl.x).toBe(FRAME.rows.damaged)
    expect(r.pushOuts).toBe(0)
    expect(r.minHullRatio).toBeGreaterThanOrEqual(1)
    // корабль действительно ушёл назад от линии
    const lineMate = f.shipIds.map((id) => shipById(w, id)!).find((s) => s.combat!.slot!.kind === 'line')!
    const back = (mid.pos.x - lineMate.pos.x) * Math.cos(f.heading) + (mid.pos.y - lineMate.pos.y) * Math.sin(f.heading)
    expect(back).toBeLessThan(-100)
  })

  it('система отсчёта переключается рамкой целиком у планеты: frame = planet.id у всех слотов, якорь не прыгает (|Δanchor| за шаг ≤ 5)', () => {
    const w = arena('A=3bb&B=2bb&seed=1')
    const f = w.fleets[0]
    const pl = w.planets.get((f.mission as { planetId: string }).planetId)!
    // ставим флот в 3r+200+60 от планеты и отправляем к ней
    const pp = planetPos(pl, w.t)
    const far = pl.radius * FRAME.planetFrameMul + FRAME.planetFramePad + 60
    f.anchor = { x: pp.x + far, y: pp.y }
    f.heading = Math.PI
    f.order = 'march'
    expect(f.frame).toBeNull()
    const prev: Vec = { x: 0, y: 0 }
    const cur: Vec = { x: 0, y: 0 }
    anchorAbs(w, f, prev)
    let switched = false
    let maxJump = 0
    for (let i = 0; i < 800; i++) {
      stepWorld(w)
      anchorAbs(w, f, cur)
      maxJump = Math.max(maxJump, Math.hypot(cur.x - prev.x, cur.y - prev.y))
      prev.x = cur.x
      prev.y = cur.y
      if (f.frame !== null) {
        switched = true
        break
      }
    }
    expect(switched).toBe(true)
    expect(f.frame).toBe(pl.id)
    expect(maxJump).toBeLessThanOrEqual(5)
    for (const id of f.shipIds) expect(shipById(w, id)!.fleetId).toBe(f.id)
  })

  it('якорь в бою едет ≥ 5 ед/с (battleId задан руками)', () => {
    const w = arena('A=3bb&B=1bb&seed=1')
    const f = w.fleets[0]
    f.battleId = 1
    f.order = 'march'
    for (let i = 0; i < 20; i++) stepWorld(w)
    expect(f.speed).toBeGreaterThanOrEqual(FRAME.anchorMinBattle)
    expect(Math.hypot(f.anchorVel.x, f.anchorVel.y)).toBeGreaterThanOrEqual(FRAME.anchorMinBattle - 1e-6)
    // без боя та же рамка стартует с нуля
    const w2 = arena('A=3bb&B=1bb&seed=1')
    w2.fleets[0].order = 'march'
    for (let i = 0; i < 20; i++) stepWorld(w2)
    expect(w2.fleets[0].speed).toBeLessThan(FRAME.anchorMinBattle)
  })

  it('реверс: при order retreat линкор движется ≤ 10 ед/с и нос смотрит на якорь врага ±10°', () => {
    const w = arena('A=3bb&B=3bb&seed=1')
    runArena(w, 300) // встали в слоты
    const f = w.fleets[0]
    f.order = 'retreat'
    const a = anchorAbs(w, f, { x: 0, y: 0 })
    const heading = f.heading
    // рубеж отхода — назад от врага
    f.fallback = { x: a.x - Math.cos(heading) * 400, y: a.y - Math.sin(heading) * 400 }
    let maxV = 0
    for (let i = 0; i < 400; i++) {
      stepWorld(w)
      for (const id of f.shipIds) {
        const s = shipById(w, id)!
        if (s.kind === 'battleship') maxV = Math.max(maxV, Math.hypot(s.vel.x - f.anchorVel.x, s.vel.y - f.anchorVel.y))
      }
    }
    expect(maxV).toBeLessThanOrEqual(FRAME.reverseSpeed + 1e-6)
    const enemy = anchorAbs(w, w.fleets[1], { x: 0, y: 0 })
    for (const id of f.shipIds) {
      const s = shipById(w, id)!
      if (s.kind !== 'battleship') continue
      const want = Math.atan2(enemy.y - s.pos.y, enemy.x - s.pos.x)
      let d = (s.combat!.heading - want) % (Math.PI * 2)
      if (d > Math.PI) d -= Math.PI * 2
      if (d < -Math.PI) d += Math.PI * 2
      expect(Math.abs(deg(d))).toBeLessThanOrEqual(10)
    }
  })

  it('слоты держатся без separate: шаг сетки 40 между соседними линкорами сохраняется ±2', () => {
    const w = arena('A=6bb&B=1bb&seed=1')
    const f = w.fleets[0]
    runArena(w, 800)
    const bbs = f.shipIds.map((id) => shipById(w, id)!).filter((s) => s.kind === 'battleship')
    expect(bbs.length).toBe(6)
    bbs.sort((p, q) => p.combat!.slot!.column - q.combat!.slot!.column)
    for (let i = 1; i < bbs.length; i++) {
      const d = Math.hypot(bbs[i].pos.x - bbs[i - 1].pos.x, bbs[i].pos.y - bbs[i - 1].pos.y)
      expect(Math.abs(d - FRAME.grid)).toBeLessThanOrEqual(2)
    }
  })

  it('детерминизм: positionsHash двух прогонов совпадает после 600 шагов движения', () => {
    const a = runArena(standard(2), 600)
    const b = runArena(standard(2), 600)
    expect(a.positionsHash).toBe(b.positionsHash)
  })
})
