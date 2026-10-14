import { createAdmiral } from './admiral'
import { CLASSES, isCombatKind } from './classes'
import { BATTLE, FRAME } from './combat-config'
import { MOVE } from './config'
import type { Vec } from './math'
import { uniqueName } from './names'
import type { Goal } from './nav'
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

/** заглушка: тело — задача 7 (пока только смыкание рядов) */
export function stepFleets(w: World): void {
  for (const f of w.fleets) if (f.reassignAt !== null && w.t >= f.reassignAt) closeRanks(w, f)
}

/** корабль без слота держит место */
export function fleetGoal(w: World, ship: Ship): Goal | null {
  if (ship.mission.type !== 'fleet') return null
  const fleet = fleetById(w, ship.mission.fleetId)
  return { pos: ship.pos, vel: fleet ? fleet.anchorVel : { x: 0, y: 0 }, frameR: Infinity, dockR: 0, onReach: () => {} }
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
    positions.push({ kind: 'line', column: k, x: FRAME.rows.line, y: k * g, phase: 0 })
    if (double && positions.length < n) {
      positions.push({ kind: 'second', column: k, x: FRAME.rows.second, y: k * g + g / 2, phase: 0 })
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

  const row = (list: Ship[], kind: Slot['kind'], x: number, half: number): void => {
    list.sort(cmp)
    const k1 = -Math.floor(list.length / 2)
    list.forEach((s, i) => setSlot(s, kind, k1 + i, x, (k1 + i) * g + half))
  }
  row(frigates, 'frigate', FRAME.rows.frigate, g / 2)

  // тыловые: колонны ближе к центру, но не ближе 0.9·grid (3 длины) к слотам фрегатов
  rear.sort(cmp)
  const dx = FRAME.rows.frigate - FRAME.rows.rear
  const dyMin = Math.sqrt(Math.max(0, (g * 0.9) ** 2 - dx * dx))
  const free: number[] = []
  for (let d = 0; free.length < rear.length; d++) {
    for (const y of d === 0 ? [0] : [-d * g, d * g]) {
      if (free.length < rear.length && frigates.every((f) => Math.abs(f.combat!.slot!.y - y) >= dyMin)) free.push(y)
    }
  }
  free.sort((a, b) => a - b)
  rear.forEach((s, i) => setSlot(s, 'rear', Math.round(free[i] / g), FRAME.rows.rear, free[i]))

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
  wings(boats, 'boat', FRAME.rows.boat, FRAME.wingPad)
  wings(reserve, 'reserve', FRAME.rows.reserve, FRAME.reservePad)

  // корветы: овал, на каждом крыле равномерно по фазе
  screen.sort(cmp)
  const left = screen.filter((_, i) => i % 2 === 0)
  const right = screen.filter((_, i) => i % 2 === 1)
  left.forEach((s, j) => setSlot(s, 'oval', -1, 0, 0, j / left.length))
  right.forEach((s, j) => setSlot(s, 'oval', 1, 0, 0, j / right.length))

  fleet.reassignAt = null
}

/** точка овала корветов (или передней петли) в системе рамки; фаза — доля периметра */
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
  const h = ((a - b) / (a + b)) ** 2
  const perimeter = Math.PI * (a + b) * (1 + (3 * h) / (10 + Math.sqrt(4 - 3 * h)))
  // левое (side −1) крыло против часовой, правое по часовой
  const phi = TAU * (phase - side * (FRAME.ovalSpeed / perimeter) * t)
  const ex = a * Math.cos(phi)
  const ey = b * Math.sin(phi)
  if (front) {
    // петля вытянута вдоль фронта: длинная полуось — по y
    out.x = cx + ey
    out.y = cy + ex
  } else {
    out.x = cx + ex
    out.y = cy + ey
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
