import type { Share } from './territory'

/** Чистая геометрия зон влияния на карте галактики (без Pixi). */

export interface Pt {
  x: number
  y: number
}

/** вершина многоугольника; tag — метка ребра от этой вершины к следующей:
 *  >= 0 — граница с соседней системой (её номер), ARC — внешняя дуга круга,
 *  RADIAL — край сектора между державами, SPLIT — служебный шов внутри одного сектора */
export interface Vert extends Pt {
  tag: number
}
export const ARC = -1
export const RADIAL = -2
export const SPLIT = -3

const CIRCLE_STEPS = 28
export const START_ANGLE = -Math.PI / 2
const FULL = Math.PI * 2

/** радиус зоны: доля расстояния до ближайшей соседней системы */
export function zoneRadius(sites: Pt[], i: number, k = 0.42): number {
  let best = Infinity
  for (let j = 0; j < sites.length; j++) {
    if (j === i) continue
    best = Math.min(best, Math.hypot(sites[j].x - sites[i].x, sites[j].y - sites[i].y))
  }
  return Number.isFinite(best) ? best * k : 200
}

/** отсечь выпуклый многоугольник полуплоскостью nx*x + ny*y <= c; новое ребро получает newTag */
export function clipHalfPlane(poly: Vert[], nx: number, ny: number, c: number, newTag: number): Vert[] {
  const out: Vert[] = []
  const n = poly.length
  for (let i = 0; i < n; i++) {
    const P = poly[i]
    const Q = poly[(i + 1) % n]
    const dp = nx * P.x + ny * P.y - c
    const dq = nx * Q.x + ny * Q.y - c
    const pin = dp <= 0
    const qin = dq <= 0
    if (pin) out.push({ x: P.x, y: P.y, tag: P.tag })
    if (pin !== qin) {
      const t = dp / (dp - dq)
      out.push({ x: P.x + (Q.x - P.x) * t, y: P.y + (Q.y - P.y) * t, tag: pin ? newTag : P.tag })
    }
  }
  return out
}

/** ячейка Вороного системы i, обрезанная кругом радиуса R */
export function zoneCell(sites: Pt[], i: number, R: number): Vert[] {
  const s = sites[i]
  let poly: Vert[] = []
  // описанный многоугольник: вписанный круг радиуса R лежит целиком внутри
  const Rc = R / Math.cos(Math.PI / CIRCLE_STEPS)
  for (let k = 0; k < CIRCLE_STEPS; k++) {
    const a = ((k + 0.5) / CIRCLE_STEPS) * FULL
    poly.push({ x: s.x + Math.cos(a) * Rc, y: s.y + Math.sin(a) * Rc, tag: ARC })
  }
  for (let j = 0; j < sites.length; j++) {
    if (j === i) continue
    const dx = sites[j].x - s.x
    const dy = sites[j].y - s.y
    const mx = (sites[j].x + s.x) / 2
    const my = (sites[j].y + s.y) / 2
    poly = clipHalfPlane(poly, dx, dy, dx * mx + dy * my, j)
    if (poly.length < 3) return []
  }
  return poly
}

export interface Sector {
  civ: number
  color: number
  a0: number
  a1: number
}

/** угловые сектора системы по долям; покрывают ровно 360° начиная с START_ANGLE */
export function sectorsOf(shares: Share[]): Sector[] {
  const out: Sector[] = []
  let a0 = START_ANGLE
  for (let k = 0; k < shares.length; k++) {
    const last = k === shares.length - 1
    const a1 = last ? START_ANGLE + FULL : a0 + shares[k].share * FULL
    out.push({ civ: shares[k].civ, color: shares[k].color, a0, a1 })
    a0 = a1
  }
  return out
}

/** держава, чей сектор покрывает направление угла a (или -1) */
export function civAtAngle(sectors: Sector[], a: number): number {
  if (!sectors.length) return -1
  let r = (a - START_ANGLE) % FULL
  if (r < 0) r += FULL
  r += START_ANGLE
  for (const s of sectors) if (r >= s.a0 && r < s.a1) return s.civ
  return sectors[sectors.length - 1].civ
}

/** части выпуклой ячейки внутри сектора [a0, a1] с центром в site (куски <= 90°, каждый выпуклый) */
export function clipSector(cell: Vert[], site: Pt, a0: number, a1: number): Vert[][] {
  const out: Vert[][] = []
  const span = a1 - a0
  const pieces = Math.max(1, Math.ceil(span / (Math.PI / 2) - 1e-9))
  for (let p = 0; p < pieces; p++) {
    const b0 = a0 + (span * p) / pieces
    const b1 = a0 + (span * (p + 1)) / pieces
    const s0 = Math.sin(b0)
    const c0 = Math.cos(b0)
    const s1 = Math.sin(b1)
    const c1 = Math.cos(b1)
    // точки левее луча b0 и правее луча b1
    let poly = clipHalfPlane(cell, s0, -c0, site.x * s0 - site.y * c0, p === 0 ? RADIAL : SPLIT)
    if (poly.length >= 3) poly = clipHalfPlane(poly, -s1, c1, -site.x * s1 + site.y * c1, p === pieces - 1 ? RADIAL : SPLIT)
    if (poly.length >= 3) out.push(poly)
  }
  return out
}

export function polyArea(poly: Pt[]): number {
  let a = 0
  for (let i = 0; i < poly.length; i++) {
    const P = poly[i]
    const Q = poly[(i + 1) % poly.length]
    a += P.x * Q.y - Q.x * P.y
  }
  return Math.abs(a) / 2
}

export interface ZonePiece {
  civ: number
  color: number
  poly: Vert[]
}

/** все куски зон одной системы; ничья система — пусто */
export function systemPieces(sites: Pt[], i: number, shares: Share[], R: number): { pieces: ZonePiece[]; sectors: Sector[] } {
  const sectors = sectorsOf(shares)
  if (!sectors.length) return { pieces: [], sectors }
  const cell = zoneCell(sites, i, R)
  if (cell.length < 3) return { pieces: [], sectors }
  const pieces: ZonePiece[] = []
  if (sectors.length === 1) {
    pieces.push({ civ: sectors[0].civ, color: sectors[0].color, poly: cell })
  } else {
    for (const s of sectors) for (const poly of clipSector(cell, sites[i], s.a0, s.a1)) pieces.push({ civ: s.civ, color: s.color, poly })
  }
  return { pieces, sectors }
}

export interface ZoneEdge {
  ax: number
  ay: number
  bx: number
  by: number
  /** true — чёткая светлая граница между разными владельцами; false — мягкий край зоны */
  bright: boolean
}

/** рёбра для рисования: между разными владельцами — чёткая граница, на краю зоны — мягкая; внутри одного владельца линий нет */
export function pieceEdges(sites: Pt[], sectorsBySys: Sector[][], piece: ZonePiece): ZoneEdge[] {
  const out: ZoneEdge[] = []
  const poly = piece.poly
  for (let k = 0; k < poly.length; k++) {
    const P = poly[k]
    const Q = poly[(k + 1) % poly.length]
    if (P.tag === SPLIT || Math.hypot(Q.x - P.x, Q.y - P.y) < 1e-6) continue
    let bright: boolean
    if (P.tag === ARC) bright = false
    else if (P.tag === RADIAL) bright = true
    else {
      const j = P.tag
      const other = civAtAngle(sectorsBySys[j], Math.atan2((P.y + Q.y) / 2 - sites[j].y, (P.x + Q.x) / 2 - sites[j].x))
      if (other === piece.civ) continue
      bright = other !== -1
    }
    out.push({ ax: P.x, ay: P.y, bx: Q.x, by: Q.y, bright })
  }
  return out
}

export interface Spot {
  x: number
  y: number
  /** радиус пятна в мировых единицах */
  r: number
  color: number
  alpha: number
}

/** пятна-облака (вариант b): по пятну на державу; смещены к центру своего сектора; размер от доли и числа планет */
export function cloudSpots(site: Pt, shares: Share[], planets: number, R: number): Spot[] {
  const out: Spot[] = []
  const sectors = sectorsOf(shares)
  const base = R * (0.75 + Math.min(0.4, planets * 0.05))
  for (let k = 0; k < shares.length; k++) {
    const sh = shares[k]
    const mid = (sectors[k].a0 + sectors[k].a1) / 2
    const off = shares.length > 1 ? R * 0.5 : 0
    out.push({
      x: site.x + Math.cos(mid) * off,
      y: site.y + Math.sin(mid) * off,
      r: base * (0.55 + 0.45 * Math.sqrt(sh.share)),
      color: sh.color,
      alpha: 0.6 + 0.3 * sh.share,
    })
  }
  return out
}
