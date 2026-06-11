// Спрайты кораблей: SVG с CSS-переменной --accent,
// перекрашиваются в цвет государства и кэшируются по (тип, цвет)

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
  let img = cache.get(key)
  if (!img) {
    const svg = (RAW[kind] || RAW.fighter).replace('<svg ', `<svg style="--accent:${color}" `)
    img = new Image()
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg)
    cache.set(key, img)
  }
  return img
}
