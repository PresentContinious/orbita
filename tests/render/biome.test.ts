import { expect, test } from 'vitest'
import { createWorld } from '../../src/sim/world'
import { BIOME_NAME, planetBiome } from '../../src/render/biome'
import type { Planet } from '../../src/sim/types'

const SEEDS = [1, 2, 3, 4, 5, 4815, 77, 2024]
const allPlanets = (seed: number): Planet[] => createWorld(seed).galaxy.systems.flatMap((s) => s.planets)

test('биом планеты детерминирован и имеет русское название', () => {
  for (const p of allPlanets(4815)) {
    const b = planetBiome(p)
    expect(planetBiome(p)).toBe(b)
    expect(BIOME_NAME[b].length).toBeGreaterThan(2)
  }
})

test('пригодные для жизни не получают лаву, яд, пустыню или голую скалу', () => {
  let seen = 0
  for (const seed of SEEDS)
    for (const p of allPlanets(seed))
      if (p.habitability >= 1 && p.kind === 'rocky') {
        seen++
        expect(['land', 'ocean', 'jungle', 'tundra']).toContain(planetBiome(p))
      }
  expect(seen).toBeGreaterThan(0)
})

test('каменные планеты разных миров выглядят по-разному', () => {
  const kinds = new Set<string>()
  for (const seed of SEEDS) for (const p of allPlanets(seed)) if (p.kind === 'rocky') kinds.add(planetBiome(p))
  expect(kinds.size).toBeGreaterThanOrEqual(5)
  expect(kinds.has('land') && kinds.size > 1).toBe(true)
})

test('газовые гиганты получают разные палитры', () => {
  const kinds = new Set<string>()
  for (const seed of SEEDS) for (const p of allPlanets(seed)) if (p.kind === 'gas') kinds.add(planetBiome(p))
  expect(kinds.size).toBeGreaterThanOrEqual(3)
})
