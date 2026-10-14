import type { Planet } from '../sim/types'
import { Rectangle, Texture } from 'pixi.js'
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

/** a — приглушённый «реалистичный», b — контрастный «кинематографичный» */
export type PlanetVariant = 'a' | 'b'
export function planetVariant(search: string): PlanetVariant {
  return new URLSearchParams(search).get('planets') === 'b' ? 'b' : 'a'
}

type RGB = [number, number, number]

function parseColor(css: string): RGB {
  const [c, ctx] = canvas(1, 1)
  ctx.fillStyle = css
  ctx.fillRect(0, 0, 1, 1)
  void c
  const d = ctx.getImageData(0, 0, 1, 1).data
  return [d[0], d[1], d[2]]
}

const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]
const clamp01 = (x: number) => Math.min(1, Math.max(0, x))
const smooth = (a: number, b: number, x: number) => {
  const t = clamp01((x - a) / (b - a))
  return t * t * (3 - 2 * t)
}

/** палитра под вариант: a — серее, b — насыщеннее */
function tune(c: RGB, v: PlanetVariant): RGB {
  const l = c[0] * 0.3 + c[1] * 0.59 + c[2] * 0.11
  const k = v === 'a' ? 0.7 : 1.12
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

/** планета с деталями поверхности; освещённая сторона — слева, спрайт поворачивают к звезде */
export function planetTexture(p: Planet, variant: PlanetVariant = 'a'): Texture {
  const [c, ctx] = canvas(PLANET_TEX, PLANET_TEX)
  const x0 = PLANET_TEX / 2
  const R = PLANET_DISC
  const seed = hashString(p.id)
  const rnd = seeded(seed)
  const pal = p.look.colors.map((s) => tune(parseColor(s), variant)) as [RGB, RGB, RGB]
  const glow = parseColor(p.look.glow)
  const night = variant === 'a' ? 0.16 : 0.05
  const rimK = variant === 'a' ? 0.35 : 0.95
  const atmo = p.kind !== 'dwarf'
  const cs = p.kind === 'dwarf' ? craters(rnd, 70, 0.07, 0.3) : p.kind === 'rocky' && p.habitability < 0.4 ? craters(rnd, 40, 0.06, 0.25) : p.kind === 'ice' ? craters(rnd, 12, 0.06, 0.2) : []
  const sea = mix(pal[2], [20, 50, 110], 0.55)
  const hasSea = p.kind === 'rocky' && p.habitability >= 0.4
  const off = rnd() * 50

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
        const e = 1 - (d - 1) * R / pad
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
      if (p.kind === 'gas') {
        const warp = fbm3(seed, nx * 2.2 + off, ny * 3, nz * 2.2, 4)
        const turb = fbm3(seed + 9, nx * 5, ny * 14, nz * 5, 3)
        const v = ny * 6.5 + (warp - 0.5) * 3.4 + (turb - 0.5) * 0.8
        const band = 0.5 + 0.5 * Math.sin(v * 2.2)
        col = mix(mix(pal[2], pal[1], smooth(0.1, 0.55, band)), pal[0], smooth(0.55, 0.95, band) * 0.9)
        col = mix(col, pal[2], clamp01((turb - 0.55) * 1.6) * 0.5)
      } else if (hasSea) {
        const e = fbm3(seed, nx * 2.1 + off, ny * 2.1, nz * 2.1, 5)
        if (e < 0.5) {
          col = mix(sea, mix(sea, pal[1], 0.5), smooth(0.4, 0.5, e))
        } else {
          const h = smooth(0.5, 0.72, e)
          col = mix(mix(pal[1], pal[0], 0.35), pal[0], h)
          col = mix(col, pal[2], fbm3(seed + 3, nx * 7, ny * 7, nz * 7, 3) * 0.35)
        }
        const cap = smooth(0.86, 0.95, Math.abs(ny) + (fbm3(seed + 5, nx * 4, ny * 4, nz * 4, 3) - 0.5) * 0.15)
        col = mix(col, [236, 240, 245], cap * 0.9)
      } else if (p.kind === 'ice') {
        const f = fbm3(seed, nx * 3 + off, ny * 3, nz * 3, 4)
        col = mix(pal[1], pal[0], smooth(0.3, 0.7, f))
        const ridge = Math.abs(fbm3(seed + 11, nx * 4.5, ny * 4.5, nz * 4.5, 3) - 0.5)
        col = mix(col, pal[2], (1 - smooth(0, 0.025, ridge)) * 0.75)
        const cap = smooth(0.78, 0.9, Math.abs(ny) + (f - 0.5) * 0.2)
        col = mix(col, [240, 246, 252], cap)
      } else {
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
