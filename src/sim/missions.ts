import { planetGoal, type Goal } from './nav'
import type { Ship, World } from './types'

export function missionGoal(w: World, ship: Ship): Goal | null {
  const m = ship.mission
  switch (m.type) {
    case 'return':
      return planetGoal(w, ship, m.planetId, dock)
    default:
      return null
  }
}

/** пристыковался к своей планете — корабль уходит в док */
function dock(_w: World, ship: Ship): void {
  ship.alive = false
}
