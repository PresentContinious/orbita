import { describe, expect, test } from 'vitest'
import { decide } from '../../src/sim/bot'
import { listOptions } from '../../src/sim/options'
import { capitalOf, populatedOf } from '../../src/sim/query'
import { hops } from '../../src/sim/routing'
import { spawnShip } from '../../src/sim/ships'
import type { Civ, World } from '../../src/sim/types'
import { createWorld } from '../../src/sim/world'
import { quietWorld, run } from '../helpers'

function rich(seed = 1): { w: World; civ: Civ } {
  const w = quietWorld(seed)
  const civ = w.civs[0]
  civ.treasury = 10_000
  civ.eco.envelopes = { expand: 3000, develop: 3000, trade: 3000, reserve: 0, war: 0 }
  capitalOf(w, civ)!.pop = 6
  return { w, civ }
}

describe('listOptions', () => {
  test('колонии — свободные пригодные планеты не дальше 2 коридоров', () => {
    const { w, civ } = rich()
    const home = capitalOf(w, civ)!
    const cols = listOptions(w, civ).filter((o) => o.kind === 'colony')
    expect(cols.length).toBeGreaterThan(0)
    for (const o of cols) {
      const p = w.planets.get(o.planetId!)!
      expect(p.owner).toBeNull()
      expect(p.habitability).toBeGreaterThan(0)
      expect(hops(w.galaxy, home.systemId, p.systemId)).toBeLessThanOrEqual(2)
      expect(o.envelope).toBe('expand')
    }
  })

  test('туда, куда уже летят свои колонисты, вторую экспедицию не предлагают', () => {
    const { w, civ } = rich()
    const first = listOptions(w, civ).find((o) => o.kind === 'colony')!
    spawnShip(w, civ, 'colony', capitalOf(w, civ)!, { type: 'colonize', planetId: first.planetId!, settlers: 0.5, price: 160 }, 160)
    expect(listOptions(w, civ).some((o) => o.kind === 'colony' && o.planetId === first.planetId)).toBe(false)
  })

  test('в столице меньше 3.5 тыс. — колоний нет', () => {
    const { w, civ } = rich()
    capitalOf(w, civ)!.pop = 3.4
    expect(listOptions(w, civ).some((o) => o.kind === 'colony')).toBe(false)
  })

  test('станции — только на планетах с пригодностью ниже 0.5', () => {
    const { w, civ } = rich()
    for (const o of listOptions(w, civ).filter((x) => x.kind === 'station')) {
      expect(w.planets.get(o.planetId!)!.habitability).toBeLessThan(0.5)
    }
  })

  test('инфраструктура столицы стоит 120; на уровне III не предлагается', () => {
    const { w, civ } = rich()
    const home = capitalOf(w, civ)!
    expect(listOptions(w, civ).find((o) => o.kind === 'infra' && o.planetId === home.id)!.price).toBe(120)
    home.infra = 3
    expect(listOptions(w, civ).some((o) => o.kind === 'infra' && o.planetId === home.id)).toBe(false)
  })

  test('на старте 4 исследования по 300, порт и верфь', () => {
    const { w, civ } = rich()
    const opts = listOptions(w, civ)
    expect(opts.filter((o) => o.kind === 'research').map((o) => o.price)).toEqual([300, 300, 300, 300])
    expect(opts.some((o) => o.kind === 'port')).toBe(true)
    expect(opts.some((o) => o.kind === 'shipyard')).toBe(true)
  })

  test('внутренний караван — только при двух своих населённых планетах', () => {
    const { w, civ } = rich()
    const internal = () => listOptions(w, civ).filter((o) => o.kind === 'caravan' && w.planets.get(o.partnerId!)!.owner === civ.id)
    expect(internal().length).toBe(0)
    const home = capitalOf(w, civ)!
    const p = w.galaxy.systems[home.systemId].planets.find((x) => x.owner === null && x.habitability > 0)!
    p.owner = civ.id
    p.pop = 1
    expect(internal().length).toBe(1)
  })

  test('внешний караван — партнёр не дальше 2 коридоров', () => {
    const { w, civ } = rich()
    const home = capitalOf(w, civ)!
    for (const o of listOptions(w, civ).filter((x) => x.kind === 'caravan')) {
      const b = w.planets.get(o.partnerId!)!
      if (b.owner !== civ.id) expect(hops(w.galaxy, home.systemId, b.systemId)).toBeLessThanOrEqual(2)
    }
  })
})

describe('межсистемный слот', () => {
  test('внутренний и внешний караваны — в своей системе, межсистемный — отдельный вариант в другую систему', () => {
    const { w, civ } = rich()
    const home = capitalOf(w, civ)!
    for (const o of listOptions(w, civ).filter((x) => x.kind === 'caravan')) {
      const a = w.planets.get(o.planetId!)!
      const b = w.planets.get(o.partnerId!)!
      expect(a.systemId === b.systemId || hops(w.galaxy, home.systemId, b.systemId) <= 2).toBe(true)
    }
  })

  test('держава с межсистемной возможностью со временем открывает межсистемную трассу', () => {
    const w = createWorld(3)
    run(w, 900)
    expect(w.events.some((e) => e.kind === 'trade-route')).toBe(true)
  })
})

describe('decide', () => {
  test('деньги только в конверте развития — покупается развитие', () => {
    const { w, civ } = rich()
    civ.eco.envelopes = { expand: 0, develop: 3000, trade: 0, reserve: 0, war: 0 }
    const o = decide(w, civ)!
    expect(['infra', 'port', 'shipyard', 'research']).toContain(o.kind)
  })

  test('деньги только в конверте расширения — летят колонисты', () => {
    const { w, civ } = rich()
    civ.eco.envelopes = { expand: 3000, develop: 0, trade: 0, reserve: 0, war: 0 }
    const o = decide(w, civ)!
    expect(o.kind).toBe('colony')
    expect(w.ships.some((s) => s.owner === civ.id && s.kind === 'colony')).toBe(true)
    expect(capitalOf(w, civ)!.pop).toBeCloseTo(5.5)
  })

  test('в долгах ничего не покупает', () => {
    const { w, civ } = rich()
    civ.eco.stage = 'deficit'
    expect(decide(w, civ)).toBeNull()
  })
})

describe('боты в живом мире', () => {
  test('за 10 минут каждая держава что-то покупает, и в галактике появляются колонии', () => {
    const w = createWorld(1)
    run(w, 600)
    for (const c of w.civs) {
      const bought = c.eco.ledger.expense
      expect(bought.colony + bought.caravan + bought.miner + bought.station + bought.infra + bought.port + bought.shipyard + bought.research).toBeGreaterThan(0)
    }
    expect(w.civs.some((c) => populatedOf(w, c).length >= 2)).toBe(true)
  }, 120_000)
})
