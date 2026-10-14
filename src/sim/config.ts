import type { SystemRole } from './types'

// ---------- время ----------
export const SIM_DT = 0.1
export const YEAR_SECONDS = 20
export const MAX_STEPS_PER_FRAME = 60
export const MAX_FRAME_DT = 0.25
/** скорости времени: клавиши 1–4 */
export const SPEEDS = [1, 5, 20, 50] as const

// ---------- галактика ----------
export const GALAXY = {
  minSystems: 5,
  maxSystems: 7,
  ellipseW: 100_000,
  ellipseH: 60_000,
  minDist: 22_000,
  maxDegree: 4,
  transitMin: 60,
  transitMax: 120,
  placementAttempts: 4000,
}

export const CIVS = { min: 8, max: 10, startPopMin: 1.6, startPopMax: 2.4, startTreasury: 100 }

// ---------- звёзды и планеты ----------
export type StarType = 'G' | 'K' | 'F' | 'M' | 'B'
export const STAR_TYPES: Record<StarType, { radius: number; lum: number; color: number }> = {
  G: { radius: 60, lum: 1.0, color: 0xffe9a8 },
  K: { radius: 50, lum: 0.6, color: 0xffb27a },
  F: { radius: 66, lum: 1.6, color: 0xfff4e0 },
  M: { radius: 36, lum: 0.25, color: 0xff7a5c },
  B: { radius: 90, lum: 4.0, color: 0x9ec8ff },
}

export const ORBIT = {
  firstMul: 6,
  firstMin: 150,
  firstMax: 250,
  gapMin: 350,
  gapMax: 600,
  /** в зоне жизни обитаемых систем орбиты теснее — чтобы хватило пригодных планет */
  gapHzMax: 450,
  gapGrowth: 0.04,
  periodBase: 120,
  periodRef: 700,
  edgePad: 600,
  gatePad: 200,
}

/** зона жизни: [inner, outer] · √светимости */
export const HZ = { inner: 900, outer: 2800, tempRef: 1500 }

export type PlanetKind = 'rocky' | 'ice' | 'gas' | 'dwarf'
export const PLANET_KINDS: Record<PlanetKind, { rMin: number; rMax: number; hab: { hot: number; temperate: number; cold: number } }> = {
  rocky: { rMin: 14, rMax: 24, hab: { hot: 0.5, temperate: 1.3, cold: 0.6 } },
  ice: { rMin: 26, rMax: 36, hab: { hot: 0.6, temperate: 1.0, cold: 0.8 } },
  gas: { rMin: 36, rMax: 48, hab: { hot: 0.3, temperate: 0.45, cold: 0.4 } },
  dwarf: { rMin: 10, rMax: 14, hab: { hot: 0, temperate: 0, cold: 0 } },
}

export const ROLE_GEN: Record<
  SystemRole,
  { stars: StarType[]; planetsMin: number; planetsMax: number; beltsMin: number; beltsMax: number; kinds: Partial<Record<PlanetKind, number>> }
> = {
  inhabited: { stars: ['G', 'K', 'F'], planetsMin: 7, planetsMax: 10, beltsMin: 1, beltsMax: 2, kinds: { rocky: 0.45, ice: 0.25, gas: 0.2, dwarf: 0.1 } },
  ore: { stars: ['K', 'M', 'B', 'G'], planetsMin: 6, planetsMax: 8, beltsMin: 2, beltsMax: 3, kinds: { gas: 0.5, ice: 0.2, dwarf: 0.2, rocky: 0.1 } },
  pit: { stars: ['M', 'K'], planetsMin: 3, planetsMax: 5, beltsMin: 3, beltsMax: 3, kinds: { dwarf: 0.6, rocky: 0.4 } },
  nebula: { stars: ['B', 'F', 'M'], planetsMin: 2, planetsMax: 4, beltsMin: 1, beltsMax: 1, kinds: { gas: 0.4, ice: 0.3, dwarf: 0.3 } },
}

export const BELT = { asteroidsMin: 16, asteroidsMax: 30, oreMin: 40, oreMax: 120, sizeMin: 3, sizeMax: 7, width: 120, regrowEvery: 30, outerGap: 300 }

// ---------- население ----------
export const POP = { growth: 0.012, capPerRadius: 0.5, settlers: 0.5, capitalReserve: 3 }

// ---------- корабли и полёты ----------
export type ShipKind = 'colony' | 'caravan' | 'miner'
export const SHIP_KINDS: Record<ShipKind, { length: number; speed: number; accel: number; upkeep: number }> = {
  colony: { length: 6, speed: 70, accel: 40, upkeep: 0.05 },
  caravan: { length: 6, speed: 80, accel: 50, upkeep: 0.05 },
  miner: { length: 5, speed: 70, accel: 40, upkeep: 0.04 },
}

export const MOVE = {
  starSafetyMul: 3,
  waypointPush: 1.2,
  arriveRadius: 150,
  dockPad: 20,
  frameMatchMul: 3,
  frameMatchPad: 200,
  gateDock: 40,
  separation: 14,
  separationForce: 30,
  gateInset: 0.97,
  /** оценка времени пересечения промежуточной системы при поиске пути, с */
  crossingCost: 60,
}

// ---------- экономика ----------
export type Envelope = 'expand' | 'develop' | 'trade' | 'reserve'
export const ENVELOPE_SHARES: Record<Envelope, number> = { expand: 0.35, develop: 0.35, trade: 0.2, reserve: 0.1 }

export const ECON = {
  taxPerPop: 0.12,
  infraTax: 0.3,
  infraCap: 0.1,
  crisisTax: 0.9,
  colonyBase: 160,
  colonyPerPlanet: 50,
  colonyOtherSystem: 1.4,
  colonyRefund: 0.5,
  caravanPrice: 50,
  minerPrice: 45,
  stationPrice: 120,
  stationBuild: 40,
  stationUpkeep: 0.05,
  stationIncome: 0.25,
  stationOreMul: 2,
  /** станция ставится на свободную планету с пригодностью ниже этого порога */
  stationMaxHab: 0.5,
  infraPrice: [120, 200, 320],
  infraBuild: [40, 60, 80],
  portPrice: 200,
  portBuild: 60,
  portTradeMul: 1.4,
  shipyardPrice: 250,
  shipyardBuild: 80,
  shipyardPriceMul: 0.75,
  shipyardUpkeepMul: 0.7,
  researchPrice: [300, 500, 800],
  researchTime: [90, 120, 150],
  adminBase: 0.1,
  adminPerPlanet: 0.05,
  adminOtherSystem: 1.5,
  tradeBase: 6,
  tradeK: 0.6,
  tradeMax: 30,
  tradePartnerShare: 0.5,
  tradeMaxHops: 2,
  minerCargo: 20,
  orePrice: 0.8,
  emaWindow: 60,
  reserveMin: 0.5,
  runwayMin: 300,
  deficitToCrisis: 45,
  crisisReserve: -0.5,
  recoverAfter: 30,
  bankruptEvery: 15,
  decommissionRefund: 0.25,
  envelopeCapMul: 1.5,
}

export type ResearchBranch = 'logistics' | 'admin' | 'agro' | 'engines'
export const RESEARCH: Record<ResearchBranch, { label: string; perLevel: number }> = {
  logistics: { label: 'Логистика', perLevel: 0.1 },
  admin: { label: 'Администрация', perLevel: 0.15 },
  agro: { label: 'Агротех', perLevel: 0.05 },
  engines: { label: 'Двигатели', perLevel: 0.15 },
}
export const RESEARCH_BRANCHES: ResearchBranch[] = ['logistics', 'admin', 'agro', 'engines']

// ---------- бот ----------
export const BOT = { decideMin: 4, decideMax: 6, minerBase: 1, minerMax: 4, colonyMaturity: 0.55 }

// ---------- оформление и журнал ----------
export const PALETTE = [0x5da8ff, 0xff8a5c, 0x7dd87d, 0xe0c060, 0xc98bff, 0x5ce0d8, 0xff8fc8, 0xa8c84d, 0x8aa0ff, 0xffd07a]
export const EVENTS = { groupWindow: 20, maxLog: 500, fxLife: 5 }
