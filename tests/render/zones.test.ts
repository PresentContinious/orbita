import { expect, test } from 'vitest'
import { civAtAngle, cloudSpots, pieceEdges, polyArea, sectorsOf, systemPieces, zoneCell, zoneRadius, type Pt } from '../../src/render/zones'
import type { Share } from '../../src/render/territory'

const sites: Pt[] = [
  { x: 0, y: 0 },
  { x: 100, y: 0 },
  { x: 40, y: 90 },
  { x: -300, y: 20 },
]
const sh = (civ: number, share: number): Share => ({ civ, color: 0x100 * civ, share })

test('ячейки соседей не перекрываются: каждая точка ближе к своей системе', () => {
  for (let i = 0; i < sites.length; i++) {
    const cell = zoneCell(sites, i, zoneRadius(sites, i))
    expect(cell.length).toBeGreaterThan(2)
    for (const v of cell) {
      const di = Math.hypot(v.x - sites[i].x, v.y - sites[i].y)
      for (let j = 0; j < sites.length; j++) if (j !== i) expect(di).toBeLessThanOrEqual(Math.hypot(v.x - sites[j].x, v.y - sites[j].y) + 1e-6)
    }
  }
})

test('зона обрезана кругом: не тянется в пустоту', () => {
  const R = zoneRadius(sites, 3)
  for (const v of zoneCell(sites, 3, R)) expect(Math.hypot(v.x - sites[3].x, v.y - sites[3].y)).toBeLessThanOrEqual(R * 1.02)
})

test('сектора покрывают 360° и идут по долям', () => {
  const sec = sectorsOf([sh(1, 0.5), sh(2, 0.3), sh(3, 0.2)])
  expect(sec[0].a0).toBeCloseTo(-Math.PI / 2)
  expect(sec[2].a1 - sec[0].a0).toBeCloseTo(Math.PI * 2)
  expect((sec[1].a1 - sec[1].a0) / (Math.PI * 2)).toBeCloseTo(0.3)
  for (let k = 1; k < sec.length; k++) expect(sec[k].a0).toBeCloseTo(sec[k - 1].a1)
  expect(civAtAngle(sec, -Math.PI / 2 + 0.1)).toBe(1)
  expect(civAtAngle(sec, -Math.PI / 2 + Math.PI * 2 * 0.9)).toBe(3)
})

test('куски секторов складываются в ячейку и пропорциональны долям', () => {
  const lone: Pt[] = [{ x: 0, y: 0 }]
  const shares = [sh(1, 0.5), sh(2, 0.3), sh(3, 0.2)]
  const { pieces } = systemPieces(lone, 0, shares, 100)
  const cellArea = polyArea(zoneCell(lone, 0, 100))
  const byCiv = new Map<number, number>()
  for (const p of pieces) byCiv.set(p.civ, (byCiv.get(p.civ) ?? 0) + polyArea(p.poly))
  const total = [...byCiv.values()].reduce((a, b) => a + b, 0)
  expect(total).toBeCloseTo(cellArea, 3)
  expect(byCiv.get(1)! / total).toBeCloseTo(0.5, 1)
  expect(byCiv.get(2)! / total).toBeCloseTo(0.3, 1)
  expect(byCiv.get(3)! / total).toBeCloseTo(0.2, 1)
})

test('ничья система — без зоны', () => {
  expect(systemPieces(sites, 0, [], 50).pieces).toEqual([])
})

test('граница чёткая у разных владельцев и пропадает у одного', () => {
  const two: Pt[] = [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
  ]
  const build = (a: number, b: number) => {
    const A = systemPieces(two, 0, [sh(a, 1)], 60)
    const B = systemPieces(two, 1, [sh(b, 1)], 60)
    const secs = [A.sectors, B.sectors]
    const bright = (r: typeof A) => r.pieces.flatMap((p) => pieceEdges(two, secs, p)).filter((e) => e.bright).length
    return bright(A) + bright(B)
  }
  expect(build(1, 2)).toBeGreaterThan(0)
  expect(build(1, 1)).toBe(0)
})

test('облака: по пятну на державу, у общей системы смещены в стороны', () => {
  const one = cloudSpots({ x: 5, y: 5 }, [sh(1, 1)], 3, 100)
  expect(one).toHaveLength(1)
  expect(one[0].x).toBe(5)
  const two = cloudSpots({ x: 5, y: 5 }, [sh(1, 0.5), sh(2, 0.5)], 4, 100)
  expect(two).toHaveLength(2)
  expect(Math.hypot(two[0].x - two[1].x, two[0].y - two[1].y)).toBeGreaterThan(10)
})
