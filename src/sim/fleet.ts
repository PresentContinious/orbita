import { createAdmiral } from './admiral'
import { CLASSES, isCombatKind, pushable, radiusOf } from './classes'
import { BATTLE, FRAME } from './combat-config'
import { MOVE, SHIP_KINDS, SIM_DT } from './config'
import type { Vec } from './math'
import { uniqueName } from './names'
import { avoidStar, shipSpeed, type Goal } from './nav'
import { planetPos, planetVel } from './system'
import type { Civ, Fleet, FleetMission, Planet, Ship, Slot, World } from './types'

export function createFleet(w: World, civ: Civ, planet: Planet, mission: FleetMission): Fleet {
  const id = w.nextId++
  const used = new Set<string>()
  for (const f of w.fleets) used.add(f.name)
  const rng = w.rng.fork('fleet:' + id)
  const admiral = createAdmiral(w, civ)
  const p = planetPos(planet, w.t)
  const off = planet.radius + MOVE.dockPad + 40
  const fleet: Fleet = {
    id,
    owner: civ.id,
    name: uniqueName(rng, used),
    admiralId: admiral.id,
    rng,
    systemId: planet.systemId,
    shipIds: [],
    reserveIds: [],
    flagshipId: null,
    anchor: { x: p.x + off, y: p.y },
    anchorVel: planetVel(planet, w.t),
    ownVel: { x: 0, y: 0 },
    turnRate: 0,
    speed: 0,
    heading: 0,
    frame: null,
    columns: 1,
    width: 0,
    formation: 'wide',
    order: 'form',
    orderSince: w.t,
    orderReason: '',
    nextReview: w.t,
    lastReactT: w.t,
    targetPriority: 'nearest',
    prioritySince: w.t,
    missiles: 'ready',
    turrets: 'pd',
    channelSince: w.t,
    screenForward: null,
    finisher: false,
    flankIds: [],
    flankSince: null,
    cohesion: BATTLE.cohesion.start,
    dStar: BATTLE.dStar.line,
    dStarSince: w.t,
    driftSide: 1,
    driftSince: w.t,
    fallback: null,
    mission,
    battleId: null,
    waitingAtGate: null,
    route: [],
    gatherSince: null,
    reassignAt: null,
    lastLossT: w.t,
    columnSwapAt: {},
    flagSince: null,
    chargeSince: w.t,
    mothballedSince: null,
    mobilizedAt: w.t,
    decided: false,
    value0: 0,
    lossValue: 0,
  }
  w.fleets.push(fleet)
  return fleet
}

export function fleetById(w: World, id: number): Fleet | undefined {
  for (const f of w.fleets) if (f.id === id) return f
  return undefined
}

export function addToFleet(_w: World, fleet: Fleet, ship: Ship): void {
  if (!fleet.shipIds.includes(ship.id)) fleet.shipIds.push(ship.id)
  ship.fleetId = fleet.id
}

function drop(list: number[], id: number): void {
  const i = list.indexOf(id)
  if (i >= 0) list.splice(i, 1)
}

/** вычёркивает корабль; погиб последний — флот распущен (адмирал жив) */
export function removeFromFleet(w: World, fleet: Fleet, shipId: number): void {
  drop(fleet.shipIds, shipId)
  drop(fleet.reserveIds, shipId)
  drop(fleet.flankIds, shipId)
  fleet.reassignAt = w.t + FRAME.closeRanksAfter
  if (!fleet.shipIds.length) disbandFleet(w, fleet)
}

export function disbandFleet(w: World, fleet: Fleet): void {
  const i = w.fleets.indexOf(fleet)
  if (i >= 0) w.fleets.splice(i, 1)
}

// ---------- геометрия рамки (спека 7.1); числа — только FRAME ----------

const TAU = Math.PI * 2

export function fleetWidth(columns: number): number {
  return (columns - 1) * FRAME.grid
}

function shipOf(w: World, id: number): Ship | undefined {
  const i = w.shipIndex.get(id)
  if (i === undefined) return undefined
  const s = w.ships[i]
  return s && s.id === id && s.alive ? s : undefined
}

/** боковая координата корабля относительно курса рамки (слева направо) */
function lateral(w: World, fleet: Fleet, ship: Ship): number {
  let ax = fleet.anchor.x
  let ay = fleet.anchor.y
  const pl = fleet.frame ? w.planets.get(fleet.frame) : undefined
  if (pl) {
    const pp = planetPos(pl, w.t)
    ax += pp.x
    ay += pp.y
  }
  return -Math.sin(fleet.heading) * (ship.pos.x - ax) + Math.cos(fleet.heading) * (ship.pos.y - ay)
}

function setSlot(ship: Ship, kind: Slot['kind'], column: number, x: number, y: number, phase = 0): void {
  ship.combat!.slot = { kind, column, x, y, phase }
}

/** раздаёт слоты живым кораблям флота; подбитые (`damaged`) остаются на своих местах */
export function assignSlots(w: World, fleet: Fleet): void {
  const g = FRAME.grid
  const line: Ship[] = []
  const frigates: Ship[] = []
  const rear: Ship[] = []
  const boats: Ship[] = []
  const screen: Ship[] = []
  const reserve: Ship[] = []
  let flag: Ship | null = null
  for (const id of fleet.shipIds) {
    const s = shipOf(w, id)
    if (!s || !s.combat || !isCombatKind(s.kind)) continue
    if (!flag || s.price > flag.price || (s.price === flag.price && s.id < flag.id)) flag = s
    if (s.combat.slot?.kind === 'damaged') continue
    const role = CLASSES[s.kind].role
    if (fleet.reserveIds.includes(id)) reserve.push(s)
    else if (role === 'line') line.push(s)
    else if (role === 'frigate') frigates.push(s)
    else if (role === 'rear') rear.push(s)
    else if (role === 'boat') boats.push(s)
    else if (role === 'screen') screen.push(s)
  }
  // флагман выбирается один раз; пока он жив и во флоте — остаётся
  const cur = fleet.flagshipId === null ? undefined : shipOf(w, fleet.flagshipId)
  if (!cur || cur.fleetId !== fleet.id) fleet.flagshipId = flag ? flag.id : null

  const cmp = (a: Ship, b: Ship): number => lateral(w, fleet, a) - lateral(w, fleet, b) || a.id - b.id

  // линкоры: позиции по возрастанию y; флагман — центр линии / второй ряд центральной колонны
  const n = line.length
  const double = fleet.formation === 'double'
  const cols = double ? Math.ceil(n / 2) : n
  const k0 = -Math.floor(cols / 2)
  const positions: Slot[] = []
  for (let i = 0; i < cols; i++) {
    const k = k0 + i
    // ряд симметричен оси: при чётном числе колонн — между колоннами
    const y = (i - (cols - 1) / 2) * g
    positions.push({ kind: 'line', column: k, x: FRAME.rows.line, y, phase: 0 })
    if (double && positions.length < n) {
      positions.push({ kind: 'second', column: k, x: FRAME.rows.second, y: y + g / 2, phase: 0 })
    }
  }
  const flagShip = line.find((s) => s.id === fleet.flagshipId) ?? null
  const rest = line.filter((s) => s !== flagShip).sort(cmp)
  if (flagShip) {
    let pi = positions.findIndex((p) => p.column === 0 && p.kind === (double ? 'second' : 'line'))
    if (pi < 0) pi = positions.findIndex((p) => p.column === 0)
    if (pi < 0) pi = 0
    flagShip.combat!.slot = positions.splice(pi, 1)[0]
  }
  rest.forEach((s, i) => (s.combat!.slot = positions[i]))

  fleet.columns = Math.max(1, cols)
  fleet.width = fleetWidth(fleet.columns)
  const W = fleet.width

  // фрегаты: ряд симметричен относительно оси (чётное число — между колоннами, нечётное — на колоннах),
  // иначе ряд из трёх торчал бы за край линии и пересекал овал корветов
  frigates.sort(cmp)
  frigates.forEach((s, i) => {
    const y = (i - (frigates.length - 1) / 2) * g
    setSlot(s, 'frigate', Math.floor(y / g), FRAME.rows.frigate, y)
  })

  // тыловые: колонны ближе к центру, но не ближе 0.9·grid (3 длины) к слотам фрегатов
  rear.sort(cmp)
  // только внутри завесы: |y| < lo (овал корветов идёт на y ≥ W/2 + wingPad − ovalB, запас полсетки);
  // нет места — следующий ряд на 0.9·grid глубже ряда фрегатов, и дальше по ряду на каждые 0.9·grid
  const minD = g * 0.9
  // тыловые между собой — три длины самого длинного из них (носители 14 → 42)
  const rearD = Math.max(minD, ...rear.map((s) => 3 * SHIP_KINDS[s.kind].length))
  const lo = W / 2 + FRAME.wingPad - FRAME.ovalB - g / 2
  const spots: { x: number; y: number }[] = []
  const free = (x: number, y: number): boolean =>
    frigates.every((f) => Math.hypot(f.combat!.slot!.x - x, f.combat!.slot!.y - y) >= minD - 1e-9) &&
    spots.every((p) => Math.hypot(p.x - x, p.y - y) >= rearD - 1e-9)
  for (let r = 0; spots.length < rear.length && r <= rear.length; r++) {
    const x = r === 0 ? FRAME.rows.rear : FRAME.rows.frigate - minD * r
    for (let d = 0; spots.length < rear.length; d++) {
      let any = false
      for (const y of d === 0 ? [0] : [-d * g, d * g]) {
        if (Math.abs(y) >= lo) continue
        any = true
        if (spots.length < rear.length && free(x, y)) spots.push({ x, y })
      }
      if (!any) break
    }
  }
  spots.sort((p, q) => p.y - q.y || q.x - p.x)
  rear.forEach((s, i) => setSlot(s, 'rear', Math.round(spots[i].y / g), spots[i].x, spots[i].y))

  // катера и резерв — на крыльях, лишние отступают назад по ряду
  const wings = (list: Ship[], kind: Slot['kind'], x: number, pad: number): void => {
    list.sort(cmp)
    const used = [0, 0]
    list.forEach((s, i) => {
      const side = i % 2 === 0 ? -1 : 1
      const j = used[i % 2]++
      setSlot(s, kind, side, x - j * g, side * (W / 2 + pad))
    })
  }
  // катера не заходят под овал корветов: у малого флота овал уходит глубже (cx − a), тогда ряд катеров сдвигается за него
  const smallOval = W < FRAME.ovalSmallW
  const ovalTail = (smallOval ? FRAME.ovalSmallCx - FRAME.ovalSmallA : FRAME.ovalCx - FRAME.ovalA) - minD
  wings(boats, 'boat', Math.min(FRAME.rows.boat, ovalTail), FRAME.wingPad)
  wings(reserve, 'reserve', FRAME.rows.reserve, FRAME.reservePad)

  // корветы: овал, на каждом крыле равномерно по фазе
  screen.sort(cmp)
  // крыло — по боковой стороне (левая половина — левое крыло): пути к овалам не пересекают строй
  const half = Math.ceil(screen.length / 2)
  const left = screen.slice(0, half)
  const right = screen.slice(half)
  left.forEach((s, j) => setSlot(s, 'oval', -1, 0, 0, j / left.length))
  right.forEach((s, j) => setSlot(s, 'oval', 1, 0, 0, j / right.length))

  fleet.reassignAt = null
}


/**
 * «Стадион» корветов: две прямые длиной 2(a − b) на Y = ±b и два полукруга радиуса b.
 * Скорость кусочная: на дуге va = sqrt(ovalTurnShare · accel · b) (центростремительное ≤ доли ускорения корвета),
 * на прямой разгон/торможение с ovalTurnShare · accel до пика vp ≤ ovalSpeed (на короткой прямой профиль треугольный).
 * Цикл по времени, без массивов: позиция — по τ внутри периода.
 */
function stadium(a: number, b: number, tau: number, out: Vec): void {
  const acc = SHIP_KINDS.corvette.accel * FRAME.ovalTurnShare
  const va = Math.sqrt(FRAME.ovalTurnShare * SHIP_KINDS.corvette.accel * b)
  const s = Math.max(0, a - b)
  const L = 2 * s
  const vp = Math.min(FRAME.ovalSpeed, Math.sqrt(va * va + acc * L))
  const dA = (vp * vp - va * va) / (2 * acc)
  const tA = (vp - va) / acc
  const tC = vp > 0 ? Math.max(0, L - 2 * dA) / vp : 0
  const Ts = 2 * tA + tC
  const Ta = (Math.PI * b) / va
  const T = 2 * (Ts + Ta)
  let u = ((tau % T) + T) % T
  // вдоль прямой: пройденный путь за время x ∈ [0, Ts]
  const dist = (x: number): number => {
    if (x < tA) return va * x + 0.5 * acc * x * x
    if (x < tA + tC) return dA + vp * (x - tA)
    const r = Ts - x
    return L - (va * r + 0.5 * acc * r * r)
  }
  if (u < Ts) {
    out.x = -s + dist(u)
    out.y = -b
  } else if ((u -= Ts) < Ta) {
    const th = -Math.PI / 2 + (u / Ta) * Math.PI
    out.x = s + b * Math.cos(th)
    out.y = b * Math.sin(th)
  } else if ((u -= Ta) < Ts) {
    out.x = s - dist(u)
    out.y = b
  } else {
    u -= Ts
    const th = Math.PI / 2 + (u / Ta) * Math.PI
    out.x = -s + b * Math.cos(th)
    out.y = b * Math.sin(th)
  }
}

/** период обхода «стадиона», с (для фаз) */
function stadiumPeriod(a: number, b: number): number {
  const acc = SHIP_KINDS.corvette.accel * FRAME.ovalTurnShare
  const va = Math.sqrt(FRAME.ovalTurnShare * SHIP_KINDS.corvette.accel * b)
  const L = 2 * Math.max(0, a - b)
  const vp = Math.min(FRAME.ovalSpeed, Math.sqrt(va * va + acc * L))
  const tA = (vp - va) / acc
  const dA = (vp * vp - va * va) / (2 * acc)
  const tC = vp > 0 ? Math.max(0, L - 2 * dA) / vp : 0
  return 2 * (2 * tA + tC + (Math.PI * b) / va)
}

/** точка овала корветов (или передней петли) в системе рамки; фаза — доля периода обхода */
export function ovalPoint(fleet: Fleet, side: -1 | 1, phase: number, t: number, out: Vec): Vec {
  const W = fleet.width
  const front = fleet.screenForward !== null
  let cx: number
  let cy: number
  let a: number
  let b: number
  if (front) {
    cx = FRAME.frontCx
    cy = 0
    a = W / 2 + FRAME.frontPad
    b = FRAME.frontB
  } else {
    const small = W < FRAME.ovalSmallW
    cx = small ? FRAME.ovalSmallCx : FRAME.ovalCx
    a = small ? FRAME.ovalSmallA : FRAME.ovalA
    b = FRAME.ovalB
    cy = side * (W / 2 + FRAME.wingPad)
  }
  const T = stadiumPeriod(a, b)
  // левое (side −1) крыло против часовой, правое по часовой: время бежит по контуру вперёд или назад
  stadium(a, b, phase * T - side * t, out)
  if (front) {
    // петля вытянута вдоль фронта: длинная ось — по y
    const sx = out.x
    out.x = cx + out.y
    out.y = cy + sx
  } else {
    out.x += cx
    out.y += cy
  }
  return out
}

/** место слота в системе отсчёта рамки */
export function slotLocal(fleet: Fleet, slot: Slot, t: number, out: Vec): Vec {
  if (slot.kind === 'oval') return ovalPoint(fleet, slot.column < 0 ? -1 : 1, slot.phase, t, out)
  out.x = slot.kind === 'damaged' ? FRAME.rows.damaged : slot.x
  out.y = slot.y
  return out
}

const localTmp: Vec = { x: 0, y: 0 }

/** место слота в координатах системы (звезда в нуле) */
export function slotWorld(w: World, fleet: Fleet, slot: Slot, out: Vec): Vec {
  slotLocal(fleet, slot, w.t, localTmp)
  const c = Math.cos(fleet.heading)
  const s = Math.sin(fleet.heading)
  let x = localTmp.x * c - localTmp.y * s + fleet.anchor.x
  let y = localTmp.x * s + localTmp.y * c + fleet.anchor.y
  const pl = fleet.frame ? w.planets.get(fleet.frame) : undefined
  if (pl) {
    const pp = planetPos(pl, w.t)
    x += pp.x
    y += pp.y
    // слот в теле планеты + planetSlotPad сдвигается вдоль орбиты
    const R = pl.radius + FRAME.planetSlotPad
    const rx = x - pp.x
    const ry = y - pp.y
    if (Math.hypot(rx, ry) < R) {
      const v = planetVel(pl, w.t)
      const vl = Math.hypot(v.x, v.y) || 1
      const tx = v.x / vl
      const ty = v.y / vl
      const b = -rx * ty + ry * tx
      const a = rx * tx + ry * ty
      const a2 = Math.sqrt(Math.max(0, R * R - b * b)) * (a < 0 ? -1 : 1)
      x = pp.x + tx * a2 - ty * b
      y = pp.y + ty * a2 + tx * b
    }
  }
  out.x = x
  out.y = y
  return out
}

/**
 * смыкание ряда: один сдвиг за вызов, следующий — через closeRanksEvery.
 * Сдвигается сосед пробоины со стороны, где до края меньше колонн (так пути не пересекаются).
 */
export function closeRanks(w: World, fleet: Fleet): void {
  const g = FRAME.grid
  const slots: Slot[] = []
  for (const id of fleet.shipIds) {
    const sl = shipOf(w, id)?.combat?.slot
    if (sl && (sl.kind === 'line' || sl.kind === 'second')) slots.push(sl)
  }
  if (!slots.length) {
    fleet.reassignAt = null
    return
  }
  const occupied = new Set<number>()
  for (const sl of slots) occupied.add(sl.column)
  const span = (): [number, number] => {
    let lo = Infinity
    let hi = -Infinity
    for (const k of occupied) {
      lo = Math.min(lo, k)
      hi = Math.max(hi, k)
    }
    return [lo, hi]
  }
  let [kmin, kmax] = span()
  let gap: number | null = null
  for (let k = kmin; k <= kmax; k++) {
    if (!occupied.has(k)) {
      gap = k
      break
    }
  }
  if (gap !== null) {
    const dir = gap - kmin <= kmax - gap ? 1 : -1
    const from = gap - dir
    for (const sl of slots) {
      if (sl.column !== from) continue
      sl.column = gap
      sl.y = gap * g + (sl.kind === 'second' ? g / 2 : 0)
    }
    occupied.delete(from)
    occupied.add(gap)
    ;[kmin, kmax] = span()
  }
  let more = false
  for (let k = kmin; k <= kmax; k++) if (!occupied.has(k)) more = true
  fleet.columns = Math.max(1, kmax - kmin + 1)
  fleet.width = fleetWidth(fleet.columns)
  fleet.reassignAt = more ? w.t + FRAME.closeRanksEvery : null
}

/** подбитый уходит в ряд подбитых по своей колонне (линкор) или полуколонне (фрегат, носитель) */
export function markDamaged(_fleet: Fleet, ship: Ship): void {
  const sl = ship.combat?.slot
  if (!sl || sl.kind === 'oval') return
  sl.kind = 'damaged'
  sl.x = FRAME.rows.damaged
}

export function clearDamaged(w: World, fleet: Fleet, ship: Ship): void {
  if (ship.combat?.slot?.kind === 'damaged') ship.combat.slot = null
  assignSlots(w, fleet)
}

// ---------- движение рамки (спека 7.1, 7.2) ----------

const ZERO_V: Vec = { x: 0, y: 0 }
const tmpA: Vec = { x: 0, y: 0 }
const tmpB: Vec = { x: 0, y: 0 }
const pushScratch: number[] = []
const tmpEnemy: Vec = { x: 0, y: 0 }
/** запас радиуса запроса в сетке: самый крупный корабль */
const PUSH_REACH = Math.max(...Object.values(SHIP_KINDS).map((k) => k.length)) / 2

/** планета системы отсчёта рамки */
function framePlanet(w: World, fleet: Fleet): Planet | undefined {
  return fleet.frame ? w.planets.get(fleet.frame) : undefined
}

/** якорь в координатах системы (звезда в нуле) */
export function anchorAbs(w: World, fleet: Fleet, out: Vec): Vec {
  out.x = fleet.anchor.x
  out.y = fleet.anchor.y
  const pl = framePlanet(w, fleet)
  if (pl) {
    const pp = planetPos(pl, w.t)
    out.x += pp.x
    out.y += pp.y
  }
  return out
}

/** планета, к которой относится миссия флота */
function missionPlanet(w: World, fleet: Fleet): Planet | undefined {
  const m = fleet.mission
  return w.planets.get(m.type === 'breakout' ? m.toPlanetId : m.planetId)
}

/** у кого-то из флота ещё нет слота (новый корабль или первый шаг) */
function needsAssign(w: World, fleet: Fleet): boolean {
  for (const id of fleet.shipIds) {
    const s = shipOf(w, id)
    if (s && s.combat && !s.combat.slot && isCombatKind(s.kind) && CLASSES[s.kind].role !== 'craft') return true
  }
  return false
}

/** система отсчёта рамки: планета, если якорь ближе planetFrameMul·r + planetFramePad */
export function frameOf(w: World, fleet: Fleet): string | null {
  anchorAbs(w, fleet, tmpA)
  let best: string | null = null
  let bestD = Infinity
  for (const p of w.galaxy.systems[fleet.systemId].planets) {
    const pp = planetPos(p, w.t)
    const d = Math.hypot(tmpA.x - pp.x, tmpA.y - pp.y)
    if (d < p.radius * FRAME.planetFrameMul + FRAME.planetFramePad && d < bestD) {
      best = p.id
      bestD = d
    }
  }
  return best
}

/** переключает систему отсчёта всей рамки; якорь переводится в новые координаты без прыжка */
function switchFrame(w: World, fleet: Fleet, next: string | null): void {
  anchorAbs(w, fleet, tmpA)
  // скорость в системе координат не прыгает: собственная скорость якоря пересчитывается в новую систему отсчёта
  // (избыток над anchorSpeed потом гасится с matchAccel — см. moveAnchor)
  const own = fleet.ownVel
  const oldPl = framePlanet(w, fleet)
  if (oldPl) {
    const v = planetVel(oldPl, w.t)
    own.x += v.x
    own.y += v.y
  }
  fleet.frame = next
  const pl = framePlanet(w, fleet)
  if (pl) {
    const v = planetVel(pl, w.t)
    own.x -= v.x
    own.y -= v.y
  }
  if (pl) {
    const pp = planetPos(pl, w.t)
    fleet.anchor.x = tmpA.x - pp.x
    fleet.anchor.y = tmpA.y - pp.y
  } else {
    fleet.anchor.x = tmpA.x
    fleet.anchor.y = tmpA.y
  }
}

/** куда рамка стремится по приказу (координаты системы); пока: form/march — к миссии, orbit — на орбиту, retreat — на рубеж, иначе стоять */
export function anchorTarget(w: World, fleet: Fleet): Vec {
  const here = anchorAbs(w, fleet, tmpB)
  const out: Vec = { x: here.x, y: here.y }
  if (fleet.order === 'retreat') return fleet.fallback ? { x: fleet.fallback.x, y: fleet.fallback.y } : out
  if (fleet.order !== 'form' && fleet.order !== 'march' && fleet.order !== 'orbit') return out
  const pl = missionPlanet(w, fleet)
  if (!pl || pl.systemId !== fleet.systemId) return out
  const pp = planetPos(pl, w.t)
  // орбитальная стоянка не ближе, чем нужно, чтобы глубокие ряды рамки не оказались в теле планеты
  let depth = 0
  for (const id of fleet.shipIds) {
    const sl = shipOf(w, id)?.combat?.slot
    if (sl && sl.kind !== "oval") depth = Math.max(depth, -sl.x)
  }
  const hold = pl.radius + Math.max(BATTLE.orbitPad, FRAME.planetSlotPad + depth)
  const dx = here.x - pp.x
  const dy = here.y - pp.y
  const d = Math.hypot(dx, dy)
  if (d < 1e-6 || d <= hold + 1) return out
  const goal: Vec = { x: pp.x + (dx / d) * hold, y: pp.y + (dy / d) * hold }
  if (fleet.order === 'orbit') return goal
  const star = w.galaxy.systems[fleet.systemId].star.radius
  return avoidStar(here, goal, star)
}

/** скорость поворота рамки, рад/с: min(turnMax, turnK · v_min / (W/2)) */
export function frameTurnRate(w: World, fleet: Fleet): number {
  let vMin = Infinity
  for (const id of fleet.shipIds) {
    const s = shipOf(w, id)
    if (s && s.combat) vMin = Math.min(vMin, shipSpeed(w, s))
  }
  const cap = (FRAME.turnMax * Math.PI) / 180
  if (!Number.isFinite(vMin) || fleet.width <= 0) return cap
  return Math.min(cap, (FRAME.turnK * vMin) / (fleet.width / 2))
}

function angleDiff(want: number, have: number): number {
  let d = (want - have) % TAU
  if (d > Math.PI) d -= TAU
  if (d < -Math.PI) d += TAU
  return d
}

/**
 * поворот к want: угловая скорость растёт и гасится плавно (тангенциальное ускорение дальнего слота ≤ доли ускорения
 * самого неповоротливого корабля), не выше frameTurnRate
 */
export function turnFrame(w: World, fleet: Fleet, want: number): void {
  const wMax = frameTurnRate(w, fleet)
  let aMin = Infinity
  let rMax = 1
  for (const id of fleet.shipIds) {
    const s = shipOf(w, id)
    const sl = s?.combat?.slot
    if (!s || !sl || sl.kind === 'oval') continue
    aMin = Math.min(aMin, SHIP_KINDS[s.kind].accel)
    rMax = Math.max(rMax, Math.hypot(sl.x, sl.y))
  }
  const alpha = Number.isFinite(aMin) ? (FRAME.ovalTurnShare * aMin) / rMax : wMax
  const err = angleDiff(want, fleet.heading)
  const wDes = Math.sign(err) * Math.min(wMax, Math.sqrt(2 * alpha * Math.abs(err)))
  const lim = alpha * SIM_DT
  let om = fleet.turnRate + Math.max(-lim, Math.min(lim, wDes - fleet.turnRate))
  om = Math.max(-wMax, Math.min(wMax, om))
  const step = om * SIM_DT
  if (Math.abs(step) >= Math.abs(err)) fleet.heading = want
  else fleet.heading += step
}

/** якорь едет к цели: разгон/торможение, в бою не ниже anchorMinBattle, дрейф, враждебные якори не ближе anchorMinDist */
export function moveAnchor(w: World, fleet: Fleet, target: Vec): void {
  const pl = framePlanet(w, fleet)
  const pp = pl ? planetPos(pl, w.t) : ZERO_V
  const ax = fleet.anchor.x
  const ay = fleet.anchor.y
  const dx = target.x - pp.x - ax
  const dy = target.y - pp.y - ay
  const L = Math.hypot(dx, dy)
  const acc = FRAME.anchorSpeed / FRAME.anchorAccelT
  const inBattle = fleet.battleId !== null
  const moving = L > 1
  let factor = 0
  const retreat = fleet.order === 'retreat'
  const foe = enemyAnchor(w, fleet, tmpEnemy)
  let foeAngle = 0
  let foeNear = false
  if (foe) {
    const me = anchorAbs(w, fleet, tmpA)
    foeAngle = Math.atan2(foe.y - me.y, foe.x - me.x)
    foeNear = Math.hypot(foe.x - me.x, foe.y - me.y) <= BATTLE.detect
  }
  if (retreat || foeNear) {
    // отход реверсом и встреча с врагом: рамка смотрит на якорь врага, ход — боком или задом (разворот только по ω)
    if (foe) turnFrame(w, fleet, foeAngle)
    factor = 1
  } else if (moving) {
    const want = Math.atan2(dy, dx)
    turnFrame(w, fleet, want)
    factor = Math.max(0, Math.cos(angleDiff(want, fleet.heading)))
  }
  let desired = moving ? (retreat ? FRAME.reverseSpeed : FRAME.anchorSpeed) * factor : 0
  if (!inBattle) desired = Math.min(desired, Math.sqrt(2 * acc * L))
  // собственная скорость якоря — вектор: меняется не быстрее acc, поэтому разворот на 180° не рвёт строй
  const own = fleet.ownVel
  let wantX = moving ? (dx / L) * desired : 0
  let wantY = moving ? (dy / L) * desired : 0
  // враждебные якори не ближе anchorMinDist: скорость сближения (относительная, в системе координат) ограничена так, чтобы успеть остановиться
  {
    const me = anchorAbs(w, fleet, tmpA)
    const myFrameV = pl ? planetVel(pl, w.t) : ZERO_V
    for (const g of w.fleets) {
      if (g === fleet || g.owner === fleet.owner || g.systemId !== fleet.systemId) continue
      const o = anchorAbs(w, g, tmpB)
      const ex = o.x - me.x
      const ey = o.y - me.y
      const d = Math.hypot(ex, ey)
      if (d < 1e-6) continue
      const closing = ((wantX + myFrameV.x - g.anchorVel.x) * ex + (wantY + myFrameV.y - g.anchorVel.y) * ey) / d
      const vmax = Math.sqrt(2 * FRAME.matchAccel * FRAME.brakeShare * Math.max(0, d - FRAME.anchorMinDist))
      if (closing > vmax) {
        wantX -= (ex / d) * (closing - vmax)
        wantY -= (ey / d) * (closing - vmax)
      }
    }
    const wl = Math.hypot(wantX, wantY)
    if (wl > FRAME.anchorSpeed) {
      wantX *= FRAME.anchorSpeed / wl
      wantY *= FRAME.anchorSpeed / wl
    }
  }
  const dvx = wantX - own.x
  const dvy = wantY - own.y
  const dv = Math.hypot(dvx, dvy)
  // торможение (и избыток скорости после входа в систему отсчёта планеты) — до matchAccel, но не быстрее ускорения линкора; разгон — acc
  const braking = dvx * own.x + dvy * own.y < 0 || Math.hypot(own.x, own.y) > FRAME.anchorSpeed
  const lim = (braking ? FRAME.matchAccel : acc) * SIM_DT
  if (dv > lim) {
    own.x += (dvx / dv) * lim
    own.y += (dvy / dv) * lim
  } else {
    own.x = wantX
    own.y = wantY
  }
  let spd = Math.hypot(own.x, own.y)
  if (inBattle && moving && spd < FRAME.anchorMinBattle) {
    // в бою рамка не стоит: не ниже anchorMinBattle (по курсу к цели, если вектор ещё мал)
    const ux = spd > 1e-9 ? own.x / spd : dx / L
    const uy = spd > 1e-9 ? own.y / spd : dy / L
    own.x = ux * FRAME.anchorMinBattle
    own.y = uy * FRAME.anchorMinBattle
    spd = FRAME.anchorMinBattle
  }
  fleet.speed = spd

  let mx = own.x * SIM_DT
  let my = own.y * SIM_DT
  if (moving && Math.hypot(mx, my) > L) {
    // не перелетать цель
    mx = (dx / L) * L
    my = (dy / L) * L
  }
  // дрейф в бою к слабому флангу врага (сторона — fleet.driftSide, пока фиксирована)
  if (inBattle && (fleet.order === 'line' || fleet.order === 'push')) {
    const ramp = Math.max(0, Math.min(1, (w.t - fleet.orderSince) / FRAME.anchorAccelT))
    mx += -Math.sin(fleet.heading) * fleet.driftSide * FRAME.drift * ramp * SIM_DT
    my += Math.cos(fleet.heading) * fleet.driftSide * FRAME.drift * ramp * SIM_DT
  }

  // враждебные якори не ближе anchorMinDist: останов, если сближаемся
  if (mx !== 0 || my !== 0) {
    const cur = anchorAbs(w, fleet, tmpA)
    const cx = cur.x
    const cy = cur.y
    for (const g of w.fleets) {
      if (g === fleet || g.owner === fleet.owner || g.systemId !== fleet.systemId) continue
      const o = anchorAbs(w, g, tmpB)
      const dNow = Math.hypot(cx - o.x, cy - o.y)
      const dNew = Math.hypot(cx + mx - o.x, cy + my - o.y)
      if (dNew < FRAME.anchorMinDist && dNew < dNow) {
        mx = 0
        my = 0
        own.x = 0
        own.y = 0
        fleet.speed = 0
        break
      }
    }
  }
  fleet.anchor.x = ax + mx
  fleet.anchor.y = ay + my
  const v = pl ? planetVel(pl, w.t) : ZERO_V
  fleet.anchorVel.x = mx / SIM_DT + v.x
  fleet.anchorVel.y = my / SIM_DT + v.y
}

export function stepFleets(w: World): void {
  for (let i = 0; i < w.fleets.length; i++) {
    const f = w.fleets[i]
    if (f.reassignAt !== null && w.t >= f.reassignAt) closeRanks(w, f)
    if (needsAssign(w, f)) assignSlots(w, f)
    const frame = frameOf(w, f)
    if (frame !== f.frame) switchFrame(w, f, frame)
    const h0 = f.heading
    moveAnchor(w, f, anchorTarget(w, f))
    f.turnRate = angleDiff(f.heading, h0) / SIM_DT
  }
}

const GOAL: Goal = { pos: { x: 0, y: 0 }, vel: { x: 0, y: 0 }, frameR: Infinity, dockR: 0, onReach: () => {} }

/** слот в мире, система отсчёта — рамка (общий объект: потребляется сразу); корабль без слота держит место */
export function fleetGoal(w: World, ship: Ship): Goal | null {
  if (ship.mission.type !== 'fleet') return null
  const fleet = fleetById(w, ship.mission.fleetId)
  const slot = ship.combat?.slot
  if (fleet && slot) slotWorld(w, fleet, slot, GOAL.pos)
  else {
    GOAL.pos.x = ship.pos.x
    GOAL.pos.y = ship.pos.y
  }
  GOAL.vel.x = fleet ? fleet.anchorVel.x : 0
  GOAL.vel.y = fleet ? fleet.anchorVel.y : 0
  if (fleet && slot) {
    // рамка поворачивается: слот на расстоянии r от якоря идёт со скоростью ω·r поперёк радиуса
    const om = fleet.turnRate
    if (om !== 0) {
      anchorAbs(w, fleet, tmpA)
      GOAL.vel.x += -om * (GOAL.pos.y - tmpA.y)
      GOAL.vel.y += om * (GOAL.pos.x - tmpA.x)
    }
  }
  if (fleet && slot && slot.kind === 'oval') {
    // слот бежит по овалу: его скорость — часть системы отсчёта цели, иначе корвет вечно отстаёт
    slotLocal(fleet, slot, w.t, tmpA)
    slotLocal(fleet, slot, w.t + SIM_DT, tmpB)
    const c = Math.cos(fleet.heading)
    const s = Math.sin(fleet.heading)
    const lx = (tmpB.x - tmpA.x) / SIM_DT
    const ly = (tmpB.y - tmpA.y) / SIM_DT
    GOAL.vel.x += lx * c - ly * s
    GOAL.vel.y += lx * s + ly * c
  }
  return GOAL
}

/** раздвигает слишком близких (последняя защита): вдоль линии центров, не быстрее pushSpeed; машины и мирные не участвуют. Каждая раздвинутая пара — w.pushOuts++ */
export function pushOut(w: World): void {
  const maxShift = FRAME.pushSpeed * SIM_DT
  for (let i = 0; i < w.ships.length; i++) {
    const a = w.ships[i]
    if (!a.alive || a.transit || !pushable(a.kind)) continue
    const ra = radiusOf(a.kind)
    for (const j of w.grids[a.systemId].query(a.pos.x, a.pos.y, ra + PUSH_REACH + FRAME.pushPad, pushScratch)) {
      if (j <= i) continue
      const b = w.ships[j]
      if (!b || !b.alive || b.transit || b.systemId !== a.systemId || !pushable(b.kind)) continue
      const need = ra + radiusOf(b.kind) + FRAME.pushPad
      const dx = b.pos.x - a.pos.x
      const dy = b.pos.y - a.pos.y
      const d = Math.hypot(dx, dy)
      if (d >= need) continue
      const shift = Math.min(maxShift, (need - d) / 2)
      const nx = d > 1e-6 ? dx / d : 1
      const ny = d > 1e-6 ? dy / d : 0
      a.pos.x -= nx * shift
      a.pos.y -= ny * shift
      b.pos.x += nx * shift
      b.pos.y += ny * shift
      w.pushOuts++
    }
  }
}

/** ближайший якорь чужого флота в той же системе (нос при отходе реверсом) */
export function enemyAnchor(w: World, fleet: Fleet, out: Vec): Vec | null {
  const me = anchorAbs(w, fleet, tmpA)
  let best = Infinity
  let found = false
  for (const g of w.fleets) {
    if (g === fleet || g.owner === fleet.owner || g.systemId !== fleet.systemId) continue
    const o = anchorAbs(w, g, tmpB)
    const d = Math.hypot(o.x - me.x, o.y - me.y)
    if (d < best) {
      best = d
      out.x = o.x
      out.y = o.y
      found = true
    }
  }
  return found ? out : null
}
