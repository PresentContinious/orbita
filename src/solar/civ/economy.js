// Экономика: население, руда, ПВО-стройка, караваны, колонизация, шахтёры, астероиды

import { TAU, clamp, rand, pick, dist, SHIP, CAP_KINDS, PVO_ORE, nextId } from './constants.js'

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
      const rate = p.outpost ? 0.35 : Math.min(p.pop, 4) * 0.045
      const got = Math.min(rate * h, p.oreRes)
      p.oreRes -= got
      st.ore += got
      if (p.oreRes <= 0) civ.log(`⛏ недра ${p.name} выработаны до дна`, { x: p.x, y: p.y })
    }
    // недовольство колоний: далёкие, зрелые и уставшие от войны тянутся к свободе;
    // тяжёлый корабль на орбите (гарнизон) сепаратизм давит. Видно в карточке планеты
    if (!p.outpost && p.id !== st.home && !st.pirate) {
      const home = civ.planetById(st.home)
      let dU = 0
      let why = null
      if (home) {
        const far = Math.min(dist(p, home) / 900, 1.2) * 0.35
        if (far > 0.12) why = 'столица далеко'
        dU += far
      }
      if (p.pop > p.baseR * 1.3 * 0.55) {
        dU += 0.3
        if (!why) why = 'выросла и хочет сама'
      }
      if (civ.states.some((o) => o.id !== st.id && !o.pirate && civ.isWar(st.id, o.id))) {
        dU += 0.25
        if (!why) why = 'устала от войны метрополии'
      }
      if (civ.ships.some((s) => CAP_KINDS.includes(s.kind) && s.owner === st.id && s.hp > 0 && dist(s, p) < 220)) dU -= 0.55
      dU -= 0.12
      p.unrest = clamp((p.unrest || 0) + dU * 0.6 * h, 0, 100)
      p.unrestWhy = p.unrest > 5 ? why : null
    } else {
      p.unrest = 0
      p.unrestWhy = null
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
    // стройка ПВО и верфи — замирает под осадой
    if (p.pvoBuildT > 0 || p.yardBuildT > 0) {
      const besieged = civ.ships.some(
        (s) => s.kind === 'dread' && s.hp > 0 && civ.hostile(p.owner, s.owner) && dist(s, p) < 260,
      )
      if (!besieged) {
        if (p.pvoBuildT > 0) {
          p.pvoBuildT -= h
          if (p.pvoBuildT <= 0) {
            p.pvoUnits++
            p.pvoReady++
            civ.log(`🛡 ${p.name}: встала в строй установка ПВО (${p.pvoUnits})`)
          }
        }
        if (p.yardBuildT > 0) {
          p.yardBuildT -= h
          if (p.yardBuildT <= 0) {
            p.shipyard = true
            civ.log(`🏗 ${p.name}: орбитальная верфь вступила в строй`, { x: p.x, y: p.y, imp: true })
          }
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

  // мобилизация: на горизонте война — флот и верфи готовятся заранее, грозу видно издалека
  const threats = civ.states.filter((o) => o.id !== st.id && !o.pirate && civ.getRel(st.id, o.id) < -25)
  if (threats.length && !st.mobilized) {
    st.mobilized = true
    civ.log(`🪖 ${st.name} объявляет мобилизацию — в воздухе пахнет войной`, { imp: true })
  } else if (!threats.length && st.mobilized) {
    st.mobilized = false
    st.mobIntel = null
    civ.log(`🕊 ${st.name} сворачивает мобилизацию`)
  }
  if (st.mobilized) {
    civ._buildYard(st, myPlanets)
    const hasYard = myPlanets.some((p) => p.shipyard)
    // сколько строить — прикидка по силе самого опасного соседа, но через слухи
    // и донесения (ошибка до ±40%): точного состава врага бот не знает
    const foe = threats.reduce((b, o) => (civ.popOf(o) > civ.popOf(b) ? o : b), threats[0])
    if (!st.mobIntel) st.mobIntel = rand(0.7, 1.4)
    const foeCaps = civ.ships.filter((s) => CAP_KINDS.includes(s.kind) && s.owner === foe.id)
    const est = (civ.popOf(foe) + foeCaps.reduce((s, c) => s + (c.kind === 'dread' ? 4 : c.kind === 'cruiser' ? 2 : 1.2), 0)) * st.mobIntel
    const wantCaps = clamp(Math.round(est / 3.5), 2, 6)
    const count = (k) => myShips.filter((s) => s.kind === k).length
    const myCapsN = myShips.filter((s) => CAP_KINDS.includes(s.kind)).length
    if (myCapsN < wantCaps) {
      // по одному корпусу за решение: сперва эсминцы, потом крейсера, при большой угрозе — дредноут
      if (count('destroyer') < Math.ceil(wantCaps / 3) && st.credits >= SHIP.destroyer.cost && st.ore >= SHIP.destroyer.ore) {
        const ds = civ._spawnShip('destroyer', st, myPlanets[0])
        if (ds) {
          st.credits -= SHIP.destroyer.cost
          st.ore -= SHIP.destroyer.ore
        }
      } else if (hasYard && count('cruiser') < Math.ceil(wantCaps / 2) && st.credits >= SHIP.cruiser.cost && st.ore >= SHIP.cruiser.ore) {
        const c = civ._spawnShip('cruiser', st, myPlanets[0])
        if (c) {
          st.credits -= SHIP.cruiser.cost
          st.ore -= SHIP.cruiser.ore
        }
      } else if (hasYard && wantCaps >= 4 && count('dread') < 2 && st.credits >= SHIP.dread.cost && st.ore >= SHIP.dread.ore) {
        const d = civ._spawnShip('dread', st, myPlanets[0])
        if (d) {
          st.credits -= SHIP.dread.cost
          st.ore -= SHIP.dread.ore
          civ.log(`⚓ ${st.name} спустило на воду дредноут`)
        }
      }
    }
  } else if (st.credits > 380 && st.ore > 60) {
    // богатый мир лениво обзаводится верфью впрок
    civ._buildYard(st, myPlanets)
  }

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
  if (!outpostEnRoute && st.ore < 120 && st.credits >= OUTPOST_COST + SHIP.transport.cost && home) {
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

  // пираты: с ними воюют, от них откупаются или их терпят — у каждого пути своя цена
  const pirates = civ.states.find((s) => s.pirate)
  // откуп: дань — и вольница 60 секунд не трогает твои суда
  if (pirates && st.pirateLosses > 120 && st.credits >= 140 && !(pirates.truces && pirates.truces[st.id] > civ.t)) {
    st.credits -= 100
    pirates.credits += 100
    pirates.truces = pirates.truces || {}
    pirates.truces[st.id] = civ.t + 60
    st.pirateLosses = 0
    civ.log(`💰 ${st.name} откупилось от вольницы — её корабли пока не трогают купцов`, { imp: true })
  }
  // охота на пиратов — только в мирное время
  if (pirates && myDreads.length && Math.random() < 0.3) {
    const den = civ.planetsOf(pirates)[0]
    if (den) {
      const d = myDreads.find((x) => !x.mission || x.mission.type === 'guard')
      if (d) d.mission = { type: 'siege', planet: den.id }
    }
  }
  if (myPlanets.some((p) => p.shipyard) && st.credits >= SHIP.dread.cost && st.ore >= SHIP.dread.ore && myDreads.length < 1 && civ.states.length > 2) {
    if (civ._spawnShip('dread', st, myPlanets[0])) {
      st.credits -= SHIP.dread.cost
      st.ore -= SHIP.dread.ore
    }
  }

  // сецессия: уходят не случайные, а НАКИПЕВШИЕ колонии (недовольство выше 75 —
  // смотри карточку планеты). Отделившиеся получают ПВО и казну — есть шанс отбиться
  const colonies = myPlanets.filter((p) => p.id !== st.home && !p.outpost && p.pop > 0.9 && (p.unrest || 0) > 75)
  if (colonies.length && Math.random() < 0.25) {
    colonies.sort((a, b) => (b.unrest || 0) - (a.unrest || 0))
    const twin = colonies.length >= 2 && Math.random() < 0.4
    const rebels = twin ? colonies.slice(0, 2) : [colonies[0]]
    const why = rebels[0].unrestWhy || 'недовольство'
    const newStates = []
    for (const p of rebels) {
      const ns = civ._makeState(p, p.pop, { credits: 150 })
      p.pvoUnits = 3
      p.pvoReady = 3
      p.unrest = 0
      p.unrestWhy = null
      civ.setRel(ns.id, st.id, rand(-40, 25))
      for (const o of civ.states) {
        if (o.id !== ns.id && o.id !== st.id && !o.pirate) civ.setRel(ns.id, o.id, rand(-25, 40))
      }
      newStates.push(ns)
    }
    if (twin) {
      const friends = Math.random() < 0.5
      civ.setRel(newStates[0].id, newStates[1].id, friends ? 70 : rand(-40, 40))
      civ.log(`📢 революция в ${st.name} (${why})! отделились ${rebels.map((p) => p.name).join(' и ')}${friends ? ' — и сразу заключили союз' : ''}`, { x: rebels[0].x, y: rebels[0].y, imp: true })
    } else {
      civ.log(`🏴 колония ${rebels[0].name} объявила независимость от ${st.name} — ${why}`, { x: rebels[0].x, y: rebels[0].y, imp: true })
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
