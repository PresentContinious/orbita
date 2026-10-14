import { BELT, SIM_DT } from './config'
import type { Vec } from './math'
import { makeAsteroid, planetPos, planetVel } from './system'
import type { Asteroid, StarSystem, World } from './types'

export const asteroidPos = (a: Asteroid, t: number): Vec => planetPos(a, t)
export const asteroidVel = (a: Asteroid, t: number): Vec => planetVel(a, t)

export function nearestAsteroid(sys: StarSystem, pos: Vec, t: number): Asteroid | undefined {
  let best: Asteroid | undefined
  let bd = Infinity
  for (const a of sys.asteroids) {
    if (a.ore <= 0) continue
    const p = asteroidPos(a, t)
    const d = Math.hypot(p.x - pos.x, p.y - pos.y)
    if (d < bd) {
      bd = d
      best = a
    }
  }
  return best
}

/** выработанные пояса медленно зарастают до исходного числа астероидов */
export function stepAsteroids(w: World): void {
  for (const sys of w.galaxy.systems) {
    if (sys.asteroids.length >= sys.asteroidTarget || sys.belts.length === 0) continue
    sys.regrowT += SIM_DT
    if (sys.regrowT + 1e-9 < BELT.regrowEvery) continue
    sys.regrowT = 0
    const bi = w.rng.int(0, sys.belts.length - 1)
    sys.asteroids.push(makeAsteroid(w.rng, sys.nextAsteroid++, bi, sys.belts[bi]))
  }
}
