// Генератор случайных чисел с зерном (mulberry32): одно зерно — одна и та же история.
// Внутри симуляции Math.random() запрещён — только Rng.

export interface Rng {
  /** [0, 1) */
  next(): number
  /** [a, b) */
  float(a: number, b: number): number
  /** целое в [a, b] включительно */
  int(a: number, b: number): number
  chance(p: number): boolean
  pick<T>(items: readonly T[]): T
  /** перемешивает массив на месте и возвращает его */
  shuffle<T>(items: T[]): T[]
  /** независимый поток: зависит только от исходного зерна и метки */
  fork(label: string): Rng
}

export function hashString(s: string): number {
  let h = 2166136261 >>> 0
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619) >>> 0
  }
  return h
}

export function createRng(seed: number): Rng {
  const origin = seed >>> 0
  let a = origin
  const next = (): number => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  return {
    next,
    float: (lo, hi) => lo + next() * (hi - lo),
    int: (lo, hi) => lo + Math.floor(next() * (hi - lo + 1)),
    chance: (p) => next() < p,
    pick: (items) => {
      if (items.length === 0) throw new Error('pick: пустой список')
      return items[Math.floor(next() * items.length)]
    },
    shuffle: (items) => {
      for (let i = items.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1))
        const tmp = items[i]
        items[i] = items[j]
        items[j] = tmp
      }
      return items
    },
    fork: (label) => createRng((origin ^ hashString(label)) >>> 0),
  }
}
