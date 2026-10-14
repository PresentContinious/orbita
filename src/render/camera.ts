import { clamp, lerp, type Vec } from '../sim/math'
import type { Galaxy } from '../sim/types'

export interface View {
  width: number
  height: number
}

export interface Bounds {
  minX: number
  minY: number
  maxX: number
  maxY: number
}

export interface CamTarget {
  x: number
  y: number
  zoom: number
}

export interface Fly {
  from: CamTarget
  to: CamTarget
  start: number
  duration: number
}

export interface Camera {
  x: number
  y: number
  zoom: number
  vx: number
  vy: number
  fly: Fly | null
  /** id планеты, за которой камера следует */
  follow: string | null
}

export const ZOOM_MAX = 3
export const LOD = { approach: 180, system: 700, band: 0.2 }
export type Lod = 'galaxy' | 'approach' | 'system'
export interface LodInfo {
  level: Lod
  approachAlpha: number
  systemAlpha: number
}

export function createCamera(): Camera {
  return { x: 0, y: 0, zoom: 0.02, vx: 0, vy: 0, fly: null, follow: null }
}

export function worldToScreen(cam: Camera, view: View, p: Vec): Vec {
  return { x: (p.x - cam.x) * cam.zoom + view.width / 2, y: (p.y - cam.y) * cam.zoom + view.height / 2 }
}

export function screenToWorld(cam: Camera, view: View, s: Vec): Vec {
  return { x: (s.x - view.width / 2) / cam.zoom + cam.x, y: (s.y - view.height / 2) / cam.zoom + cam.y }
}

export function galaxyBounds(g: Galaxy): Bounds {
  const b = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity }
  for (const s of g.systems) {
    b.minX = Math.min(b.minX, s.pos.x - s.radius)
    b.minY = Math.min(b.minY, s.pos.y - s.radius)
    b.maxX = Math.max(b.maxX, s.pos.x + s.radius)
    b.maxY = Math.max(b.maxY, s.pos.y + s.radius)
  }
  return b
}

export function fitZoom(view: View, b: Bounds, pad = 1.15): number {
  return Math.min(view.width / ((b.maxX - b.minX) * pad), view.height / ((b.maxY - b.minY) * pad))
}

/** зум «вся галактика»: влезает в экран и держит уровень «галактика» у самой большой системы */
export function galaxyZoom(view: View, g: Galaxy): number {
  const maxR = Math.max(...g.systems.map((s) => s.radius))
  return Math.min(fitZoom(view, galaxyBounds(g)), (LOD.approach * (1 - LOD.band)) / maxR)
}

/** зум колесом: точка мира под курсором остаётся под курсором */
export function zoomAt(cam: Camera, view: View, screen: Vec, factor: number, minZoom: number): void {
  const before = screenToWorld(cam, view, screen)
  cam.zoom = clamp(cam.zoom * factor, minZoom, ZOOM_MAX)
  const after = screenToWorld(cam, view, screen)
  cam.x += before.x - after.x
  cam.y += before.y - after.y
}

export function flyDuration(z0: number, z1: number): number {
  return clamp(0.6 + 0.2 * Math.abs(Math.log2(z1 / z0)), 0.6, 1.4)
}

export function startFly(cam: Camera, to: CamTarget, now: number): void {
  cam.fly = { from: { x: cam.x, y: cam.y, zoom: cam.zoom }, to, start: now, duration: flyDuration(cam.zoom, to.zoom) }
  cam.vx = 0
  cam.vy = 0
}

const easeInOutCubic = (u: number): number => (u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2)

export function updateCamera(cam: Camera, now: number, dt: number): void {
  if (cam.fly) {
    const f = cam.fly
    const u = clamp((now - f.start) / f.duration, 0, 1)
    const e = easeInOutCubic(u)
    cam.x = lerp(f.from.x, f.to.x, e)
    cam.y = lerp(f.from.y, f.to.y, e)
    cam.zoom = f.from.zoom * Math.pow(f.to.zoom / f.from.zoom, e)
    if (u >= 1) {
      cam.x = f.to.x
      cam.y = f.to.y
      cam.zoom = f.to.zoom
      cam.fly = null
    }
    return
  }
  cam.x += cam.vx * dt
  cam.y += cam.vy * dt
  const k = Math.exp(-dt * 5)
  cam.vx *= k
  cam.vy *= k
}

/** уровень детализации по экранному радиусу системы; альфы плавно переходят в полосе ±20% от порога */
export function lodOf(systemRadius: number, zoom: number): LodInfo {
  const r = systemRadius * zoom
  const ramp = (edge: number) => clamp((r - edge * (1 - LOD.band)) / (2 * edge * LOD.band), 0, 1)
  return {
    level: r < LOD.approach ? 'galaxy' : r < LOD.system ? 'approach' : 'system',
    approachAlpha: ramp(LOD.approach),
    systemAlpha: ramp(LOD.system),
  }
}
