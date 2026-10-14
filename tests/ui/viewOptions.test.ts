import { describe, expect, test } from 'vitest'
import { PLANET_OPTIONS, TERRITORY_OPTIONS, TRADE_OPTIONS, planetsPatch, territoryPatch, tradePatch } from '../../src/ui/viewOptions'
import { territoryVisibility } from '../../src/render/galaxyLayer'

describe('меню «Вид»', () => {
  test('каждый пункт даёт правильную поправку к настройкам', () => {
    expect(TERRITORY_OPTIONS.map((o) => territoryPatch(o.value))).toEqual([{ territory: 'off' }, { territory: 'zones' }, { territory: 'clouds' }])
    expect(PLANET_OPTIONS.map((o) => planetsPatch(o.value))).toEqual([{ planets: 'calm' }, { planets: 'contrast' }])
    expect(TRADE_OPTIONS.map((o) => tradePatch(o.value))).toEqual([{ trade: true }, { trade: false }])
  })
  test('режим территорий включает ровно один слой, «выкл» — ни одного', () => {
    expect(territoryVisibility('off')).toEqual({ zones: false, clouds: false })
    expect(territoryVisibility('zones')).toEqual({ zones: true, clouds: false })
    expect(territoryVisibility('clouds')).toEqual({ zones: false, clouds: true })
  })
})
