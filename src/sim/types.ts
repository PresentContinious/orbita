import type { Envelope, PlanetKind, ResearchBranch, ShipKind, StarType } from './config'
import type { Vec } from './math'
import type { Rng } from './rng'
import type { SpatialGrid } from './spatial'

export type { Vec }
export type Zone = 'hot' | 'temperate' | 'cold'
export type SystemRole = 'inhabited' | 'ore' | 'pit' | 'nebula'

export interface PlanetLook {
  colors: [string, string, string]
  glow: string
  banded: boolean
  rings: boolean
}

export interface Build {
  kind: 'infra' | 'station'
  level: number
  remaining: number
  total: number
}

export interface Planet {
  id: string
  systemId: number
  name: string
  kind: PlanetKind
  radius: number
  orbit: number
  period: number
  phase: number
  zone: Zone
  habitability: number
  tempK: number
  owner: number | null
  /** тысячи жителей */
  pop: number
  infra: number
  station: boolean
  build: Build | null
  look: PlanetLook
}

export interface Belt {
  orbit: number
  width: number
}

export interface Asteroid {
  id: number
  belt: number
  orbit: number
  period: number
  phase: number
  ore: number
  size: number
}

export interface Gate {
  corridorId: number
  toSystem: number
  /** относительно звезды своей системы */
  pos: Vec
}

export interface Star {
  type: StarType
  radius: number
  lum: number
  color: number
}

export interface StarSystem {
  id: number
  name: string
  role: SystemRole
  civSlots: number
  /** положение звезды в галактике */
  pos: Vec
  star: Star
  radius: number
  planets: Planet[]
  belts: Belt[]
  asteroids: Asteroid[]
  asteroidTarget: number
  nextAsteroid: number
  regrowT: number
  gates: Gate[]
}

export interface Corridor {
  id: number
  a: number
  b: number
  /** расстояние между вратами */
  length: number
  /** время перелёта, с */
  transit: number
}

export interface Galaxy {
  systems: StarSystem[]
  corridors: Corridor[]
}

export type Mission =
  | { type: 'colonize'; planetId: string; settlers: number; price: number }
  | { type: 'trade'; a: string; b: string; leg: 0 | 1 }
  | { type: 'mine'; phase: 'out' | 'back'; asteroidId: number | null; cargo: number; idleT: number }
  | { type: 'return'; planetId: string }

export interface Transit {
  corridorId: number
  from: number
  to: number
  elapsed: number
  duration: number
}

export interface Ship {
  id: number
  kind: ShipKind
  owner: number
  price: number
  systemId: number
  /** относительно звезды текущей системы */
  pos: Vec
  prevPos: Vec
  vel: Vec
  /** системы, которые ещё предстоит пройти; следующая — route[0] */
  route: number[]
  transit: Transit | null
  mission: Mission
  alive: boolean
}

export type Stage = 'ok' | 'deficit' | 'crisis' | 'bankrupt'
export type IncomeSource = 'tax' | 'trade' | 'tradePartner' | 'mining' | 'station' | 'refund'
export type ExpenseCat = 'colony' | 'caravan' | 'miner' | 'station' | 'infra' | 'port' | 'shipyard' | 'research' | 'upkeep' | 'admin'

export interface Ledger {
  start: number
  income: Record<IncomeSource, number>
  expense: Record<ExpenseCat, number>
}

export interface CivEconomy {
  ledger: Ledger
  envelopes: Record<Envelope, number>
  stage: Stage
  /** скользящие средние за минуту, кр/с */
  grossEma: number
  upkeepEma: number
  tradeEma: number
  /** суммы за текущий шаг */
  earnedStep: number
  upkeepStep: number
  tradeStep: number
  deficitSince: number | null
  positiveSince: number | null
  lastDecommission: number
}

export interface CivProject {
  kind: 'port' | 'shipyard'
  remaining: number
  total: number
}

export interface ResearchJob {
  branch: ResearchBranch
  level: number
  remaining: number
  total: number
}

export interface Civ {
  id: number
  name: string
  color: number
  capital: string
  homeSystem: number
  treasury: number
  eco: CivEconomy
  research: Record<ResearchBranch, number>
  researchJob: ResearchJob | null
  port: boolean
  shipyard: boolean
  project: CivProject | null
  nextDecision: number
}

export interface GameEvent {
  id: number
  t: number
  kind: string
  pri: 0 | 1 | 2
  text: string
  civs: number[]
  at: { system: number; planet?: string }
  count: number
}

/** подсказка для отрисовки: «+N кр» над местом доставки */
export interface Fx {
  kind: 'income'
  t: number
  systemId: number
  x: number
  y: number
  amount: number
}

export interface World {
  seed: number
  t: number
  tick: number
  galaxy: Galaxy
  civs: Civ[]
  ships: Ship[]
  events: GameEvent[]
  fx: Fx[]
  /** по сетке на систему, индексы — позиции в ships */
  grids: SpatialGrid[]
  rng: Rng
  nextId: number
  planets: Map<string, Planet>
}
