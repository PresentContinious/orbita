import type { Planet } from '../sim/types'
import { Rectangle, Texture } from 'pixi.js'
import type { PlanetStyle } from '../app/display'
import { planetBiome, type Biome } from './biome'
import { fbm3, hashString, seeded } from './noise'

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  return [c, c.getContext('2d')!]
}

/** белое радиальное свечение — красится через tint */
export function glowTexture(size = 128): Texture {
  const [c, ctx] = canvas(size, size)
  const r = size / 2
  const g = ctx.createRadialGradient(r, r, 0, r, r, r)
  g.addColorStop(0, 'rgba(255,255,255,1)')
  g.addColorStop(0.22, 'rgba(255,255,255,0.55)')
  g.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, size, size)
  return Texture.from(c)
}

const TAU = Math.PI * 2
export const PLANET_TEX = 320
/** радиус диска планеты на текстуре, px */
export const PLANET_DISC = 72

/** calm — приглушённый «реалистичный», contrast — контрастный «кинематографичный» */
export type PlanetVariant = PlanetStyle

type RGB = [number, number, number]

const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]
const clamp01 = (x: number) => Math.min(1, Math.max(0, x))
const smooth = (a: number, b: number, x: number) => {
  const t = clamp01((x - a) / (b - a))
  return t * t * (3 - 2 * t)
}

/** палитра под вариант: a — серее, b — насыщеннее */
function tune(c: RGB, v: PlanetVariant): RGB {
  const l = c[0] * 0.3 + c[1] * 0.59 + c[2] * 0.11
  const k = v === 'calm' ? 0.8 : 1.12
  return [l + (c[0] - l) * k, l + (c[1] - l) * k, l + (c[2] - l) * k]
}

interface Crater {
  x: number
  y: number
  z: number
  r: number
}

function craters(rnd: () => number, n: number, rMin: number, rMax: number): Crater[] {
  const out: Crater[] = []
  for (let i = 0; i < n; i++) {
    const z = rnd() * 2 - 1
    const a = rnd() * TAU
    const s = Math.sqrt(1 - z * z)
    out.push({ x: s * Math.cos(a), y: s * Math.sin(a), z, r: rMin + rnd() * rnd() * (rMax - rMin) })
  }
  return out
}

/** вклад кратеров: <0 — тёмное дно, >0 — светлый вал */
function craterTerm(cs: Crater[], x: number, y: number, z: number): number {
  let v = 0
  for (const c of cs) {
    const d = Math.acos(Math.min(1, x * c.x + y * c.y + z * c.z)) / c.r
    if (d < 1) v -= 0.5 * (1 - d * d) * 0.9
    else if (d < 1.25) v += 0.35 * (1 - (d - 1) / 0.25)
  }
  return v
}

function ring(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, a0: number, a1: number): void {
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(-0.18)
  ctx.scale(1, 0.32)
  ctx.strokeStyle = 'rgba(205,178,124,0.6)'
  ctx.lineWidth = r * 0.42
  ctx.beginPath()
  ctx.arc(0, 0, r * 1.8, a0, a1)
  ctx.stroke()
  ctx.restore()
}

// направление на звезду (освещённая сторона слева, чуть к зрителю)
const LX = -0.8
const LY = -0.1
const LZ = 0.59

interface Spec {
  /** светлый, средний, тёмный */
  pal: [RGB, RGB, RGB]
  /** цвет каймы атмосферы; null — без атмосферы */
  glow: RGB | null
}

const SPEC: Record<Biome, Spec> = {
  land: { pal: [[132, 118, 84], [74, 118, 58], [88, 78, 60]], glow: [120, 170, 255] },
  ocean: { pal: [[196, 184, 140], [70, 120, 70], [60, 110, 160]], glow: [110, 170, 255] },
  jungle: { pal: [[110, 150, 70], [40, 100, 44], [20, 56, 36]], glow: [140, 220, 140] },
  desert: { pal: [[226, 192, 128], [190, 138, 80], [128, 86, 54]], glow: [255, 200, 140] },
  lava: { pal: [[96, 72, 64], [52, 40, 38], [26, 20, 20]], glow: [255, 130, 70] },
  toxic: { pal: [[214, 208, 110], [150, 160, 60], [98, 112, 48]], glow: [210, 230, 90] },
  tundra: { pal: [[220, 226, 230], [158, 168, 176], [96, 106, 120]], glow: [190, 215, 245] },
  rock: { pal: [[156, 150, 142], [112, 108, 104], [62, 60, 58]], glow: null },
  'gas-amber': { pal: [[236, 212, 170], [200, 140, 86], [126, 82, 60]], glow: [255, 210, 150] },
  'gas-ice': { pal: [[200, 224, 240], [116, 160, 205], [62, 90, 134]], glow: [160, 210, 255] },
  'gas-toxic': { pal: [[200, 208, 150], [134, 156, 92], [78, 98, 64]], glow: [200, 230, 130] },
  'gas-violet': { pal: [[208, 198, 218], [144, 130, 172], [86, 76, 108]], glow: [200, 180, 240] },
  ice: { pal: [[238, 245, 251], [176, 206, 230], [104, 144, 190]], glow: [190, 225, 255] },
  'ice-spots': { pal: [[232, 238, 244], [168, 190, 214], [66, 78, 100]], glow: [190, 215, 245] },
  'dwarf-grey': { pal: [[150, 148, 144], [106, 104, 102], [56, 55, 54]], glow: null },
  'dwarf-brown': { pal: [[158, 132, 106], [110, 90, 72], [62, 49, 40]], glow: null },
}

const isGas = (b: Biome) => b.startsWith('gas-')

/** планета с деталями поверхности; освещённая сторона — слева, спрайт поворачивают к звезде */
export function planetTexture(p: Planet, variant: PlanetVariant = 'calm'): Texture {
  const [c, ctx] = canvas(PLANET_TEX, PLANET_TEX)
  const x0 = PLANET_TEX / 2
  const R = PLANET_DISC
  const seed = hashString(p.id)
  const rnd = seeded(seed)
  const biome = planetBiome(p)
  const spec = SPEC[biome]
  const pal = spec.pal.map((col) => tune(col, variant)) as [RGB, RGB, RGB]
  const atmo = spec.glow !== null
  const glow: RGB = spec.glow ?? [0, 0, 0]
  const night = variant === 'calm' ? 0.16 : 0.05
  const rimK = variant === 'calm' ? 0.35 : 0.95
  const cs =
    biome === 'dwarf-grey' || biome === 'dwarf-brown'
      ? craters(rnd, 70, 0.07, 0.3)
      : biome === 'rock'
        ? craters(rnd, 55, 0.06, 0.28)
        : biome === 'ice' || biome === 'ice-spots'
          ? craters(rnd, 12, 0.06, 0.2)
          : biome === 'tundra'
            ? craters(rnd, 8, 0.05, 0.16)
            : []
  const sea = tune([22, 52, 112], variant)
  const deep = tune([12, 34, 86], variant)
  const off = rnd() * 50
  const emitK = variant === 'calm' ? 0.85 : 1

  if (p.look.rings) ring(ctx, x0, x0, R, Math.PI, TAU)

  const [pc, pctx] = canvas(PLANET_TEX, PLANET_TEX)
  const img = pctx.createImageData(PLANET_TEX, PLANET_TEX)
  const px = img.data
  const pad = 5
  for (let j = 0; j < PLANET_TEX; j++) {
    for (let i = 0; i < PLANET_TEX; i++) {
      const dx = (i + 0.5 - x0) / R
      const dy = (j + 0.5 - x0) / R
      const d2 = dx * dx + dy * dy
      const d = Math.sqrt(d2)
      if (d > 1 + pad / R) continue
      const nz2 = 1 - d2
      const ndl0 = LX * dx + LY * dy + LZ * Math.sqrt(Math.max(0, nz2))
      const o = (j * PLANET_TEX + i) * 4
      if (d > 1) {
        // тонкий ободок атмосферы за краем диска, только на освещённой стороне
        if (!atmo) continue
        const e = 1 - ((d - 1) * R) / pad
        const lit = smooth(-0.35, 0.3, LX * dx + LY * dy)
        const a = e * e * 0.55 * lit
        px[o] = glow[0]
        px[o + 1] = glow[1]
        px[o + 2] = glow[2]
        px[o + 3] = a * 255
        continue
      }
      const nx = dx
      const ny = dy
      const nz = Math.sqrt(nz2)
      let col: RGB
      let emit = 0 // самосвечение (лава), не гасится ночью
      const cap = (lo: number, hi: number, f: number) => smooth(lo, hi, Math.abs(ny) + (f - 0.5) * 0.2)
      if (isGas(biome)) {
        const warp = fbm3(seed, nx * 2.2 + off, ny * 3, nz * 2.2, 4)
        const turb = fbm3(seed + 9, nx * 5, ny * 14, nz * 5, 3)
        const v = ny * 6.5 + (warp - 0.5) * 3.4 + (turb - 0.5) * 0.8
        const band = 0.5 + 0.5 * Math.sin(v * 2.2)
        col = mix(mix(pal[2], pal[1], smooth(0.1, 0.55, band)), pal[0], smooth(0.55, 0.95, band) * 0.9)
        col = mix(col, pal[2], clamp01((turb - 0.55) * 1.6) * 0.5)
      } else if (biome === 'land') {
        const e = fbm3(seed, nx * 2.1 + off, ny * 2.1, nz * 2.1, 5)
        if (e < 0.5) {
          col = mix(deep, sea, smooth(0.25, 0.5, e))
          col = mix(col, [70, 140, 160], smooth(0.44, 0.5, e) * 0.5)
        } else {
          const h = smooth(0.5, 0.72, e)
          col = mix(pal[1], pal[0], h)
          col = mix(col, pal[2], fbm3(seed + 3, nx * 7, ny * 7, nz * 7, 3) * 0.4)
          col = mix(col, [236, 238, 240], smooth(0.68, 0.8, e) * 0.5)
        }
        col = mix(col, [236, 240, 245], cap(0.86, 0.95, fbm3(seed + 5, nx * 4, ny * 4, nz * 4, 3)) * 0.9)
      } else if (biome === 'ocean') {
        const e = fbm3(seed, nx * 2.4 + off, ny * 2.4, nz * 2.4, 5)
        const swell = fbm3(seed + 2, nx * 6, ny * 6, nz * 6, 3)
        col = mix(deep, sea, smooth(0.2, 0.62, e))
        col = mix(col, [60, 130, 180], smooth(0.5, 0.62, e) * 0.7 + swell * 0.12)
        if (e > 0.64) col = mix(col, mix(pal[1], pal[0], smooth(0.64, 0.74, e)), smooth(0.64, 0.68, e))
        const cloud = smooth(0.58, 0.8, fbm3(seed + 6, nx * 3 + off, ny * 5, nz * 3, 4))
        col = mix(col, [238, 242, 247], cloud * 0.4)
        col = mix(col, [236, 240, 245], cap(0.88, 0.96, swell) * 0.9)
      } else if (biome === 'jungle') {
        const e = fbm3(seed, nx * 2.6 + off, ny * 2.6, nz * 2.6, 5)
        const leaf = fbm3(seed + 3, nx * 9, ny * 9, nz * 9, 3)
        col = mix(pal[2], pal[1], smooth(0.25, 0.6, e))
        col = mix(col, pal[0], smooth(0.55, 0.8, leaf) * 0.55)
        if (e < 0.36) col = mix(col, [34, 84, 120], smooth(0.36, 0.28, e) * 0.85)
        col = mix(col, [226, 234, 238], cap(0.93, 0.99, leaf) * 0.7)
      } else if (biome === 'desert') {
        const warp = fbm3(seed, nx * 2 + off, ny * 2, nz * 2, 4)
        const dune = 0.5 + 0.5 * Math.sin((nx * 7 + ny * 4 + warp * 9) * 1.5 + off)
        const grain = fbm3(seed + 4, nx * 10, ny * 10, nz * 10, 3)
        col = mix(pal[1], pal[0], smooth(0.25, 0.75, warp))
        col = mix(col, pal[2], smooth(0.5, 0.95, dune) * 0.35 + clamp01((grain - 0.55) * 1.4) * 0.3)
        const mesa = smooth(0.68, 0.76, fbm3(seed + 8, nx * 3, ny * 3, nz * 3, 4))
        col = mix(col, pal[2], mesa * 0.5)
      } else if (biome === 'lava') {
        const f = fbm3(seed, nx * 3 + off, ny * 3, nz * 3, 5)
        col = mix(pal[1], pal[0], smooth(0.35, 0.7, f))
        col = mix(col, pal[2], smooth(0.5, 0.2, f) * 0.6)
        const ridge = Math.abs(fbm3(seed + 11, nx * 3.2 + off, ny * 3.2, nz * 3.2, 4) - 0.5)
        const crack = 1 - smooth(0, 0.035, ridge)
        const pool = smooth(0.62, 0.74, fbm3(seed + 13, nx * 2.2, ny * 2.2, nz * 2.2, 3))
        emit = clamp01(crack * 0.95 + pool * 0.8)
        col = mix(col, [255, 120, 30], emit)
      } else if (biome === 'toxic') {
        const w1 = fbm3(seed, nx * 2 + off, ny * 2.4, nz * 2, 4)
        const w2 = fbm3(seed + 5, nx * 3 + w1 * 2.2, ny * 4 + w1, nz * 3 + off, 5)
        col = mix(pal[2], pal[1], smooth(0.3, 0.6, w2))
        col = mix(col, pal[0], smooth(0.55, 0.8, w2) * 0.8)
        col = mix(col, [120, 80, 40], smooth(0.18, 0.1, w2) * 0.5)
      } else if (biome === 'tundra') {
        const f = fbm3(seed, nx * 3 + off, ny * 3, nz * 3, 5)
        col = mix(pal[1], pal[0], smooth(0.3, 0.7, f))
        const ridge = Math.abs(fbm3(seed + 11, nx * 4 + off, ny * 4, nz * 4, 4) - 0.5)
        col = mix(col, pal[2], (1 - smooth(0, 0.03, ridge)) * 0.7)
        col = mix(col, [244, 247, 250], cap(0.7, 0.88, f) * 0.9)
      } else if (biome === 'ice' || biome === 'ice-spots') {
        const f = fbm3(seed, nx * 3 + off, ny * 3, nz * 3, 4)
        col = mix(pal[1], pal[0], smooth(0.3, 0.7, f))
        const ridge = Math.abs(fbm3(seed + 11, nx * 4.5, ny * 4.5, nz * 4.5, 3) - 0.5)
        col = mix(col, pal[2], (1 - smooth(0, 0.025, ridge)) * 0.75)
        if (biome === 'ice-spots') col = mix(col, pal[2], smooth(0.6, 0.7, fbm3(seed + 17, nx * 2.5, ny * 2.5, nz * 2.5, 3)) * 0.8)
        col = mix(col, [240, 246, 252], cap(0.78, 0.9, f))
      } else {
        // голая скала и карлики
        const f = fbm3(seed, nx * 3 + off, ny * 3, nz * 3, 5)
        col = mix(pal[1], pal[0], smooth(0.35, 0.7, f))
        col = mix(col, pal[2], smooth(0.5, 0.2, f) * 0.45)
      }
      if (cs.length) {
        const k = craterTerm(cs, nx, ny, nz)
        col = k < 0 ? mix(col, pal[2], Math.min(0.7, -k)) : mix(col, pal[0], Math.min(0.5, k))
      }
      // резкая граница дня и ночи + мягкое падение яркости к терминатору
      const day = smooth(-0.02, 0.05, ndl0)
      const shade = night + (1 - night) * day * (0.62 + 0.38 * clamp01(ndl0 * 1.3))
      let r = col[0] * shade
      let g = col[1] * shade
      let b = col[2] * shade
      if (emit > 0) {
        const k = emit * emitK
        r = Math.max(r, 255 * k)
        g = Math.max(g, 110 * k)
        b = Math.max(b, 25 * k)
      }
      if (atmo) {
        // подсветка с края на освещённой стороне (rim light)
        const rim = Math.pow(1 - nz, 3) * rimK * day
        r += glow[0] * rim
        g += glow[1] * rim
        b += glow[2] * rim
      }
      const cov = clamp01((1 - d) * R + 0.5)
      px[o] = Math.min(255, r)
      px[o + 1] = Math.min(255, g)
      px[o + 2] = Math.min(255, b)
      px[o + 3] = cov * 255
    }
  }
  pctx.putImageData(img, 0, 0)
  ctx.drawImage(pc, 0, 0)
  if (p.look.rings) ring(ctx, x0, x0, R, 0, Math.PI)
  return Texture.from(c)
}

export type IconKind = 'colony' | 'caravan' | 'miner' | 'dot'
export type Atlas = Record<IconKind, Texture>
export const ICON_CELL = 32
/** длина корпуса значка внутри клетки, px — по ней считается масштаб */
export const ICON_BODY = 24

/** белые силуэты кораблей в одной текстуре — для пакетной отрисовки и перекраски tint */
export function shipAtlas(): Atlas {
  const S = ICON_CELL
  const [c, ctx] = canvas(S * 4, S)
  ctx.fillStyle = '#fff'
  // караван — вытянутый грузовой корпус
  ctx.beginPath()
  ctx.roundRect(4, 11, 24, 10, 3)
  ctx.fill()
  // колонисты — ромб
  ctx.beginPath()
  ctx.moveTo(S + 28, 16)
  ctx.lineTo(S + 16, 7)
  ctx.lineTo(S + 4, 16)
  ctx.lineTo(S + 16, 25)
  ctx.closePath()
  ctx.fill()
  // шахтёр — треугольник носом вперёд
  ctx.beginPath()
  ctx.moveTo(2 * S + 28, 16)
  ctx.lineTo(2 * S + 4, 6)
  ctx.lineTo(2 * S + 4, 26)
  ctx.closePath()
  ctx.fill()
  // точка — корабль в коридоре на общем плане
  ctx.beginPath()
  ctx.arc(3 * S + 16, 16, 10, 0, TAU)
  ctx.fill()
  const base = Texture.from(c)
  const frame = (i: number) => new Texture({ source: base.source, frame: new Rectangle(i * S, 0, S, S) })
  return { caravan: frame(0), colony: frame(1), miner: frame(2), dot: frame(3) }
}
