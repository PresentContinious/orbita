import { CIVS } from './config'
import type { Galaxy } from './types'

export interface GalaxyOptions {
  systems?: number
  civs?: number
  perSystem?: number
  ore?: number
  pits?: number
  links?: number
  size?: number
  treasury?: number
  unitCap?: number
}

/** все числа настроек галактики и лимита юнитов */
export const SETUP = {
  systems: { min: 4, max: 12 },
  civs: { min: 2, max: 24 },
  perSystem: { min: 1, max: 3, def: 3 },
  ore: { min: 0, max: 4, def: 1 },
  pits: { min: 0, max: 4, def: 1 },
  links: { min: 0, max: 1, def: 0 },
  size: { min: 0.6, max: 1.6, def: 1 },
  treasury: { min: 20, max: 300, def: CIVS.startTreasury },
  unitCap: { options: [500, 1000, 2000, 5000], def: 2000 },
  inhabitedShare: 0.6,
  retireMin: 20,
  retireShare: 0.2,
}

const INTEGER = ['systems', 'civs', 'perSystem', 'ore', 'pits'] as const
const RANGED = ['systems', 'civs', 'perSystem', 'ore', 'pits', 'links', 'size', 'treasury'] as const

export function clampOptions(o: GalaxyOptions): GalaxyOptions {
  const out: GalaxyOptions = {}
  for (const key of RANGED) {
    const v = o[key]
    if (typeof v !== 'number' || Number.isNaN(v)) continue
    const { min, max } = SETUP[key]
    let x = Math.min(max, Math.max(min, v))
    if ((INTEGER as readonly string[]).includes(key)) x = Math.round(x)
    out[key] = x
  }
  const cap = o.unitCap
  if (typeof cap === 'number' && !Number.isNaN(cap)) {
    out.unitCap = SETUP.unitCap.options.reduce((b, c) => (Math.abs(c - cap) < Math.abs(b - cap) ? c : b))
  }
  return out
}

export interface Setup {
  systems: number
  inhabited: number
  civs: number
  ore: number
  pits: number
  nebulae: number
  links: number
  size: number
  treasury: number
  unitCap: number
}

/** что вышло по готовой галактике */
export function setupOf(g: Galaxy, opts: GalaxyOptions): Setup {
  const count = (r: string) => g.systems.filter((s) => s.role === r).length
  return {
    systems: g.systems.length,
    inhabited: count('inhabited'),
    civs: g.systems.reduce((a, s) => a + s.civSlots, 0),
    ore: count('ore'),
    pits: count('pit'),
    nebulae: count('nebula'),
    links: g.corridors.length,
    size: opts.size ?? SETUP.size.def,
    treasury: opts.treasury ?? SETUP.treasury.def,
    unitCap: opts.unitCap ?? SETUP.unitCap.def,
  }
}
