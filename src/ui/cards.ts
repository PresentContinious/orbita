import { orderName, strengthOf } from '../render/battleGeom'
import type { Pick } from '../render/hit'
import { territoryShares } from '../render/territory'
import { ECON, EVENTS, RESEARCH, RESEARCH_BRANCHES } from '../sim/config'
import { report, stationIncome, taxOf } from '../sim/economy'
import { capOf, civById, planetsOf, populatedOf } from '../sim/query'
import { CLASSES, isCombatKind, type CombatKind } from '../sim/classes'
import { WAR } from '../sim/combat-config'
import type { Battle, BattleLogEntry, BattlePhase, BattleSide, Fleet, FleetMission, Ship, Trait, World } from '../sim/types'
import { fmtCredits, fmtDuration, fmtPop, fmtRate, hex, roman } from './format'

export interface CardRow {
  label: string
  value: string
  tone?: 'good' | 'bad' | 'muted'
}

export interface CardData {
  kind: 'planet' | 'system' | 'civ' | 'ship' | 'battle' | 'fleet'
  title: string
  subtitle?: string
  color?: string
  rows: CardRow[]
  sections?: { title: string; rows: CardRow[]; color?: string }[]
  table?: { head: string[]; rows: string[][] }
  log?: BattleLogEntry[]
  /** вся лента боя (≤ EVENTS.battleLog) для кнопки «вся» */
  logAll?: BattleLogEntry[]
  /** value — доля левой стороны 0..1 */
  meter?: { label: string; value: number; left: string; right: string }[]
}

export { orderName }

const TRAIT_RU: Record<Trait, string> = { bold: 'Напористый', careful: 'Осторожный', methodical: 'Методичный', dashing: 'Лихой' }
const PHASE_RU: Record<BattlePhase, string> = {
  approach: 'сближение', engage: 'сход', line: 'линия', decision: 'решение', retreat: 'отход', over: 'окончен',
}
export const traitName = (t: Trait): string => TRAIT_RU[t]
export const phaseName = (p: BattlePhase): string => PHASE_RU[p]

const KIND_RU = { rocky: 'каменистая', ice: 'ледяной гигант', gas: 'газовый гигант', dwarf: 'карлик' }
const ZONE_RU = { hot: 'горячая', temperate: 'умеренная', cold: 'холодная' }
const ROLE_RU = { inhabited: 'обитаемая', ore: 'рудная', pit: 'астероидная «Яма»', nebula: 'туманность' }
const STAGE_RU = { ok: 'в норме', deficit: 'дефицит', crisis: 'кризис', bankrupt: 'банкрот' }
const SHIP_RU: Record<Ship['kind'], string> = {
  colony: 'Колонисты', caravan: 'Караван', miner: 'Шахтёр',
  corvette: 'Корвет', torpedo: 'Торпедный катер', frigate: 'Фрегат', battleship: 'Линкор', carrier: 'Носитель',
  interceptor: 'Перехватчик', bomber: 'Бомбардировщик', trooper: 'Десантник', supply: 'Снабженец', scout: 'Разведчик',
}

export function planetCard(w: World, id: string): CardData | null {
  const p = w.planets.get(id)
  if (!p) return null
  const owner = p.owner === null ? undefined : civById(w, p.owner)
  const t = p.tempK - 273
  const rows: CardRow[] = [
    { label: 'тип', value: `${KIND_RU[p.kind]}, ${ZONE_RU[p.zone]} зона` },
    { label: 'температура', value: `${t > 0 ? '+' : ''}${t} °C` },
  ]
  if (owner && p.pop > 0) {
    rows.push({ label: 'население', value: `${fmtPop(p.pop)} / ${fmtPop(capOf(p, owner))}` })
    rows.push({ label: 'инфраструктура', value: p.infra ? roman(p.infra) : '—' })
    rows.push({ label: 'налог', value: fmtRate(taxOf(p, owner) * 60) })
  } else if (p.station) {
    rows.push({ label: 'станция', value: p.build ? 'строится' : fmtRate(stationIncome(w.galaxy.systems[p.systemId]) * 60) })
  } else if (p.owner === null) {
    rows.push({ label: 'пригодность', value: p.habitability > 0 ? `×${p.habitability}` : 'непригодна', tone: p.habitability >= 1 ? 'good' : 'muted' })
  }
  if (p.build) {
    const what = p.build.kind === 'infra' ? `инфраструктура ${roman(p.build.level)}` : 'станция'
    rows.push({ label: 'стройка', value: `${what} · ${fmtDuration(p.build.remaining)}` })
  }
  const caravans = w.ships.filter((s) => s.alive && s.mission.type === 'trade' && (s.mission.a === id || s.mission.b === id)).length
  if (caravans) rows.push({ label: 'караваны', value: String(caravans) })
  return {
    kind: 'planet',
    title: p.name,
    subtitle: owner ? `${owner.name}${owner.capital === p.id ? ' · столица' : ''}` : 'ничья',
    color: owner ? hex(owner.color) : undefined,
    rows,
  }
}

export function systemCard(w: World, id: number): CardData | null {
  const s = w.galaxy.systems[id]
  if (!s) return null
  const rows: CardRow[] = [{ label: 'планет', value: String(s.planets.length) }]
  for (const sh of territoryShares(w, s)) {
    const c = civById(w, sh.civ)!
    rows.push({ label: c.name, value: `${Math.round(sh.share * 100)}%` })
  }
  const neighbours = s.gates.map((g) => w.galaxy.systems[g.toSystem].name).join(', ')
  rows.push({ label: 'коридоры', value: neighbours || '—' })
  return { kind: 'system', title: s.name, subtitle: `${ROLE_RU[s.role]} · звезда ${s.star.type}`, rows }
}

export function civCard(w: World, id: number): CardData | null {
  const civ = civById(w, id)
  if (!civ) return null
  const r = report(civ)
  const mine = populatedOf(w, civ)
  const stations = planetsOf(w, civ).filter((p) => p.station).length
  const research = RESEARCH_BRANCHES.filter((b) => civ.research[b] > 0).map((b) => `${RESEARCH[b].label} ${roman(civ.research[b])}`)
  const rows: CardRow[] = [
    { label: 'казна', value: fmtCredits(civ.treasury), tone: civ.treasury < 0 ? 'bad' : undefined },
    { label: 'доход', value: fmtRate(r.grossPerMin) },
    { label: 'содержание', value: fmtRate(-r.upkeepPerMin) },
    { label: 'чистый доход', value: fmtRate(r.netPerMin), tone: r.netPerMin >= 0 ? 'good' : 'bad' },
    { label: 'запас', value: Number.isFinite(r.reserveMin) ? `${r.reserveMin.toFixed(1)} мин дохода` : '—' },
    { label: 'стадия', value: STAGE_RU[civ.eco.stage], tone: civ.eco.stage === 'ok' ? 'good' : 'bad' },
    { label: 'планет', value: `${mine.length}${stations ? ` + ${stations} станц.` : ''}` },
    { label: 'население', value: fmtPop(mine.reduce((s, p) => s + p.pop, 0)) },
    { label: 'исследования', value: research.length ? research.join(', ') : '—' },
    { label: 'верфь / порт', value: `${civ.shipyard ? 'есть' : 'нет'} / ${civ.port ? 'есть' : 'нет'}` },
  ]
  if (civ.researchJob) rows.push({ label: 'исследует', value: `${RESEARCH[civ.researchJob.branch].label} ${roman(civ.researchJob.level)} · ${fmtDuration(civ.researchJob.remaining)}` })
  if (civ.project) rows.push({ label: 'строит', value: `${civ.project.kind === 'port' ? 'порт' : 'верфь'} · ${fmtDuration(civ.project.remaining)}` })
  return { kind: 'civ', title: civ.name, color: hex(civ.color), rows }
}

export function missionText(w: World, ship: Ship): string {
  if (ship.transit) {
    const to = w.galaxy.systems[ship.transit.to].name
    return `в коридоре → ${to} · ${fmtDuration(ship.transit.duration - ship.transit.elapsed)}`
  }
  const name = (id: string) => w.planets.get(id)?.name ?? '?'
  const m = ship.mission
  switch (m.type) {
    case 'colonize':
      return `везёт колонистов → ${name(m.planetId)}`
    case 'trade':
      return `торгует: ${name(m.a)} ↔ ${name(m.b)}`
    case 'mine':
      if (m.phase === 'back') return `везёт руду домой (+${Math.round(m.cargo * ECON.orePrice)} кр)`
      return m.asteroidId === null && m.idleT > 0 ? 'ждёт руду у планеты' : 'летит к астероиду'
    case 'return':
      return 'возвращается в док'
    case 'patrol':
      return 'патрулирует'
    case 'fleet':
      return 'в строю флота'
    case 'wing':
      return m.carrierId === null ? 'без носителя' : 'в крыле носителя'
    case 'salvage':
      return 'собирает лом'
  }
}

const MODULE_RU = { engines: 'двигатели', turrets: 'турели', hangar: 'ангар', mainGun: 'главный калибр', launchers: 'пусковые' }

const fmtInt = (n: number): string => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')

export function shipCard(w: World, id: number): CardData | null {
  const ship = w.ships.find((s) => s.id === id)
  if (!ship) return null
  const owner = civById(w, ship.owner)
  const where = ship.transit ? 'в коридоре' : w.galaxy.systems[ship.systemId].name
  const rows: CardRow[] = [
    { label: 'задача', value: missionText(w, ship) },
    { label: 'где', value: where },
  ]
  const c = ship.combat
  if (c) {
    rows.push({ label: 'корпус', value: `${fmtInt(c.hull)} / ${fmtInt(c.hullMax)}`, tone: c.hull < c.hullMax * 0.3 ? 'bad' : undefined })
    if (c.shieldMax > 0) rows.push({ label: 'щит', value: `${fmtInt(c.shield)} / ${fmtInt(c.shieldMax)}` })
    const hurt = (Object.keys(c.modules) as (keyof typeof MODULE_RU)[]).filter((m) => (c.modules[m] ?? 1) < 1)
    rows.push({
      label: 'модули',
      value: hurt.length ? hurt.map((m) => `${MODULE_RU[m]} ${(c.modules[m] ?? 0) <= 0 ? 'выбиты' : 'повреждены'}`).join(', ') : 'целы',
      tone: hurt.length ? 'bad' : 'good',
    })
    rows.push({ label: 'ранг', value: c.rank ? roman(c.rank) : '—' })
    const fleet = ship.fleetId === null ? undefined : w.fleets.find((f) => f.id === ship.fleetId)
    if (fleet) rows.push({ label: 'флот', value: fleet.name })
    if (c.burning !== null) rows.push({ label: 'состояние', value: 'горит', tone: 'bad' })
  }
  return { kind: 'ship', title: SHIP_RU[ship.kind], subtitle: owner?.name, color: owner ? hex(owner.color) : undefined, rows }
}

// ---------- бой и флот ----------

export function fleetMissionText(w: World, m: FleetMission): string {
  const name = (id: string) => w.planets.get(id)?.name ?? '?'
  switch (m.type) {
    case 'show': return `показывает силу у ${name(m.planetId)}`
    case 'defend': return `защищает ${name(m.planetId)}`
    case 'breakout': return `прорыв к ${name(m.toPlanetId)}`
    case 'return': return `возвращается к ${name(m.planetId)}`
    case 'dock': return `идёт в док ${name(m.planetId)}`
  }
}

const COMBAT_RU: Record<CombatKind, string> = {
  corvette: 'Корвет', torpedo: 'Торп. катер', frigate: 'Фрегат', battleship: 'Линкор', carrier: 'Носитель',
  interceptor: 'Перехватчик', bomber: 'Бомбардировщик', trooper: 'Десантник', supply: 'Снабженец', scout: 'Разведчик',
}

interface ClassTally { alive: number; burning: number }

/** один проход по w.ships: живые боевые корабли сторон по классам, залпы фрегатов, крыло */
function tallySides(w: World, b: Battle) {
  const fleetSide = new Map<number, 0 | 1>()
  b.sides.forEach((side, i) => side.fleetIds.forEach((f) => fleetSide.set(f, i as 0 | 1)))
  const tally = [new Map<CombatKind, ClassTally>(), new Map<CombatKind, ClassTally>()]
  const ammo = [0, 0]
  const frigates = [0, 0]
  const air = [0, 0]
  const deck = [0, 0]
  for (const s of w.ships) {
    if (!s.alive || !s.combat || !isCombatKind(s.kind)) continue
    let side = s.fleetId === null ? undefined : fleetSide.get(s.fleetId)
    if (side === undefined && s.combat.carrierId !== null) {
      const ci = w.shipIndex.get(s.combat.carrierId)
      const car = ci === undefined ? undefined : w.ships[ci]
      if (car && car.fleetId !== null) side = fleetSide.get(car.fleetId)
    }
    if (side === undefined) continue
    const t = tally[side].get(s.kind) ?? { alive: 0, burning: 0 }
    t.alive++
    if (s.combat.burning !== null) t.burning++
    tally[side].set(s.kind, t)
    if (s.kind === 'frigate') {
      ammo[side] += s.combat.ammo
      frigates[side]++
    }
    if (s.kind === 'interceptor' || s.kind === 'bomber') {
      if (s.combat.wing?.phase === 'air') air[side]++
      else deck[side]++
    }
  }
  return { tally, ammo, frigates, air, deck }
}

const admiralOf = (w: World, f: Fleet) => w.admirals.find((a) => a.id === f.admiralId)

function sideSection(w: World, b: Battle, i: 0 | 1, t: ReturnType<typeof tallySides>): { title: string; rows: CardRow[]; color?: string } {
  const side: BattleSide = b.sides[i]
  const civ = civById(w, side.civ)
  const fleets = side.fleetIds.map((id) => w.fleets.find((f) => f.id === id)).filter((f): f is Fleet => !!f)
  const lead = fleets[0]
  const adm = lead ? admiralOf(w, lead) : undefined
  const rows: CardRow[] = [{ label: 'роль', value: side.role === 'attacker' ? 'нападает' : 'защищается' }]
  if (adm) rows.push({ label: 'адмирал', value: `${adm.name} — ${traitName(adm.trait)}` })
  if (lead) {
    rows.push({ label: 'приказ', value: orderName(lead.order) })
    if (lead.orderReason) rows.push({ label: 'причина', value: lead.orderReason, tone: 'muted' })
    const coh = Math.round(fleets.reduce((s, f) => s + f.cohesion, 0) / fleets.length)
    rows.push({ label: 'сплочённость', value: String(coh), tone: coh < 30 ? 'bad' : undefined })
  }
  if (t.frigates[i] > 0) {
    const max = t.frigates[i] * CLASSES.frigate.ammo
    rows.push({ label: 'залпы', value: `${Math.round((t.ammo[i] / max) * 10)} из 10` })
  }
  const was = (side.classes0?.interceptor ?? 0) + (side.classes0?.bomber ?? 0)
  if (was > 0 || t.air[i] + t.deck[i] > 0) {
    const lost = Math.max(0, was - t.air[i] - t.deck[i])
    rows.push({ label: 'крыло', value: `${t.air[i]} в воздухе / ${t.deck[i]} на палубе / ${lost} потеряно` })
  }
  return { title: civ?.name ?? '?', rows, color: civ ? hex(civ.color) : undefined }
}

export function battleCard(w: World, id: number): CardData | null {
  const b = w.battles.find((x) => x.id === id)
  if (!b) return null
  const sys = w.galaxy.systems[b.systemId]
  const planet = b.planetId ? w.planets.get(b.planetId) : undefined
  const t = tallySides(w, b)
  const names = b.sides.map((s) => civById(w, s.civ)?.name ?? '?')
  let sub = phaseName(b.phase)
  if (b.phase === 'decision' && b.decisionDeadline !== null) sub += ` · ${fmtDuration(Math.max(0, b.decisionDeadline - w.t))}`
  const head = ['класс', ...names.flatMap((n) => [`${n}: было`, 'живы', 'горят'])]
  const kinds = new Set<CombatKind>()
  for (let i = 0; i < 2; i++) {
    for (const k of t.tally[i].keys()) kinds.add(k)
    for (const k of Object.keys(b.sides[i].classes0 ?? {})) if (k in CLASSES) kinds.add(k as CombatKind)
  }
  const order = Object.keys(CLASSES) as CombatKind[]
  const rows = order.filter((k) => kinds.has(k)).map((k) => [
    COMBAT_RU[k],
    ...[0, 1].flatMap((i) => {
      const cur = t.tally[i].get(k) ?? { alive: 0, burning: 0 }
      const was = b.sides[i].classes0?.[k] ?? cur.alive
      return [String(was), String(cur.alive), String(cur.burning)]
    }),
  ])
  const arrow = b.pressureState === 1 ? `давит ${names[0]}` : b.pressureState === -1 ? `давит ${names[1]}` : 'равновесие'
  const share = b.pressure > 0 ? b.pressure / (1 + b.pressure) : 0.5
  return {
    kind: 'battle',
    title: `Бой у ${planet?.name ?? sys.name}`,
    subtitle: sub,
    rows: [
      { label: 'силы', value: `${Math.round(strengthOf(w, b.sides[0]))} : ${Math.round(strengthOf(w, b.sides[1]))}` },
      { label: 'давление', value: arrow },
    ],
    sections: [sideSection(w, b, 0, t), sideSection(w, b, 1, t)],
    table: { head, rows },
    meter: [{ label: 'давление', value: share, left: names[0], right: names[1] }],
    log: b.log.slice(-30),
    logAll: b.log.slice(-EVENTS.battleLog),
  }
}

export function fleetCard(w: World, id: number): CardData | null {
  const f = w.fleets.find((x) => x.id === id)
  if (!f) return null
  const civ = civById(w, f.owner)
  const adm = admiralOf(w, f)
  const counts = new Map<CombatKind, number>()
  for (const sid of f.shipIds) {
    const i = w.shipIndex.get(sid)
    const s = i === undefined ? undefined : w.ships[i]
    if (s && s.alive && isCombatKind(s.kind)) counts.set(s.kind, (counts.get(s.kind) ?? 0) + 1)
  }
  const comp = (Object.keys(CLASSES) as CombatKind[]).filter((k) => counts.has(k)).map((k) => `${COMBAT_RU[k]} ${counts.get(k)}`)
  const rows: CardRow[] = [
    { label: 'адмирал', value: adm ? `${adm.name} — ${traitName(adm.trait)}` : '—' },
    { label: 'миссия', value: fleetMissionText(w, f.mission) },
    { label: 'приказ', value: orderName(f.order) },
  ]
  if (f.orderReason) rows.push({ label: 'причина', value: f.orderReason, tone: 'muted' })
  rows.push({ label: 'состав', value: comp.length ? comp.join(', ') : '—' })
  rows.push({ label: 'сплочённость', value: String(Math.round(f.cohesion)), tone: f.cohesion < 30 ? 'bad' : undefined })
  const left = f.mobilizedAt + WAR.mobilizeT - w.t
  if (f.mothballedSince !== null) rows.push({ label: 'состояние', value: 'в консервации', tone: 'muted' })
  else if (left > 0) rows.push({ label: 'состояние', value: `мобилизация ${Math.ceil(left)} с` })
  return { kind: 'fleet', title: f.name, subtitle: civ?.name, color: civ ? hex(civ.color) : undefined, rows }
}

export function cardFor(w: World, pick: Pick | null): CardData | null {
  if (!pick) return null
  if (pick.type === 'planet') return planetCard(w, pick.id)
  if (pick.type === 'system') return systemCard(w, pick.id)
  if (pick.type === 'battle') return battleCard(w, pick.id)
  if (pick.type === 'fleet') return fleetCard(w, pick.id)
  return shipCard(w, pick.id)
}
