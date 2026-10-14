import type { Envelope, PlanetKind, ResearchBranch, ShipKind, StarType } from './config'
import type { Vec } from './math'
import type { Rng } from './rng'
import type { Setup } from './setup'
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
  | { type: 'patrol'; a: string; b: string; leg: 0 | 1 }
  /** боевой корабль в рамке флота: цель — точка слота */
  | { type: 'fleet'; fleetId: number }
  /** машина крыла; carrierId null — сирота */
  | { type: 'wing'; carrierId: number | null }
  | { type: 'salvage'; debrisId: number }

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
  /** боевое состояние; у мирных кораблей null */
  combat: Combat | null
  fleetId: number | null
}

export type Stage = 'ok' | 'deficit' | 'crisis' | 'bankrupt'
export type IncomeSource = 'tax' | 'trade' | 'tradePartner' | 'mining' | 'station' | 'refund' | 'salvage'
export type ExpenseCat = 'colony' | 'caravan' | 'miner' | 'station' | 'infra' | 'port' | 'shipyard' | 'research' | 'upkeep' | 'admin' | 'warship' | 'fighter'

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
  at: { system: number; planet?: string; battle?: number }
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
  /** что вышло при генерации галактики */
  settings: Setup
  /** лимит юнитов на карте */
  unitCap: number
  // ---- война (2А) ----
  civIndex: Map<number, Civ>
  /** id корабля → индекс в ships; перестраивается при сжатии и в spawnShip */
  shipIndex: Map<number, number>
  fleets: Fleet[]
  admirals: Admiral[]
  battles: Battle[]
  /** пул снарядов; alive=false — свободен */
  projectiles: Projectile[]
  /** по сетке на систему, индексы — позиции в projectiles (только торпеды, ракеты, приманки) */
  projGrids: SpatialGrid[]
  debris: Debris[]
  /** пара держав «a:b» (a < b) → до какого времени враждебны */
  hostility: Map<string, number>
  /** подсказки боя для отрисовки; очищаются каждый шаг */
  fxBattle: BattleFx[]
  /** счётчик срабатываний push-out за шаг (метрика арены) */
  pushOuts: number
  skirmish: { nextAt: number; lastTo: Map<string, number>; recentBig: boolean[]; nextBot: number }
}

// ---------- война (2А) ----------

export type Module = 'engines' | 'turrets' | 'hangar' | 'mainGun' | 'launchers'
export type Trait = 'bold' | 'careful' | 'methodical' | 'dashing'
export type Order = 'form' | 'march' | 'line' | 'push' | 'charge' | 'flank' | 'orbit' | 'retreat' | 'pursue' | 'dock'
export type TargetPriority = 'battleships' | 'frigates' | 'carriers' | 'nearest'
export type SlotKind = 'line' | 'second' | 'frigate' | 'rear' | 'boat' | 'reserve' | 'oval' | 'damaged' | 'flank'

/** место в рамке: x — вперёд к врагу, y — вбок (в системе отсчёта рамки); phase — для овала корветов */
export interface Slot {
  kind: SlotKind
  column: number
  x: number
  y: number
  phase: number
}

export interface WingState {
  phase: 'deck' | 'air' | 'return' | 'orphan'
  since: number
  targetId: number | null
}

export interface Hangar {
  /** id машин на палубе */
  deck: number[]
  /** время, когда каждое место перезарядки освободится */
  bays: number[]
  torpedoes: number
  /** живых машин, приписанных к носителю (для содержания) */
  craft: number
  nextWave: number
}

export interface Combat {
  hull: number
  hullMax: number
  shield: number
  shieldMax: number
  shieldRegen: number
  lastHitT: number
  /** 1 — цел, 0 — выбит */
  modules: Partial<Record<Module, number>>
  /** залпы (фрегат), торпеды (катер, бомбардировщик, носитель — через hangar.torpedoes) */
  ammo: number
  /** когда загорелся */
  burning: number | null
  /** нос, рад; поворот ограничен SHIP_KINDS.turn */
  heading: number
  slot: Slot | null
  rank: 0 | 1 | 2 | 3
  carrierId: number | null
  wing: WingState | null
  hangar: Hangar | null
  targetId: number | null
  retargetAt: number
  /** по оружию: время, когда можно стрелять снова */
  cooldown: number[]
  mothballed: boolean
  dockedAt: string | null
  /** пережитых боёв */
  battles: number
}

export type FleetMission =
  | { type: 'show'; systemId: number; planetId: string }
  | { type: 'defend'; planetId: string }
  | { type: 'breakout'; toPlanetId: string }
  | { type: 'return'; planetId: string }
  | { type: 'dock'; planetId: string }

export interface Fleet {
  id: number
  owner: number
  name: string
  admiralId: number
  /** случайность флота до создания Battle: w.rng.fork('fleet:' + id) */
  rng: Rng
  systemId: number
  shipIds: number[]
  reserveIds: number[]
  flagshipId: number | null
  anchor: Vec
  anchorVel: Vec
  /** текущая скорость якоря по курсу движения, ед/с (разгон/торможение) */
  speed: number
  /** курс рамки, рад */
  heading: number
  /** planetId — система отсчёта рамки */
  frame: string | null
  columns: number
  /** ширина строя W = (columns − 1) · FRAME.grid */
  width: number
  formation: 'wide' | 'double'
  order: Order
  orderSince: number
  orderReason: string
  nextReview: number
  lastReactT: number
  targetPriority: TargetPriority
  prioritySince: number
  missiles: 'ready' | 'volley'
  turrets: 'pd' | 'screen'
  channelSince: number
  /** когда завеса вышла вперёд; null — на крыльях */
  screenForward: number | null
  finisher: boolean
  flankIds: number[]
  flankSince: number | null
  cohesion: number
  dStar: number
  dStarSince: number
  driftSide: -1 | 1
  driftSince: number
  /** рубеж отхода (координаты системы) */
  fallback: Vec | null
  mission: FleetMission
  battleId: number | null
  waitingAtGate: number | null
  route: number[]
  gatherSince: number | null
  /** когда пересчитать слоты после гибели (ряд смыкается не раньше 30 с) */
  reassignAt: number | null
  lastLossT: number
  /** колонна → время последней смены колонны */
  columnSwapAt: Record<number, number>
  flagSince: number | null
  chargeSince: number
  mothballedSince: number | null
  mobilizedAt: number
  /** решение в фазе «решение» уже принято */
  decided: boolean
  /** стартовая стоимость состава (для сплочённости) */
  value0: number
  lossValue: number
}

export interface Admiral {
  id: number
  owner: number
  name: string
  trait: Trait
  fame: number
  wins: number
  alive: boolean
}

export type ProjectileKind = 'missile' | 'decoy' | 'torpedo' | 'beam'

export interface Projectile {
  kind: ProjectileKind
  owner: number
  shooterId: number
  targetId: number
  x: number
  y: number
  vx: number
  vy: number
  heading: number
  speed: number
  /** рад/с */
  turn: number
  damage: number
  hp: number
  bornT: number
  life: number
  systemId: number
  alive: boolean
  /** луч: суммарный урон в одну цель за жизнь и кому — для броска на модуль */
  dealt: number
  dealtTo: number
  /** луч: длина отрезка */
  length: number
}

export type BattlePhase = 'approach' | 'engage' | 'line' | 'decision' | 'retreat' | 'over'

export interface BattleSide {
  fleetIds: number[]
  civ: number
  role: 'attacker' | 'defender'
  strength0: number
  strength: number
  /** корпус, снятый этой стороной, по секундам (кольцо на 30 с) */
  hullDealt: number[]
  lastSalvoT: number
  outOfAmmo: boolean
  state: 'fight' | 'charge' | 'retreat' | 'flee' | 'orbit' | 'dock'
  value0: number
  lossValue: number
}

export interface BattleLogEntry {
  t: number
  kind: string
  text: string
  side?: 0 | 1
  shipId?: number
}

export interface BattleMetrics {
  orderChanges: number
  capitalOffSlotT: number
  capitalLineT: number
  capitalSlowT: number
  maxQuiet: number
  lastEventT: number
  pressureFlips: number
  minHullDist: number
  pushOuts: number
  dStarChanges: number
  leaderAt60: 0 | 1 | null
  missilesFired: number
  missilesHit: number
  corvetteFirstDeathT: number | null
  minSpeedViolations: number
}

export interface Battle {
  id: number
  systemId: number
  startT: number
  phase: BattlePhase
  phaseSince: number
  sides: [BattleSide, BattleSide]
  pressure: number
  pressureSince: number
  pressureFlips: number
  /** 1 — давит сторона 0, −1 — сторона 1, 0 — полоса */
  pressureState: -1 | 0 | 1
  lastVolleyT: number
  lineSince: number
  decisionDeadline: number | null
  bandSince: number | null
  targetValue: 'low' | 'high'
  planetId: string | null
  log: BattleLogEntry[]
  /** «класс → класс» → снятый корпус (для вердикта) */
  damage: Record<string, number>
  verdict: string | null
  factors: string[]
  metrics: BattleMetrics
  rng: Rng
  noEnemySince: number | null
  overAt: number | null
}

export interface Debris {
  id: number
  systemId: number
  pos: Vec
  value: number
  owner: number
  bornT: number
  holder: number | null
  r: number
  kind: ShipKind
}

/** подсказки боя для отрисовки: трассер, вспышка щита, взрыв; живут один шаг */
export type BattleFx =
  | { kind: 'tracer'; systemId: number; x0: number; y0: number; x1: number; y1: number; hit: boolean }
  | { kind: 'shield' | 'boom'; systemId: number; x: number; y: number; r: number }
