export type Vec = { x: number; y: number }

export const TAU = Math.PI * 2
export const ZERO: Readonly<Vec> = Object.freeze({ x: 0, y: 0 })

export const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v))
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t
export const dist = (a: Vec, b: Vec): number => Math.hypot(a.x - b.x, a.y - b.y)
