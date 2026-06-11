// Спрайты кораблей: SVG с CSS-переменной --accent, перекрашиваются в цвет
// государства и кэшируются по (тип, цвет).
// ВАЖНО: SVG запекается в битмап ОДИН раз — drawImage прямо из SVG-<img>
// заставляет браузер пере-растеризовывать вектор на каждом кадре для каждого
// корабля; эта работа идёт в композиторе, мимо JS-профайлера, и валит FPS
// пропорционально размеру флота

import fighterRaw from '../assets/sprites/fighter.svg?raw'
import raiderRaw from '../assets/sprites/raider.svg?raw'
import escortRaw from '../assets/sprites/escort.svg?raw'
import minerRaw from '../assets/sprites/miner.svg?raw'
import dreadRaw from '../assets/sprites/dreadnought.svg?raw'
import cruiserRaw from '../assets/sprites/cruiser.svg?raw'
import destroyerRaw from '../assets/sprites/destroyer.svg?raw'
import corsairRaw from '../assets/sprites/corsair.svg?raw'
import cargoRaw from '../assets/sprites/cargo-transport.svg?raw'
import troopRaw from '../assets/sprites/troop-transport.svg?raw'
import missileRaw from '../assets/sprites/missile-ballistic.svg?raw'

const RAW = {
  fighter: fighterRaw,
  raider: raiderRaw,
  escort: escortRaw,
  miner: minerRaw,
  dread: dreadRaw,
  cruiser: cruiserRaw,
  destroyer: destroyerRaw,
  corsair: corsairRaw,
  cargo: cargoRaw,
  troop: troopRaw,
  missile: missileRaw,
}

const cache = new Map()

export function getSprite(kind, color = '#59d6ff') {
  const key = kind + '|' + color
  let entry = cache.get(key)
  if (!entry) {
    const svg = (RAW[kind] || RAW.fighter).replace('<svg ', `<svg style="--accent:${color}" `)
    const img = new Image()
    entry = { source: img }
    img.onload = () => {
      // запас разрешения ×6 — хватает на максимальный размер корабля на экране
      const k = 6
      const c = document.createElement('canvas')
      c.width = Math.max(2, Math.round(img.naturalWidth * k))
      c.height = Math.max(2, Math.round(img.naturalHeight * k))
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height)
      entry.source = c
    }
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg)
    cache.set(key, entry)
  }
  return entry.source
}

// готов ли спрайт к отрисовке: запечённый битмап — всегда, <img> — после загрузки
export function spriteReady(s) {
  return s instanceof HTMLCanvasElement ? true : !!(s.complete && s.naturalWidth)
}
