import type { Planet } from '../sim/types'
import { Texture } from 'pixi.js'

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
export const PLANET_TEX = 160
/** радиус диска планеты на текстуре, px */
export const PLANET_DISC = 36

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

/** планета по палитре из симуляции; освещённая сторона — слева, спрайт поворачивают к звезде */
export function planetTexture(p: Planet): Texture {
  const [c, ctx] = canvas(PLANET_TEX, PLANET_TEX)
  const x = PLANET_TEX / 2
  const y = PLANET_TEX / 2
  const r = PLANET_DISC
  let g = ctx.createRadialGradient(x, y, r * 0.6, x, y, r * 1.55)
  g.addColorStop(0, p.look.glow)
  g.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.arc(x, y, r * 1.55, 0, TAU)
  ctx.fill()
  if (p.look.rings) ring(ctx, x, y, r, Math.PI, TAU)
  g = ctx.createRadialGradient(x - r * 0.5, y, r * 0.12, x, y, r * 1.04)
  g.addColorStop(0, p.look.colors[0])
  g.addColorStop(0.55, p.look.colors[1])
  g.addColorStop(1, p.look.colors[2])
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.arc(x, y, r, 0, TAU)
  ctx.fill()
  if (p.look.banded) {
    ctx.save()
    ctx.beginPath()
    ctx.arc(x, y, r, 0, TAU)
    ctx.clip()
    ctx.globalAlpha = 0.16
    ctx.fillStyle = p.look.colors[2]
    for (let i = 0; i < 4; i++) {
      const by = y - r + ((i + 0.5) * 2 * r) / 4
      ctx.fillRect(x - r, by - r * 0.08, r * 2, r * 0.18)
    }
    ctx.restore()
  }
  // ночная сторона
  g = ctx.createLinearGradient(x - r, y, x + r, y)
  g.addColorStop(0.45, 'rgba(0,0,0,0)')
  g.addColorStop(1, 'rgba(0,0,8,0.6)')
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.arc(x, y, r, 0, TAU)
  ctx.fill()
  if (p.look.rings) ring(ctx, x, y, r, 0, Math.PI)
  return Texture.from(c)
}
