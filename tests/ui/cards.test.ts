import { describe, expect, test } from 'vitest'
import { capitalOf } from '../../src/sim/query'
import { spawnShip } from '../../src/sim/ships'
import { civCard, missionText, planetCard, shipCard, systemCard } from '../../src/ui/cards'
import { quietWorld, run } from '../helpers'

describe('карточки', () => {
  test('столица: владелец, население из потолка, налог', () => {
    const w = quietWorld(4815)
    const civ = w.civs[0]
    const home = capitalOf(w, civ)!
    const card = planetCard(w, home.id)!
    expect(card.title).toBe(home.name)
    expect(card.subtitle).toBe(`${civ.name} · столица`)
    const rows = Object.fromEntries(card.rows.map((r) => [r.label, r.value]))
    expect(rows['население']).toMatch(/^\d[\d ]* \/ \d[\d ]*$/)
    expect(rows['налог']).toMatch(/^\+\d+\.\d кр\/с$/)
  })

  test('ничья планета показывает пригодность', () => {
    const w = quietWorld(4815)
    const free = [...w.planets.values()].find((p) => p.owner === null && p.habitability >= 1)!
    const card = planetCard(w, free.id)!
    expect(card.subtitle).toBe('ничья')
    expect(card.rows.find((r) => r.label === 'пригодность')!.tone).toBe('good')
  })

  test('система: роль и доли держав', () => {
    const w = quietWorld(4815)
    const home = capitalOf(w, w.civs[0])!
    const card = systemCard(w, home.systemId)!
    expect(card.subtitle).toContain('обитаемая')
    expect(card.rows.some((r) => r.label === w.civs[0].name)).toBe(true)
  })

  test('держава: отчёт казны и стадия', () => {
    const w = quietWorld(4815)
    run(w, 10)
    const card = civCard(w, w.civs[0].id)!
    const labels = card.rows.map((r) => r.label)
    expect(labels).toEqual(expect.arrayContaining(['казна', 'чистый доход', 'запас', 'стадия', 'планет']))
  })

  test('корабль: чей и чем занят', () => {
    const w = quietWorld(4815)
    const civ = w.civs[0]
    const home = capitalOf(w, civ)!
    const ship = spawnShip(w, civ, 'caravan', home, { type: 'return', planetId: home.id }, 50)
    expect(missionText(w, ship)).toBe('возвращается в док')
    ship.mission = { type: 'mine', phase: 'back', asteroidId: null, cargo: 20, idleT: 0 }
    expect(missionText(w, ship)).toBe('везёт руду домой (+16 кр)')
    const card = shipCard(w, ship.id)!
    expect(card.subtitle).toBe(civ.name)
  })
})
