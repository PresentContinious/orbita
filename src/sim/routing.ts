import type { Galaxy } from './types'

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
