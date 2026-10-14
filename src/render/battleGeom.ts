import { isCraft } from '../sim/classes'
import { SHIP_KINDS, type ShipKind } from '../sim/config'
import type { ProjectileKind, Ship } from '../sim/types'
import type { FxKind } from './textures'

/** длина корабля на экране: машины ≥ 3 px, остальные ≥ 6 px, при крупном зуме — настоящий размер */
export function shipScreenLen(kind: ShipKind, z: number): number {
  return Math.max(SHIP_KINDS[kind].length * z, isCraft(kind) ? 3 : 6)
}

/** нос: у боевого — combat.heading, у мирного — по скорости */
export function headingOf(ship: Pick<Ship, 'combat' | 'vel'>): number {
  return ship.combat ? ship.combat.heading : Math.atan2(ship.vel.y, ship.vel.x)
}

/** шаг расслоения: рисуется каждый k-й снаряд, чтобы на кадр вышло ≤ max */
export function drawBudget(n: number, max = 2000): number {
  return n <= max ? 1 : Math.ceil(n / max)
}

export function shouldDraw(index: number, k: number): boolean {
  return index % k === 0
}

/** текстура снаряда; луч частицей не рисуется (его рисует Graphics) */
export function projTexture(kind: ProjectileKind): FxKind | null {
  return kind === 'beam' ? null : kind
}

/** горящий корабль: теплее исходного цвета (R растёт, B падает) */
export function burnTint(color: number): number {
  const r = (color >> 16) & 255
  const g = (color >> 8) & 255
  const b = color & 255
  const r2 = Math.min(255, Math.round(r + (255 - r) * 0.55))
  const g2 = Math.round(g * 0.75)
  const b2 = Math.round(b * 0.4)
  return (r2 << 16) | (g2 << 8) | b2
}

/** обломок гаснет в последнюю треть жизни */
export function debrisAlpha(age: number, life: number): number {
  if (life <= 0 || age >= life) return 0
  const t = age / life
  return t < 2 / 3 ? 1 : (1 - t) * 3
}
