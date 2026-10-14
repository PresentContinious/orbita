// Таблицы классов боевых кораблей (спека 2А, раздел 6). Движение — в SHIP_KINDS, всё остальное здесь.
import { SHIP_KINDS, type ShipKind } from './config'
import type { Combat, Module } from './types'

export type CombatKind = 'corvette' | 'torpedo' | 'frigate' | 'battleship' | 'carrier' | 'interceptor' | 'bomber' | 'trooper' | 'supply' | 'scout'
/** line — линкоры (ряд 0), frigate — ряд −90, rear — носители/снабженцы/десант/разведчики (−110), screen — корветы (овал), boat — катера (крылья), craft — машины */
export type Role = 'line' | 'frigate' | 'rear' | 'screen' | 'boat' | 'craft'
export type WeaponKind = 'flak' | 'lightTorpedo' | 'missile' | 'autocannon' | 'beam' | 'turret' | 'gun' | 'torpedo'

export interface Weapon {
  kind: WeaponKind
  range: number
  /** с между выстрелами одного ствола */
  cooldown: number
  damage: number
  /** стволов */
  count: number
  /** сектор от носа, ° в каждую сторону; 180 — круговой */
  arc: number
}

export interface HangarSpec {
  capacity: number
  spare: number
  bays: number
  reload: number
  torpedoes: number
}

export interface ShipClass {
  role: Role
  hull: number
  shield: number
  shieldRegen: number
  price: number
  modules: Module[]
  /** залпы (фрегат), торпеды (катер, бомбардировщик) */
  ammo: number
  weapons: Weapon[]
  hangar: HangarSpec | null
}

const W = (kind: WeaponKind, range: number, cooldown: number, damage: number, count = 1, arc = 180): Weapon => ({ kind, range, cooldown, damage, count, arc })
const NONE: Weapon[] = []

export const CLASSES: Record<CombatKind, ShipClass> = {
  corvette: { role: 'screen', hull: 120, shield: 0, shieldRegen: 0, price: 60, modules: [], ammo: 0, weapons: [W('flak', 70, 1, 6)], hangar: null },
  torpedo: { role: 'boat', hull: 100, shield: 0, shieldRegen: 0, price: 80, modules: [], ammo: 2, weapons: [W('lightTorpedo', 60, 2, 60)], hangar: null },
  frigate: {
    role: 'frigate', hull: 300, shield: 150, shieldRegen: 6, price: 160, modules: ['engines', 'launchers'], ammo: 10,
    weapons: [W('missile', 320, 12, 100), W('autocannon', 110, 0.5, 10)], hangar: null,
  },
  battleship: {
    role: 'line', hull: 1500, shield: 500, shieldRegen: 12, price: 600, modules: ['engines', 'turrets', 'mainGun'], ammo: 0,
    weapons: [W('beam', 250, 4, 40, 2, 60), W('turret', 160, 1, 8, 4)], hangar: null,
  },
  carrier: {
    role: 'rear', hull: 700, shield: 250, shieldRegen: 8, price: 700, modules: ['engines', 'hangar'], ammo: 0, weapons: NONE,
    hangar: { capacity: 12, spare: 6, bays: 4, reload: 12, torpedoes: 24 },
  },
  interceptor: { role: 'craft', hull: 20, shield: 0, shieldRegen: 0, price: 20, modules: [], ammo: 0, weapons: [W('gun', 40, 0.5, 2.5)], hangar: null },
  bomber: { role: 'craft', hull: 35, shield: 0, shieldRegen: 0, price: 35, modules: [], ammo: 1, weapons: [W('torpedo', 80, 3, 150)], hangar: null },
  trooper: { role: 'rear', hull: 250, shield: 0, shieldRegen: 0, price: 120, modules: ['engines'], ammo: 0, weapons: NONE, hangar: null },
  supply: { role: 'rear', hull: 250, shield: 0, shieldRegen: 0, price: 100, modules: ['engines'], ammo: 0, weapons: NONE, hangar: null },
  scout: { role: 'rear', hull: 60, shield: 0, shieldRegen: 0, price: 70, modules: ['engines'], ammo: 0, weapons: NONE, hangar: null },
}

export const COMBAT_KINDS = Object.keys(CLASSES) as CombatKind[]

export function isCombatKind(kind: ShipKind): kind is CombatKind {
  return kind in CLASSES
}

export const isCraft = (kind: ShipKind): boolean => kind === 'interceptor' || kind === 'bomber'

export function isCapital(kind: ShipKind): boolean {
  if (!isCombatKind(kind)) return false
  const r = CLASSES[kind].role
  return r === 'line' || r === 'frigate' || r === 'rear'
}

/** участвует в push-out рамки: капитальные, корветы, катера; машины и мирные — нет */
export const pushable = (kind: ShipKind): boolean => isCombatKind(kind) && !isCraft(kind)

export const radiusOf = (kind: ShipKind): number => SHIP_KINDS[kind].length / 2

/** состав по умолчанию: 6 перехватчиков + 6 бомбардировщиков в ангаре, запас 3 + 3 */
export const DEFAULT_WING: { kind: 'interceptor' | 'bomber'; n: number }[] = [
  { kind: 'interceptor', n: 6 },
  { kind: 'bomber', n: 6 },
]

export function newCombat(kind: CombatKind, t: number): Combat {
  const c = CLASSES[kind]
  const modules: Partial<Record<Module, number>> = {}
  for (const m of c.modules) modules[m] = 1
  return {
    hull: c.hull,
    hullMax: c.hull,
    shield: c.shield,
    shieldMax: c.shield,
    shieldRegen: c.shieldRegen,
    lastHitT: -Infinity,
    modules,
    ammo: c.ammo,
    burning: null,
    heading: 0,
    slot: null,
    rank: 0,
    carrierId: null,
    wing: null,
    hangar: c.hangar ? { deck: [], bays: new Array(c.hangar.bays).fill(0), torpedoes: c.hangar.torpedoes, craft: 0, nextWave: t } : null,
    targetId: null,
    retargetAt: t,
    cooldown: c.weapons.map(() => 0),
    mothballed: false,
    dockedAt: null,
    battles: 0,
  }
}

/** цена класса с машинами полного ангара и запаса (носитель 700 + 12 · 20 + 6 · 35 = 1 150) */
export function fullPrice(kind: CombatKind): number {
  const c = CLASSES[kind]
  if (!c.hangar) return c.price
  return c.price + c.hangar.capacity * CLASSES.interceptor.price + c.hangar.spare * CLASSES.bomber.price
}
