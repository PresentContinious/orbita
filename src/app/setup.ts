// Параметры галактики в адресе и запоминание выбора в браузере.
import { clampOptions, SETUP, type GalaxyOptions } from '../sim/setup'

/** начальные положения ползунков экрана настроек */
export const UI_DEFAULTS: Required<GalaxyOptions> = {
  systems: 6,
  civs: 9,
  perSystem: 3,
  ore: 1,
  pits: 1,
  links: 0,
  size: 1,
  treasury: 60,
  unitCap: SETUP.unitCap.def,
}

/** ключ настройки → имя параметра адреса */
const PARAMS: [keyof GalaxyOptions, string][] = [
  ['systems', 'systems'],
  ['civs', 'civs'],
  ['perSystem', 'per'],
  ['ore', 'ore'],
  ['pits', 'pits'],
  ['links', 'links'],
  ['size', 'size'],
  ['treasury', 'money'],
  ['unitCap', 'cap'],
]

export function parseSetup(search: string): { seed: number | null; opts: GalaxyOptions; stress: number } {
  const q = new URLSearchParams(search)
  const num = (k: string): number | null => {
    const raw = q.get(k)
    if (raw === null || raw.trim() === '') return null
    const n = Number(raw)
    return Number.isFinite(n) ? n : null
  }
  const raw: GalaxyOptions = {}
  for (const [key, name] of PARAMS) {
    const n = num(name)
    if (n !== null) raw[key] = n
  }
  const s = num('seed')
  const st = num('stress')
  return {
    seed: s !== null && s !== 0 ? s : null,
    opts: clampOptions(raw),
    stress: st === null || st <= 0 ? 0 : st === 1 ? 2000 : Math.round(st),
  }
}

export function setupQuery(seed: number, opts: GalaxyOptions): string {
  const q = new URLSearchParams({ seed: String(seed) })
  const o = clampOptions(opts)
  for (const [key, name] of PARAMS) if (o[key] !== undefined) q.set(name, String(o[key]))
  return q.toString()
}

const CAP_KEY = 'orbita.unitCap'
const SETUP_KEY = 'orbita.setup'

export function loadUnitCap(): number | null {
  try {
    const n = Number(localStorage.getItem(CAP_KEY))
    return SETUP.unitCap.options.includes(n) ? n : null
  } catch {
    return null
  }
}

export function saveUnitCap(n: number): void {
  try {
    localStorage.setItem(CAP_KEY, String(n))
  } catch {
    // хранилище недоступно — лимит просто не запомнится
  }
}

export type SetupValues = Required<GalaxyOptions> & { seed: number }

export function loadSetupValues(): SetupValues {
  const base: SetupValues = { ...UI_DEFAULTS, seed: Math.floor(Math.random() * 1_000_000) + 1 }
  try {
    const raw = localStorage.getItem(SETUP_KEY)
    if (raw) {
      const saved = JSON.parse(raw)
      const seed = typeof saved.seed === 'number' && saved.seed > 0 ? saved.seed : base.seed
      return { ...base, ...clampOptions(saved), seed }
    }
  } catch {
    // битое сохранение — берём умолчания
  }
  return base
}

export function saveSetupValues(v: SetupValues): void {
  try {
    localStorage.setItem(SETUP_KEY, JSON.stringify(v))
  } catch {
    // см. выше
  }
}
