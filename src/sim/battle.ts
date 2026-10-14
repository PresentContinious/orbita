// Бой (спека 2А, §8.3–8.6, §12.2, §13.2): обнаружение, фазы, давление, часы, сплочённость, матрица исхода, вердикт, метрики.
// Одна функция матрицы исхода на весь проект — expectedOutcome; адмирал, режиссёр и бот импортируют её отсюда.
import { CLASSES, COMBAT_KINDS, DEFAULT_WING, isCapital, isCombatKind, isCraft, type CombatKind, type Weapon } from './classes'
import { BATTLE, FRAME, MATRIX_CLOSE, MATRIX_MUL, MATRIX_PD, MATRIX_SHIELD_BLOCK, PROJ, WING } from './combat-config'
import { EVENTS, SHIP_KINDS, SIM_DT } from './config'
import { beamsOf, canVolley, fireMul, turretsOk } from './damage'
import { pushEvent } from './events'
import { anchorAbs, fleetById, slotWorld } from './fleet'
import type { Vec } from './math'
import { capitalOf, capitalSystem, civById } from './query'
import type { Rng } from './rng'
import { planetPos } from './system'
import { fireWeapons, pickTargets } from './weapons'
import type { Battle, BattleLogEntry, BattleSide, Civ, Fleet, Planet, Ship, World } from './types'

/** шагов в секунде: кольцо давления и «раз в секунду» считаются по tick, а не по дробному времени */
const PER_S = Math.round(1 / SIM_DT)

// ---------- враждебность ----------

function hostKey(a: number, b: number): string {
  return a < b ? a + ':' + b : b + ':' + a
}

export function isHostile(w: World, a: number, b: number): boolean {
  if (a === b) return false
  const until = w.hostility.get(hostKey(a, b))
  return until !== undefined && until > w.t
}

export function setHostile(w: World, a: number, b: number, untilT: number): void {
  w.hostility.set(hostKey(a, b), untilT)
}

// ---------- журнал и связь корабля с боем ----------

/** строка в журнал боя; журнал не длиннее EVENTS.battleLog */
export function logBattle(w: World, b: Battle, kind: string, text: string, side?: 0 | 1, shipId?: number): void {
  const e: BattleLogEntry = { t: w.t, kind, text }
  if (side !== undefined) e.side = side
  if (shipId !== undefined) e.shipId = shipId
  b.log.push(e)
  if (b.log.length > EVENTS.battleLog) b.log.splice(0, b.log.length - EVENTS.battleLog)
  b.metrics.lastEventT = w.t
}

/** бой, в котором участвует флот корабля */
export function battleOf(w: World, ship: Ship): Battle | null {
  if (ship.fleetId === null) return null
  const fleet = fleetById(w, ship.fleetId)
  if (!fleet || fleet.battleId === null) return null
  for (const b of w.battles) if (b.id === fleet.battleId) return b
  return null
}

/** случайность корабля: в бою — battle.rng, иначе во флоте — fleet.rng, иначе w.rng */
export function combatRng(w: World, ship: Ship): Rng {
  const b = battleOf(w, ship)
  if (b) return b.rng
  const fleet = ship.fleetId === null ? undefined : fleetById(w, ship.fleetId)
  return fleet ? fleet.rng : w.rng
}

function sideOfFleet(b: Battle, fleetId: number): 0 | 1 {
  return b.sides[0].fleetIds.includes(fleetId) ? 0 : 1
}

function liveShip(w: World, id: number): Ship | undefined {
  const i = w.shipIndex.get(id)
  if (i === undefined) return undefined
  const s = w.ships[i]
  return s && s.id === id && s.alive ? s : undefined
}

// ---------- память боя (не часть состояния мира: считается из него же) ----------

interface SideMem {
  /** стартовая сплочённость */
  start: number
  /** накопленные поправки: флагман, носитель, обойдён, теснят, спокойствие */
  adj: number
  lastLossT: number
  lossPrev: number
  flagId: number | null
  flagLost: boolean
  carriers: number
  flankedFor: number
  flankedTotal: number
  orbit: boolean
}

interface Mem {
  /** последняя секунда, чей слот кольца давления очищен */
  sec: number
  /** кандидат состояния давления и его сторона-давитель до подтверждения */
  cand: -1 | 0 | 1
  /** последний, кто давил (для pressureFlips) */
  lastPresser: -1 | 0 | 1
  /** сторона, чей D* ещё надо снизить (кулдаун мог не пустить сразу) */
  pendingD: -1 | 0 | 1
  sides: [SideMem, SideMem]
  vel: Map<number, Vec>
  inBelt: boolean
  corvettes: number
  /** с какого момента обе рамки стоят */
  settledSince: number | null
}

const mems = new WeakMap<Battle, Mem>()

function newSideMem(): SideMem {
  return { start: 0, adj: 0, lastLossT: 0, lossPrev: 0, flagId: null, flagLost: false, carriers: 0, flankedFor: 0, flankedTotal: 0, orbit: false }
}

function memOf(w: World, b: Battle): Mem {
  let m = mems.get(b)
  if (!m) {
    m = { sec: Math.floor(w.tick / PER_S), cand: 0, lastPresser: 0, pendingD: 0, sides: [newSideMem(), newSideMem()], vel: new Map(), inBelt: false, corvettes: -1, settledSince: null }
    for (const sm of m.sides) sm.lastLossT = w.t
    mems.set(b, m)
  }
  return m
}

// ---------- ценность цели ----------

/** high: столица, единственная планета державы в чужой системе (плацдарм) или планета с населением ≥ highValuePop */
export function targetValueOf(w: World, planet: Planet, civ: Civ): 'low' | 'high' {
  if (capitalOf(w, civ)?.id === planet.id) return 'high'
  if (planet.pop >= BATTLE.highValuePop) return 'high'
  if (planet.systemId !== capitalSystem(w, civ)) {
    let n = 0
    for (const p of w.galaxy.systems[planet.systemId].planets) if (p.owner === civ.id) n++
    if (n === 1) return 'high'
  }
  return 'low'
}

// ---------- состав и сила сторон ----------

function aliveValue(w: World, f: Fleet): number {
  let v = 0
  for (const id of f.shipIds) {
    const s = liveShip(w, id)
    if (s && s.combat) v += s.price
  }
  return v
}

function fleetsOf(w: World, side: BattleSide): Fleet[] {
  const out: Fleet[] = []
  for (const id of side.fleetIds) {
    const f = fleetById(w, id)
    if (f) out.push(f)
  }
  return out
}

function addClasses(w: World, side: BattleSide, f: Fleet): void {
  if (!side.classes0) side.classes0 = {}
  for (const id of f.shipIds) {
    const s = liveShip(w, id)
    if (s && s.combat) side.classes0[s.kind] = (side.classes0[s.kind] ?? 0) + 1
  }
}

function fleetStrength(w: World, f: Fleet): number {
  let v = 0
  for (const id of f.shipIds) {
    const s = liveShip(w, id)
    if (s && s.combat) v += (s.price * Math.max(0, s.combat.hull)) / s.combat.hullMax
  }
  return v
}

/** пересчёт сил, потерь и часов боезапаса обеих сторон по живым кораблям */
export function updateStrength(w: World, b: Battle): void {
  const m = memOf(w, b)
  let corvettes = 0
  for (let i = 0; i < 2; i++) {
    const side = b.sides[i]
    let str = 0
    let alive = 0
    let users = 0
    let left = 0
    for (let k = 0; k < side.fleetIds.length; k++) {
      const f = fleetById(w, side.fleetIds[k])
      if (!f) continue
      let fAlive = 0
      for (let j = 0; j < f.shipIds.length; j++) {
        const s = liveShip(w, f.shipIds[j])
        const c = s?.combat
        if (!s || !c) continue
        str += (s.price * Math.max(0, c.hull)) / c.hullMax
        alive += s.price
        fAlive += s.price
        if (s.kind === 'frigate') {
          users++
          if (c.ammo > 0) left++
        } else if (s.kind === 'carrier') {
          users++
          if (c.hangar && c.hangar.torpedoes > 0) left++
        } else if (s.kind === 'corvette') corvettes++
      }
      f.lossValue = Math.max(0, f.value0 - fAlive)
    }
    side.strength = str
    side.lossValue = Math.max(0, side.value0 - alive)
    if (!side.outOfAmmo && users > 0 && left === 0) {
      side.outOfAmmo = true
      side.lastSalvoT = w.t
      b.lastVolleyT = w.t
      const civ = civById(w, side.civ)
      logBattle(w, b, 'clock', `Последний залп ${civ ? civ.name : '?'}`, i as 0 | 1)
    }
  }
  if (m.corvettes >= 0 && corvettes < m.corvettes && b.metrics.corvetteFirstDeathT === null) b.metrics.corvetteFirstDeathT = w.t - b.startT
  m.corvettes = corvettes
}

// ---------- создание и присоединение ----------

function placeName(w: World, b: Battle): string {
  const p = b.planetId ? w.planets.get(b.planetId) : undefined
  return p ? p.name : (w.galaxy.systems[b.systemId]?.name ?? '?')
}

const tmpA: Vec = { x: 0, y: 0 }
const tmpB: Vec = { x: 0, y: 0 }

function admiralOf(w: World, f: Fleet) {
  for (const a of w.admirals) if (a.id === f.admiralId) return a
  return undefined
}

function startCohesion(w: World, side: BattleSide): number {
  const fleets = fleetsOf(w, side)
  const adm = fleets.length ? admiralOf(w, fleets[0]) : undefined
  let ranks = 0
  for (const f of fleets) {
    for (const id of f.shipIds) {
      const s = liveShip(w, id)
      if (s && s.combat) ranks += s.combat.rank
    }
  }
  const C = BATTLE.cohesion
  const v = C.start + Math.min(adm ? adm.fame : 0, C.fameMax) + Math.min(Math.floor(ranks / C.vetPerRanks), C.vetMax)
  return Math.min(C.cap, v)
}

function newSide(w: World, f: Fleet, role: BattleSide['role']): BattleSide {
  const value0 = aliveValue(w, f)
  f.value0 = value0
  f.lossValue = 0
  const s: BattleSide = {
    fleetIds: [f.id],
    civ: f.owner,
    role,
    strength0: fleetStrength(w, f),
    strength: fleetStrength(w, f),
    hullDealt: new Array<number>(BATTLE.pressureWindow).fill(0),
    lastSalvoT: -Infinity,
    outOfAmmo: false,
    state: 'fight',
    value0,
    lossValue: 0,
  }
  addClasses(w, s, f)
  return s
}

/** флот-защитник: миссия «оборона» или «док» */
function isDefender(f: Fleet): boolean {
  return f.mission.type === 'defend' || f.mission.type === 'dock'
}

export function createBattle(w: World, fa: Fleet, fb: Fleet): Battle {
  // сторона 0 — нападающий; если fa защищается, а fb нет — меняем
  let atk = fa
  let def = fb
  if (isDefender(fa) && !isDefender(fb)) {
    atk = fb
    def = fa
  }
  const id = w.nextId++
  const defCiv = civById(w, def.owner)
  const defAnchor = anchorAbs(w, def, tmpA)
  let planet: Planet | null = null
  let best = Infinity
  for (const p of w.galaxy.systems[def.systemId].planets) {
    if (p.owner !== def.owner) continue
    const pp = planetPos(p, w.t)
    const d = Math.hypot(pp.x - defAnchor.x, pp.y - defAnchor.y)
    if (d < best) {
      best = d
      planet = p
    }
  }
  const b: Battle = {
    id,
    systemId: def.systemId,
    startT: w.t,
    phase: 'approach',
    phaseSince: w.t,
    sides: [newSide(w, atk, 'attacker'), newSide(w, def, 'defender')],
    pressure: 1,
    pressureSince: w.t,
    pressureFlips: 0,
    pressureState: 0,
    lastVolleyT: w.t,
    lineSince: w.t,
    decisionDeadline: null,
    bandSince: null,
    targetValue: planet && defCiv ? targetValueOf(w, planet, defCiv) : 'low',
    planetId: planet ? planet.id : null,
    log: [],
    damage: {},
    verdict: null,
    factors: [],
    metrics: {
      orderChanges: 0, capitalOffSlotT: 0, capitalLineT: 0, capitalSlowT: 0, maxQuiet: 0, lastEventT: w.t, pressureFlips: 0,
      minHullDist: Infinity, pushOuts: 0, dStarChanges: 0, leaderAt60: null, missilesFired: 0, missilesHit: 0,
      corvetteFirstDeathT: null, minSpeedViolations: 0,
    },
    rng: w.rng.fork('battle:' + id),
    noEnemySince: null,
    overAt: null,
  }
  atk.battleId = id
  def.battleId = id
  w.battles.push(b)

  const m = memOf(w, b)
  for (let i = 0; i < 2; i++) {
    m.sides[i].start = startCohesion(w, b.sides[i])
    for (const f of fleetsOf(w, b.sides[i])) f.cohesion = m.sides[i].start
    m.sides[i].carriers = countKind(w, b.sides[i], 'carrier')
    const f = fleetsOf(w, b.sides[i])[0]
    m.sides[i].flagId = f && f.flagshipId !== null && liveShip(w, f.flagshipId) ? f.flagshipId : null
  }
  m.inBelt = inBelt(w, b.systemId, defAnchor)
  updateStrength(w, b)

  const atkCiv = civById(w, atk.owner)
  const text = `${atkCiv ? atkCiv.name : '?'} встречает ${defCiv ? defCiv.name : '?'} у ${placeName(w, b)}`
  logBattle(w, b, 'phase', text)
  pushEvent(w, {
    kind: 'battle',
    pri: 1,
    text,
    civs: [atk.owner, def.owner],
    at: planet ? { system: b.systemId, planet: planet.id, battle: id } : { system: b.systemId, battle: id },
  })
  return b
}

function countKind(w: World, side: BattleSide, kind: string): number {
  let n = 0
  for (const f of fleetsOf(w, side)) {
    for (const id of f.shipIds) {
      const s = liveShip(w, id)
      if (s && s.kind === kind) n++
    }
  }
  return n
}

function inBelt(w: World, systemId: number, at: Vec): boolean {
  const r = Math.hypot(at.x, at.y)
  for (const belt of w.galaxy.systems[systemId].belts) if (Math.abs(r - belt.orbit) <= belt.width / 2) return true
  return false
}

function joinBattle(w: World, free: Fleet, busy: Fleet): void {
  const b = w.battles.find((x) => x.id === busy.battleId)
  if (!b || b.phase === 'over') return
  const mine = sideOfFleet(b, busy.id)
  const side = b.sides[(1 - mine) as 0 | 1]
  if (side.civ !== free.owner) return
  side.fleetIds.push(free.id)
  free.battleId = b.id
  free.value0 = aliveValue(w, free)
  free.lossValue = 0
  side.value0 += free.value0
  const st = fleetStrength(w, free)
  side.strength0 += st
  side.strength += st
  addClasses(w, side, free)
  const m = memOf(w, b)
  free.cohesion = m.sides[1 - mine].start
  m.sides[1 - mine].carriers += countKind(w, { ...side, fleetIds: [free.id] }, 'carrier')
  const civ = civById(w, free.owner)
  logBattle(w, b, 'join', `${civ ? civ.name : '?'}: подошёл флот «${free.name}»`, (1 - mine) as 0 | 1)
}

/** пары враждебных флотов одной системы ближе BATTLE.detect: новый бой или присоединение к идущему */
export function detectBattles(w: World): void {
  const F = w.fleets
  for (let i = 0; i < F.length; i++) {
    const a = F[i]
    for (let j = i + 1; j < F.length; j++) {
      const c = F[j]
      if (a.owner === c.owner || a.systemId !== c.systemId) continue
      if (a.battleId !== null && c.battleId !== null) continue
      if (!a.shipIds.length || !c.shipIds.length) continue
      const pa = anchorAbs(w, a, tmpA)
      const pc = anchorAbs(w, c, tmpB)
      if (Math.hypot(pa.x - pc.x, pa.y - pc.y) >= BATTLE.detect) continue
      if (!isHostile(w, a.owner, c.owner)) continue
      if (a.battleId === null && c.battleId === null) createBattle(w, a, c)
      else if (a.battleId === null) joinBattle(w, a, c)
      else joinBattle(w, c, a)
    }
  }
}

// ---------- фазы ----------

const PHASE_NAME: Record<Battle['phase'], string> = {
  approach: 'Сближение', engage: 'Завязка', line: 'Линия', decision: 'Решение', retreat: 'Отход', over: 'Конец боя',
}

function setPhase(w: World, b: Battle, phase: Battle['phase'], note: string): void {
  b.phase = phase
  b.phaseSince = w.t
  logBattle(w, b, 'phase', `${PHASE_NAME[phase]}: ${note}`)
}

/** расстояние между ближайшими якорями сторон; Infinity, если у стороны не осталось флотов */
function sideDist(w: World, b: Battle): number {
  let best = Infinity
  for (const fa of b.sides[0].fleetIds) {
    const a = fleetById(w, fa)
    if (!a) continue
    anchorAbs(w, a, tmpA)
    for (const fb of b.sides[1].fleetIds) {
      const c = fleetById(w, fb)
      if (!c) continue
      anchorAbs(w, c, tmpB)
      const d = Math.hypot(tmpA.x - tmpB.x, tmpA.y - tmpB.y)
      if (d < best) best = d
    }
  }
  return best
}

function sideDStar(w: World, side: BattleSide): number {
  let d = Infinity
  for (const f of fleetsOf(w, side)) d = Math.min(d, f.dStar)
  return d
}

export function updatePhase(w: World, b: Battle): void {
  if (b.phase === 'over') return
  const d = sideDist(w, b)
  const retreating = (s: BattleSide) => s.state === 'retreat' || s.state === 'flee'
  if (b.phase !== 'retreat' && (retreating(b.sides[0]) || retreating(b.sides[1]))) {
    setPhase(w, b, 'retreat', 'одна из сторон отходит')
    return
  }
  if (b.phase === 'approach' && d <= BATTLE.engage) setPhase(w, b, 'engage', `дистанция ${Math.round(d)}`)
  if (b.phase === 'engage') {
    const m = memOf(w, b)
    let still = true
    for (const s of b.sides) for (const f of fleetsOf(w, s)) if (f.speed > BATTLE.settleSpeed) still = false
    if (!still) m.settledSince = null
    else if (m.settledSince === null) m.settledSince = w.t
    const settled = m.settledSince !== null && w.t - m.settledSince >= BATTLE.settleT
    if (d <= Math.min(sideDStar(w, b.sides[0]), sideDStar(w, b.sides[1])) || settled) {
      b.lineSince = w.t
      setPhase(w, b, 'line', `дистанция ${Math.round(d)}`)
    }
  }
  if (b.phase === 'line') {
    const inBand = b.pressure >= BATTLE.pressureLo && b.pressure <= BATTLE.pressureHi
    if (inBand) {
      if (b.bandSince === null) b.bandSince = w.t
    } else b.bandSince = null
    const out = b.sides[0].outOfAmmo || b.sides[1].outOfAmmo
    const stale = w.t - b.lineSince >= BATTLE.lineTimeout && b.bandSince !== null && w.t - b.bandSince >= BATTLE.bandHold
    if (out || stale) {
      b.decisionDeadline = w.t + BATTLE.decisionT
      setPhase(w, b, 'decision', out ? 'боезапас на исходе, нужно решение' : 'бой затянулся, нужно решение')
    }
  }
}

// ---------- давление ----------

/** текущий слот кольца hullDealt */
function ringSlot(w: World): number {
  return Math.floor(w.tick / PER_S) % BATTLE.pressureWindow
}

/** корпус снят с target: засчитывается другой стороне в кольцо давления (зовёт damage.ts) */
export function noteHullLoss(w: World, b: Battle, target: Ship, dealt: number): void {
  if (target.fleetId === null || dealt <= 0) return
  const other = (1 - sideOfFleet(b, target.fleetId)) as 0 | 1
  const ring = b.sides[other].hullDealt
  const k = ringSlot(w)
  ring[k] = (ring[k] ?? 0) + dealt
}

/** попадание настоящей ракетой (не приманкой) — для метрики «долетело» (зовёт damage.ts) */
export function noteMissileHit(w: World, target: Ship, damage: number): void {
  if (damage <= PROJ.decoy.damage) return
  const b = battleOf(w, target)
  if (b) b.metrics.missilesHit++
}

function sumRing(r: number[]): number {
  let s = 0
  for (let i = 0; i < r.length; i++) s += r[i]
  return s
}

export function updatePressure(w: World, b: Battle): void {
  const m = memOf(w, b)
  const W = BATTLE.pressureWindow
  const sec = Math.floor(w.tick / PER_S)
  if (sec - m.sec >= W) {
    for (const s of b.sides) s.hullDealt.fill(0)
    m.sec = sec
  }
  while (m.sec < sec) {
    m.sec++
    for (const s of b.sides) s.hullDealt[m.sec % W] = 0
  }
  if (w.t - b.startT < BATTLE.pressureWindow) {
    b.pressure = 1
    return
  }
  const mine = sumRing(b.sides[0].hullDealt)
  const theirs = sumRing(b.sides[1].hullDealt)
  b.pressure = Math.min(BATTLE.pressureCap, (mine + BATTLE.pressureEps) / (theirs + BATTLE.pressureEps))
  const cand: -1 | 0 | 1 = b.pressure >= BATTLE.pressureHi ? 1 : b.pressure <= BATTLE.pressureLo ? -1 : 0
  if (cand === b.pressureState) {
    m.cand = cand
    b.pressureSince = w.t
  } else {
    if (m.cand !== cand) {
      m.cand = cand
      b.pressureSince = w.t
    } else if (w.t - b.pressureSince >= BATTLE.pressureHold) {
      b.pressureState = cand
      if (cand !== 0) {
        if (m.lastPresser !== 0 && m.lastPresser !== cand) {
          b.pressureFlips++
          b.metrics.pressureFlips = b.pressureFlips
        }
        m.lastPresser = cand
        m.pendingD = cand
        const civ = civById(w, b.sides[cand === 1 ? 0 : 1].civ)
        logBattle(w, b, 'pressure', `${civ ? civ.name : '?'} давит: ${b.pressure.toFixed(2)}`, cand === 1 ? 0 : 1)
      } else m.pendingD = 0
    }
  }
  // давящий сближается: D* −pressDStar, не чаще dStarCooldown; теснимый пятится по приказу адмирала (задача 10)
  if (m.pendingD !== 0) {
    const side = b.sides[m.pendingD === 1 ? 0 : 1]
    let changed = false
    for (const f of fleetsOf(w, side)) {
      if (w.t - f.dStarSince < BATTLE.dStarCooldown) continue
      const next = Math.max(BATTLE.dStar.charge, f.dStar - BATTLE.pressDStar)
      f.dStarSince = w.t
      if (next === f.dStar) continue
      f.dStar = next
      changed = true
    }
    if (changed) {
      b.metrics.dStarChanges++
      logBattle(w, b, 'pressure', `D* сближения ${sideDStar(w, side)}`, m.pendingD === 1 ? 0 : 1)
      m.pendingD = 0
    }
  }
}

// ---------- сплочённость ----------

/** обойдён: чужой корабль с оружием (не машина) в секторе > flankedAngle от курса рамки ближе flankedRange */
function flanked(w: World, b: Battle, i: 0 | 1): boolean {
  const enemy = b.sides[(1 - i) as 0 | 1]
  const ang = (BATTLE.flankedAngle * Math.PI) / 180
  for (const f of fleetsOf(w, b.sides[i])) {
    const a = anchorAbs(w, f, tmpA)
    for (const g of fleetsOf(w, enemy)) {
      for (const id of g.shipIds) {
        const s = liveShip(w, id)
        if (!s || !s.combat || isCraft(s.kind) || !isCombatKind(s.kind) || !CLASSES[s.kind].weapons.length) continue
        const dx = s.pos.x - a.x
        const dy = s.pos.y - a.y
        if (dx * dx + dy * dy > BATTLE.flankedRange * BATTLE.flankedRange) continue
        let d = Math.atan2(dy, dx) - f.heading
        d = Math.abs(Math.atan2(Math.sin(d), Math.cos(d)))
        if (d > ang) return true
      }
    }
  }
  return false
}

export function updateCohesion(w: World, b: Battle, i: 0 | 1): void {
  updateStrength(w, b)
  const side = b.sides[i]
  const sm = memOf(w, b).sides[i]
  const C = BATTLE.cohesion
  const fleets = fleetsOf(w, side)
  // потери
  if (side.lossValue > sm.lossPrev) sm.lastLossT = w.t
  sm.lossPrev = side.lossValue
  // флагман: погиб текущий — минус; идёт передача флага — меньше
  if (sm.flagId !== null && !liveShip(w, sm.flagId)) {
    sm.adj -= fleets.length && fleets[0].flagSince !== null ? C.flagshipPassed : C.flagship
    sm.flagLost = true
    sm.flagId = null
  }
  if (fleets.length) {
    const fl = fleets[0].flagshipId
    if (fl !== null && fl !== sm.flagId && liveShip(w, fl)) sm.flagId = fl
  }
  // носитель
  const carriers = countKind(w, side, 'carrier')
  if (carriers < sm.carriers) sm.adj -= (sm.carriers - carriers) * C.carrier
  sm.carriers = carriers
  // раз в секунду: обойдён, теснят, спокойствие
  if (w.tick % PER_S === 0 && b.phase !== 'approach') {
    if (flanked(w, b, i)) {
      sm.flankedFor++
      if (sm.flankedFor >= BATTLE.flankedT) {
        sm.adj -= (C.flanked * 1) / BATTLE.flankedT
        sm.flankedTotal++
      }
    } else sm.flankedFor = 0
    const presser = i === 0 ? -1 : 1
    if (b.pressureState === presser) sm.adj -= C.pressed / BATTLE.flankedT
    if (w.t - sm.lastLossT >= C.calmAfter) sm.adj += C.calm / BATTLE.flankedT
  }
  const lost = side.value0 > 0 ? side.lossValue / side.value0 : 0
  const v = Math.max(0, Math.min(sm.start, sm.start - lost * C.lostMul + sm.adj))
  for (const f of fleets) f.cohesion = v
}

// ---------- часы: залпы ----------

/** новые ракеты этого шага → число пущенных и «последний залп» стороны */
function scanMissiles(w: World): void {
  const n = Math.min(PROJ.pool.missile, w.projectiles.length)
  for (let i = 0; i < n; i++) {
    const p = w.projectiles[i]
    if (!p.alive || p.bornT !== w.t) continue
    for (let k = 0; k < w.battles.length; k++) {
      const b = w.battles[k]
      if (b.phase === 'over' || b.systemId !== p.systemId) continue
      const s: 0 | 1 | null = b.sides[0].civ === p.owner ? 0 : b.sides[1].civ === p.owner ? 1 : null
      if (s === null) continue
      b.metrics.missilesFired++
      b.sides[s].lastSalvoT = w.t
      b.lastVolleyT = w.t
      break
    }
  }
}

// ---------- метрики ----------

const near: number[] = []

export function collectMetrics(w: World, b: Battle): void {
  const me = b.metrics
  const m = memOf(w, b)
  me.maxQuiet = Math.max(me.maxQuiet, w.t - me.lastEventT)
  me.pressureFlips = b.pressureFlips
  me.pushOuts += w.pushOuts
  if (me.leaderAt60 === null && w.t - b.startT >= BATTLE.leaderAt) me.leaderAt60 = b.sides[0].strength >= b.sides[1].strength ? 0 : 1
  const inLine = b.phase === 'line' || b.phase === 'decision'
  const grid = w.grids[b.systemId]
  const spot: Vec = tmpB
  for (let i = 0; i < 2; i++) {
    for (const f of fleetsOf(w, b.sides[i])) {
      if (f.order === 'orbit') m.sides[i].orbit = true
      for (let k = 0; k < f.shipIds.length; k++) {
        const s = liveShip(w, f.shipIds[k])
        if (!s || !s.combat || s.transit || isCraft(s.kind)) continue
        // скорость: изменение за шаг ≤ accel · dt
        let pv = m.vel.get(s.id)
        if (pv) {
          if (Math.hypot(s.vel.x - pv.x, s.vel.y - pv.y) > SHIP_KINDS[s.kind].accel * SIM_DT + 1e-6) me.minSpeedViolations++
          pv.x = s.vel.x
          pv.y = s.vel.y
        } else {
          pv = { x: s.vel.x, y: s.vel.y }
          m.vel.set(s.id, pv)
        }
        // капитальные в линии: вне слота и медленнее slowSpeed
        if (inLine && isCapital(s.kind) && s.combat.slot) {
          me.capitalLineT += SIM_DT
          slotWorld(w, f, s.combat.slot, spot)
          if (Math.hypot(spot.x - s.pos.x, spot.y - s.pos.y) > BATTLE.offSlot) me.capitalOffSlotT += SIM_DT
          if (Math.hypot(s.vel.x - (f.anchorVel.x), s.vel.y - f.anchorVel.y) < BATTLE.slowSpeed) me.capitalSlowT += SIM_DT
        }
        // зазор корпусов (от борта до борта) до любого не-машины
        const idx = w.shipIndex.get(s.id)
        if (idx === undefined) continue
        const ra = SHIP_KINDS[s.kind].length / 2
        for (const j of grid.query(s.pos.x, s.pos.y, 3 * SHIP_KINDS[s.kind].length + 40, near)) {
          if (j <= idx) continue
          const o = w.ships[j]
          if (!o || !o.alive || o.systemId !== b.systemId || isCraft(o.kind) || !isCombatKind(o.kind)) continue
          const d = Math.hypot(s.pos.x - o.pos.x, s.pos.y - o.pos.y) - ra - SHIP_KINDS[o.kind].length / 2
          if (d < me.minHullDist) me.minHullDist = d
        }
      }
    }
  }
}

// ---------- вердикт и конец боя ----------

const KILLER_NAME: Partial<Record<string, string>> = {
  corvette: 'корветы', torpedo: 'катера', frigate: 'фрегаты', battleship: 'линкоры', carrier: 'носители',
  interceptor: 'перехватчики', bomber: 'бомбардировщики',
}

const FACTOR_TEXT: Record<string, string> = {
  'бегство': 'противник побежал',
  'флагман': 'у противника потерян флагман',
  'обход': 'обход с фланга',
  'орбита': 'огонь с орбиты',
  'пояс': 'бой в поясе',
  'зенитки': 'ракеты сбили зенитками',
  'боезапас': 'у противника кончился боезапас',
  'класс-убийца': '',
  'число': 'перевес в силах',
  'ничья': 'никто не уступил',
}

export interface Verdict {
  text: string
  factors: string[]
  /** победившая сторона или null при ничьей */
  winner: 0 | 1 | null
}

function winnerOf(b: Battle): 0 | 1 | null {
  const [s0, s1] = b.sides
  const out = (s: BattleSide) => s.state === 'retreat' || s.state === 'flee'
  if (out(s0) && !out(s1)) return 1
  if (out(s1) && !out(s0)) return 0
  if (s0.strength <= 0 && s1.strength <= 0) return null
  if (s0.strength <= 0) return 1
  if (s1.strength <= 0) return 0
  if (s0.strength >= s1.strength * BATTLE.verdictWin) return 0
  if (s1.strength >= s0.strength * BATTLE.verdictWin) return 1
  return null
}

export function verdictOf(w: World, b: Battle): Verdict {
  updateStrength(w, b)
  const m = memOf(w, b)
  const win = winnerOf(b)
  const names = b.sides.map((s) => civById(w, s.civ)?.name ?? '?')
  const place = placeName(w, b)
  const loss = `Потери: ${names[0]} ${Math.round(b.sides[0].lossValue)} кр, ${names[1]} ${Math.round(b.sides[1].lossValue)} кр`
  if (win === null) {
    return { text: `Бой у ${place} — без результата. ${loss}`, factors: ['ничья'], winner: null }
  }
  const lose = (1 - win) as 0 | 1
  const W = b.sides[win]
  const L = b.sides[lose]
  const factors: string[] = []
  if (L.state === 'retreat' || L.state === 'flee') factors.push('бегство')
  if (m.sides[lose].flagLost) factors.push('флагман')
  if (m.sides[lose].flankedTotal >= BATTLE.flankedT) factors.push('обход')
  if (W.role === 'defender' && m.sides[win].orbit) factors.push('орбита')
  if (W.role === 'defender' && m.inBelt) factors.push('пояс')
  const mf = b.metrics.missilesFired
  if (mf >= BATTLE.verdictFlakMin && b.metrics.missilesHit / mf <= BATTLE.verdictFlak) factors.push('зенитки')
  if (L.outOfAmmo && !W.outOfAmmo) factors.push('боезапас')
  // класс-убийца: чей класс снял больше всего корпуса (из классов победителя)
  let killer = ''
  let top = 0
  for (const key of Object.keys(b.damage)) {
    const kind = key.split('→')[0]
    if (!W.classes0 || !(kind in W.classes0)) continue
    if (b.damage[key] > top) {
      top = b.damage[key]
      killer = kind
    }
  }
  if (killer) factors.push('класс-убийца')
  if (W.strength0 >= L.strength0 * BATTLE.verdictNumber) factors.push('число')
  const parts: string[] = []
  for (const f of factors) {
    if (f === 'класс-убийца') parts.push(`${KILLER_NAME[killer] ?? killer} сняли больше всего корпуса`)
    else if (FACTOR_TEXT[f]) parts.push(FACTOR_TEXT[f])
    if (parts.length >= 2) break
  }
  const why = parts.length ? parts.join(' и ') : 'перевес на поле боя'
  const head = W.role === 'defender' ? `${names[win]} удержал ${place}` : `${names[win]} одолел ${names[lose]} у ${place}`
  return { text: `${head}: ${why}. ${loss}`, factors, winner: win }
}

export function finishBattle(w: World, b: Battle): void {
  if (b.phase === 'over') return
  const v = verdictOf(w, b)
  b.phase = 'over'
  b.phaseSince = w.t
  b.overAt = w.t
  b.verdict = v.text
  b.factors = v.factors
  for (let i = 0; i < 2; i++) {
    for (const f of fleetsOf(w, b.sides[i])) {
      f.battleId = null
      f.decided = false
      for (const id of f.shipIds) {
        const s = liveShip(w, id)
        if (!s || !s.combat) continue
        s.combat.battles++
        s.combat.rank = Math.min(BATTLE.rankMax, s.combat.rank + 1) as 0 | 1 | 2 | 3
      }
      if (v.winner === i) {
        const adm = admiralOf(w, f)
        if (adm) {
          adm.fame = Math.min(BATTLE.fameMax, adm.fame + BATTLE.fameWin)
          adm.wins++
        }
      }
    }
  }
  logBattle(w, b, 'verdict', v.text)
  pushEvent(w, {
    kind: 'verdict',
    pri: 0,
    text: v.text,
    civs: [b.sides[0].civ, b.sides[1].civ],
    at: b.planetId ? { system: b.systemId, planet: b.planetId, battle: b.id } : { system: b.systemId, battle: b.id },
  })
  mems.delete(b)
}

export function checkOver(w: World, b: Battle): void {
  if (sideDist(w, b) > BATTLE.overRange) {
    if (b.noEnemySince === null) b.noEnemySince = w.t
    else if (w.t - b.noEnemySince >= BATTLE.overAfter) finishBattle(w, b)
  } else b.noEnemySince = null
}

// ---------- шаг боёв ----------

export function stepBattles(w: World): void {
  detectBattles(w)
  for (let i = 0; i < w.battles.length; i++) {
    const b = w.battles[i]
    if (b.phase === 'over') continue
    updateStrength(w, b)
    updatePhase(w, b)
    updatePressure(w, b)
  }
  // выбор целей и выстрелы (включая залп ряда) — один раз на мир
  pickTargets(w)
  fireWeapons(w)
  scanMissiles(w)
  for (let i = 0; i < w.battles.length; i++) {
    const b = w.battles[i]
    if (b.phase === 'over') continue
    updateCohesion(w, b, 0)
    updateCohesion(w, b, 1)
    collectMetrics(w, b)
    checkOver(w, b)
  }
}

// ---------- матрица ожидаемого исхода (§8.5) ----------

const KIND_INDEX = new Map<CombatKind, number>()
COMBAT_KINDS.forEach((k, i) => KIND_INDEX.set(k, i))

function rowOf(kind: CombatKind): number {
  switch (CLASSES[kind].role) {
    case 'line': return FRAME.rows.line
    case 'frigate': return FRAME.rows.frigate
    case 'rear': return FRAME.rows.rear
    case 'boat': return FRAME.rows.boat
    case 'screen': return FRAME.ovalCx
    default: return 0
  }
}

function groupOf(kind: CombatKind): 'capital' | 'small' | 'craft' {
  return isCraft(kind) ? 'craft' : isCapital(kind) ? 'capital' : 'small'
}

interface Pool {
  hp: number[]
  shielded: number[]
  count: number[]
  total: number
}

function poolOf(ships: Ship[], shieldMul: number): Pool {
  const n = COMBAT_KINDS.length
  const p: Pool = { hp: new Array<number>(n).fill(0), shielded: new Array<number>(n).fill(0), count: new Array<number>(n).fill(0), total: 0 }
  for (const s of ships) {
    const c = s.combat
    if (!s.alive || !c || !isCombatKind(s.kind)) continue
    const i = KIND_INDEX.get(s.kind)!
    const hp = Math.max(0, c.hull) + Math.max(0, c.shield) * shieldMul
    p.hp[i] += hp
    p.count[i]++
    if (c.shield > 0) p.shielded[i]++
    p.total += hp
  }
  return p
}

/** доля ракет и торпед, дошедших до цели сквозь ПВО: pd — корветы + ½ линкоров в ПРО, volley — ракет в залпе */
export function pdShare(pd: number, volley: number): number {
  if (volley <= 0) return 1
  const v = 1 - (BATTLE.matrixPdK * pd) / (volley / 4)
  return Math.max(BATTLE.matrixPdMin, Math.min(1, v))
}

function pdPower(ships: Ship[]): number {
  let pd = 0
  for (const s of ships) {
    if (!s.alive || !s.combat) continue
    if (s.kind === 'corvette') pd += 1
    else if (s.kind === 'battleship' && turretsOk(s)) pd += 0.5
  }
  return pd
}

function volleyOf(ships: Ship[]): number {
  let n = 0
  for (const s of ships) if (s.alive && s.combat && s.kind === 'frigate' && s.combat.ammo > 0 && canVolley(s)) n++
  return n
}

/** номинальный dps одного ствола с учётом состояния корабля; машины и торпеды — по часам боя */
function nominal(ship: Ship, wp: Weapon): number {
  const c = ship.combat
  const fm = ship.combat ? fireMul(ship) : 1
  switch (wp.kind) {
    case 'beam': {
      const n = Math.min(wp.count, beamsOf(ship))
      return (wp.damage * n) / wp.cooldown * fm
    }
    case 'turret':
      return turretsOk(ship) ? (wp.damage * wp.count) / wp.cooldown * fm : 0
    case 'missile': {
      if (!c || c.ammo <= 0 || !canVolley(ship)) return 0
      return (wp.damage / wp.cooldown) * (c.ammo / CLASSES.frigate.ammo) * fm
    }
    case 'lightTorpedo':
      return c && c.ammo > 0 ? (wp.damage * c.ammo) / BATTLE.matrixBoatT * fm : 0
    case 'torpedo':
      return c && c.ammo > 0 ? (wp.damage / WING.waveT) * BATTLE.matrixAirborne : 0
    default:
      return ((wp.damage * wp.count) / wp.cooldown) * fm
  }
}

function vsPool(wp: Weapon, selfKind: CombatKind, pool: Pool, dStar: number): number {
  if (pool.total <= 0) return 0
  const selfRow = rowOf(selfKind)
  const flies = isCraft(selfKind)
  let sum = 0
  for (let ik = 0; ik < COMBAT_KINDS.length; ik++) {
    if (pool.hp[ik] <= 0) continue
    const k = COMBAT_KINDS[ik]
    let mul = MATRIX_MUL[wp.kind][groupOf(k)]
    if (mul <= 0) continue
    if (MATRIX_SHIELD_BLOCK.includes(wp.kind)) mul *= 1 - pool.shielded[ik] / pool.count[ik]
    let reach = 1
    if (!flies && !isCraft(k)) {
      const dist = dStar - selfRow - rowOf(k)
      if (dist > wp.range) reach = MATRIX_CLOSE.includes(wp.kind) ? BATTLE.matrixCloseCoef : 0
    }
    sum += (pool.hp[ik] / pool.total) * mul * reach
  }
  return sum
}

/** суммарный эффективный dps моих кораблей по составу врага; pd — доля дошедших ракет/торпед */
function totalDps(mine: Ship[], pool: Pool, dStar: number, pd: number): number {
  let sum = 0
  for (const s of mine) {
    const c = s.combat
    if (!s.alive || !c || !isCombatKind(s.kind)) continue
    for (const wp of CLASSES[s.kind].weapons) {
      const nom = nominal(s, wp)
      if (nom <= 0) continue
      sum += nom * vsPool(wp, s.kind, pool, dStar) * (MATRIX_PD.includes(wp.kind) ? pd : 1)
    }
    // ангар без машин в списке: крыло по умолчанию (когда появятся сами машины — считаются как корабли)
    if (s.kind === 'carrier' && c.hangar && c.hangar.craft === 0 && c.modules.hangar !== 0) {
      for (const part of DEFAULT_WING) {
        const wp = CLASSES[part.kind].weapons[0]
        const nom = part.kind === 'bomber' ? (wp.damage / WING.waveT) * BATTLE.matrixAirborne : (wp.damage * wp.count) / wp.cooldown
        sum += part.n * nom * vsPool(wp, part.kind, pool, dStar) * (MATRIX_PD.includes(wp.kind) ? pd : 1)
      }
    }
  }
  return sum
}

/**
 * Ожидаемый исход боя с точки зрения mine: 1 — поровну, > 1 — выгоднее мне (раздел 8.5, шаги 1–5).
 * Одна функция для отхода, режиссёра и бота.
 */
export function expectedOutcome(
  _w: World | null, mine: Ship[], theirs: Ship[], dStar: number, opts: { orbitA?: boolean; orbitB?: boolean; pdB?: number } = {},
): number {
  const poolA = poolOf(mine, opts.orbitA ? BATTLE.orbitShield : 1)
  const poolB = poolOf(theirs, opts.orbitB ? BATTLE.orbitShield : 1)
  const pdA = pdShare(pdPower(mine), volleyOf(theirs))
  const pdB = pdShare(opts.pdB ?? pdPower(theirs), volleyOf(mine))
  const myDps = totalDps(mine, poolB, dStar, pdB)
  const theirDps = totalDps(theirs, poolA, dStar, pdA)
  const cap = BATTLE.outcomeCap
  if (myDps <= 0 && theirDps <= 0) return 1
  if (theirDps <= 0) return cap
  if (myDps <= 0) return 1 / cap
  const tMine = poolA.total / theirDps
  const tTheirs = poolB.total / myDps
  return Math.max(1 / cap, Math.min(cap, Math.pow(tMine / tTheirs, BATTLE.matrixExp)))
}

function shipsOf(w: World, f: Fleet): Ship[] {
  const out: Ship[] = []
  for (const id of f.shipIds) {
    const s = liveShip(w, id)
    if (s) out.push(s)
  }
  return out
}

/** исход для флота против флота: орбита учитывается по приказу `orbit` */
export function fleetOutcome(w: World, fleet: Fleet, enemy: Fleet, dStar: number): number {
  return expectedOutcome(w, shipsOf(w, fleet), shipsOf(w, enemy), dStar, { orbitA: fleet.order === 'orbit', orbitB: enemy.order === 'orbit' })
}
