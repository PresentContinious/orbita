import { CIVS, GALAXY, ORBIT } from './config'
import { dist, TAU, type Vec } from './math'
import type { Rng } from './rng'
import { generateSystem } from './system'
import type { Corridor, Galaxy, StarSystem, SystemRole } from './types'

/** точки в эллипсе с минимальной дистанцией; если не влезли — эллипс +10% */
export function placeSystems(rng: Rng, n: number): Vec[] {
  let w = GALAXY.ellipseW
  let h = GALAXY.ellipseH
  for (let round = 0; round < 30; round++) {
    const pts: Vec[] = []
    for (let i = 0; i < GALAXY.placementAttempts && pts.length < n; i++) {
      const a = rng.float(0, TAU)
      const r = Math.sqrt(rng.next())
      const p = { x: (Math.cos(a) * r * w) / 2, y: (Math.sin(a) * r * h) / 2 }
      if (pts.every((q) => dist(p, q) >= GALAXY.minDist)) pts.push(p)
    }
    if (pts.length === n) return pts
    w *= 1.1
    h *= 1.1
  }
  throw new Error('не удалось разместить системы')
}

export function isConnected(n: number, edges: [number, number][]): boolean {
  if (n === 0) return true
  const seen = new Set<number>([0])
  const stack = [0]
  while (stack.length) {
    const u = stack.pop()!
    for (const [a, b] of edges) {
      const v = a === u ? b : b === u ? a : -1
      if (v >= 0 && !seen.has(v)) {
        seen.add(v)
        stack.push(v)
      }
    }
  }
  return seen.size === n
}

/** граф относительного соседства + одна петля, если вышло дерево; степень ≤ 4 */
export function buildCorridorEdges(pts: Vec[]): [number, number][] {
  const n = pts.length
  let edges: [number, number][] = []
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const d = dist(pts[i], pts[j])
      let ok = true
      for (let k = 0; k < n && ok; k++) {
        if (k !== i && k !== j && Math.max(dist(pts[i], pts[k]), dist(pts[j], pts[k])) < d) ok = false
      }
      if (ok) edges.push([i, j])
    }
  }
  if (edges.length === n - 1) {
    const has = new Set(edges.map(([a, b]) => `${a}-${b}`))
    let best: [number, number] | null = null
    let bestLen = Infinity
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        if (has.has(`${i}-${j}`)) continue
        const mid = { x: (pts[i].x + pts[j].x) / 2, y: (pts[i].y + pts[j].y) / 2 }
        const half = dist(pts[i], pts[j]) / 2
        let gabriel = true
        for (let k = 0; k < n && gabriel; k++) if (k !== i && k !== j && dist(pts[k], mid) < half) gabriel = false
        if (gabriel && half * 2 < bestLen) {
          best = [i, j]
          bestLen = half * 2
        }
      }
    }
    if (best) edges.push(best)
  }
  for (;;) {
    const deg = new Array(n).fill(0)
    for (const [a, b] of edges) {
      deg[a]++
      deg[b]++
    }
    const v = deg.findIndex((d) => d > GALAXY.maxDegree)
    if (v < 0) break
    const mine = edges.filter(([a, b]) => a === v || b === v).sort((e1, e2) => dist(pts[e2[0]], pts[e2[1]]) - dist(pts[e1[0]], pts[e1[1]]))
    let removed = false
    for (const e of mine) {
      const rest = edges.filter((x) => x !== e)
      if (isConnected(n, rest)) {
        edges = rest
        removed = true
        break
      }
    }
    if (!removed) break
  }
  return edges
}

export function hopMatrix(n: number, edges: [number, number][]): number[][] {
  const m: number[][] = []
  for (let s = 0; s < n; s++) {
    const d = new Array(n).fill(Infinity)
    d[s] = 0
    const queue = [s]
    while (queue.length) {
      const u = queue.shift()!
      for (const [a, b] of edges) {
        const v = a === u ? b : b === u ? a : -1
        if (v >= 0 && d[v] === Infinity) {
          d[v] = d[u] + 1
          queue.push(v)
        }
      }
    }
    m.push(d)
  }
  return m
}

function combinations(n: number, k: number): number[][] {
  const out: number[][] = []
  const rec = (start: number, acc: number[]) => {
    if (acc.length === k) {
      out.push([...acc])
      return
    }
    for (let i = start; i < n; i++) {
      acc.push(i)
      rec(i + 1, acc)
      acc.pop()
    }
  }
  rec(0, [])
  return out
}

/** обитаемые — как можно дальше друг от друга; «Яма» — на развилке; рудная — из оставшихся */
export function assignRoles(rng: Rng, n: number, edges: [number, number][]): SystemRole[] {
  const k = n === 5 ? 3 : 4
  const hop = hopMatrix(n, edges)
  let best: number[] = []
  let bestMin = -1
  let bestSum = -1
  for (const c of rng.shuffle(combinations(n, k))) {
    let mn = Infinity
    let sum = 0
    for (let i = 0; i < c.length; i++) {
      for (let j = i + 1; j < c.length; j++) {
        mn = Math.min(mn, hop[c[i]][c[j]])
        sum += hop[c[i]][c[j]]
      }
    }
    if (mn > bestMin || (mn === bestMin && sum > bestSum)) {
      best = c
      bestMin = mn
      bestSum = sum
    }
  }
  const roles: SystemRole[] = new Array(n).fill('nebula')
  for (const i of best) roles[i] = 'inhabited'
  const deg = new Array(n).fill(0)
  for (const [a, b] of edges) {
    deg[a]++
    deg[b]++
  }
  const rest = rng.shuffle([...Array(n).keys()].filter((i) => roles[i] !== 'inhabited'))
  const pit = rest.reduce((b, i) => (deg[i] > deg[b] ? i : b), rest[0])
  roles[pit] = 'pit'
  roles[rest.find((i) => i !== pit)!] = 'ore'
  return roles
}

/** сколько цивилизаций в каждой обитаемой системе: по 2–3, всего 8–10 */
export function civSlots(rng: Rng, inhabited: number): number[] {
  const total = Math.min(Math.max(rng.int(CIVS.min, CIVS.max), inhabited * 2), inhabited * 3)
  const slots = new Array(inhabited).fill(2)
  let extra = total - inhabited * 2
  while (extra > 0) {
    const i = rng.int(0, inhabited - 1)
    if (slots[i] < 3) {
      slots[i]++
      extra--
    }
  }
  return slots
}

function gatePos(from: StarSystem, to: StarSystem): Vec {
  const dx = to.pos.x - from.pos.x
  const dy = to.pos.y - from.pos.y
  const d = Math.hypot(dx, dy)
  const r = from.radius + ORBIT.gatePad
  return { x: (dx / d) * r, y: (dy / d) * r }
}

export function generateGalaxy(rng: Rng): Galaxy {
  const n = rng.int(GALAXY.minSystems, GALAXY.maxSystems)
  const pts = placeSystems(rng, n)
  const edges = buildCorridorEdges(pts)
  const roles = assignRoles(rng, n, edges)
  const inhabited = roles.flatMap((r, i) => (r === 'inhabited' ? [i] : []))
  const slots = civSlots(rng, inhabited.length)
  const used = new Set<string>()
  const systems = pts.map((p, i) =>
    generateSystem(rng, i, roles[i], roles[i] === 'inhabited' ? slots[inhabited.indexOf(i)] : 0, p, used),
  )
  const corridors: Corridor[] = edges.map(([a, b], id) => {
    const A = systems[a]
    const B = systems[b]
    return { id, a, b, length: dist(A.pos, B.pos) - A.radius - B.radius - 2 * ORBIT.gatePad, transit: 0 }
  })
  const lens = corridors.map((c) => c.length)
  const lo = Math.min(...lens)
  const hi = Math.max(...lens)
  for (const c of corridors) {
    c.transit =
      hi - lo < 1e-6
        ? (GALAXY.transitMin + GALAXY.transitMax) / 2
        : GALAXY.transitMin + ((GALAXY.transitMax - GALAXY.transitMin) * (c.length - lo)) / (hi - lo)
    const A = systems[c.a]
    const B = systems[c.b]
    A.gates.push({ corridorId: c.id, toSystem: c.b, pos: gatePos(A, B) })
    B.gates.push({ corridorId: c.id, toSystem: c.a, pos: gatePos(B, A) })
  }
  return { systems, corridors }
}
