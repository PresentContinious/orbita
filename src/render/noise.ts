// Детерминированный шум и генераторы для рендера (отдельно от src/sim: там свой Rng).

/** простой генератор с зерном, значения [0,1) */
export function seeded(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function hashString(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
  return h >>> 0
}

function lattice(seed: number, x: number, y: number, z: number): number {
  let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(z, 2147483647) ^ Math.imul(seed, 1274126177)
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}

const fade = (t: number) => t * t * (3 - 2 * t)

/** value noise в 3D, значения [0,1] */
export function noise3(seed: number, x: number, y: number, z: number): number {
  const xi = Math.floor(x)
  const yi = Math.floor(y)
  const zi = Math.floor(z)
  const fx = fade(x - xi)
  const fy = fade(y - yi)
  const fz = fade(z - zi)
  const l = (dx: number, dy: number, dz: number) => lattice(seed, xi + dx, yi + dy, zi + dz)
  const lx = (dy: number, dz: number) => l(0, dy, dz) * (1 - fx) + l(1, dy, dz) * fx
  const a = lx(0, 0) * (1 - fy) + lx(1, 0) * fy
  const b = lx(0, 1) * (1 - fy) + lx(1, 1) * fy
  return a * (1 - fz) + b * fz
}

/** фрактальный шум, значения ~[0,1] */
export function fbm3(seed: number, x: number, y: number, z: number, octaves = 4): number {
  let sum = 0
  let amp = 0.5
  let norm = 0
  let f = 1
  for (let i = 0; i < octaves; i++) {
    sum += amp * noise3(seed + i * 101, x * f, y * f, z * f)
    norm += amp
    amp *= 0.5
    f *= 2.03
  }
  return sum / norm
}

export interface Dust {
  /** угол и смещение от центра пояса (в долях половины ширины, −1..1) */
  a: number
  off: number
  size: number
  /** яркость 0..1 */
  light: number
}

/** каменная крошка пояса: плотнее к центру, разный размер и яркость */
export function beltDust(seed: number, count: number): Dust[] {
  const rnd = seeded(seed)
  const out: Dust[] = []
  for (let i = 0; i < count; i++) {
    const off = ((rnd() + rnd() + rnd()) / 3 - 0.5) * 2
    out.push({ a: rnd() * Math.PI * 2, off, size: 0.5 + rnd() * rnd() * 1.1, light: 0.25 + rnd() * 0.75 })
  }
  return out
}
