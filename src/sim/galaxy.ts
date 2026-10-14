import { CIVS, GALAXY, ORBIT } from './config'
import { SETUP, type GalaxyOptions } from './setup'
import { dist, TAU, type Vec } from './math'
import type { Rng } from './rng'
import { generateSystem } from './system'
import type { Corridor, Galaxy, StarSystem, SystemRole } from './types'

/** точки в эллипсе с минимальной дистанцией; если не влезли — эллипс +10% */
export function placeSystems(rng: Rng, n: number, scale = 1): Vec[] {
  let w = GALAXY.ellipseW * scale
  let h = GALAXY.ellipseH * scale
  const minDist = GALAXY.minDist * scale
  for (let round = 0; round < 30; round++) {
    const pts: Vec[] = []
    for (let i = 0; i < GALAXY.placementAttempts && pts.length < n; i++) {
      const a = rng.float(0, TAU)
      const r = Math.sqrt(rng.next())
      const p = { x: (Math.cos(a) * r * w) / 2, y: (Math.sin(a) * r * h) / 2 }
      if (pts.every((q) => dist(p, q) >= minDist)) pts.push(p)
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

function distToSegment(q: Vec, a: Vec, b: Vec): number {
  const l2 = (b.x - a.x) ** 2 + (b.y - a.y) ** 2
  const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((q.x - a.x) * (b.x - a.x) + (q.y - a.y) * (b.y - a.y)) / l2))
  return Math.hypot(q.x - (a.x + t * (b.x - a.x)), q.y - (a.y + t * (b.y - a.y)))
}

function segmentsCross(p1: Vec, p2: Vec, p3: Vec, p4: Vec): boolean {
  const cr = (o: Vec, a: Vec, b: Vec) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x)
  return cr(p1, p2, p3) * cr(p1, p2, p4) < 0 && cr(p3, p4, p1) * cr(p3, p4, p2) < 0
}

/** граф относительного соседства + одна петля, если вышло дерево; степень ≤ 4 */
export function buildCorridorEdges(pts: Vec[], extra = 0): [number, number][] {
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
    if (!removed) {
      // все рёбра вершины — мосты: самое длинное заменяем связью через другую вершину
      const e = mine[0]
      const rest = edges.filter((x) => x !== e)
      const u = e[0] === v ? e[1] : e[0]
      const comp = new Set<number>([u])
      for (let grew = true; grew; ) {
        grew = false
        for (const [a, b] of rest) {
          if (comp.has(a) !== comp.has(b)) {
            comp.add(a)
            comp.add(b)
            grew = true
          }
        }
      }
      let best: [number, number] | null = null
      let bestLen = Infinity
      for (const x of comp) {
        for (let y = 0; y < n; y++) {
          if (comp.has(y) || y === v || deg[x] >= GALAXY.maxDegree || deg[y] >= GALAXY.maxDegree) continue
          const len = dist(pts[x], pts[y])
          if (len < bestLen) {
            best = x < y ? [x, y] : [y, x]
            bestLen = len
          }
        }
      }
      if (!best) break
      edges = [...rest, best]
    }
  }
  if (edges.length === n - 1) {
    const has = new Set(edges.map(([a, b]) => `${a}-${b}`))
    const deg = new Array(n).fill(0)
    for (const [a, b] of edges) {
      deg[a]++
      deg[b]++
    }
    let best: [number, number] | null = null
    let bestLen = Infinity
    // сначала кратчайшее ребро графа Габриэля, иначе кратчайшее не пересекающее коридоры
    for (const mode of ['gabriel', 'free'] as const) {
      for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) {
          if (has.has(`${i}-${j}`) || deg[i] >= GALAXY.maxDegree || deg[j] >= GALAXY.maxDegree) continue
          const len = dist(pts[i], pts[j])
          if (len >= bestLen) continue
          if (mode === 'gabriel') {
            const mid = { x: (pts[i].x + pts[j].x) / 2, y: (pts[i].y + pts[j].y) / 2 }
            if (pts.some((q, k) => k !== i && k !== j && dist(q, mid) < len / 2)) continue
          } else if (pts.some((q, k) => k !== i && k !== j && distToSegment(q, pts[i], pts[j]) < 1e-9)) {
            continue
          } else if (edges.some(([a, b]) => a !== i && a !== j && b !== i && b !== j && segmentsCross(pts[i], pts[j], pts[a], pts[b]))) {
            continue
          }
          best = [i, j]
          bestLen = len
        }
      }
      if (best) break
    }
    if (best) edges.push(best)
  }
  for (let added = 0; added < extra; added++) {
    const has = new Set(edges.map(([a, b]) => `${a}-${b}`))
    const deg = new Array(n).fill(0)
    for (const [a, b] of edges) {
      deg[a]++
      deg[b]++
    }
    let best: [number, number] | null = null
    let bestLen = Infinity
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        if (has.has(`${i}-${j}`) || deg[i] >= GALAXY.maxDegree || deg[j] >= GALAXY.maxDegree) continue
        const len = dist(pts[i], pts[j])
        if (len >= bestLen) continue
        if (pts.some((q, k) => k !== i && k !== j && distToSegment(q, pts[i], pts[j]) < 1e-9)) continue
        if (edges.some(([a, b]) => a !== i && a !== j && b !== i && b !== j && segmentsCross(pts[i], pts[j], pts[a], pts[b]))) continue
        best = [i, j]
        bestLen = len
      }
    }
    if (!best) break
    edges.push(best)
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
export function assignRoles(rng: Rng, n: number, edges: [number, number][], inhabited?: number, ore = 1, pits = 1): SystemRole[] {
  const k = inhabited ?? (n === 5 ? 3 : 4)
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
  const pitCount = Math.min(pits, rest.length)
  const oreCount = Math.min(ore, rest.length - pitCount)
  const left = [...rest]
  for (let c = 0; c < pitCount; c++) {
    const pit = left.reduce((b, i) => (deg[i] > deg[b] ? i : b), left[0])
    roles[pit] = 'pit'
    left.splice(left.indexOf(pit), 1)
  }
  for (let c = 0; c < oreCount; c++) roles[left[c]] = 'ore'
  return roles
}

/** сколько цивилизаций в каждой обитаемой системе: по 2–3, всего 8–10 */
export function civSlots(rng: Rng, inhabited: number, civs?: number, perSystem = 3): number[] {
  const base = Math.min(2, perSystem)
  const total = Math.min(Math.max(civs ?? rng.int(CIVS.min, CIVS.max), inhabited * base), inhabited * perSystem)
  const slots = new Array(inhabited).fill(base)
  let extra = total - inhabited * base
  while (extra > 0) {
    const i = rng.int(0, inhabited - 1)
    if (slots[i] < perSystem) {
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

export function generateGalaxy(rng: Rng, opts: GalaxyOptions = {}): Galaxy {
  const n = opts.systems ?? rng.pick([5, 6, 6, 7])
  const perSystem = opts.perSystem ?? SETUP.perSystem.def
  const size = opts.size ?? SETUP.size.def
  const wanted =
    opts.civs !== undefined
      ? Math.ceil(opts.civs / perSystem)
      : opts.systems !== undefined
        ? Math.round(n * SETUP.inhabitedShare)
        : undefined
  const want = wanted === undefined ? undefined : Math.max(1, Math.min(n - 1, wanted))
  const pts = placeSystems(rng, n, size)
  const edges = buildCorridorEdges(pts, Math.round((opts.links ?? 0) * n / 2))
  const roles = assignRoles(rng, n, edges, want, opts.ore ?? SETUP.ore.def, opts.pits ?? SETUP.pits.def)
  const inhabited = roles.flatMap((r, i) => (r === 'inhabited' ? [i] : []))
  const slots = civSlots(rng, inhabited.length, opts.civs, perSystem)
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
      size *
      (hi - lo < 1e-6
        ? (GALAXY.transitMin + GALAXY.transitMax) / 2
        : GALAXY.transitMin + ((GALAXY.transitMax - GALAXY.transitMin) * (c.length - lo)) / (hi - lo))
    const A = systems[c.a]
    const B = systems[c.b]
    A.gates.push({ corridorId: c.id, toSystem: c.b, pos: gatePos(A, B) })
    B.gates.push({ corridorId: c.id, toSystem: c.a, pos: gatePos(B, A) })
  }
  return { systems, corridors }
}
