// Все числа боя (спека 2А). Арена крутит их; в коде боя литералов из спеки быть не должно.
import type { Trait } from './types'

/** деньги войны (раздел 9) */
export const WAR = {
  /** лимит конверта war = ECON.envelopeCapMul × цена носителя с машинами */
  envelopeCap: 1150,
  mothballMul: 0.3,
  mothballAfter: 60,
  mobilizeT: 20,
  craftUpkeep: 0.01,
  orphanUpkeep: 0.015,
  orphanSpeedMul: 0.6,
}

/** рамка флота (раздел 7) */
export const FRAME = {
  grid: 40,
  rows: { line: 0, second: -50, frigate: -90, rear: -110, damaged: -150, boat: -170, reserve: -80 },
  wingPad: 40,
  reservePad: 80,
  ovalA: 70,
  ovalB: 12,
  ovalCx: -30,
  ovalMinLen: 200,
  ovalSmallW: 120,
  ovalSmallA: 100,
  ovalSmallCx: -60,
  frontCx: 30,
  frontB: 15,
  frontPad: 20,
  ovalSpeed: 60,
  screenForwardT: 15,
  anchorSpeed: 10,
  anchorAccelT: 10,
  anchorMinBattle: 5,
  drift: 7,
  driftEvery: 20,
  driftHold: 40,
  turnMax: 10,
  turnK: 0.8,
  anchorMinDist: 100,
  pushPad: 6,
  pushSpeed: 5,
  closeRanksAfter: 30,
  closeRanksEvery: 10,
  planetFrameMul: 3,
  planetFramePad: 200,
  planetSlotPad: 30,
  approachSpeed: 30,
  reverseSpeed: 10,
  gatherShare: 0.9,
  gatherT: 60,
  gateOffset: 80,
}

/** бой: фазы, давление, часы, сплочённость, решение (раздел 8) */
export const BATTLE = {
  detect: 700,
  engage: 320,
  beamRange: 250,
  dStar: { line: 170, push: 130, charge: 100 },
  pressureWindow: 30,
  pressureHold: 20,
  pressureHi: 1.25,
  pressureLo: 0.8,
  pressureFlee: 1.5,
  pressDStar: 30,
  dStarCooldown: 40,
  frontSpeed: 10,
  lineTimeout: 240,
  bandHold: 30,
  decisionT: 60,
  chargeT: 60,
  chargeAgain: 1.2,
  overAfter: 30,
  overRange: 800,
  review: 5,
  orderHold: 20,
  orderHoldLong: 30,
  reactCooldown: 10,
  channelCooldown: 15,
  flankedAngle: 60,
  flankedRange: 300,
  flankedT: 10,
  cohesion: { start: 70, fameMax: 12, vetMax: 8, vetPerRanks: 3, cap: 90, lostMul: 80, flagship: 15, flagshipPassed: 5, carrier: 8, flanked: 3, pressed: 1, calm: 2, calmAfter: 20, hysteresis: 5, flee: 20 },
  retreatOutcome: { attacker: 1.1, defender: 0.9, orbit: 0.6 },
  decisionCharge: { attacker: 1.0, defender: 1.2 },
  highValuePop: 3,
  highRetreatShift: 20,
  orbitRegenMul: 2,
  orbitPad: 200,
  orbitSpeed: 6,
  breakoutLoss: 0.3,
  pursueLeash: 600,
  pursueLossLimit: 0.2,
  flagTransferT: 20,
  flagDeathChance: 0.5,
  fameWin: 3,
  fameMax: 12,
  rankMax: 3,
  rankBonus: 0.03,
  matrixAirborne: 0.6,
  matrixCloseCoef: 0.5,
  matrixPdK: 0.1,
  matrixPdMin: 0.2,
  volleyMinCorvettes: 3,
  volleyArrivalMin: 0.4,
  screenCorvetteMul: 2,
  showStandT: 60,
  strengthIcon: 1000,
  bigBattle: 20,
}

export const TRAITS: Record<
  Trait,
  { name: string; retreat: number; chargePressure: number | null; chargeOutcome: number | null; reserve: number; doubleLine: boolean; markHold: number; flankCorvettes: number; finisherShield: number; breakoutShift: number }
> = {
  bold: { name: 'Напористый', retreat: 35, chargePressure: 1.25, chargeOutcome: 1.0, reserve: 0, doubleLine: false, markHold: 15, flankCorvettes: 4, finisherShield: 0, breakoutShift: -0.1 },
  careful: { name: 'Осторожный', retreat: 55, chargePressure: null, chargeOutcome: null, reserve: 0.3, doubleLine: false, markHold: 15, flankCorvettes: 4, finisherShield: 0, breakoutShift: 0.1 },
  methodical: { name: 'Методичный', retreat: 45, chargePressure: null, chargeOutcome: null, reserve: 0.15, doubleLine: true, markHold: 20, flankCorvettes: 4, finisherShield: 0, breakoutShift: 0 },
  dashing: { name: 'Лихой', retreat: 45, chargePressure: null, chargeOutcome: null, reserve: 0.15, doubleLine: false, markHold: 15, flankCorvettes: 2, finisherShield: 0.1, breakoutShift: 0 },
}
export const TRAIT_LIST: Trait[] = ['bold', 'careful', 'methodical', 'dashing']

/** снаряды (раздел 10.1) */
export const PROJ = {
  pool: { missile: 600, decoy: 1800, torpedo: 1000, beam: 160 },
  missile: { speed: 160, turn: 90, life: 4, hp: 2, retarget: 80 },
  decoy: { speed: 160, turn: 90, life: 4, hp: 1, damage: 10, count: 3, spread: 6 },
  torpedo: { speed: 60, turn: 25, life: 3, hp: 10 },
  lightTorpedo: { speed: 70, turn: 25, life: 3, hp: 8 },
  beam: { length: 250, width: 4, steps: 5, aim: 20, perStep: 8 },
  tracersMax: 400,
  hitPad: 2,
  /** клетки сетки вдоль отрезка проверяются с таким шагом */
  traceStep: 25,
  /** радиус торпеды как цели для луча, ракеты и трассера */
  torpHitR: 4,
}

/** вероятности попадания и множители по цели (разделы 6, 8.5) */
export const HIT = {
  flak: { missile: 0.7, craft: 0.4, hullMul: 0.15 },
  turret: { small: 0.35, craft: 0.25, capitalMul: 0.25 },
  gun: { craftMul: 2 },
  /** с до следующего поиска цели у второго оружия, если целей не нашлось */
  retargetIdle: 0.5,
  rankBonus: 0.03,
}

/** щиты, модули, горение, обломки (разделы 9.2, 10) */
export const DAMAGE = {
  shieldDelay: 5,
  burnBelow: 0.4,
  burnT: 30,
  burnRate: 0.005,
  burnSpeedMul: 0.6,
  burnFireMul: 0.5,
  moduleChance: { torpedo: 0.35, missile: 0.2, beam: 0.1 } as Record<string, number>,
  beamRollMin: 20,
  engineMul: 0.5,
  debrisShare: 0.2,
  debrisLife: 720,
  debrisRMul: 1.5,
  debrisHoldAfter: 30,
  salvageT: 8,
  salvageAfter: 30,
}

/** крыло носителя (раздел 11) */
export const WING = {
  airT: 60,
  landT: 12,
  waveMin: 4,
  waveT: 70,
  directions: 8,
  escortR: 60,
  frameR: 90,
  flakProbe: 150,
  craftCellPad: 5,
}

/** док (раздел 9.2) */
export const DOCK = {
  repairRate: 0.01,
  moduleT: 20,
  ammoT: 10,
  fighterT: 10,
  range: 60,
}

/** режиссёр боёв и военный бот (раздел 11) */
export const SKIRMISH = {
  every: 480,
  jitter: 180,
  perNeighbour: 900,
  minOutcome: 1.2,
  preferLo: 1.2,
  preferHi: 1.6,
  botEvery: 30,
  maxClassShare: 0.5,
  smallMin: 3,
  smallMax: 8,
  bigMin: 20,
  bigWindow: 4,
  minFleet: 8,
  hostilityPad: 120,
  counter: {
    battleship: ['bomber', 'torpedo', 'frigate'],
    frigate: ['battleship', 'corvette'],
    corvette: ['battleship', 'frigate'],
    torpedo: ['corvette', 'frigate'],
    carrier: ['corvette', 'battleship'],
  } as Record<string, string[]>,
  baseMix: ['battleship', 'frigate', 'corvette', 'corvette', 'torpedo', 'carrier'] as const,
}
