// Урон. ЗАГЛУШКА задачи 4: корпус минус урон; щиты, модули, горение и обломки — задача 5.
import type { WeaponKind } from './classes'
import type { Projectile, Ship, World } from './types'

export function applyHit(
  _w: World,
  target: Ship,
  damage: number,
  _source: WeaponKind | 'beam' | 'collision',
  _shooterId: number,
): void {
  if (!target.combat) {
    target.alive = false
    return
  }
  target.combat.hull -= damage
  if (target.combat.hull <= 0) target.alive = false
}

/** луч догорел: бросок на модуль по суммарному урону — задача 5 */
export function onBeamEnd(_w: World, _proj: Projectile): void {}
