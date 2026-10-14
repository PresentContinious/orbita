import { MOVE, SIM_DT } from './config'
import { clamp, lerp, type Vec } from './math'
import type { Galaxy, Gate, StarSystem, Transit } from './types'

/** число коридоров между системами; Infinity — пути нет */
export function hops(g: Galaxy, from: number, to: number): number {
  if (from === to) return 0
  const d = new Array(g.systems.length).fill(Infinity)
  d[from] = 0
  const queue = [from]
  while (queue.length) {
    const u = queue.shift()!
    for (const c of g.corridors) {
      const v = c.a === u ? c.b : c.b === u ? c.a : -1
      if (v >= 0 && d[v] === Infinity) {
        d[v] = d[u] + 1
        if (v === to) return d[v]
        queue.push(v)
      }
    }
  }
  return Infinity
}

/** самый быстрый путь (транзит + пересечение систем); системы после from до to включительно */
export function findPath(g: Galaxy, from: number, to: number): number[] | null {
  if (from === to) return []
  const n = g.systems.length
  const cost = new Array(n).fill(Infinity)
  const prev = new Array(n).fill(-1)
  const done = new Array(n).fill(false)
  cost[from] = 0
  for (;;) {
    let u = -1
    for (let i = 0; i < n; i++) if (!done[i] && cost[i] < Infinity && (u < 0 || cost[i] < cost[u])) u = i
    if (u < 0) return null
    if (u === to) break
    done[u] = true
    for (const c of g.corridors) {
      const v = c.a === u ? c.b : c.b === u ? c.a : -1
      if (v < 0 || done[v]) continue
      const next = cost[u] + c.transit + MOVE.crossingCost
      if (next < cost[v]) {
        cost[v] = next
        prev[v] = u
      }
    }
  }
  const path: number[] = []
  for (let v = to; v !== from; v = prev[v]) path.push(v)
  return path.reverse()
}

export function gateTo(sys: StarSystem, toSystem: number): Gate | undefined {
  return sys.gates.find((x) => x.toSystem === toSystem)
}

export function gateGalaxyPos(sys: StarSystem, gate: Gate): Vec {
  return { x: sys.pos.x + gate.pos.x, y: sys.pos.y + gate.pos.y }
}

/** точка в галактике для корабля в коридоре; alpha — доля шага для плавной отрисовки (1 = текущий шаг) */
export function transitGalaxyPos(g: Galaxy, tr: Transit, alpha = 1): Vec {
  const A = g.systems[tr.from]
  const B = g.systems[tr.to]
  const ga = gateGalaxyPos(A, gateTo(A, tr.to)!)
  const gb = gateGalaxyPos(B, gateTo(B, tr.from)!)
  const u = clamp((tr.elapsed - SIM_DT * (1 - alpha)) / tr.duration, 0, 1)
  return { x: lerp(ga.x, gb.x, u), y: lerp(ga.y, gb.y, u) }
}
