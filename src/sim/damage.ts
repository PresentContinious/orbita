// Урон (спека 2А, §9.2, §10.2–10.4): щит до нуля, модули, горение, гибель, обломки и лом.
// Корпус и щит меняются только здесь.
import { CLASSES, isCapital, isCraft, isCombatKind, type WeaponKind } from './classes'
import { BATTLE, DAMAGE, PROJ } from './combat-config'
import { SHIP_KINDS, SIM_DT, type ShipKind } from './config'
import { battleOf, combatRng, logBattle } from './battle'
import { earn } from './economy'
import { pushEvent } from './events'
import { fleetById, removeFromFleet } from './fleet'
import { ZERO } from './math'
import { setDestination, type Goal } from './nav'
import { capitalOf, civById } from './query'
import type { Battle, Debris, Module, Projectile, Ship, World } from './types'

export type DamageSource = WeaponKind | 'beam' | 'collision'

const KIND_NAME: Partial<Record<ShipKind, string>> = {
  corvette: 'Корвет', torpedo: 'Катер', frigate: 'Фрегат', battleship: 'Линкор', carrier: 'Носитель',
  interceptor: 'Перехватчик', bomber: 'Бомбардировщик', trooper: 'Десантник', supply: 'Снабженец', scout: 'Разведчик',
}

const MODULE_TEXT: Record<Module, string> = {
  engines: 'двигатели повреждены',
  turrets: 'башни повреждены',
  hangar: 'ангар повреждён',
  mainGun: 'главный калибр выбит',
  launchers: 'пусковые повреждены',
}

/** отображаемое имя корабля: класс и номер */
export function shipName(ship: Ship): string {
  return (KIND_NAME[ship.kind] ?? ship.kind) + ' ' + ship.id
}

/** сторона корабля в бою: 0 или 1 */
function sideIn(b: Battle, ship: Ship): 0 | 1 {
  return ship.fleetId !== null && b.sides[0].fleetIds.includes(ship.fleetId) ? 0 : 1
}

function shipAt(w: World, id: number): Ship | undefined {
  const i = w.shipIndex.get(id)
  return i === undefined ? undefined : w.ships[i]
}

// ---------- попадание ----------

/** корпусный урон и учёт в Battle.damage; убивает при hull ≤ 0 */
function hullLoss(w: World, target: Ship, amount: number, killerKey: string, source: DamageSource, shooterId: number): void {
  const c = target.combat!
  const dealt = Math.min(amount, Math.max(0, c.hull))
  c.hull -= amount
  const b = battleOf(w, target)
  if (b) {
    const key = killerKey + '→' + target.kind
    b.damage[key] = (b.damage[key] ?? 0) + dealt
  }
  if (c.hull <= 0) killShip(w, target, source, shooterId)
}

export function applyHit(w: World, target: Ship, damage: number, source: DamageSource, shooterId: number): void {
  if (!target.alive) return
  const c = target.combat
  if (!c) {
    target.alive = false
    return
  }
  let rest = damage
  if (c.shield > 0) {
    const absorbed = Math.min(c.shield, rest)
    c.shield -= absorbed
    rest -= absorbed
    if (w.fxBattle.length < PROJ.tracersMax) {
      w.fxBattle.push({ kind: 'shield', systemId: target.systemId, x: target.pos.x, y: target.pos.y, r: SHIP_KINDS[target.kind].length })
    }
    if (c.shield <= 0 && isCapital(target.kind)) {
      const b = battleOf(w, target)
      if (b) logBattle(w, b, 'shield', `Щит «${shipName(target)}» пробит`, sideIn(b, target), target.id)
    }
  }
  c.lastHitT = w.t
  if (rest <= 0) return
  const shooter = shipAt(w, shooterId)
  hullLoss(w, target, rest, shooter ? shooter.kind : source, source, shooterId)
  if (!target.alive) return
  const key = source === 'lightTorpedo' ? 'torpedo' : source
  if (source === 'torpedo' || source === 'lightTorpedo' || source === 'missile') rollModule(w, target, DAMAGE.moduleChance[key])
}

/** луч догорел: один бросок на модуль по суммарному урону в одну цель */
export function onBeamEnd(w: World, proj: Projectile): void {
  if (proj.dealt < DAMAGE.beamRollMin) return
  const t = shipAt(w, proj.dealtTo)
  if (!t || !t.alive || !t.combat || t.combat.shield > 0) return
  rollModule(w, t, DAMAGE.moduleChance.beam)
}

const alive: Module[] = []

/** бросок на выбитый узел: вероятность p, узел равновероятно из ещё целых */
export function rollModule(w: World, ship: Ship, p: number): void {
  const c = ship.combat
  if (!c) return
  const rng = combatRng(w, ship)
  if (!rng.chance(p)) return
  alive.length = 0
  for (const m of Object.keys(c.modules) as Module[]) if (c.modules[m] === 1) alive.push(m)
  if (!alive.length) return
  const m = alive[rng.int(0, alive.length - 1)]
  c.modules[m] = 0
  const b = battleOf(w, ship)
  if (b) logBattle(w, b, 'module', `«${shipName(ship)}»: ${MODULE_TEXT[m]}`, sideIn(b, ship), ship.id)
}

// ---------- влияние состояния на корабль ----------

export function speedMul(ship: Ship): number {
  const c = ship.combat
  if (!c) return 1
  let m = 1
  if (c.modules.engines === 0) m *= DAMAGE.engineMul
  if (c.burning !== null) m *= DAMAGE.burnSpeedMul
  return m
}

export function fireMul(ship: Ship): number {
  return ship.combat && ship.combat.burning !== null ? DAMAGE.burnFireMul : 1
}

export function turretsOk(ship: Ship): boolean {
  return !ship.combat || ship.combat.modules.turrets !== 0
}

/** лучей у корабля: 1 при выбитом главном калибре */
export function beamsOf(ship: Ship): number {
  if (!isCombatKind(ship.kind)) return 0
  let n = 0
  for (const wp of CLASSES[ship.kind].weapons) if (wp.kind === 'beam') n += wp.count
  return ship.combat && ship.combat.modules.mainGun === 0 ? Math.min(1, n) : n
}

export function canLaunch(ship: Ship): boolean {
  return !ship.combat || ship.combat.modules.hangar !== 0
}

export function canVolley(ship: Ship): boolean {
  return !ship.combat || ship.combat.modules.launchers !== 0
}

// ---------- состояние боя: щит, горение ----------

function regenMul(w: World, ship: Ship): number {
  if (ship.fleetId === null) return 1
  const f = fleetById(w, ship.fleetId)
  return f && f.order === 'orbit' ? BATTLE.orbitRegenMul : 1
}

export function stepCombatState(w: World): void {
  for (let i = 0; i < w.ships.length; i++) {
    const ship = w.ships[i]
    const c = ship.combat
    if (!ship.alive || !c) continue
    if (c.shield < c.shieldMax && w.t - c.lastHitT >= DAMAGE.shieldDelay) {
      c.shield = Math.min(c.shieldMax, c.shield + c.shieldRegen * regenMul(w, ship) * SIM_DT)
    }
    const threshold = DAMAGE.burnBelow * c.hullMax
    if (c.burning === null) {
      if (c.hull < threshold) {
        if (!c.burnedOut) c.burning = w.t
      } else if (c.burnedOut) c.burnedOut = false
    }
    if (c.burning !== null) {
      if (w.t - c.burning >= DAMAGE.burnT) {
        c.burning = null
        c.burnedOut = true
      } else {
        hullLoss(w, ship, DAMAGE.burnRate * c.hullMax * SIM_DT, 'огонь', 'collision', 0)
      }
    }
  }
}

// ---------- гибель и обломки ----------

export function killShip(w: World, ship: Ship, _source: DamageSource, _shooterId: number): void {
  if (!ship.alive) return
  ship.alive = false
  if (ship.combat) ship.combat.hull = Math.max(0, ship.combat.hull)
  spawnDebris(w, ship)
  if (w.fxBattle.length < PROJ.tracersMax) {
    w.fxBattle.push({ kind: 'boom', systemId: ship.systemId, x: ship.pos.x, y: ship.pos.y, r: SHIP_KINDS[ship.kind].length * 2 })
  }
  const b = battleOf(w, ship)
  if (!isCraft(ship.kind)) {
    const sys = w.galaxy.systems[ship.systemId]
    pushEvent(w, {
      kind: 'shipLost',
      pri: 1,
      text: `«${shipName(ship)}» погиб у ${sys ? sys.name : '?'}`,
      civs: [ship.owner],
      at: b ? { system: ship.systemId, battle: b.id } : { system: ship.systemId },
    })
    if (b) logBattle(w, b, 'death', `«${shipName(ship)}» погиб`, sideIn(b, ship), ship.id)
  }
  if (ship.fleetId !== null) {
    const fleet = fleetById(w, ship.fleetId)
    if (fleet) removeFromFleet(w, fleet, ship.id)
  }
}

export function spawnDebris(w: World, ship: Ship): Debris {
  const d: Debris = {
    id: w.nextId++,
    systemId: ship.systemId,
    pos: { x: ship.pos.x, y: ship.pos.y },
    value: DAMAGE.debrisShare * ship.price,
    owner: ship.owner,
    bornT: w.t,
    holder: null,
    holdCiv: null,
    holdSince: 0,
    r: SHIP_KINDS[ship.kind].length * DAMAGE.debrisRMul,
    kind: ship.kind,
  }
  w.debris.push(d)
  return d
}

const near: number[] = []
const present: number[] = []

/** раз в секунду: истечение, держатель поля */
export function stepDebris(w: World): void {
  if (w.tick % 10 !== 0) return
  const R2 = BATTLE.overRange * BATTLE.overRange
  let j = 0
  for (let i = 0; i < w.debris.length; i++) {
    const d = w.debris[i]
    if (w.t - d.bornT >= DAMAGE.debrisLife) {
      continue
    }
    w.debris[j++] = d
    present.length = 0
    w.grids[d.systemId].query(d.pos.x, d.pos.y, BATTLE.overRange, near)
    for (let k = 0; k < near.length; k++) {
      const s = w.ships[near[k]]
      if (!s || !s.alive || s.transit || s.systemId !== d.systemId) continue
      if ((s.pos.x - d.pos.x) ** 2 + (s.pos.y - d.pos.y) ** 2 > R2) continue
      if (present.indexOf(s.owner) < 0) present.push(s.owner)
    }
    if (present.length >= 2) {
      d.holder = null
      d.holdCiv = null
    } else if (present.length === 1) {
      const civ = present[0]
      if (d.holder === civ) continue
      if (d.holdCiv !== civ) {
        d.holdCiv = civ
        d.holdSince = w.t
      } else if (w.t - d.holdSince >= DAMAGE.debrisHoldAfter) {
        d.holder = civ
        d.holdCiv = null
      }
    } else d.holdCiv = null
  }
  w.debris.length = j
}

// ---------- лом ----------

function goHome(w: World, ship: Ship): void {
  const civ = civById(w, ship.owner)
  const home = civ ? capitalOf(w, civ) : null
  if (!home) {
    ship.alive = false
    return
  }
  ship.mission = { type: 'return', planetId: home.id }
  ship.route = []
}

/** цель миссии salvage — обломок; сбор salvageT секунд, потом earn(…, 'salvage') */
export function salvageGoal(w: World, ship: Ship): Goal | null {
  if (ship.mission.type !== 'salvage') return null
  const id = ship.mission.debrisId
  let idx = -1
  for (let i = 0; i < w.debris.length; i++) if (w.debris[i].id === id) idx = i
  if (idx < 0 || isCraft(ship.kind)) {
    goHome(w, ship)
    return null
  }
  const d = w.debris[idx]
  if (d.systemId !== ship.systemId) {
    setDestination(w, ship, d.systemId)
    return null
  }
  // отошёл дальше радиуса сбора — отсчёт начнётся заново
  if (ship.mission.startT !== null && Math.hypot(ship.pos.x - d.pos.x, ship.pos.y - d.pos.y) > d.r) ship.mission.startT = null
  return { pos: d.pos, vel: ZERO, frameR: 0, dockR: d.r, onReach: reachDebris }
}

function reachDebris(w: World, ship: Ship): void {
  if (ship.mission.type !== 'salvage') return
  const id = ship.mission.debrisId
  const start = ship.mission.startT
  if (start === null) {
    ship.mission.startT = w.t
    return
  }
  if (w.t - start < DAMAGE.salvageT) return
  for (let i = 0; i < w.debris.length; i++) {
    const d = w.debris[i]
    if (d.id !== id) continue
    const civ = civById(w, ship.owner)
    if (civ) {
      earn(civ, d.value, 'salvage')
      w.fx.push({ kind: 'income', t: w.t, systemId: d.systemId, x: d.pos.x, y: d.pos.y, amount: d.value })
    }
    w.debris.splice(i, 1)
    break
  }
  goHome(w, ship)
}
