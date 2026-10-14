import { civById } from '../sim/query'
import type { StarSystem, World } from '../sim/types'

export interface Share {
  civ: number
  color: number
  share: number
}

/** доли держав в системе: населённая планета весит 1, станция — 0.5 */
export function territoryShares(w: World, sys: StarSystem): Share[] {
  const weight = new Map<number, number>()
  let total = 0
  for (const p of sys.planets) {
    if (p.owner === null) continue
    const k = p.pop > 0 ? 1 : p.station ? 0.5 : 0
    if (!k) continue
    weight.set(p.owner, (weight.get(p.owner) ?? 0) + k)
    total += k
  }
  const out: Share[] = []
  for (const [id, wgt] of weight) {
    const c = civById(w, id)
    if (c) out.push({ civ: id, color: c.color, share: wgt / total })
  }
  return out.sort((a, b) => b.share - a.share || a.civ - b.civ)
}
