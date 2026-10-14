// Настройки вида, которые зритель выбирает под себя: территории, стиль планет, торговые пути.
// Хранятся в браузере; параметры URL (?territory=, ?planets=, ?trade=) перекрывают их — для снимков.
export type TerritoryMode = 'off' | 'zones' | 'clouds'
export type PlanetStyle = 'calm' | 'contrast'

export interface Display {
  territory: TerritoryMode
  planets: PlanetStyle
  trade: boolean
}

export const DEFAULT_DISPLAY: Readonly<Display> = { territory: 'zones', planets: 'calm', trade: true }

const KEY = 'orbita.display'

/** текущие настройки; отрисовка читает их каждый кадр (дёшево — простой объект) */
export const display: Display = { ...DEFAULT_DISPLAY }

const listeners = new Set<() => void>()

function parseTerritory(v: string | null | undefined): TerritoryMode | null {
  if (v === 'off' || v === 'zones' || v === 'clouds') return v
  if (v === 'a') return 'zones'
  if (v === 'b') return 'clouds'
  return null
}

function parsePlanets(v: string | null | undefined): PlanetStyle | null {
  if (v === 'calm' || v === 'contrast') return v
  if (v === 'a') return 'calm'
  if (v === 'b') return 'contrast'
  return null
}

/** собрать настройки: умолчания ← сохранённое в браузере ← параметры URL */
export function resolveDisplay(saved: Partial<Record<keyof Display, unknown>> | null, search: string): Display {
  const out: Display = { ...DEFAULT_DISPLAY }
  if (saved) {
    out.territory = parseTerritory(saved.territory as string) ?? out.territory
    out.planets = parsePlanets(saved.planets as string) ?? out.planets
    if (typeof saved.trade === 'boolean') out.trade = saved.trade
  }
  const q = new URLSearchParams(search)
  out.territory = parseTerritory(q.get('territory')) ?? out.territory
  out.planets = parsePlanets(q.get('planets')) ?? out.planets
  const trade = q.get('trade')
  if (trade === '0' || trade === 'off') out.trade = false
  if (trade === '1' || trade === 'on') out.trade = true
  return out
}

/** один раз при старте: прочитать сохранённое и URL */
export function initDisplay(search: string): void {
  let saved: Partial<Record<keyof Display, unknown>> | null = null
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) saved = JSON.parse(raw)
  } catch {
    saved = null
  }
  Object.assign(display, resolveDisplay(saved, search))
}

export function setDisplay(patch: Partial<Display>): void {
  Object.assign(display, patch)
  try {
    localStorage.setItem(KEY, JSON.stringify(display))
  } catch {
    // приватный режим или запрет хранилища — настройки просто не запомнятся
  }
  for (const fn of listeners) fn()
}

export function onDisplay(fn: () => void): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}
