// Оружие (спека 2А, §6, §8.1, §10.1): выбор целей расслоённо, сектора, выстрелы, залп ряда, каналы турелей.
// Цель основного оружия (индекс 0) хранится в combat.targetId: > 0 — id корабля, < 0 — снаряд в пуле (−(индекс + 1)).
// Второе оружие (турели линкора, автопушка фрегата) выбирает цель в момент выстрела.
import { CLASSES, isCapital, isCombatKind, isCraft, radiusOf, type CombatKind, type Weapon } from './classes'
import { BATTLE, HIT, PROJ } from './combat-config'
import { SHIP_KINDS, type ShipKind } from './config'
import { canVolley, beamsOf, fireMul, turretsOk } from './damage'
import { combatRng, logBattle } from './battle'
import { fleetById } from './fleet'
import { TAU } from './math'
import { fireBeam, fireMissile, fireTorpedo, hitProjectile, traceShot } from './projectiles'
import { shipById } from './ships'
import type { Fleet, Projectile, Ship, TargetPriority, World } from './types'

const DEG = Math.PI / 180
/** ранг сильнее любого расстояния */
const RANK = 1e12

let maxR = 0
for (const k of Object.keys(SHIP_KINDS) as ShipKind[]) maxR = Math.max(maxR, radiusOf(k))
/** запас запроса к сетке: самый большой корпус и смещение за шаг */
const QPAD = maxR + 20

const cands: number[] = []
const pcands: number[] = []
const order: Ship[] = []

// ---------- геометрия ----------

function angDiff(a: number, b: number): number {
  let d = (a - b) % TAU
  if (d > Math.PI) d -= TAU
  else if (d < -Math.PI) d += TAU
  return d
}

/** цель в секторе ±arc° от носа стрелка (180 — круговой) */
export function arcOk(ship: Ship, target: Ship, arc: number): boolean {
  if (arc >= 180) return true
  const c = ship.combat
  if (!c) return true
  const want = Math.atan2(target.pos.y - ship.pos.y, target.pos.x - ship.pos.x)
  return Math.abs(angDiff(want, c.heading)) <= arc * DEG
}

function reach(ship: Ship, t: Ship, range: number): boolean {
  const dx = t.pos.x - ship.pos.x
  const dy = t.pos.y - ship.pos.y
  const r = range + radiusOf(t.kind)
  return dx * dx + dy * dy <= r * r
}

function dist2(ship: Ship, t: Ship): number {
  const dx = t.pos.x - ship.pos.x
  const dy = t.pos.y - ship.pos.y
  return dx * dx + dy * dy
}

function foe(ship: Ship, t: Ship): boolean {
  return t.alive && !t.transit && t.combat !== null && t.owner !== ship.owner && t.systemId === ship.systemId
}

function fleetOf(w: World, ship: Ship): Fleet | undefined {
  return ship.fleetId === null ? undefined : fleetById(w, ship.fleetId)
}

function gather(w: World, ship: Ship, range: number): void {
  w.grids[ship.systemId].query(ship.pos.x, ship.pos.y, range + QPAD, cands)
}

function priorityClass(p: TargetPriority): CombatKind | null {
  return p === 'battleships' ? 'battleship' : p === 'frigates' ? 'frigate' : p === 'carriers' ? 'carrier' : null
}

// ---------- выбор целей по оружию ----------

/** зенитка: торпеда → ракета/приманка → машина → корпус; внутри класса ближайшая к якорю флота */
export function flakTarget(w: World, ship: Ship, wp: Weapon): number {
  const fleet = fleetOf(w, ship)
  const ax = fleet ? fleet.anchor.x : ship.pos.x
  const ay = fleet ? fleet.anchor.y : ship.pos.y
  let best = 0
  let bs = Infinity
  w.projGrids[ship.systemId].query(ship.pos.x, ship.pos.y, wp.range + PROJ.torpHitR + QPAD, pcands)
  for (let j = 0; j < pcands.length; j++) {
    const idx = pcands[j]
    const p = w.projectiles[idx]
    if (!p || !p.alive || p.kind === 'beam' || p.owner === ship.owner) continue
    const dx = p.x - ship.pos.x
    const dy = p.y - ship.pos.y
    const r = wp.range + PROJ.torpHitR
    if (dx * dx + dy * dy > r * r) continue
    const s = (p.kind === 'torpedo' ? 0 : RANK) + (p.x - ax) ** 2 + (p.y - ay) ** 2
    if (s < bs) {
      bs = s
      best = -(idx + 1)
    }
  }
  gather(w, ship, wp.range)
  for (let j = 0; j < cands.length; j++) {
    const t = w.ships[cands[j]]
    if (!t || !foe(ship, t) || !reach(ship, t, wp.range)) continue
    const s = (isCraft(t.kind) ? 2 : 3) * RANK + (t.pos.x - ax) ** 2 + (t.pos.y - ay) ** 2
    if (s < bs) {
      bs = s
      best = t.id
    }
  }
  return best
}

/** турели в режиме «завеса»: чужие корветы впереди (по курсу флота) → катера → ближайший корпус */
export function screenTarget(w: World, ship: Ship, wp: Weapon): number {
  const fleet = fleetOf(w, ship)
  const h = fleet ? fleet.heading : ship.combat ? ship.combat.heading : 0
  const fx = Math.cos(h)
  const fy = Math.sin(h)
  gather(w, ship, wp.range)
  let best = 0
  let bs = Infinity
  for (let j = 0; j < cands.length; j++) {
    const t = w.ships[cands[j]]
    if (!t || !foe(ship, t) || !reach(ship, t, wp.range)) continue
    const ahead = (t.pos.x - ship.pos.x) * fx + (t.pos.y - ship.pos.y) * fy > 0
    const rank = t.kind === 'corvette' && ahead ? 0 : t.kind === 'torpedo' ? 1 : 2
    const s = rank * RANK + dist2(ship, t)
    if (s < bs) {
      bs = s
      best = t.id
    }
  }
  return best
}

function beamValid(ship: Ship, t: Ship, wp: Weapon): boolean {
  return foe(ship, t) && reach(ship, t, wp.range) && arcOk(ship, t, wp.arc)
}

/** луч: класс по приоритету → цель группы метки → ближайший */
export function beamTarget(w: World, ship: Ship, wp: Weapon): number {
  const fleet = fleetOf(w, ship)
  const cls = fleet ? priorityClass(fleet.targetPriority) : null
  gather(w, ship, wp.range)
  let hasClass = false
  if (cls) {
    for (let j = 0; j < cands.length; j++) {
      const t = w.ships[cands[j]]
      if (t && t.kind === cls && beamValid(ship, t, wp)) {
        hasClass = true
        break
      }
    }
  }
  if (fleet && ship.kind === 'battleship') {
    const st = markState(w, fleet)
    let gi = -1
    for (let g = 0; g < st.groups.length && gi < 0; g++) if (st.groups[g].indexOf(ship.id) >= 0) gi = g
    if (gi >= 0) {
      const cur = shipById(w, st.targets[gi])
      if (cur && beamValid(ship, cur, wp)) return cur.id
      const group = st.groups[gi]
      let cx = 0
      let cy = 0
      let n = 0
      for (let k = 0; k < group.length; k++) {
        const m = shipById(w, group[k])
        if (m && m.alive) {
          cx += m.pos.x
          cy += m.pos.y
          n++
        }
      }
      if (n) {
        cx /= n
        cy /= n
      }
      let free: Ship | null = null
      let fd = Infinity
      let low: Ship | null = null
      let ls = Infinity
      for (let j = 0; j < cands.length; j++) {
        const t = w.ships[cands[j]]
        if (!t || !beamValid(ship, t, wp) || (hasClass && t.kind !== cls)) continue
        let taken = false
        for (let g = 0; g < st.targets.length; g++) if (g !== gi && st.targets[g] === t.id) taken = true
        const d = (t.pos.x - cx) ** 2 + (t.pos.y - cy) ** 2
        if (!taken && d < fd) {
          fd = d
          free = t
        }
        const sh = (t.combat ? t.combat.shield : 0) * 1e6 + d
        if (sh < ls) {
          ls = sh
          low = t
        }
      }
      const pick = free ?? low
      if (pick) {
        st.targets[gi] = pick.id
        return pick.id
      }
      return 0
    }
  }
  let best = 0
  let bd = Infinity
  for (let j = 0; j < cands.length; j++) {
    const t = w.ships[cands[j]]
    if (!t || !beamValid(ship, t, wp) || (hasClass && t.kind !== cls)) continue
    const d = dist2(ship, t)
    if (d < bd) {
      bd = d
      best = t.id
    }
  }
  return best
}

/** ракета: класс по приоритету, ближайший досягаемый */
export function missileTarget(w: World, ship: Ship, wp: Weapon): number {
  const fleet = fleetOf(w, ship)
  const cls = fleet ? priorityClass(fleet.targetPriority) : null
  gather(w, ship, wp.range)
  let best = 0
  let bs = Infinity
  for (let j = 0; j < cands.length; j++) {
    const t = w.ships[cands[j]]
    if (!t || !foe(ship, t) || !reach(ship, t, wp.range)) continue
    const s = (cls && t.kind !== cls ? RANK : 0) + dist2(ship, t)
    if (s < bs) {
      bs = s
      best = t.id
    }
  }
  return best
}

const unshielded = (t: Ship): boolean => t.combat !== null && (t.combat.shield <= 0 || isCraft(t.kind))

/** автопушка: бесщитовое или машина, ближайшее */
export function autocannonTarget(w: World, ship: Ship, wp: Weapon): number {
  gather(w, ship, wp.range)
  let best = 0
  let bd = Infinity
  for (let j = 0; j < cands.length; j++) {
    const t = w.ships[cands[j]]
    if (!t || !foe(ship, t) || !unshielded(t) || !reach(ship, t, wp.range)) continue
    const d = dist2(ship, t)
    if (d < bd) {
      bd = d
      best = t.id
    }
  }
  return best
}

/** перехватчик: бомбардировщики раньше, потом бесщитовое или машина */
export function interceptorTarget(w: World, ship: Ship, wp: Weapon): number {
  gather(w, ship, wp.range)
  let best = 0
  let bs = Infinity
  for (let j = 0; j < cands.length; j++) {
    const t = w.ships[cands[j]]
    if (!t || !foe(ship, t) || !unshielded(t) || !reach(ship, t, wp.range)) continue
    const s = (t.kind === 'bomber' ? 0 : RANK) + dist2(ship, t)
    if (s < bs) {
      bs = s
      best = t.id
    }
  }
  return best
}

// ---------- группы метки ----------

interface MarkState {
  priority: TargetPriority
  /** линкоры слева направо, как они были при разбиении */
  ids: number[]
  groups: number[][]
  /** цель каждой группы (id корабля, 0 — нет) */
  targets: number[]
}

const marks = new WeakMap<World, Map<number, MarkState>>()

function markState(w: World, fleet: Fleet): MarkState {
  let per = marks.get(w)
  if (!per) {
    per = new Map()
    marks.set(w, per)
  }
  // линкоры ряда слева направо (по y слота), вставкой — без аллокаций
  order.length = 0
  for (let i = 0; i < fleet.shipIds.length; i++) {
    const s = shipById(w, fleet.shipIds[i])
    if (!s || !s.alive || !s.combat || s.kind !== 'battleship') continue
    const y = s.combat.slot ? s.combat.slot.y : 0
    let k = order.length
    order.push(s)
    while (k > 0) {
      const p = order[k - 1]
      const py = p.combat!.slot ? p.combat!.slot.y : 0
      if (py < y || (py === y && p.id < s.id)) break
      order[k] = p
      k--
    }
    order[k] = s
  }
  let st = per.get(fleet.id)
  let same = !!st && st.priority === fleet.targetPriority && st.ids.length === order.length
  if (st && same) for (let i = 0; i < order.length; i++) if (st.ids[i] !== order[i].id) same = false
  if (!st || !same) {
    const n = order.length
    const g = Math.ceil(n / 3)
    const groups: number[][] = []
    const base = g ? Math.floor(n / g) : 0
    const rem = g ? n % g : 0
    let at = 0
    for (let k = 0; k < g; k++) {
      const size = base + (k < rem ? 1 : 0)
      const grp: number[] = []
      for (let i = 0; i < size; i++) grp.push(order[at++].id)
      groups.push(grp)
    }
    st = { priority: fleet.targetPriority, ids: order.map((s) => s.id), groups, targets: new Array(g).fill(0) }
    per.set(fleet.id, st)
  }
  return st
}

/** линкоры ряда слева направо по 3 (7 → 3 + 2 + 2; одиночка присоединена к соседней), одна цель на группу */
export function markGroups(w: World, fleet: Fleet): number[][] {
  return markState(w, fleet).groups
}

// ---------- расслоённый выбор целей ----------

/** есть ли у корабля собственный выбор цели: катера и бомбардировщики получают цель от адмирала/крыла */
function picksOwn(kind: ShipKind): boolean {
  return kind === 'corvette' || kind === 'frigate' || kind === 'battleship' || kind === 'interceptor'
}

function pickFor(w: World, ship: Ship, wp: Weapon, turretsMode: 'pd' | 'screen'): number {
  switch (wp.kind) {
    case 'flak': return flakTarget(w, ship, wp)
    case 'turret': return turretsMode === 'screen' ? screenTarget(w, ship, wp) : flakTarget(w, ship, wp)
    case 'beam': return beamTarget(w, ship, wp)
    case 'missile': return missileTarget(w, ship, wp)
    case 'autocannon': return autocannonTarget(w, ship, wp)
    case 'gun': return interceptorTarget(w, ship, wp)
    default: return 0
  }
}

export function pickTargets(w: World): void {
  const slot = w.tick % 10
  for (let i = 0; i < w.ships.length; i++) {
    const s = w.ships[i]
    const c = s.combat
    if (!c || !s.alive || s.transit || c.mothballed || !isCombatKind(s.kind) || !picksOwn(s.kind)) continue
    if (s.id % 10 !== slot) continue
    const wp = CLASSES[s.kind].weapons[0]
    if (!wp) continue
    // луч держит цель, пока она жива, досягаема и в секторе
    if (wp.kind === 'beam' && c.targetId !== null && c.targetId > 0) {
      const cur = shipById(w, c.targetId)
      if (cur && beamValid(s, cur, wp)) continue
    }
    const fleet = fleetOf(w, s)
    const id = pickFor(w, s, wp, fleet ? fleet.turrets : 'pd')
    c.targetId = id === 0 ? null : id
    c.retargetAt = w.t
  }
}

// ---------- выстрелы ----------

/** шанс попадания по цели (корабль или снаряд) с бонусом ранга; 1 — без броска */
export function hitChance(wp: Weapon, target: Ship | Projectile, shooter: Ship): number {
  const bonus = HIT.rankBonus * (shooter.combat ? shooter.combat.rank : 0)
  let p = 1
  if ('shooterId' in target) {
    if (wp.kind === 'flak' || wp.kind === 'turret') p = HIT.flak.missile
  } else if (wp.kind === 'flak') {
    if (isCraft(target.kind)) p = HIT.flak.craft
  } else if (wp.kind === 'turret') {
    if (isCraft(target.kind)) p = HIT.turret.craft
    else if (!isCapital(target.kind)) p = HIT.turret.small
  }
  return Math.min(1, p + bonus)
}

function damageOf(wp: Weapon, target: Ship | Projectile): number {
  if ('shooterId' in target) return wp.damage
  if (wp.kind === 'flak' && !isCraft(target.kind)) return wp.damage * HIT.flak.hullMul
  if (wp.kind === 'turret' && isCapital(target.kind)) return wp.damage * HIT.turret.capitalMul
  if (wp.kind === 'gun' && isCraft(target.kind)) return wp.damage * HIT.gun.craftMul
  return wp.damage
}

function shoot(w: World, s: Ship, wp: Weapon, ts: Ship | null, tp: Projectile | null): void {
  const target = ts ?? tp!
  const p = hitChance(wp, target, s)
  const hit = p >= 1 || combatRng(w, s).chance(p)
  const dmg = damageOf(wp, target)
  if (!hit) {
    if (w.fxBattle.length < PROJ.tracersMax) {
      const x = ts ? ts.pos.x : tp!.x
      const y = ts ? ts.pos.y : tp!.y
      w.fxBattle.push({ kind: 'tracer', systemId: s.systemId, x0: s.pos.x, y0: s.pos.y, x1: x, y1: y, hit: false })
    }
    return
  }
  if (ts) traceShot(w, s, ts, dmg, wp.kind)
  else {
    hitProjectile(w, tp!, dmg)
    if (w.fxBattle.length < PROJ.tracersMax) {
      w.fxBattle.push({ kind: 'tracer', systemId: s.systemId, x0: s.pos.x, y0: s.pos.y, x1: tp!.x, y1: tp!.y, hit: true })
    }
  }
}

function targetShip(w: World, s: Ship, id: number | null): Ship | null {
  if (id === null || id <= 0) return null
  const t = shipById(w, id)
  return t && foe(s, t) ? t : null
}

function targetProj(w: World, s: Ship, id: number | null): Projectile | null {
  if (id === null || id >= 0) return null
  const p = w.projectiles[-id - 1]
  return p && p.alive && p.kind !== 'beam' && p.owner !== s.owner && p.systemId === s.systemId ? p : null
}

function projReach(s: Ship, p: Projectile, range: number): boolean {
  const r = range + PROJ.torpHitR
  return (p.x - s.pos.x) ** 2 + (p.y - s.pos.y) ** 2 <= r * r
}

function missileIndex(kind: CombatKind): number {
  const ws = CLASSES[kind].weapons
  for (let i = 0; i < ws.length; i++) if (ws[i].kind === 'missile') return i
  return -1
}

/** фрегат готов к залпу и есть кого бить: цель ракеты (или null) */
function missileShot(w: World, s: Ship, wp: Weapon): Ship | null {
  const c = s.combat
  if (!c || c.ammo <= 0 || !canVolley(s) || fireMul(s) <= 0) return null
  const t = targetShip(w, s, c.targetId)
  return t && reach(s, t, wp.range) ? t : null
}

/** залп ряда: фрегаты копят готовность и стреляют в один такт, когда готов самый медленный */
export function rowVolley(w: World, fleet: Fleet): void {
  if (fleet.missiles !== 'volley') return
  const mi = missileIndex('frigate')
  const wp = CLASSES.frigate.weapons[mi]
  let n = 0
  for (let i = 0; i < fleet.shipIds.length; i++) {
    const s = shipById(w, fleet.shipIds[i])
    if (!s || !s.alive || s.kind !== 'frigate' || !s.combat || s.transit || !missileShot(w, s, wp)) continue
    if (s.combat.cooldown[mi] > w.t) return
    n++
  }
  if (!n) return
  for (let i = 0; i < fleet.shipIds.length; i++) {
    const s = shipById(w, fleet.shipIds[i])
    if (!s || !s.alive || s.kind !== 'frigate' || !s.combat || s.transit) continue
    const t = missileShot(w, s, wp)
    if (!t) continue
    fireMissile(w, s, t, wp.damage)
    s.combat.ammo--
    s.combat.cooldown[mi] = w.t + wp.cooldown / fireMul(s)
  }
  const b = fleet.battleId === null ? null : (w.battles.find((x) => x.id === fleet.battleId) ?? null)
  if (b) logBattle(w, b, 'volley', `Залп ряда: ${n} ракет`)
}

export function fireWeapons(w: World): void {
  for (let f = 0; f < w.fleets.length; f++) rowVolley(w, w.fleets[f])
  for (let i = 0; i < w.ships.length; i++) {
    const s = w.ships[i]
    const c = s.combat
    if (!c || !s.alive || s.transit || c.mothballed || !isCombatKind(s.kind)) continue
    const ws = CLASSES[s.kind].weapons
    if (!ws.length) continue
    const fleet = fleetOf(w, s)
    const volley = fleet !== undefined && fleet.missiles === 'volley'
    const mode = fleet ? fleet.turrets : 'pd'
    const fm = fireMul(s)
    if (fm <= 0) continue
    for (let wi = 0; wi < ws.length; wi++) {
      const wp = ws[wi]
      if (c.cooldown[wi] > w.t) continue
      if (wp.kind === 'turret' && !turretsOk(s)) continue
      if (wp.kind === 'missile' && volley) continue
      // основное оружие бьёт по запомненной цели, второе выбирает цель в момент выстрела
      let id: number | null
      if (wi === 0 || !picksOwn(s.kind)) id = c.targetId
      else {
        id = pickFor(w, s, wp, mode) || null
        // нет цели: не опрашивать сетку каждый шаг
        if (id === null) {
          c.cooldown[wi] = w.t + HIT.retargetIdle
          continue
        }
      }
      const ts = targetShip(w, s, id)
      const tp = ts ? null : targetProj(w, s, id)
      if (ts) {
        if (!reach(s, ts, wp.range) || !arcOk(s, ts, wp.arc)) continue
        if ((wp.kind === 'autocannon' || wp.kind === 'gun') && !unshielded(ts)) continue
      } else if (tp) {
        if (!projReach(s, tp, wp.range)) continue
      } else continue
      let fired = true
      switch (wp.kind) {
        case 'beam': {
          if (!ts) { fired = false; break }
          const n = Math.min(wp.count, beamsOf(s))
          for (let k = 0; k < n; k++) fireBeam(w, s, ts, k)
          fired = n > 0
          break
        }
        case 'missile':
          if (!ts || c.ammo <= 0 || !canVolley(s)) { fired = false; break }
          fireMissile(w, s, ts, wp.damage)
          c.ammo--
          break
        case 'lightTorpedo':
        case 'torpedo':
          if (!ts || c.ammo <= 0) { fired = false; break }
          fireTorpedo(w, s, ts, wp.kind === 'lightTorpedo')
          c.ammo--
          break
        default:
          for (let k = 0; k < wp.count; k++) shoot(w, s, wp, ts, tp)
      }
      if (fired) c.cooldown[wi] = w.t + wp.cooldown / fm
    }
  }
}

// ---------- каналы ----------

/** смена канала флота (приоритет, ракеты, турели): не чаще BATTLE.channelCooldown, строка в журнал боя */
export function setChannel(
  w: World, fleet: Fleet, channel: 'priority' | 'missiles' | 'turrets', value: string, reason: string,
): boolean {
  if (w.t - fleet.channelSince < BATTLE.channelCooldown) return false
  const cur = channel === 'priority' ? fleet.targetPriority : channel === 'missiles' ? fleet.missiles : fleet.turrets
  if (cur === value) return false
  if (channel === 'priority') {
    fleet.targetPriority = value as TargetPriority
    fleet.prioritySince = w.t
  } else if (channel === 'missiles') fleet.missiles = value as Fleet['missiles']
  else fleet.turrets = value as Fleet['turrets']
  fleet.channelSince = w.t
  fleet.orderReason = reason
  const b = fleet.battleId === null ? null : (w.battles.find((x) => x.id === fleet.battleId) ?? null)
  if (b) logBattle(w, b, 'channel', reason)
  return true
}
