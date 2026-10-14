import { ECON } from './config'
import { earn } from './economy'
import { pushEvent } from './events'
import { SETUP } from './setup'
import type { Civ, Ship, World } from './types'

export function liveShips(w: World): number {
  let n = 0
  for (const s of w.ships) if (s.alive) n++
  return n
}

export function civShare(w: World): number {
  return Math.ceil(w.unitCap / Math.max(1, w.civs.length))
}

const isTraffic = (s: Ship) => s.kind === 'caravan' || s.kind === 'miner'

/** можно ли державе покупать мирный корабль */
export function trafficAllowed(w: World, civ: Civ): boolean {
  if (liveShips(w) >= w.unitCap) return false
  let mine = 0
  for (const s of w.ships) if (s.alive && s.owner === civ.id && isTraffic(s)) mine++
  return mine < civShare(w)
}

/** раз в секунду списывает лишние караваны и шахтёров (колонисты и боевые — никогда) */
export function stepUnitCap(w: World): void {
  if (w.tick % 10 !== 0) return
  const excess = liveShips(w) - w.unitCap
  if (excess <= 0) return
  const quota = Math.min(excess, Math.max(SETUP.retireMin, Math.ceil(excess * SETUP.retireShare)))
  const byCiv = new Map<number, Ship[]>()
  for (const s of w.ships) {
    if (!s.alive || !isTraffic(s)) continue
    const list = byCiv.get(s.owner)
    if (list) list.push(s)
    else byCiv.set(s.owner, [s])
  }
  let retired = 0
  for (; retired < quota; retired++) {
    let bestId = -1
    let bestN = 0
    for (const [id, list] of byCiv) {
      if (list.length > bestN || (list.length === bestN && list.length > 0 && id < bestId)) {
        bestId = id
        bestN = list.length
      }
    }
    if (bestN === 0) break
    const list = byCiv.get(bestId)!
    let k = 0
    for (let i = 1; i < list.length; i++) if (list[i].id > list[k].id) k = i
    const ship = list.splice(k, 1)[0]
    ship.alive = false
    const civ = w.civs.find((c) => c.id === bestId)
    if (civ) earn(civ, ship.price * ECON.decommissionRefund, 'refund')
  }
  if (retired > 0) {
    pushEvent(w, {
      kind: 'decommission',
      pri: 2,
      text: `Лимит юнитов: списано ${retired} кораблей`,
      textMany: (n) => `Лимит юнитов: списание продолжается (${n} волн)`,
      civs: [],
      at: { system: 0 },
    })
  }
}
