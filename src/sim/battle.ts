// Бой: журнал и связь корабля с боем. Остальное (фазы, давление, вердикт) — задача 9.
import { EVENTS } from './config'
import { fleetById } from './fleet'
import type { Rng } from './rng'
import type { Battle, BattleLogEntry, Ship, World } from './types'

/** строка в журнал боя; журнал не длиннее EVENTS.battleLog */
export function logBattle(w: World, b: Battle, kind: string, text: string, side?: 0 | 1, shipId?: number): void {
  const e: BattleLogEntry = { t: w.t, kind, text }
  if (side !== undefined) e.side = side
  if (shipId !== undefined) e.shipId = shipId
  b.log.push(e)
  if (b.log.length > EVENTS.battleLog) b.log.splice(0, b.log.length - EVENTS.battleLog)
  b.metrics.lastEventT = w.t
}

/** бой, в котором участвует флот корабля */
export function battleOf(w: World, ship: Ship): Battle | null {
  if (ship.fleetId === null) return null
  const fleet = fleetById(w, ship.fleetId)
  if (!fleet || fleet.battleId === null) return null
  for (const b of w.battles) if (b.id === fleet.battleId) return b
  return null
}

/** случайность корабля: в бою — battle.rng, иначе во флоте — fleet.rng, иначе w.rng */
export function combatRng(w: World, ship: Ship): Rng {
  const b = battleOf(w, ship)
  if (b) return b.rng
  const fleet = ship.fleetId === null ? undefined : fleetById(w, ship.fleetId)
  return fleet ? fleet.rng : w.rng
}
