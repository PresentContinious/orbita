import { describe, expect, it } from 'vitest'
import { createArena, parseArena, runArena } from '../../src/sim/arena'
import {
  checkOver, createBattle, detectBattles, finishBattle, isHostile, noteHullLoss, setHostile, targetValueOf, updateCohesion,
  updatePhase, updatePressure,
} from '../../src/sim/battle'
import { BATTLE } from '../../src/sim/combat-config'
import { SIM_DT } from '../../src/sim/config'
import { applyHit } from '../../src/sim/damage'
import { shipById } from '../../src/sim/ships'
import { capitalOf } from '../../src/sim/query'
import type { Battle, Fleet, World } from '../../src/sim/types'

const arena = (q: string): World => createArena(parseArena(q))

/** якорь флота в координатах системы (без системы отсчёта планеты) */
function put(f: Fleet, x: number, y: number): void {
  f.frame = null
  f.anchor = { x, y }
}

/** две стороны арены, якоря на заданной дистанции друг от друга; боя ещё нет, враждебность снята */
function pair(q = 'A=3bb,2co&B=3bb&seed=1', gap = 600): { w: World; a: Fleet; b: Fleet } {
  const w = arena(q)
  w.hostility.clear()
  const [a, b] = w.fleets
  put(a, 1000, 1000)
  put(b, 1000 + gap, 1000)
  return { w, a, b }
}

function tick(w: World): void {
  w.t += SIM_DT
  w.tick++
}

/** n секунд шагов: каждую секунду по hit хитов; `deal` — сколько корпуса снято сторонами в секунду (прямо в кольцо давления) */
function runPressure(w: World, b: Battle, seconds: number, deal: [number, number]): void {
  const steps = Math.round(seconds / SIM_DT)
  for (let i = 0; i < steps; i++) {
    tick(w)
    const slot = Math.floor(w.tick / 10) % BATTLE.pressureWindow
    // очистку слота делает updatePressure; пишем после неё
    updatePressure(w, b)
    b.sides[0].hullDealt[slot] += deal[0] * SIM_DT
    b.sides[1].hullDealt[slot] += deal[1] * SIM_DT
  }
}

describe('бой: обнаружение', () => {
  it('бой создаётся при якорях ближе 700 только у враждебных; невраждебные соседи боя не начинают', () => {
    const { w, a, b } = pair('A=3bb&B=3bb&seed=1', 600)
    detectBattles(w)
    expect(w.battles.length).toBe(0)
    expect(isHostile(w, a.owner, b.owner)).toBe(false)
    setHostile(w, a.owner, b.owner, w.t + 100)
    expect(isHostile(w, b.owner, a.owner)).toBe(true) // порядок пары не важен
    put(b, 1000 + 800, 1000)
    detectBattles(w)
    expect(w.battles.length).toBe(0) // враги, но дальше 700
    put(b, 1000 + 600, 1000)
    detectBattles(w)
    expect(w.battles.length).toBe(1)
    const battle = w.battles[0]
    expect(battle.phase).toBe('approach')
    expect(a.battleId).toBe(battle.id)
    expect(b.battleId).toBe(battle.id)
    // нападающий — сторона 0, защитник (миссия defend) — сторона 1
    expect(battle.sides[0].role).toBe('attacker')
    expect(battle.sides[1].role).toBe('defender')
    expect(battle.sides[0].civ).toBe(a.owner)
    const ev = w.events.find((e) => e.at.battle === battle.id)!
    expect(ev.pri).toBe(1)
    expect(ev.text).toContain('встречает')
    // повторное обнаружение не создаёт второй бой
    detectBattles(w)
    expect(w.battles.length).toBe(1)
    // классы на старте записаны для карточки
    expect(battle.sides[0].classes0).toEqual({ battleship: 3 })
  })

  it('вражда истекает: после untilT бой не создаётся', () => {
    const { w, a, b } = pair('A=2bb&B=2bb&seed=1', 600)
    setHostile(w, a.owner, b.owner, w.t + 1)
    w.t += 2
    detectBattles(w)
    expect(w.battles.length).toBe(0)
  })
})

describe('бой: фазы', () => {
  it('фазы: engage при 320, line при D*, decision после последнего залпа, over через 30 с без врагов на 800', () => {
    const { w, a, b } = pair('A=3bb&B=3bb&seed=1', 600)
    setHostile(w, a.owner, b.owner, Infinity)
    detectBattles(w)
    const battle = w.battles[0]
    updatePhase(w, battle)
    expect(battle.phase).toBe('approach')
    put(b, 1000 + 330, 1000)
    updatePhase(w, battle)
    expect(battle.phase).toBe('approach')
    put(b, 1000 + 310, 1000)
    updatePhase(w, battle)
    expect(battle.phase).toBe('engage')
    put(b, 1000 + 180, 1000)
    updatePhase(w, battle)
    expect(battle.phase).toBe('engage') // D* = 170
    put(b, 1000 + 165, 1000)
    updatePhase(w, battle)
    expect(battle.phase).toBe('line')
    // последний залп одной стороны → решение, таймер 60 с
    battle.sides[0].outOfAmmo = true
    updatePhase(w, battle)
    expect(battle.phase).toBe('decision')
    expect(battle.decisionDeadline).toBeCloseTo(w.t + BATTLE.decisionT)
    // враги разошлись дальше 800: через 30 с бой закрыт
    put(b, 1000 + 900, 1000)
    checkOver(w, battle)
    expect(battle.phase).toBe('decision')
    w.t += BATTLE.overAfter - 1
    checkOver(w, battle)
    expect(battle.phase).not.toBe('over')
    w.t += 1.5
    checkOver(w, battle)
    expect(battle.phase).toBe('over')
    expect(a.battleId).toBeNull()
    expect(b.battleId).toBeNull()
    // каждый переход — строка в журнале
    const phases = battle.log.filter((e) => e.kind === 'phase').map((e) => e.text)
    expect(phases.some((t) => t.startsWith('Завязка'))).toBe(true)
    expect(phases.some((t) => t.startsWith('Линия'))).toBe(true)
    expect(phases.some((t) => t.startsWith('Решение'))).toBe(true)
  })

  it('затянувшаяся линия: 240 с при давлении в полосе 30 с → решение', () => {
    const { w, a, b } = pair('A=3bb&B=3bb&seed=1', 160)
    setHostile(w, a.owner, b.owner, Infinity)
    detectBattles(w)
    const battle = w.battles[0]
    updatePhase(w, battle) // approach → engage → line за один вызов
    expect(battle.phase).toBe('line')
    w.t += 100
    updatePhase(w, battle)
    expect(battle.phase).toBe('line')
    w.t = battle.lineSince + BATTLE.lineTimeout - 1
    battle.bandSince = w.t - BATTLE.bandHold - 1
    updatePhase(w, battle)
    expect(battle.phase).toBe('line') // 240 с ещё не прошло
    w.t += 2
    battle.bandSince = w.t - BATTLE.bandHold - 1
    updatePhase(w, battle)
    expect(battle.phase).toBe('decision')
  })
})

describe('бой: давление', () => {
  it('порог 1.25 должен держаться 20 с; переворот считается в pressureFlips; D* давящего −30, не чаще 40 с', () => {
    const { w, a, b } = pair('A=3bb&B=3bb&seed=1', 160)
    setHostile(w, a.owner, b.owner, Infinity)
    detectBattles(w)
    const battle = w.battles[0]
    // первые 30 с давление 1.0, что бы ни происходило
    runPressure(w, battle, 29, [50, 0])
    expect(battle.pressure).toBe(1)
    // сторона 0 снимает корпус, сторона 1 — нет; порог пройден, но 20 с ещё не держится
    runPressure(w, battle, 10, [50, 0])
    expect(battle.pressure).toBeGreaterThanOrEqual(BATTLE.pressureHi)
    expect(battle.pressureState).toBe(0)
    expect(a.dStar).toBe(BATTLE.dStar.line)
    runPressure(w, battle, 15, [50, 0])
    expect(battle.pressureState).toBe(1)
    expect(a.dStar).toBe(BATTLE.dStar.line - BATTLE.pressDStar)
    expect(b.dStar).toBe(BATTLE.dStar.line)
    expect(battle.metrics.dStarChanges).toBe(1)
    expect(battle.pressureFlips).toBe(0)
    // перелом: теперь давит сторона 1 — это переворот
    runPressure(w, battle, 80, [0, 50])
    expect(battle.pressureState).toBe(-1)
    expect(battle.pressureFlips).toBe(1)
    expect(b.dStar).toBe(BATTLE.dStar.line - BATTLE.pressDStar)
    const flips = battle.log.filter((e) => e.kind === 'pressure').length
    expect(flips).toBeGreaterThanOrEqual(2)
  })

  it('смена D* не чаще dStarCooldown: недавняя смена откладывает снижение, не отменяя его', () => {
    const { w, a, b } = pair('A=3bb&B=3bb&seed=1', 160)
    setHostile(w, a.owner, b.owner, Infinity)
    detectBattles(w)
    const battle = w.battles[0]
    runPressure(w, battle, 40, [50, 0])
    expect(battle.pressureState).toBe(0)
    a.dStarSince = w.t // «только что менялось»
    const mark = w.t
    runPressure(w, battle, 20, [50, 0])
    expect(battle.pressureState).toBe(1)
    expect(a.dStar).toBe(BATTLE.dStar.line) // кулдаун держит
    runPressure(w, battle, BATTLE.dStarCooldown - (w.t - mark) + 1, [50, 0])
    expect(a.dStar).toBe(BATTLE.dStar.line - BATTLE.pressDStar)
    expect(battle.metrics.dStarChanges).toBe(1)
  })

  it('noteHullLoss засчитывает корпус другой стороне', () => {
    const { w, a, b } = pair('A=3bb&B=3bb&seed=1', 160)
    setHostile(w, a.owner, b.owner, Infinity)
    detectBattles(w)
    const battle = w.battles[0]
    const victim = shipById(w, b.shipIds[0])!
    noteHullLoss(w, battle, victim, 40)
    expect(battle.sides[0].hullDealt.reduce((s, x) => s + x, 0)).toBe(40)
    expect(battle.sides[1].hullDealt.reduce((s, x) => s + x, 0)).toBe(0)
  })
})

describe('бой: сплочённость', () => {
  function cohesionSetup(q: string) {
    const { w, a, b } = pair(q, 600)
    setHostile(w, a.owner, b.owner, Infinity)
    return { w, a, b }
  }

  it('сплочённость: старт 70 + слава 3 + ветераны; два попадания без потерь ничего не меняют; потеря 25 % стоимости → −20', () => {
    const { w, a, b } = cohesionSetup('A=4bb&B=3bb&seed=1')
    w.admirals.find((x) => x.id === a.admiralId)!.fame = 3
    for (const id of a.shipIds.slice(0, 3)) shipById(w, id)!.combat!.rank = 3 // Σ ранг 9 → +3
    const battle = createBattle(w, a, b)
    updateCohesion(w, battle, 0)
    expect(a.cohesion).toBe(BATTLE.cohesion.start + 3 + 3)
    expect(b.cohesion).toBe(BATTLE.cohesion.start)
    // два попадания по уцелевшим
    const s = shipById(w, a.shipIds[1])!
    applyHit(w, s, 30, 'collision', 0)
    applyHit(w, s, 30, 'collision', 0)
    updateCohesion(w, battle, 0)
    expect(a.cohesion).toBe(76)
    // гибнет линкор (не флагман): 600 из 2400 = 25 % → −20
    const victim = a.shipIds.map((id) => shipById(w, id)!).find((x) => x.id !== a.flagshipId)!
    victim.alive = false
    updateCohesion(w, battle, 0)
    expect(a.cohesion).toBeCloseTo(76 - 20, 6)
    expect(b.cohesion).toBe(70) // у противника ничего не изменилось
  })

  it('флагман −15, с передачей −5; носитель −8', () => {
    for (const passed of [false, true]) {
      const { w, a, b } = cohesionSetup('A=4bb&B=2bb&seed=1')
      const battle = createBattle(w, a, b)
      updateCohesion(w, battle, 0)
      const base = a.cohesion
      const flag = shipById(w, a.flagshipId!)!
      if (passed) a.flagSince = w.t // идёт передача флага
      flag.alive = false
      updateCohesion(w, battle, 0)
      const lost = (flag.price / battle.sides[0].value0) * BATTLE.cohesion.lostMul
      expect(a.cohesion).toBeCloseTo(base - lost - (passed ? BATTLE.cohesion.flagshipPassed : BATTLE.cohesion.flagship), 6)
    }
    const { w, a, b } = cohesionSetup('A=3bb,1cv&B=2bb&seed=1')
    const battle = createBattle(w, a, b)
    updateCohesion(w, battle, 0)
    const base = a.cohesion
    const cv = a.shipIds.map((id) => shipById(w, id)!).find((x) => x.kind === 'carrier')!
    cv.alive = false
    updateCohesion(w, battle, 0)
    const lost = (cv.price / battle.sides[0].value0) * BATTLE.cohesion.lostMul
    // если носитель ещё и флагман, к потере прибавляется флагман
    const flag = cv.id === a.flagshipId ? BATTLE.cohesion.flagship : 0
    expect(a.cohesion).toBeCloseTo(base - lost - BATTLE.cohesion.carrier - flag, 6)
  })
})

describe('бой: ценность цели', () => {
  it('targetValueOf: столица, плацдарм, pop ≥ 3 — high; прочее — low', () => {
    const w = arena('A=2bb&B=2bb&seed=1')
    const civ = w.civs[1]
    const cap = capitalOf(w, civ)!
    expect(targetValueOf(w, cap, civ)).toBe('high')
    // не столица той же системы, мало жителей
    const side = w.galaxy.systems[cap.systemId].planets.find((p) => p.id !== cap.id)!
    side.owner = civ.id
    side.pop = 1
    expect(targetValueOf(w, side, civ)).toBe('low')
    side.pop = BATTLE.highValuePop
    expect(targetValueOf(w, side, civ)).toBe('high')
    // единственная планета в чужой системе — плацдарм
    side.pop = 1
    const other = w.galaxy.systems.find((s) => s.id !== cap.systemId && s.planets.length >= 2)!
    for (const p of other.planets) p.owner = null
    const [p1, p2] = other.planets
    p1.owner = civ.id
    p1.pop = 1
    expect(targetValueOf(w, p1, civ)).toBe('high')
    p2.owner = civ.id
    p2.pop = 1
    expect(targetValueOf(w, p1, civ)).toBe('low') // две планеты — уже не плацдарм
  })
})

describe('бой: прогон на арене', () => {
  const Q = 'A=3bb,1cv,3ff,6co&B=2bb,2ff,1cv,4tb&seed=3'

  it('одно зерно — один журнал боя: два прогона арены 3 000 шагов дают одинаковые log и positionsHash', () => {
    const r1 = runArena(arena(Q), 3000)
    const r2 = runArena(arena(Q), 3000)
    expect(r1.log.length).toBeGreaterThan(5)
    expect(JSON.stringify(r1.log)).toBe(JSON.stringify(r2.log))
    expect(r1.positionsHash).toBe(r2.positionsHash)
    expect(JSON.stringify(r1.metrics)).toBe(JSON.stringify(r2.metrics))
  })

  it('разные зёрна — разный ход: модули или log отличаются', () => {
    const r1 = runArena(arena('A=3bb,1cv,3ff,6co&B=2bb,2ff,1cv,4tb&seed=1'), 3000)
    const r2 = runArena(arena('A=3bb,1cv,3ff,6co&B=2bb,2ff,1cv,4tb&seed=2'), 3000)
    const text = (r: { log: { kind: string; text: string }[] }) => JSON.stringify(r.log.filter((e) => e.kind === 'module' || e.kind === 'death'))
    expect(text(r1) === text(r2) && r1.positionsHash === r2.positionsHash).toBe(false)
  })

  it('metrics: leaderAt60 задан, maxQuiet считается по lastEventT, missilesFired ≥ missilesHit', () => {
    const r = runArena(arena(Q), 3000)
    const m = r.metrics!
    expect(m.leaderAt60 === 0 || m.leaderAt60 === 1).toBe(true)
    expect(m.maxQuiet).toBeGreaterThan(0)
    expect(m.maxQuiet).toBeLessThan(r.durationS)
    expect(m.missilesFired).toBeGreaterThan(0)
    expect(m.missilesFired).toBeGreaterThanOrEqual(m.missilesHit)
    expect(m.minHullDist).toBeLessThan(Infinity)
    expect(m.capitalLineT).toBeGreaterThan(0)
    expect(m.capitalOffSlotT).toBeLessThanOrEqual(m.capitalLineT)
  })

  it('вердикт: strength0 ≥ 1.5× → фактор «число»; класс-убийца из battle.damage; событие P0 с at.battle; потери в кредитах по живым', () => {
    const { w, a, b } = pair('A=6bb,3co&B=2bb&seed=1', 600)
    setHostile(w, a.owner, b.owner, Infinity)
    const battle = createBattle(w, a, b)
    expect(battle.sides[0].strength0).toBeGreaterThanOrEqual(1.5 * battle.sides[1].strength0)
    battle.damage = { 'battleship→battleship': 3000, 'corvette→battleship': 10, 'torpedo→battleship': 99999 } // торпедных катеров у победителя нет
    for (const id of b.shipIds.slice()) shipById(w, id)!.alive = false // защитник уничтожен
    finishBattle(w, battle)
    expect(battle.factors).toContain('число')
    expect(battle.factors).toContain('класс-убийца')
    expect(battle.verdict).toContain('линкоры')
    expect(battle.verdict).toContain('одолел')
    const ev = w.events.find((e) => e.kind === 'verdict' && e.at.battle === battle.id)!
    expect(ev.pri).toBe(0)
    expect(ev.text).toBe(battle.verdict)
    // потери в кредитах — по живым кораблям: два линкора защитника = 1200, у нападающего ничего
    expect(battle.sides[1].lossValue).toBe(1200)
    expect(battle.sides[0].lossValue).toBe(0)
    expect(battle.verdict).toContain('Потери:')
    expect(battle.verdict).toContain('1200 кр')
  })

  it('прогон арены до конца: вердикт в журнале и в ленте, потери в тексте вердикта', () => {
    const w = arena('A=3bb,1cv,3ff,6co&B=2bb,2ff,1cv,4tb&seed=2')
    const r = runArena(w, 6000)
    const battle = w.battles[0]
    expect(r.phase).toBe('over')
    expect(battle.verdict).toBeTruthy()
    expect(r.factors.length).toBeGreaterThan(0)
    const ev = w.events.find((e) => e.kind === 'verdict' && e.at.battle === battle.id)!
    expect(ev.pri).toBe(0)
    // вердикт фиксирует потери на момент конца боя; догорающие после него в ведомость арены попадают позже
    expect(battle.sides[0].lossValue).toBeLessThanOrEqual(r.losses[0])
    expect(battle.sides[1].lossValue).toBeLessThanOrEqual(r.losses[1])
    expect(battle.verdict).toContain(Math.round(battle.sides[0].lossValue) + ' кр')
    expect(battle.log[battle.log.length - 1].kind).toBe('verdict')
  })

  it('combat.battles и rank растут только после over; rank ≤ 3', () => {
    const { w, a, b } = pair('A=2bb&B=2bb&seed=1', 600)
    setHostile(w, a.owner, b.owner, Infinity)
    const battle = createBattle(w, a, b)
    const s = shipById(w, a.shipIds[0])!
    const t = shipById(w, b.shipIds[0])!
    t.combat!.rank = 3
    expect(s.combat!.battles).toBe(0)
    expect(s.combat!.rank).toBe(0)
    updateCohesion(w, battle, 0)
    updatePhase(w, battle)
    expect(s.combat!.battles).toBe(0)
    expect(s.combat!.rank).toBe(0)
    finishBattle(w, battle)
    expect(battle.phase).toBe('over')
    expect(s.combat!.battles).toBe(1)
    expect(s.combat!.rank).toBe(1)
    expect(t.combat!.rank).toBe(BATTLE.rankMax) // потолок
    // повторный finish ничего не добавляет
    finishBattle(w, battle)
    expect(s.combat!.battles).toBe(1)
  })
})
