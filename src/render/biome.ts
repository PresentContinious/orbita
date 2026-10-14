// Биом планеты — только вид. Выводится из данных планеты (вид, зона, пригодность, хеш id), симуляцию не трогает.
import type { Planet } from '../sim/types'
import { hashString } from './noise'

export type Biome =
  | 'land'
  | 'ocean'
  | 'jungle'
  | 'desert'
  | 'lava'
  | 'toxic'
  | 'tundra'
  | 'rock'
  | 'gas-amber'
  | 'gas-ice'
  | 'gas-toxic'
  | 'gas-violet'
  | 'ice'
  | 'ice-spots'
  | 'dwarf-grey'
  | 'dwarf-brown'

export const BIOME_NAME: Record<Biome, string> = {
  land: 'Земля: материки и моря',
  ocean: 'Океан',
  jungle: 'Джунгли',
  desert: 'Пустыня',
  lava: 'Лавовый мир',
  toxic: 'Ядовитая атмосфера',
  tundra: 'Тундра',
  rock: 'Голая скала',
  'gas-amber': 'Газовый гигант (охра)',
  'gas-ice': 'Газовый гигант (ледяной)',
  'gas-toxic': 'Газовый гигант (ядовитый)',
  'gas-violet': 'Газовый гигант (сизый)',
  ice: 'Ледяной мир',
  'ice-spots': 'Ледяной мир с тёмными пятнами',
  'dwarf-grey': 'Карлик (серый)',
  'dwarf-brown': 'Карлик (бурый)',
}

export const biomeName = (b: Biome): string => BIOME_NAME[b]

function pick<T>(opts: [T, number][], u: number): T {
  const total = opts.reduce((s, o) => s + o[1], 0)
  let x = u * total
  for (const [v, w] of opts) {
    x -= w
    if (x < 0) return v
  }
  return opts[opts.length - 1][0]
}

/** число [0,1) из хеша id; золотое смещение по номеру планеты разводит соседей по системе */
function roll(p: Planet): number {
  const idx = Number(p.id.split(':')[1]) || 0
  const h = hashString(p.id) / 4294967296
  return (h + idx * 0.618034) % 1
}

export function planetBiome(p: Planet): Biome {
  const u = roll(p)
  if (p.kind === 'gas') return pick<Biome>([['gas-amber', 1], ['gas-ice', 1], ['gas-toxic', 1], ['gas-violet', 1]], u)
  if (p.kind === 'ice') return pick<Biome>([['ice', 3], ['ice-spots', 2]], u)
  if (p.kind === 'dwarf') return pick<Biome>([['dwarf-grey', 1], ['dwarf-brown', 1]], u)
  // каменные. Пригодные для жизни — только правдоподобные: земля, океан, джунгли, тундра
  if (p.habitability >= 1) {
    if (p.zone === 'cold') return 'tundra'
    return pick<Biome>([['land', 4], ['ocean', 3], ['jungle', 3]], u)
  }
  if (p.zone === 'hot') return pick<Biome>([['lava', 3], ['desert', 3], ['toxic', 2], ['rock', 2]], u)
  if (p.zone === 'cold') return pick<Biome>([['tundra', 5], ['rock', 3], ['toxic', 1]], u)
  return pick<Biome>([['desert', 3], ['rock', 2], ['toxic', 1], ['land', 2], ['jungle', 1]], u)
}
