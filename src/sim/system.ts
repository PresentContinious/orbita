import { BELT, HZ, ORBIT, PLANET_KINDS, ROLE_GEN, STAR_TYPES, type PlanetKind } from './config'
import { TAU } from './math'
import { uniqueName } from './names'
import type { Rng } from './rng'
import type { Asteroid, Belt, Planet, PlanetLook, StarSystem, SystemRole, Vec, Zone } from './types'

export type Orbiting = { orbit: number; period: number; phase: number }

export function periodOf(orbit: number): number {
  return ORBIT.periodBase * Math.pow(orbit / ORBIT.periodRef, 1.5)
}

export function zoneOf(orbit: number, lum: number): Zone {
  const s = Math.sqrt(lum)
  if (orbit < HZ.inner * s) return 'hot'
  if (orbit > HZ.outer * s) return 'cold'
  return 'temperate'
}

export function tempKOf(orbit: number, lum: number): number {
  return Math.max(3, 288 * Math.sqrt((HZ.tempRef * Math.sqrt(lum)) / orbit))
}

export function planetPos(o: Orbiting, t: number): Vec {
  const a = o.phase + (TAU * t) / o.period
  return { x: Math.cos(a) * o.orbit, y: Math.sin(a) * o.orbit }
}

export function planetVel(o: Orbiting, t: number): Vec {
  const w = TAU / o.period
  const a = o.phase + w * t
  return { x: -Math.sin(a) * o.orbit * w, y: Math.cos(a) * o.orbit * w }
}

function pickWeighted(rng: Rng, weights: Partial<Record<PlanetKind, number>>): PlanetKind {
  const entries = Object.entries(weights) as [PlanetKind, number][]
  let r = rng.next() * entries.reduce((s, [, w]) => s + w, 0)
  for (const [k, w] of entries) {
    r -= w
    if (r < 0) return k
  }
  return entries[entries.length - 1][0]
}

function hsl(h: number, s: number, l: number): string {
  return `hsl(${Math.round(h)}, ${Math.round(s)}%, ${Math.round(l)}%)`
}

/** палитра планеты — перенесена из старой ОРБИТЫ */
export function makeLook(rng: Rng, kind: PlanetKind): PlanetLook {
  if (kind === 'rocky') {
    const h = rng.chance(0.5) ? rng.float(10, 50) : rng.float(180, 260)
    const s = rng.float(18, 55)
    return { colors: [hsl(h, s, 78), hsl(h, s + 8, 48), hsl(h, s, 20)], glow: `hsla(${Math.round(h)}, 70%, 65%, 0.55)`, banded: false, rings: false }
  }
  if (kind === 'ice') {
    const h = rng.float(165, 230)
    return { colors: [hsl(h, 65, 85), hsl(h, 55, 55), hsl(h, 60, 22)], glow: `hsla(${Math.round(h)}, 75%, 65%, 0.5)`, banded: rng.chance(0.3), rings: false }
  }
  if (kind === 'gas') {
    const h = rng.chance(0.7) ? rng.float(20, 55) : rng.float(260, 320)
    return { colors: [hsl(h, 55, 82), hsl(h, 50, 55), hsl(h, 55, 24)], glow: `hsla(${Math.round(h)}, 65%, 62%, 0.5)`, banded: true, rings: rng.chance(0.4) }
  }
  const h = rng.float(20, 40)
  return { colors: [hsl(h, 10, 62), hsl(h, 12, 38), hsl(h, 10, 16)], glow: 'hsla(35, 20%, 60%, 0.35)', banded: false, rings: false }
}

export function habitableCount(sys: StarSystem): number {
  return sys.planets.filter((p) => p.habitability >= 1).length
}

export function makeAsteroid(rng: Rng, id: number, belt: number, b: Belt): Asteroid {
  const orbit = b.orbit + rng.float(-b.width / 2, b.width / 2)
  return {
    id,
    belt,
    orbit,
    period: periodOf(orbit),
    phase: rng.float(0, TAU),
    ore: rng.float(BELT.oreMin, BELT.oreMax),
    size: rng.float(BELT.sizeMin, BELT.sizeMax),
  }
}

/** обитаемой системе нужно пригодных планет (≥ 1.0) на всех цивилизаций и ещё одну — иначе перегенерируем */
export function generateSystem(rng: Rng, id: number, role: SystemRole, civSlots: number, pos: Vec, usedNames: Set<string>): StarSystem {
  for (let attempt = 0; attempt < 50; attempt++) {
    const sys = buildSystem(rng, id, role, civSlots, pos, usedNames)
    if (role !== 'inhabited' || habitableCount(sys) >= civSlots + 1) return sys
  }
  throw new Error(`система ${id}: за 50 попыток не набралось пригодных планет`)
}

function buildSystem(rng: Rng, id: number, role: SystemRole, civSlots: number, pos: Vec, usedNames: Set<string>): StarSystem {
  const gen = ROLE_GEN[role]
  const type = rng.pick(gen.stars)
  const st = STAR_TYPES[type]
  const planets: Planet[] = []
  const count = rng.int(gen.planetsMin, gen.planetsMax)
  let orbit = st.radius * ORBIT.firstMul + rng.float(ORBIT.firstMin, ORBIT.firstMax)
  for (let i = 0; i < count; i++) {
    if (i > 0) {
      const tight = role === 'inhabited' && zoneOf(orbit, st.lum) === 'temperate'
      orbit += rng.float(ORBIT.gapMin, tight ? ORBIT.gapHzMax : ORBIT.gapMax) + ORBIT.gapGrowth * orbit
    }
    const r = Math.round(orbit)
    const zone = zoneOf(r, st.lum)
    let kind = pickWeighted(rng, gen.kinds)
    if (role === 'inhabited' && zone === 'temperate') kind = rng.chance(0.6) ? 'rocky' : 'ice'
    const k = PLANET_KINDS[kind]
    planets.push({
      id: `${id}:${i}`,
      systemId: id,
      name: uniqueName(rng, usedNames),
      kind,
      radius: Math.round(rng.float(k.rMin, k.rMax)),
      orbit: r,
      period: periodOf(r),
      phase: rng.float(0, TAU),
      zone,
      habitability: k.hab[zone],
      tempK: Math.round(tempKOf(r, st.lum)),
      owner: null,
      pop: 0,
      infra: 0,
      station: false,
      build: null,
      look: makeLook(rng, kind),
    })
  }

  // пояса — между соседними орбитами; если пар не хватает — за последней планетой
  const beltCount = rng.int(gen.beltsMin, gen.beltsMax)
  const gaps = rng.shuffle(planets.slice(1).map((_, i) => i))
  const belts: Belt[] = []
  let outer = planets[planets.length - 1].orbit
  for (let b = 0; b < beltCount; b++) {
    if (b < gaps.length) {
      const i = gaps[b]
      belts.push({ orbit: Math.round((planets[i].orbit + planets[i + 1].orbit) / 2), width: BELT.width })
    } else {
      outer += BELT.outerGap
      belts.push({ orbit: outer, width: BELT.width })
    }
  }

  const asteroids: Asteroid[] = []
  let nextAsteroid = id * 100_000
  belts.forEach((belt, bi) => {
    const n = rng.int(BELT.asteroidsMin, BELT.asteroidsMax)
    for (let k = 0; k < n; k++) asteroids.push(makeAsteroid(rng, nextAsteroid++, bi, belt))
  })

  const edge = Math.max(planets[planets.length - 1].orbit, ...belts.map((b) => b.orbit + b.width / 2))
  return {
    id,
    name: uniqueName(rng, usedNames),
    role,
    civSlots,
    pos,
    star: { type, radius: st.radius, lum: st.lum, color: st.color },
    radius: Math.round(edge + ORBIT.edgePad),
    planets,
    belts,
    asteroids,
    asteroidTarget: asteroids.length,
    nextAsteroid,
    regrowT: 0,
    gates: [],
  }
}
