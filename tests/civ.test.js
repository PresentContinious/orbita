import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { atWar, freeze, makeEngine, onlyStates, run, seedRandom } from './harness.js'

beforeEach(() => seedRandom(42))
afterEach(() => vi.restoreAllMocks())

describe('экономика', () => {
  test('отбитый обратно караван не печатает деньги', () => {
    const e = makeEngine()
    const c = e.civ
    const [A, B] = c.states
    onlyStates(c, A, B)
    freeze(A, B)
    atWar(c, A, B)
    const bHome = c.planetById(B.home)
    // караван, который A когда-то перехватило у B: возит A дань с планеты B
    const sh = c._spawnShip('transport', A, bHome)
    sh.mission = { type: 'trade', a: A.id, b: A.id, from: bHome.id, to: c.planetById(A.home).id, leg: 0, boost: 1.5 }
    // дредноут B его подбивает — караван снова у B
    sh.hp = 0
    sh.killer = B.id

    const before = B.credits
    run(e, 10)

    // честный доход B за 10 с — налоги с ~2 тыс. жителей, единицы кредитов
    expect(B.credits - before).toBeLessThan(200)
  })

  test('выработанные до нуля пояса астероидов снова зарастают рудой', () => {
    const e = makeEngine()
    const c = e.civ
    onlyStates(c, c.states[0])
    freeze(c.states[0])
    c.asteroids = [] // шахтёры выгребли всё

    run(e, 90)

    expect(c.asteroids.length).toBeGreaterThan(0)
  })

  test('купленный корабль появляется, даже когда небо забито истребителями', () => {
    const e = makeEngine()
    const c = e.civ
    const A = c.states[0]
    onlyStates(c, A)
    const home = c.planetById(A.home)
    for (let i = 0; i < 130; i++) c._spawnShip('fighter', A, home)
    const d = c._spawnShip('dread', A, home)
    expect(c.ships).toContain(d)
  })
})

describe('колонизация', () => {
  // мирное государство A: зрелая столица, денег на экспедицию с запасом
  function matureState() {
    const e = makeEngine()
    const c = e.civ
    const A = c.states[0]
    onlyStates(c, A)
    const home = c.planetById(A.home)
    home.pop = home.baseR * 1.3 * 0.8
    home.pvoUnits = home.pvoReady = 2
    A.credits = 1000
    A.decideT = 0
    return { e, c, A, home }
  }

  test('колонистов набирают в столице, а не на крошечной колонии', () => {
    const { e, c, A, home } = matureState()
    // колония A на орбите ближе к солнцу, чем столица
    const colony = e.planets.find((p) => !p.owner && !p.barren && p.orbit < home.orbit)
    expect(colony).toBeDefined()
    colony.owner = A.id
    colony.pop = 0.2
    colony.pvoUnits = colony.pvoReady = 1
    const homePop = home.pop

    run(e, 0.2) // одно решение

    expect(c.ships.some((s) => s.owner === A.id && s.mission?.type === 'colonize')).toBe(true)
    expect(colony.pop).toBeGreaterThan(0.19)
    expect(home.pop).toBeLessThan(homePop - 0.1)
  })

  test('две экспедиции не летят на одну и ту же планету', () => {
    const { e, c, A } = matureState()
    A.credits = 5000 // хватит на несколько экспедиций подряд

    // записываем каждую отправленную экспедицию: несколько решений, пока первые ещё в пути
    const sent = new Map()
    for (let i = 0; i < 200; i++) {
      run(e, 0.1)
      for (const s of c.ships) if (s.owner === A.id && s.mission?.type === 'colonize') sent.set(s.id, s.mission.planet)
    }

    const targets = [...sent.values()]
    expect(targets.length).toBeGreaterThan(1)
    expect(new Set(targets).size).toBe(targets.length)
  })

  test('потеряв столицу, государство продолжает колонизацию', () => {
    const { e, c, A, home } = matureState()
    // вторая планета A — большая и зрелая, может стать новой столицей
    const second = e.planets.find((p) => !p.owner && !p.barren && p.baseR >= 7)
    second.owner = A.id
    second.pop = second.baseR * 1.3 * 0.8
    second.pvoUnits = second.pvoReady = 2
    // старую столицу захватили
    const B = c._makeState(home, 0.5, { name: 'Захватчик' })
    freeze(B)

    run(e, 0.2) // одно решение A

    expect(c.ships.some((s) => s.owner === A.id && s.mission?.type === 'colonize')).toBe(true)
  })
})

describe('война', () => {
  // A сильнее и воюет с B; два дредноута A уже у планеты B, её ПВО подавлено
  function suppressedSiege() {
    const e = makeEngine()
    const c = e.civ
    const [A, B] = c.states
    onlyStates(c, A, B)
    freeze(B)
    A.missileT = A.breakerT = 1e9 // только флот и десант, без ракет
    atWar(c, A, B)
    c.planetById(A.home).pop = 8
    A.credits = 2000
    const target = c.planetById(B.home)
    target.pop = 2
    target.pvoUnits = target.pvoReady = 0
    for (let i = 0; i < 2; i++) {
      const d = c._spawnShip('dread', A, target)
      d.home = A.home
      d.mission = { type: 'siege', planet: target.id }
    }
    return { e, c, A, B, target }
  }

  test('планету с подавленным ПВО берут десантом, а не выжигают', () => {
    const owners = []
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      seedRandom(seed)
      const { e, A, target } = suppressedSiege()
      // до первой смены владельца: захваченная колония потом может отделиться — это другая механика
      for (let s = 0; s < 120 && target.owner !== A.id && target.owner; s++) run(e, 1)
      owners.push(target.owner === A.id ? 'A' : target.owner ? 'B' : 'пусто')
    }
    expect(owners).toEqual(['A', 'A', 'A', 'A', 'A', 'A'])
  })

  test('осаждённый не выходит из войны, пока у его планеты стоит вражеский флот', () => {
    const e = makeEngine()
    const c = e.civ
    const [A, B] = c.states
    onlyStates(c, A, B)
    freeze(A) // A только осаждает, десант не шлёт
    atWar(c, A, B) // война идёт давно, B проигрывает — по старым правилам ему положен мир
    c.planetById(A.home).pop = 8
    const target = c.planetById(B.home)
    target.pop = 2
    for (let i = 0; i < 2; i++) {
      const d = c._spawnShip('dread', A, target)
      d.home = A.home
      d.mission = { type: 'siege', planet: target.id }
    }
    run(e, 60)
    expect(c.isWar(A.id, B.id)).toBe(true)
  })

  test('пиратское логово с подавленным ПВО выжигают', () => {
    const e = makeEngine()
    const c = e.civ
    const A = c.states[0]
    onlyStates(c, A)
    const den = e.planets.find((p) => p.barren && !p.owner)
    const P = c._makeState(den, 0.3, { pirate: true, name: 'Вольница', credits: 0 })
    freeze(A, P) // пираты не успевают эвакуироваться
    den.pvoUnits = den.pvoReady = 0
    for (let i = 0; i < 2; i++) {
      const d = c._spawnShip('dread', A, den)
      d.home = A.home
      d.mission = { type: 'siege', planet: den.id }
    }
    run(e, 60)
    expect(den.owner).toBe(null)
  })
})

describe('скорость времени', () => {
  // 5 истребителей A гонятся 20 с за неубиваемым транспортом B — сколько урона успеют нанести
  function fighterDamage(seed, speed, dt) {
    seedRandom(seed)
    const e = makeEngine()
    const c = e.civ
    const [A, B] = c.states
    onlyStates(c, A, B)
    freeze(A, B)
    atWar(c, A, B)
    const home = c.planetById(A.home)
    const away = (p) => Math.hypot(p.x - home.x, p.y - home.y)
    const far = e.planets.filter((p) => !p.owner).sort((a, b) => away(b) - away(a))[0]
    const prey = c._spawnShip('transport', B, home)
    prey.hp = prey.maxHp = 1e6
    prey.home = B.home
    prey.mission = { type: 'colonize', planet: far.id, settlers: 0.1 }
    for (let i = 0; i < 5; i++) c._spawnShip('fighter', A, home)
    run(e, 20, { speed, dt })
    return 1e6 - prey.hp
  }

  test('на ×50 истребители бьют так же, как на ×1', () => {
    let x1 = 0
    let x50 = 0
    for (const seed of [1, 2, 3]) {
      x1 += fighterDamage(seed, 1, 1 / 60)
      // кадр 50 мс (просадка FPS) на ×50 — 2.5 игровых секунды за кадр
      x50 += fighterDamage(seed, 50, 0.05)
    }
    expect(x1).toBeGreaterThan(100)
    expect(x50).toBeGreaterThan(x1 * 0.6)
  })
})
