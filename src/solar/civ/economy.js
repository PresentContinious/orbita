// Экономика: население, руда, ПВО-стройка, караваны, колонизация, шахтёры, астероиды

import { TAU, clamp, rand, pick, dist, SHIP, PVO_ORE, nextId } from './constants.js'

export function populations(civ, h) {
  for (const p of civ.e.planets) {
    if (!p.alive || !p.owner) continue
    const st = civ.stateById(p.owner)
    if (!st) {
      p.owner = null
      continue
    }
    // на аванпосте живёт лишь вахта горняков, города не растут
    const cap = p.outpost ? 0.4 : p.baseR * 1.3
    if (p.pop < 0) p.pop = 0
    p.pop += p.pop * (st.pirate ? 0.006 : 0.014) * h * (1 - p.pop / cap)
    // выбитое под ноль население вымирает, а не воскресает
    if (p.pop <= 0.008) {
      p.pop = 0
      p.owner = null
      p.pvoUnits = 0
      p.pvoReady = 0
      civ.log(`⚰️ население ${p.name} вымерло — планета опустела`, { x: p.x, y: p.y })
      continue
    }
    st.credits += p.pop * 0.12 * h
    // собственная добыча из недр: аванпост качает на полную, обычная планета — понемногу
    if (p.oreRes > 0) {
      const rate = p.outpost ? 0.25 : Math.min(p.pop, 3) * 0.03
      const got = Math.min(rate * h, p.oreRes)
      p.oreRes -= got
      st.ore += got
      if (p.oreRes <= 0) civ.log(`⛏ недра ${p.name} выработаны до дна`, { x: p.x, y: p.y })
    }
    // перезарядка установок ПВО
    if (p.pvoReload.length) {
      p.pvoReload = p.pvoReload.filter((t) => {
        if (t - h <= 0) {
          p.pvoReady = Math.min(p.pvoReady + 1, p.pvoUnits)
          return false
        }
        return true
      })
      p.pvoReload = p.pvoReload.map((t) => t - h)
    }
    // стройка новой установки — замирает под осадой
    if (p.pvoBuildT > 0) {
      const besieged = civ.ships.some(
        (s) => s.kind === 'dread' && s.hp > 0 && civ.hostile(p.owner, s.owner) && dist(s, p) < 260,
      )
      if (!besieged) {
        p.pvoBuildT -= h
        if (p.pvoBuildT <= 0) {
          p.pvoUnits++
          p.pvoReady++
          civ.log(`🛡 ${p.name}: встала в строй установка ПВО (${p.pvoUnits})`)
        }
      }
    }
  }
}

export function minersDecide(civ, st, myPlanets, myShips) {
  // шахтёры; после пиратских грабежей — с эскортом (конвой)
  if (civ.asteroids.some((a) => a.res > 0) && myShips.filter((s) => s.kind === 'miner').length < 2 && st.credits >= SHIP.miner.cost) {
    const mn = civ._spawnShip('miner', st, myPlanets[0])
    if (mn) {
      st.credits -= SHIP.miner.cost
      if (st.pirateLosses >= 80 && st.credits >= SHIP.escort.cost * 2 && st.ore >= SHIP.escort.ore * 2) {
        for (let i = 0; i < 2; i++) {
          const es = civ._spawnShip('escort', st, myPlanets[0])
          if (!es) break
          st.credits -= SHIP.escort.cost
          st.ore -= SHIP.escort.ore
          es.mission = { type: 'escort', ship: mn.id }
        }
        if (Math.random() < 0.5) civ.log(`🛡 ${st.name} пускает шахтёров только конвоями`)
      }
    }
  }
}

export function peacetimeDecide(civ, st, myPlanets, myShips, myDreads) {
  st.tactic = null
  const allies = civ.states.filter((o) => o.id !== st.id && !o.pirate && civ.isAlly(st.id, o.id))

  // ПВО в мирное время — хотя бы пара установок на планету
  for (const p of myPlanets) {
    if (p.pvoUnits < Math.min(civ.pvoCap(p), 2) && p.pvoBuildT <= 0 && st.credits >= 70 && st.ore >= PVO_ORE) {
      st.credits -= 70
      st.ore -= PVO_ORE
      p.pvoBuildT = rand(40, 60)
      break
    }
  }

  // мирное время
  // внутренние караваны между своими планетами
  if (myPlanets.length >= 2) {
    const internal = civ.ships.find((s) => s.kind === 'transport' && s.mission?.type === 'trade' && s.mission.a === st.id && s.mission.b === st.id)
    if (!internal && st.credits >= SHIP.transport.cost) {
      const sh = civ._spawnShip('transport', st, myPlanets[0])
      if (sh) {
        st.credits -= SHIP.transport.cost
        sh.mission = { type: 'trade', a: st.id, b: st.id, from: myPlanets[0].id, to: myPlanets[1].id, leg: 0, boost: 1 }
        civ.log(`🚚 ${st.name} запустило внутренний караван`)
      }
    }
  }
  // внешняя торговля: достаточно дружбы, не обязательно альянс
  const friends = civ.states.filter((o) => o.id !== st.id && !o.pirate && civ.getRel(st.id, o.id) > 10)
  for (const al of friends) {
    const route = civ.ships.find(
      (s) => s.kind === 'transport' && s.mission?.type === 'trade' && ((s.mission.a === st.id && s.mission.b === al.id) || (s.mission.a === al.id && s.mission.b === st.id)),
    )
    if (!route && st.credits >= SHIP.transport.cost) {
      const alHome = civ.planetsOf(al)[0]
      if (alHome) {
        const sh = civ._spawnShip('transport', st, myPlanets[0])
        if (sh) {
          st.credits -= SHIP.transport.cost
          sh.mission = { type: 'trade', a: st.id, b: al.id, from: myPlanets[0].id, to: alHome.id, leg: 0, boost: 1 }
          civ.log(`🚚 караван ${st.name} ↔ ${al.name} вышел на маршрут`)
        }
      }
      break
    }
  }

  // колонизация — дорогая экспедиция: сначала обустраиваем свою планету,
  // и только зрелое государство тянет новую колонию
  const COLONY_COST = 240
  const home = civ.planetById(st.home) || myPlanets[0]
  const homeMature = home && home.pop > home.baseR * 1.3 * 0.55 && home.pvoUnits >= 2
  const free = civ.e.planets.filter((p) => p.alive && !p.owner && !p.barren && p.baseR >= 5)
  if (free.length && homeMature && home && st.credits >= COLONY_COST + SHIP.transport.cost) {
    free.sort((a, b) => dist(a, home) - dist(b, home))
    const sh = civ._spawnShip('transport', st, home)
    if (sh) {
      st.credits -= COLONY_COST + SHIP.transport.cost
      const settlers = 0.18
      home.pop = Math.max(home.pop - settlers, 0.05)
      sh.mission = { type: 'colonize', planet: free[0].id, settlers }
      civ.log(`🚀 ${st.name} снарядило экспедицию к ${free[0].name} (−${COLONY_COST + SHIP.transport.cost} кр)`, { x: free[0].x, y: free[0].y })
    }
  }

  // шахтёрский аванпост: руда кончается — пора застолбить богатую глыбу на окраине
  const OUTPOST_COST = 150
  const outpostEnRoute = civ.ships.some((s) => s.owner === st.id && s.mission?.type === 'outpost')
  if (!outpostEnRoute && st.ore < 50 && st.credits >= OUTPOST_COST + SHIP.transport.cost && home) {
    const rocks = civ.e.planets.filter((p) => p.alive && !p.owner && p.barren && p.oreRes > 200)
    if (rocks.length) {
      rocks.sort((a, b) => dist(a, home) - dist(b, home))
      const sh = civ._spawnShip('transport', st, home)
      if (sh) {
        st.credits -= OUTPOST_COST + SHIP.transport.cost
        sh.mission = { type: 'outpost', planet: rocks[0].id }
        civ.log(`⛏ ${st.name} снаряжает горняков на ${rocks[0].name}`, { x: rocks[0].x, y: rocks[0].y })
      }
    }
  }

  // охота на пиратов — только в мирное время
  const pirates = civ.states.find((s) => s.pirate)
  if (pirates && myDreads.length && Math.random() < 0.3) {
    const den = civ.planetsOf(pirates)[0]
    if (den) {
      const d = myDreads.find((x) => !x.mission || x.mission.type === 'guard')
      if (d) d.mission = { type: 'siege', planet: den.id }
    }
  }
  if (st.credits >= SHIP.dread.cost && myDreads.length < 1 && civ.states.length > 2) {
    if (civ._spawnShip('dread', st, myPlanets[0])) st.credits -= SHIP.dread.cost
  }

  // сецессия колоний: отделившиеся получают ПВО и казну — у них есть шанс отбиться.
  // если зрелых колоний две — может полыхнуть революция: уходят обе разом
  const colonies = myPlanets.filter((p) => p.id !== st.home && p.pop > 0.9)
  if (colonies.length && Math.random() < 0.05) {
    colonies.sort((a, b) => a.pop - b.pop)
    const twin = colonies.length >= 2 && Math.random() < 0.4
    const rebels = twin ? colonies.slice(0, 2) : [colonies[0]]
    const newStates = []
    for (const p of rebels) {
      const ns = civ._makeState(p, p.pop, { credits: 150 })
      p.pvoUnits = 3
      p.pvoReady = 3
      civ.setRel(ns.id, st.id, rand(-40, 25))
      for (const o of civ.states) {
        if (o.id !== ns.id && o.id !== st.id && !o.pirate) civ.setRel(ns.id, o.id, rand(-25, 40))
      }
      newStates.push(ns)
    }
    if (twin) {
      const friends = Math.random() < 0.5
      civ.setRel(newStates[0].id, newStates[1].id, friends ? 70 : rand(-40, 40))
      civ.log(`📢 революция в ${st.name}! отделились ${rebels.map((p) => p.name).join(' и ')}${friends ? ' — и сразу заключили союз' : ''}`, { x: rebels[0].x, y: rebels[0].y, imp: true })
    } else {
      civ.log(`🏴 колония ${rebels[0].name} объявила независимость от ${st.name}`, { x: rebels[0].x, y: rebels[0].y, imp: true })
    }
  }
}

export function spawnAsteroid(civ, orbitR, ang = Math.random() * TAU, res = Math.round(rand(40, 110))) {
  const size = rand(2.2, 4.5)
  civ.asteroids.push({
    id: nextId(),
    orbitR,
    ang,
    // кеплеровская угловая скорость — летят вместе со всеми, не отстают
    w: Math.sqrt(civ.gm) / Math.pow(orbitR, 1.5),
    size,
    res,
    res0: Math.max(res, 110),
    rot: Math.random() * TAU,
    spin: rand(-0.6, 0.6),
    verts: Array.from({ length: 7 }, (_, k) => {
      const va = (k / 7) * TAU
      const vr = size * rand(0.65, 1.3)
      return { x: Math.cos(va) * vr, y: Math.sin(va) * vr }
    }),
    x: 0,
    y: 0,
  })
}

export function asteroidsTick(civ, h) {
  // пополнение пояса: чем сильнее выработан, тем щедрее облако Оорта подкидывает
  civ.astTick -= h
  if (civ.astTick <= 0) {
    civ.astTick = 20
    if (civ.asteroids.length < 70 && civ.asteroids.length > 0) {
      civ._spawnAsteroid(pick(civ.asteroids).orbitR + rand(-40, 40))
      // сильно выгребли — прилетает ещё один
      if (civ.asteroids.length < 30) civ._spawnAsteroid(pick(civ.asteroids).orbitR + rand(-40, 40))
    }
  }
  for (const a of civ.asteroids) {
    a.ang += a.w * h
    a.rot += a.spin * h
    a.x = Math.cos(a.ang) * a.orbitR
    a.y = Math.sin(a.ang) * a.orbitR
  }
}
