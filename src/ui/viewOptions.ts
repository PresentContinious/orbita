import type { Display, PlanetStyle, TerritoryMode } from '../app/display'

export const TERRITORY_OPTIONS: { value: TerritoryMode; label: string }[] = [
  { value: 'off', label: 'выкл' },
  { value: 'zones', label: 'зоны' },
  { value: 'clouds', label: 'облака' },
]
export const PLANET_OPTIONS: { value: PlanetStyle; label: string }[] = [
  { value: 'calm', label: 'спокойные' },
  { value: 'contrast', label: 'контрастные' },
]
export const TRADE_OPTIONS: { value: boolean; label: string }[] = [
  { value: true, label: 'вкл' },
  { value: false, label: 'выкл' },
]

/** выбор в меню «Вид» → поправка к настройкам вида */
export const territoryPatch = (v: TerritoryMode): Partial<Display> => ({ territory: v })
export const planetsPatch = (v: PlanetStyle): Partial<Display> => ({ planets: v })
export const tradePatch = (v: boolean): Partial<Display> => ({ trade: v })
