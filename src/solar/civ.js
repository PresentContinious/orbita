// Цивилизация: государства, население, дипломатия, флоты, пираты, экономика.
// Боты принимают решения по utility-оценке своего положения, не по таймеру-пустышке.

import { genName } from './gen.js'
import { getSprite } from './sprites.js'

const TAU = Math.PI * 2
const SQ = 0.74

const clamp = (v, a, b) => Math.min(b, Math.max(a, v))
const rand = (a, b) => a + Math.random() * (b - a)
const pick = (arr) => arr[(Math.random() * arr.length) | 0]
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y)

const STATE_COLORS = ['#5da8ff', '#ff8a5c', '#7dd87d', '#e0c060', '#c98bff', '#5ce0d8', '#ff8fc8', '#a8c84d', '#8aa0ff', '#ffd07a']
const PIRATE_COLOR = '#ff5555'

// Война при отношениях ниже, союз — выше
const WAR_AT = -45
const ALLY_AT = 55

const SHIP = {
  transport: { hp: 60, speed: 60, cost: 60, label: 'транспорт' },
  dread: { hp: 420, speed: 30, cost: 320, label: 'дредноут' },
  fighter: { hp: 14, speed: 115, cost: 0, label: 'истребитель' },
  raider: { hp: 16, speed: 100, cost: 28, label: 'рейдер' },
  miner: { hp: 30, speed: 52, cost: 45, label: 'шахтёр' },
  escort: { hp: 24, speed: 108, cost: 22, label: 'эскорт' },
}

let uid = 1

export class Civ {
  constructor(engine) {
    this.e = engine
    this.reset()
  }

  reset() {
    this.t = 0
    this.states = []
    this.ships = []
    this.asteroids = []
    this.events = []
    this.beams = []
    this.rel = {}
    this.relTick = 0
    this.astTick = 30
    this.warSince = {}
    this.battleLogT = 0

    // GM солнца из текущей орбиты любой планеты: v²·r
    const p0 = this.e.planets[0]
    this.gm = (p0.vx * p0.vx + p0.vy * p0.vy) * p0.orbit

    // пояса астероидов: 2–3 кольца между орбитами планет
    const orbits = this.e.planets.map((p) => p.orbit).sort((a, b) => a - b)
    const beltCount = 2 + ((Math.random() * 2) | 0)
    for (let b = 0; b < beltCount; b++) {
      const i = 1 + ((Math.random() * (orbits.length - 2)) | 0)
      const beltR = (orbits[i] + orbits[i + 1]) / 2
      const n = 12 + ((Math.random() * 9) | 0)
      for (let k = 0; k < n; k++) this._spawnAsteroid(beltR + rand(-50, 50))
    }

    for (const p of this.e.planets) {
      p.owner = null
      p.pop = 0
      p.pvoUnits = 0 // построенные установки ПВО
      p.pvoReady = 0 // заряженные прямо сейчас
      p.pvoReload = [] // таймеры перезарядки
      p.pvoBuildT = 0 // строится ли новая установка
      p.pvoDmg = 0 // накопленный урон осады по ПВО
      p.lightsSeed = Math.random() * 1000
      // у глыб на окраине — богатые россыпи руды рядом
      if (p.barren) {
        const ang0 = Math.atan2(p.y, p.x)
        for (let k = 0; k < 8; k++) {
          this._spawnAsteroid(p.orbit + rand(-55, 55), ang0 + rand(-0.4, 0.4), Math.round(rand(120, 260)))
        }
      }
    }

    // 3 колыбели жизни на средних планетах
    const candidates = [...this.e.planets]
      .filter((p) => !p.barren && p.baseR >= 7 && p.baseR <= 16)
      .sort(() => Math.random() - 0.5)
      .slice(0, 3)
    for (const p of candidates) this._makeState(p, rand(1.4, 2.4))

    this.log('🌍 на ' + candidates.map((p) => p.name).join(', ') + ' зародилась жизнь')
  }

  log(text) {
    this.events.push({ id: uid++, text })
    if (this.events.length > 40) this.events.shift()
  }

  // ---------- государства / дипломатия ----------

  _makeState(planet, pop, opts = {}) {
    const usedColors = new Set(this.states.filter((s) => !s.pirate).map((s) => s.color))
    const freeColor = STATE_COLORS.find((c) => !usedColors.has(c)) ?? STATE_COLORS[this.states.length % STATE_COLORS.length]
    const st = {
      id: uid++,
      name: opts.name || planet.name,
      color: opts.pirate ? PIRATE_COLOR : freeColor,
      credits: opts.credits ?? 80,
      pirate: !!opts.pirate,
      decideT: rand(1, 5),
      missileT: 10,
      tactic: null,
      pirateLosses: 0,
      bornT: this.t,
      home: planet.id,
    }
    this.states.push(st)
    planet.owner = st.id
    planet.pop = pop
    planet.pvoUnits = opts.pirate ? 1 : 2
    planet.pvoReady = planet.pvoUnits
    planet.pvoReload = []
    return st
  }

  relKey(a, b) {
    return a < b ? `${a}:${b}` : `${b}:${a}`
  }

  getRel(a, b) {
    if (a === b) return 100
    return this.rel[this.relKey(a, b)] ?? 0
  }

  setRel(a, b, v) {
    this.rel[this.relKey(a, b)] = clamp(v, -100, 100)
  }

  // при смерти государства вычищаем его дипломатические следы
  _purgeRelations(id) {
    for (const key of Object.keys(this.rel)) {
      const [a, b] = key.split(':')
      if (+a === id || +b === id) delete this.rel[key]
    }
    for (const key of Object.keys(this.warSince)) {
      const [a, b] = key.split(':')
      if (+a === id || +b === id) delete this.warSince[key]
    }
  }

  isWar(a, b) {
    const sa = this.stateById(a)
    const sb = this.stateById(b)
    if (!sa || !sb) return false
    if (sa.pirate !== sb.pirate) return true // пираты вне закона всегда
    return this.getRel(a, b) < WAR_AT
  }

  isAlly(a, b) {
    return a !== b && this.getRel(a, b) > ALLY_AT
  }

  stateById(id) {
    return this.states.find((s) => s.id === id)
  }

  planetsOf(st) {
    return this.e.planets.filter((p) => p.alive && p.owner === st.id)
  }

  popOf(st) {
    return this.planetsOf(st).reduce((s, p) => s + p.pop, 0)
  }

  // ---------- главный тик ----------

  updateVisual(dt) {
    // визуальные эффекты гаснут и на паузе
    for (const b of this.beams) b.life -= dt * 2
    this.beams = this.beams.filter((b) => b.life > 0)
  }

  tick(h) {
    this.t += h
    if (this.battleLogT > 0) this.battleLogT -= h

    this._populations(h)
    this._decisions(h)
    this._diplomacyDrift(h)
    this._ships(h)
    this._planetDefense(h)
    this._pvoIntercept()
    this._asteroidsTick(h)

    this.states = this.states.filter((s) => {
      if (this.planetsOf(s).length === 0 && !this.ships.some((sh) => sh.owner === s.id)) {
        this.log(`☠️ ${s.name} прекратило существование`)
        this._purgeRelations(s.id)
        return false
      }
      return true
    })
  }

  _populations(h) {
    for (const p of this.e.planets) {
      if (!p.alive || !p.owner) continue
      const st = this.stateById(p.owner)
      if (!st) {
        p.owner = null
        continue
      }
      const cap = p.baseR * 1.3
      if (p.pop < 0) p.pop = 0
      p.pop += p.pop * (st.pirate ? 0.006 : 0.014) * h * (1 - p.pop / cap)
      // выбитое под ноль население вымирает, а не воскресает
      if (p.pop <= 0.008) {
        p.pop = 0
        p.owner = null
        p.pvoUnits = 0
        p.pvoReady = 0
        this.log(`⚰️ население ${p.name} вымерло — планета опустела`)
        continue
      }
      st.credits += p.pop * 0.12 * h
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
        const besieged = this.ships.some(
          (s) => s.kind === 'dread' && s.hp > 0 && this.hostile(p.owner, s.owner) && dist(s, p) < 260,
        )
        if (!besieged) {
          p.pvoBuildT -= h
          if (p.pvoBuildT <= 0) {
            p.pvoUnits++
            p.pvoReady++
            this.log(`🛡 ${p.name}: встала в строй установка ПВО (${p.pvoUnits})`)
          }
        }
      }
    }
  }

  // предел установок ПВО зависит от населения
  pvoCap(p) {
    return clamp(2 + Math.floor(p.pop / 1.5), 1, 8)
  }

  // урон по ПВО: установка ломается, накопив 30 урона
  damagePvo(p, amount) {
    if (p.pvoUnits <= 0) return
    p.pvoDmg += amount
    if (p.pvoDmg >= 30) {
      p.pvoDmg = 0
      p.pvoUnits--
      p.pvoReady = Math.min(p.pvoReady, p.pvoUnits)
      this.e._burst(p.x, p.y, 18, ['#7df0ff', '#ffd9a0'], 40, 180)
      if (p.pvoUnits <= 0) this.log(`💥 ПВО ${p.name} полностью подавлено!`)
    }
  }

  // ---------- решения ботов ----------

  _decisions(h) {
    for (const st of this.states) {
      st.decideT -= h
      st.missileT -= h
      if (st.breakerT === undefined) st.breakerT = 30
      st.breakerT -= h
      if (st.decideT > 0) continue
      st.decideT = rand(3.5, 6)
      if (st.pirate) this._pirateDecide(st)
      else this._stateDecide(st)
    }
  }

  _stateDecide(st) {
    const myPlanets = this.planetsOf(st)
    if (!myPlanets.length) return
    const myPop = this.popOf(st)
    const enemies = this.states.filter((o) => o.id !== st.id && !o.pirate && this.isWar(st.id, o.id))
    const myShips = this.ships.filter((s) => s.owner === st.id)
    const myDreads = myShips.filter((s) => s.kind === 'dread')

    // шахтёры; после пиратских грабежей — с эскортом (конвой)
    if (this.asteroids.some((a) => a.res > 0) && myShips.filter((s) => s.kind === 'miner').length < 2 && st.credits >= SHIP.miner.cost) {
      const mn = this._spawnShip('miner', st, myPlanets[0])
      if (mn) {
        st.credits -= SHIP.miner.cost
        if (st.pirateLosses >= 80 && st.credits >= SHIP.escort.cost * 2) {
          for (let i = 0; i < 2; i++) {
            const es = this._spawnShip('escort', st, myPlanets[0])
            if (!es) break
            st.credits -= SHIP.escort.cost
            es.mission = { type: 'escort', ship: mn.id }
          }
          if (Math.random() < 0.5) this.log(`🛡 ${st.name} пускает шахтёров только конвоями`)
        }
      }
    }

    if (enemies.length) {
      // воюем с сильнейшим из врагов
      const enemy = enemies.reduce((b, o) => (this.popOf(o) > this.popOf(b) ? o : b), enemies[0])
      const ePlanets = this.planetsOf(enemy)
      if (!ePlanets.length) return
      const ePop = this.popOf(enemy)
      const eDreads = this.ships.filter((s) => s.kind === 'dread' && s.owner === enemy.id).length

      // выбор тактики по соотношению сил (с инерцией)
      const myStr = myPop + myDreads.length * 4
      const eStr = ePop + eDreads * 4
      if (!st.tactic || Math.random() < 0.25) {
        const next =
          myStr > eStr * 1.35 ? 'assault' : myStr < eStr * 0.65 ? 'defense' : Math.random() < 0.5 ? 'raid' : 'blockade'
        if (next !== st.tactic) {
          st.tactic = next
          const T = { assault: 'генеральное наступление', defense: 'глухую оборону', raid: 'рейды по тылам', blockade: 'блокаду' }
          this.log(`🎯 ${st.name} выбирает тактику: ${T[next]}`)
        }
      }

      // ПВО: установки строятся по одной; в обороне — до предела, иначе минимум 3
      for (const p of myPlanets) {
        const want = st.tactic === 'defense' ? this.pvoCap(p) : Math.min(this.pvoCap(p), 3)
        if (p.pvoUnits < want && p.pvoBuildT <= 0 && st.credits >= 70) {
          st.credits -= 70
          p.pvoBuildT = st.tactic === 'defense' ? rand(25, 40) : rand(40, 60)
          break
        }
      }

      // баллистика ЗАЛПОМ: дорого — выгоднее захватывать, чем выжигать
      if (st.missileT <= 0 && st.credits >= 25) {
        const volley = clamp(1 + Math.floor(myPop / 3), 1, 4)
        const target = pick(ePlanets)
        for (let i = 0; i < volley && st.credits >= 25; i++) {
          st.credits -= 25
          this._launchWarhead(pick(myPlanets), target, st)
        }
        st.missileT = clamp(30 / Math.max(myPop, 0.4), 6, 40)
      }

      // разрушитель планет: оружие отчаяния — дорого (по размеру цели), сбивается ПВО
      if (st.breakerT <= 0) {
        const target = pick(ePlanets)
        const cost = Math.round(target.baseR * 14)
        const warKey = this.relKey(st.id, enemy.id)
        const desperate = myStr < eStr * 0.75
        if (st.credits >= cost && this.t - (this.warSince[warKey] ?? this.t) > 60 && (desperate || Math.random() < 0.2)) {
          st.credits -= cost
          this._launchWarhead(pick(myPlanets), target, st, 'breaker')
          st.breakerT = 50
          this.log(`☄️ ${st.name} запустило РАЗРУШИТЕЛЬ ПЛАНЕТ к ${target.name} (−${cost} кр)`)
        } else {
          st.breakerT = 15
        }
      }

      // флот
      if (st.credits >= SHIP.dread.cost && myDreads.length < 3) {
        const d = this._spawnShip('dread', st, myPlanets[0])
        if (d) {
          st.credits -= SHIP.dread.cost
          this.log(`⚓ ${st.name} спустило на воду дредноут`)
        }
      }

      const idle = myDreads.filter((d) => !d.mission)
      if (st.tactic === 'assault') {
        if (idle.length >= 2) {
          const target = ePlanets[0]
          for (const d of idle) d.mission = { type: 'siege', planet: target.id }
          this.log(`⚔️ флот ${st.name} идёт на штурм ${target.name}`)
        }
        // десант волнами: на одном транспорте максимум 500 человек —
        // для захвата нужен целый конвой, и его могут перехватить по дороге
        const broken = ePlanets.find((p) => p.pvoUnits <= 0 && myDreads.some((d) => d.mission?.planet === p.id && dist(d, p) < 260))
        if (broken && myPop > 0.9) {
          const enRoute = this.ships
            .filter((s) => s.owner === st.id && s.mission?.type === 'invade' && s.mission.planet === broken.id)
            .reduce((s2, t) => s2 + t.mission.troops, 0)
          let needed = broken.pop / 2.5 + 0.15 - enRoute
          let sent = 0
          while (needed > 0 && sent < 3 && st.credits >= SHIP.transport.cost && myPop > 0.8) {
            const sh = this._spawnShip('transport', st, myPlanets[0])
            if (!sh) break
            st.credits -= SHIP.transport.cost
            // борт берёт от 1 до 10 тысяч — крупный десант, а не сотня лодок
            const troops = Math.min(clamp(needed, 1, 10), Math.max(myPlanets[0].pop * 0.5, 0.3))
            myPlanets[0].pop = Math.max(myPlanets[0].pop - troops * 0.4, 0.05)
            sh.mission = { type: 'invade', planet: broken.id, troops }
            needed -= troops
            sent++
          }
          if (sent > 0) this.log(`🪖 ${st.name}: десантная волна из ${sent} бортов идёт на ${broken.name}`)
        }
      } else if (st.tactic === 'raid') {
        // дредноуты ходят минимум парами — одиночка ждёт напарника дома
        if (idle.length >= 2) for (const d of idle) d.mission = { type: 'raid', enemy: enemy.id }
      } else if (st.tactic === 'blockade') {
        if (idle.length >= 2) {
          const tp = pick(ePlanets).id
          for (const d of idle) d.mission = { type: 'blockade', planet: tp }
        }
      } else {
        // оборона: всех домой
        for (const d of myDreads) if (d.mission && d.mission.type !== 'escort') d.mission = null
      }

      // мир — только если война затянулась и идёт плохо
      const key = this.relKey(st.id, enemy.id)
      const warDur = this.t - (this.warSince[key] ?? this.t)
      if (warDur > 50 && myPop < ePop * 0.4 && Math.random() < 0.3) {
        this.setRel(st.id, enemy.id, -10)
        delete this.warSince[key]
        this.log(`🕊 ${st.name} запросило мир с ${enemy.name}`)
      }
      return
    }

    st.tactic = null
    const allies = this.states.filter((o) => o.id !== st.id && !o.pirate && this.isAlly(st.id, o.id))

    // ПВО в мирное время — хотя бы пара установок на планету
    for (const p of myPlanets) {
      if (p.pvoUnits < Math.min(this.pvoCap(p), 2) && p.pvoBuildT <= 0 && st.credits >= 70) {
        st.credits -= 70
        p.pvoBuildT = rand(40, 60)
        break
      }
    }

    // мирное время
    // внутренние караваны между своими планетами
    if (myPlanets.length >= 2) {
      const internal = this.ships.find((s) => s.kind === 'transport' && s.mission?.type === 'trade' && s.mission.a === st.id && s.mission.b === st.id)
      if (!internal && st.credits >= SHIP.transport.cost) {
        const sh = this._spawnShip('transport', st, myPlanets[0])
        if (sh) {
          st.credits -= SHIP.transport.cost
          sh.mission = { type: 'trade', a: st.id, b: st.id, from: myPlanets[0].id, to: myPlanets[1].id, leg: 0, boost: 1 }
          this.log(`🚚 ${st.name} запустило внутренний караван`)
        }
      }
    }
    // внешняя торговля: достаточно дружбы, не обязательно альянс
    const friends = this.states.filter((o) => o.id !== st.id && !o.pirate && this.getRel(st.id, o.id) > 10)
    for (const al of friends) {
      const route = this.ships.find(
        (s) => s.kind === 'transport' && s.mission?.type === 'trade' && ((s.mission.a === st.id && s.mission.b === al.id) || (s.mission.a === al.id && s.mission.b === st.id)),
      )
      if (!route && st.credits >= SHIP.transport.cost) {
        const alHome = this.planetsOf(al)[0]
        if (alHome) {
          const sh = this._spawnShip('transport', st, myPlanets[0])
          if (sh) {
            st.credits -= SHIP.transport.cost
            sh.mission = { type: 'trade', a: st.id, b: al.id, from: myPlanets[0].id, to: alHome.id, leg: 0, boost: 1 }
            this.log(`🚚 караван ${st.name} ↔ ${al.name} вышел на маршрут`)
          }
        }
        break
      }
    }

    // колонизация — дорогая экспедиция: сначала обустраиваем свою планету,
    // и только зрелое государство тянет новую колонию
    const COLONY_COST = 240
    const home = this.planetById(st.home) || myPlanets[0]
    const homeMature = home && home.pop > home.baseR * 1.3 * 0.55 && home.pvoUnits >= 2
    const free = this.e.planets.filter((p) => p.alive && !p.owner && !p.barren && p.baseR >= 5)
    if (free.length && homeMature && home && st.credits >= COLONY_COST + SHIP.transport.cost) {
      free.sort((a, b) => dist(a, home) - dist(b, home))
      const sh = this._spawnShip('transport', st, home)
      if (sh) {
        st.credits -= COLONY_COST + SHIP.transport.cost
        const settlers = 0.18
        home.pop = Math.max(home.pop - settlers, 0.05)
        sh.mission = { type: 'colonize', planet: free[0].id, settlers }
        this.log(`🚀 ${st.name} снарядило экспедицию к ${free[0].name} (−${COLONY_COST + SHIP.transport.cost} кр)`)
      }
    }

    // охота на пиратов — только в мирное время
    const pirates = this.states.find((s) => s.pirate)
    if (pirates && myDreads.length && Math.random() < 0.3) {
      const den = this.planetsOf(pirates)[0]
      if (den) {
        const d = myDreads.find((x) => !x.mission || x.mission.type === 'guard')
        if (d) d.mission = { type: 'siege', planet: den.id }
      }
    }
    if (st.credits >= SHIP.dread.cost && myDreads.length < 1 && this.states.length > 2) {
      if (this._spawnShip('dread', st, myPlanets[0])) st.credits -= SHIP.dread.cost
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
        const ns = this._makeState(p, p.pop, { credits: 150 })
        p.pvoUnits = 3
        p.pvoReady = 3
        this.setRel(ns.id, st.id, rand(-40, 25))
        for (const o of this.states) {
          if (o.id !== ns.id && o.id !== st.id && !o.pirate) this.setRel(ns.id, o.id, rand(-25, 40))
        }
        newStates.push(ns)
      }
      if (twin) {
        const friends = Math.random() < 0.5
        this.setRel(newStates[0].id, newStates[1].id, friends ? 70 : rand(-40, 40))
        this.log(`📢 революция в ${st.name}! отделились ${rebels.map((p) => p.name).join(' и ')}${friends ? ' — и сразу заключили союз' : ''}`)
      } else {
        this.log(`🏴 колония ${rebels[0].name} объявила независимость от ${st.name}`)
      }
    }
  }

  _pirateDecide(st) {
    const den = this.planetsOf(st)[0]
    if (!den) return

    // на базу напали — пираты выжидают момент и эвакуируются на новую скалу.
    // дредноуты прилетят добивать пустые камни
    const threat = this.ships.some((s) => s.kind === 'dread' && s.hp > 0 && s.owner !== st.id && dist(s, den) < 320)
    if (threat) {
      if (!st.evacAt) st.evacAt = this.t + rand(7, 14)
      if (this.t >= st.evacAt) {
        const dest = this.e.planets
          .filter((p) => p.alive && !p.owner && p !== den)
          .sort((a, b) => (b.barren ? 1 : 0) - (a.barren ? 1 : 0) || dist(b, den) - dist(a, den))[0]
        if (dest) {
          const sh = this._spawnShip('transport', st, den)
          if (sh) {
            sh.hp = sh.maxHp = 110 // боевой транспорт с усиленным корпусом
            sh.mission = { type: 'pirateMove', planet: dest.id, popLoad: Math.max(den.pop, 0.2) }
            den.owner = null
            den.pop = 0
            den.pvoUnits = 0
            den.pvoReady = 0
            st.evacAt = null
            this.log('🏴‍☠️ пираты бросили базу и ушли в туман — преследователи найдут пустые скалы')
            return
          }
        }
      }
    } else {
      st.evacAt = null
    }

    const raiders = this.ships.filter((s) => s.owner === st.id && s.kind === 'raider')
    // строят стаю рейдеров — побольше и позлее
    if (raiders.length < 10 && st.credits >= SHIP.raider.cost) {
      if (this._spawnShip('raider', st, den)) st.credits -= SHIP.raider.cost
    }
    // цель — грабёж транспортов и шахтёров
    const prey = this.ships.filter((s) => (s.kind === 'transport' || s.kind === 'miner') && s.owner !== st.id)
    if (prey.length) {
      for (const r of raiders) {
        if (!r.mission || r.mission.type !== 'hunt') {
          const target = prey.reduce((b, p) => (dist(r, p) < dist(r, b) ? p : b), prey[0])
          r.mission = { type: 'hunt', ship: target.id }
        }
      }
    }
    // разбогатели — занимают свободную глыбу или планету
    const free = this.e.planets.filter((p) => p.alive && !p.owner)
    if (st.credits > 260 && free.length) {
      st.credits -= 200
      free.sort((a, b) => (b.barren ? 1 : 0) - (a.barren ? 1 : 0) || dist(a, den) - dist(b, den))
      free[0].owner = st.id
      free[0].pop = 0.25
      free[0].pvoUnits = 1
      free[0].pvoReady = 1
      this.log(`🏴‍☠️ пираты выкупили базу на ${free[0].name}`)
    }
  }

  _diplomacyDrift(h) {
    this.relTick -= h
    if (this.relTick > 0) return
    this.relTick = 6
    const civs = this.states.filter((s) => !s.pirate)
    for (let i = 0; i < civs.length; i++) {
      for (let j = i + 1; j < civs.length; j++) {
        const a = civs[i]
        const b = civs[j]
        const key = this.relKey(a.id, b.id)
        const cur = this.getRel(a.id, b.id)
        const atWar = cur < WAR_AT
        let drift = atWar ? rand(-1.5, 1.5) : rand(-4, 4)
        // активная торговля сближает
        if (this.ships.some((s) => s.mission?.type === 'trade' && ((s.mission.a === a.id && s.mission.b === b.id) || (s.mission.a === b.id && s.mission.b === a.id)))) drift += 2
        // дипломатический иммунитет новорождённых: 60 секунд их не трогают
        const young = this.t - (a.bornT ?? 0) < 60 || this.t - (b.bornT ?? 0) < 60
        // сильный смотрит на слабого как на обед
        const pa = this.popOf(a)
        const pb = this.popOf(b)
        if (!atWar && !young && Math.max(pa, pb) > Math.min(pa, pb) * 2.3 + 0.5) drift -= 2.5
        let next = clamp(cur + drift, -100, 100)
        if (!atWar && young) next = Math.max(next, WAR_AT + 4)

        const wasWar = atWar
        let isWarNow = next < WAR_AT
        // войну так просто не закончить: минимум 45 секунд
        if (wasWar && !isWarNow && this.t - (this.warSince[key] ?? 0) < 45) {
          next = WAR_AT - 3
          isWarNow = true
        }
        this.setRel(a.id, b.id, next)

        if (!wasWar && isWarNow) {
          // объявление войны — это всерьёз
          this.setRel(a.id, b.id, Math.min(next, -65))
          this.warSince[key] = this.t
          this.log(`⚔️ ${a.name} и ${b.name} объявили войну!`)
          this._maybeSpawnPirates()
          // оборонительные союзы: за союзника вступаются
          for (const c of civs) {
            if (c.id === a.id || c.id === b.id) continue
            if (this.isAlly(c.id, b.id) && !this.isWar(c.id, a.id)) {
              this.setRel(c.id, a.id, -60)
              this.warSince[this.relKey(c.id, a.id)] = this.t
              this.log(`🛡 ${c.name} вступается за союзника ${b.name}!`)
            }
            if (this.isAlly(c.id, a.id) && !this.isWar(c.id, b.id)) {
              this.setRel(c.id, b.id, -60)
              this.warSince[this.relKey(c.id, b.id)] = this.t
              this.log(`🛡 ${c.name} вступается за союзника ${a.name}!`)
            }
          }
        } else if (wasWar && !isWarNow) {
          delete this.warSince[key]
          this.log(`🕊 ${a.name} и ${b.name} заключили мир`)
        } else if (cur <= ALLY_AT && next > ALLY_AT) {
          this.log(`🤝 ${a.name} и ${b.name} заключили альянс`)
        }
      }
    }
  }

  _maybeSpawnPirates() {
    if (this.states.some((s) => s.pirate)) return
    if (Math.random() > 0.4) return
    // гнездо — на глыбе на окраине; если глыб нет, сойдёт мелкая планета
    const rocks = this.e.planets.filter((p) => p.alive && !p.owner && p.barren)
    const small = rocks.length ? rocks : this.e.planets.filter((p) => p.alive && !p.owner && p.baseR <= 8)
    if (!small.length) return
    const den = pick(small)
    this._makeState(den, 0.3, { pirate: true, name: 'Вольница ' + genName(), credits: 50 })
    this.log(`🏴‍☠️ на ${den.name} завелись пираты!`)
  }

  // ---------- корабли ----------

  _spawnShip(kind, st, fromPlanet) {
    if (this.ships.length >= 130) return null
    const cfg = SHIP[kind]
    const a = Math.random() * TAU
    const sh = {
      id: uid++,
      kind,
      owner: st.id,
      x: fromPlanet.x + Math.cos(a) * (fromPlanet.r + 14),
      y: fromPlanet.y + Math.sin(a) * (fromPlanet.r + 14),
      vx: 0,
      vy: 0,
      hp: cfg.hp,
      maxHp: cfg.hp,
      speed: cfg.speed,
      mission: null,
      cd: 0,
      home: fromPlanet.id,
    }
    if (kind === 'dread') {
      // доктрина авиакрыла: свободная охота / собранный налёт / прикрытие
      const r2 = Math.random()
      sh.airTactic = r2 < 0.4 ? 'free' : r2 < 0.8 ? 'massed' : 'cap'
      sh.strike = false
    }
    this.ships.push(sh)
    return sh
  }

  planetById(id) {
    return this.e.planets.find((p) => p.id === id)
  }

  shipById(id) {
    return this.ships.find((s) => s.id === id)
  }

  hostile(aOwner, bOwner) {
    if (aOwner === bOwner) return false
    return this.isWar(aOwner, bOwner)
  }

  // упреждение: куда планета придёт к моменту встречи (две итерации уточнения)
  _leadPoint(sh, p) {
    let tx = p.x
    let ty = p.y
    for (let i = 0; i < 2; i++) {
      const eta = Math.hypot(tx - sh.x, ty - sh.y) / Math.max(sh.speed, 1)
      const r2 = p.x * p.x + p.y * p.y || 1
      const w = (p.x * p.vy - p.y * p.vx) / r2
      const da = clamp(w * eta, -1.4, 1.4)
      const c = Math.cos(da)
      const s = Math.sin(da)
      tx = p.x * c - p.y * s
      ty = p.x * s + p.y * c
    }
    return { x: tx, y: ty }
  }

  _steerPlanet(sh, p, h) {
    const lp = this._leadPoint(sh, p)
    this._steer(sh, lp.x, lp.y, h, p)
  }

  // позиция в походном клине за флагманом (первым кораблём группы)
  _formationSlot(sh, group) {
    const idx = group.indexOf(sh)
    if (idx <= 0) return null
    const lead = group[0]
    const va = Math.atan2(lead.vy, lead.vx)
    const side = idx % 2 ? 1 : -1
    const row = Math.ceil(idx / 2)
    return {
      x: lead.x - Math.cos(va) * 42 * row + Math.cos(va + Math.PI / 2) * 50 * row * side,
      y: lead.y - Math.sin(va) * 42 * row + Math.sin(va + Math.PI / 2) * 50 * row * side,
    }
  }

  // дежурство на орбите: подойти и кружить на дистанции R, не залезая в планету
  _holdOrbit(sh, p, R, h) {
    if (dist(sh, p) > R + 60) {
      this._steerPlanet(sh, p, h)
      return
    }
    const ang = Math.atan2(sh.y - p.y, sh.x - p.x) + 0.35 * h
    this._steer(sh, p.x + Math.cos(ang) * R, p.y + Math.sin(ang) * R, h, p)
  }

  // рулёжка: к цели, огибая солнце и планеты (кроме планеты-цели — на неё садимся)
  _steer(sh, tx, ty, h, ignore = null) {
    let dx = tx - sh.x
    let dy = ty - sh.y
    const d = Math.hypot(dx, dy) || 1
    let wx = (dx / d) * sh.speed
    let wy = (dy / d) * sh.speed
    // солнце — опасная зона
    const ds = Math.hypot(sh.x, sh.y) || 1
    const sunR = 150
    if (ds < sunR) {
      const push = ((sunR - ds) / sunR) * sh.speed * 2.2
      wx += (sh.x / ds) * push
      wy += (sh.y / ds) * push
    }
    // планеты обходим
    for (const p of this.e.planets) {
      if (!p.alive || p === ignore) continue
      const dp = dist(sh, p)
      const danger = p.r + 20
      if (dp < danger && dp > 0.01) {
        const push = ((danger - dp) / danger) * sh.speed * 2
        wx += ((sh.x - p.x) / dp) * push
        wy += ((sh.y - p.y) / dp) * push
      }
    }
    const k = Math.min(1, h * 2.2)
    sh.vx += (wx - sh.vx) * k
    sh.vy += (wy - sh.vy) * k
    sh.x += sh.vx * h
    sh.y += sh.vy * h
  }

  _ships(h) {
    for (const sh of this.ships) {
      sh.cd -= h
      const st = this.stateById(sh.owner)
      if (!st) {
        sh.hp = 0
        continue
      }
      const m = sh.mission

      // боевая цель рядом важнее миссии (лёгкие корабли)
      if (sh.kind === 'fighter' || sh.kind === 'raider' || sh.kind === 'escort') {
        // эскорт держится возле подопечного
        if (sh.kind === 'escort' && m?.type === 'escort') {
          const ward = this.shipById(m.ship)
          if (!ward || ward.hp <= 0) {
            sh.mission = null
          } else {
            let foe = null
            let bd = 220
            for (const o of this.ships) {
              if (o.hp <= 0 || !this.hostile(sh.owner, o.owner)) continue
              const d = dist(ward, o)
              if (d < bd) {
                bd = d
                foe = o
              }
            }
            if (foe) {
              this._attackRun(sh, foe, h, 7)
            } else {
              this._steer(sh, ward.x + 18, ward.y + 12, h)
            }
            continue
          }
        }

        // ополчение: дерётся только у своей планеты, потом расходится по домам
        if (sh.militia) {
          const homeP = this.planetById(sh.home)
          if (!homeP || !homeP.alive || homeP.owner !== sh.owner) {
            sh.hp = 0
            continue
          }
          let target = null
          let bd = Infinity
          for (const o of this.ships) {
            if (o.hp <= 0 || o.kind === 'miner' || !this.hostile(sh.owner, o.owner)) continue
            if (dist(homeP, o) > 330) continue
            const d = dist(sh, o)
            if (d < bd) {
              bd = d
              target = o
            }
          }
          if (target) {
            sh.idleT = 0
            this._attackRun(sh, target, h, 6)
            continue
          }
          sh.idleT = (sh.idleT || 0) + h
          if (sh.idleT > 6) {
            sh.gone = true
            continue
          }
          this._holdOrbit(sh, homeP, homeP.r + 26, h)
          continue
        }

        // палубная тактика носителя
        const car = sh.kind === 'fighter' && sh.carrier ? this.shipById(sh.carrier) : null
        if (car) {
          if (car.airTactic === 'massed' && !car.strike) {
            // ждём сбора полного крыла — кружим у носителя
            this._holdOrbit(sh, car, 34, h)
            continue
          }
          if (car.airTactic === 'cap') {
            // прикрытие: бьём только тех, кто лезет к носителю
            let target = null
            let bd = 175
            for (const o of this.ships) {
              if (o.hp <= 0 || !this.hostile(sh.owner, o.owner)) continue
              const d = dist(car, o)
              if (d < bd) {
                bd = d
                target = o
              }
            }
            if (target) this._attackRun(sh, target, h, 6)
            else this._holdOrbit(sh, car, 30, h)
            continue
          }
        }

        let target = m?.ship && m.type === 'hunt' ? this.shipById(m.ship) : null
        if (!target || target.hp <= 0) {
          target = null
          let bd = 300
          for (const o of this.ships) {
            if (o.hp <= 0 || !this.hostile(sh.owner, o.owner)) continue
            const d = dist(sh, o)
            if (d < bd) {
              bd = d
              target = o
            }
          }
        }
        if (target) {
          this._attackRun(sh, target, h, sh.kind === 'raider' ? 8 : 6)
          continue
        }
        // нет целей — к носителю (и в ангар, если вокруг спокойно), рейдеры патрулируют
        const carrier = sh.carrier ? this.shipById(sh.carrier) : null
        if (carrier) {
          this._steer(sh, carrier.x, carrier.y, h)
          if (dist(sh, carrier) < 20) {
            const danger = this.ships.some((o) => o.hp > 0 && this.hostile(sh.owner, o.owner) && dist(carrier, o) < 340)
            if (!danger) sh.gone = true
          }
        } else {
          const homePl = this.planetById(sh.home)
          if (homePl) {
            if (sh.kind === 'raider') this._holdOrbit(sh, homePl, 60, h)
            else {
              this._steerPlanet(sh, homePl, h)
              if (dist(sh, homePl) < homePl.r + 10) sh.gone = true
            }
          }
        }
        continue
      }

      if (sh.kind === 'dread') {
        // отступление: уходим из боя домой на ремонт
        if (sh.retreating) {
          const homeP = this.planetById(sh.home)
          if (homeP) this._steerPlanet(sh, homeP, h)
          let nearestFoe = Infinity
          for (const o of this.ships) {
            if (o.kind === 'dread' && o.hp > 0 && this.hostile(sh.owner, o.owner)) nearestFoe = Math.min(nearestFoe, dist(sh, o))
          }
          if (nearestFoe > 620 || (homeP && dist(sh, homeP) < 160)) sh.retreating = false
          continue
        }

        // авиакрыло
        const wing = this.ships.filter((s) => s.carrier === sh.id && s.hp > 0)
        // сбор ударного крыла: считаем все свои истребители рядом (включая крылья соседей по флоту)
        if (sh.airTactic === 'massed') {
          const near = this.ships.filter((s) => s.kind === 'fighter' && s.owner === sh.owner && s.hp > 0 && dist(s, sh) < 150).length
          if (!sh.strike && near >= 5) sh.strike = true
          else if (sh.strike && near < 2) sh.strike = false
        }
        // приоритет целей: дредноуты > транспорты > мелочь (по самолётам бьёт крыло)
        let foe = null
        let foeRank = 0
        let foeD = 300
        for (const o of this.ships) {
          if (o.hp <= 0 || !this.hostile(sh.owner, o.owner)) continue
          const d2 = dist(sh, o)
          if (d2 > 300) continue
          const rank = o.kind === 'dread' ? 3 : o.kind === 'transport' ? 2 : 1
          if (rank > foeRank || (rank === foeRank && d2 < foeD)) {
            foeRank = rank
            foeD = d2
            foe = o
          }
        }
        if (wing.length < 3 && (foe || (m && m.type !== 'escort')) && sh.cd <= 0) {
          sh.cd = 5
          const f = this._spawnShip('fighter', st, { x: sh.x, y: sh.y, r: 4, id: sh.home })
          if (f) {
            f.carrier = sh.id
            f.home = sh.home
          }
        }
        if (foe && dist(sh, foe) < 90) this._fire(sh, foe, 22 * h, true)

        // ГЕНЕРАЛЬНОЕ СРАЖЕНИЕ: вражеский дредноут в радиусе — манёвр, строй и шквальный огонь
        let duel = null
        let duelD = 520
        for (const o of this.ships) {
          if (o.kind !== 'dread' || o.hp <= 0 || !this.hostile(sh.owner, o.owner)) continue
          const d2 = dist(sh, o)
          if (d2 < duelD) {
            duelD = d2
            duel = o
          }
        }
        if (duel) {
          if (!sh.battle) {
            sh.battle = true
            if (this.battleLogT <= 0) {
              this.battleLogT = 15
              this.log(`⚔️ флоты ${st.name} и ${this.stateById(duel.owner)?.name || '?'} сошлись в генеральном сражении!`)
            }
          }
          // побитый дредноут против здорового может дрогнуть и выйти из боя
          if (sh.hp < sh.maxHp * 0.35 && duel.hp > sh.hp * 1.6 && Math.random() < h * 0.18) {
            sh.retreating = true
            sh.battle = false
            sh.mission = null
            this.log(`🏳️ повреждённый дредноут ${st.name} выходит из боя`)
            continue
          }
          // в бою поднимаем полное авиакрыло
          if (wing.length < 5 && sh.cd <= 0) {
            sh.cd = 2.5
            const f = this._spawnShip('fighter', st, { x: sh.x, y: sh.y, r: 4, id: sh.home })
            if (f) {
              f.carrier = sh.id
              f.home = sh.home
            }
          }
          // держим боевую дистанцию: сблизиться, не таранить, кружить
          if (duelD > 200) this._steer(sh, duel.x, duel.y, h)
          else if (duelD < 110) this._steer(sh, sh.x + (sh.x - duel.x), sh.y + (sh.y - duel.y), h)
          else {
            const ang = Math.atan2(sh.y - duel.y, sh.x - duel.x) + 0.18 * h
            this._steer(sh, duel.x + Math.cos(ang) * 150, duel.y + Math.sin(ang) * 150, h)
          }
          if (duelD < 230) this._fire(sh, duel, 18 * h, true)
          continue
        }
        sh.battle = false

        // рейд по тылам: гоняем грузовики и шахтёров противника
        if (m?.type === 'raid') {
          const en = this.stateById(m.enemy)
          if (!en || !this.isWar(sh.owner, m.enemy)) {
            sh.mission = null
          } else {
            let prey = null
            let bd = Infinity
            for (const o of this.ships) {
              if (o.hp <= 0 || o.owner !== m.enemy || (o.kind !== 'transport' && o.kind !== 'miner')) continue
              const d = dist(sh, o)
              if (d < bd) {
                bd = d
                prey = o
              }
            }
            if (prey) this._steer(sh, prey.x, prey.y, h)
            else {
              const eHome = this.planetsOf(en)[0]
              if (eHome) this._holdOrbit(sh, eHome, 340, h)
            }
            continue
          }
        }

        // блокада: висим у вражеской планеты вне зоны ПВО и перехватываем всё
        if (m?.type === 'blockade') {
          const p = this.planetById(m.planet)
          if (!p || !p.alive || !p.owner || !this.hostile(sh.owner, p.owner)) {
            sh.mission = null
          } else {
            this._holdOrbit(sh, p, 320, h)
            continue
          }
        }

        if (m?.type === 'siege') {
          const p = this.planetById(m.planet)
          if (!p || !p.alive || !p.owner || !this.hostile(sh.owner, p.owner)) {
            sh.mission = null
          } else {
            const dNow = dist(sh, p)
            // на марше держим строй клином за флагманом
            if (dNow > 420) {
              const group = this.ships.filter(
                (s) => s.kind === 'dread' && s.owner === sh.owner && s.hp > 0 && s.mission?.type === 'siege' && s.mission.planet === m.planet,
              )
              const slot = this._formationSlot(sh, group)
              if (slot) {
                this._steer(sh, slot.x, slot.y, h)
                continue
              }
            }
            if (dNow > 190) {
              this._steerPlanet(sh, p, h)
            } else {
              // встаём на боевую дистанцию и медленно облетаем цель
              const ang = Math.atan2(sh.y - p.y, sh.x - p.x) + 0.25 * h
              this._steer(sh, p.x + Math.cos(ang) * 150, p.y + Math.sin(ang) * 150, h, p)
            }
            const d = dist(sh, p)
            if (d < 220) {
              if (p.pvoUnits > 0) {
                // сначала выбиваем ПВО — по людям не бьём, планета нужна целой
                this.damagePvo(p, 9 * h)
                if (Math.random() < h * 2) this.beams.push({ x1: sh.x, y1: sh.y, x2: p.x, y2: p.y, life: 1, color: st.color })
                // ПВО лютое: фокусирует ближайший корабль, 1 установка ≈ 1 корабль
                const siegers = this.ships.filter((s) => s.kind === 'dread' && s.hp > 0 && s.mission?.planet === p.id && dist(s, p) < 240)
                let nearest = sh
                let nd = dist(sh, p)
                for (const s2 of siegers) {
                  const dd2 = dist(s2, p)
                  if (dd2 < nd) {
                    nd = dd2
                    nearest = s2
                  }
                }
                this._damageShip(nearest, p.pvoUnits * 14 * h, null)
                if (nearest !== sh) this._damageShip(sh, p.pvoUnits * 2.5 * h, null)
                if (Math.random() < h * 2.2) this.beams.push({ x1: p.x, y1: p.y, x2: nearest.x, y2: nearest.y, life: 0.8, color: '#7df0ff' })
              } else {
                // бомбардировка беззащитной планеты: выжигаем, но не захватываем
                p.pop -= 0.12 * h
                if (Math.random() < h * 1.5) this.beams.push({ x1: sh.x, y1: sh.y, x2: p.x, y2: p.y, life: 0.7, color: st.color })
                if (p.pop <= 0.01) {
                  p.pop = 0
                  p.owner = null
                  p.pvoUnits = 0
                  p.pvoReady = 0
                  this.log(`🔥 ${st.name} выжгло ${p.name} дотла — планета обезлюдела`)
                }
              }
            }
          }
          continue
        }
        // охрана дома: дежурим на орбите и чинимся
        const homeP = this.planetById(sh.home)
        if (homeP) {
          this._holdOrbit(sh, homeP, 95, h)
          if (sh.hp < sh.maxHp && dist(sh, homeP) < 180) sh.hp = Math.min(sh.maxHp, sh.hp + 6 * h)
        }
        continue
      }

      if (sh.kind === 'transport') {
        // ПВО транспорта: отстреливает истребители и рейдеров поодиночке
        const attackers = this.ships.filter((s) => s.hp > 0 && (s.kind === 'fighter' || s.kind === 'raider') && this.hostile(sh.owner, s.owner) && dist(sh, s) < 55)
        if (attackers.length) {
          const dps = 16 / Math.max(attackers.length - 1, 1) // стаю уже не сдержать
          this._fire(sh, attackers[0], dps * h)
        }

        // переезд пиратского логова: вся вольница на одном борту
        if (m?.type === 'pirateMove') {
          const p = this.planetById(m.planet)
          if (!p || !p.alive || p.owner) {
            const alt = this.e.planets.find((q) => q.alive && !q.owner)
            if (alt) m.planet = alt.id
            else sh.mission = null
            continue
          }
          this._steerPlanet(sh, p, h)
          if (dist(sh, p) < p.r + 10) {
            p.owner = sh.owner
            p.pop = m.popLoad
            p.pvoUnits = 1
            p.pvoReady = 1
            for (const r of this.ships) {
              if (r.owner === sh.owner && r.kind === 'raider') r.home = p.id
            }
            this.log(`🏴‍☠️ пираты обжили новую базу на ${p.name}`)
            sh.gone = true
          }
          continue
        }

        if (m?.type === 'trade') {
          const from = this.planetById(m.from)
          const to = this.planetById(m.to)
          if (!from || !to || !from.alive || !to.alive) {
            sh.mission = null
            continue
          }
          const tgt = m.leg === 0 ? to : from
          this._steerPlanet(sh, tgt, h)
          if (dist(sh, tgt) < tgt.r + 16) {
            m.leg = 1 - m.leg
            const gain = 20 * (m.boost || 1)
            if (m.boost > 1) {
              const o = this.stateById(sh.owner)
              if (o) o.credits += gain
            } else if (m.a === m.b) {
              // внутренний маршрут — скромнее, но стабильно
              const o = this.stateById(sh.owner)
              if (o) o.credits += 12
            } else {
              const sa = this.stateById(m.a)
              const sb = this.stateById(m.b)
              if (sa) sa.credits += gain
              if (sb) sb.credits += gain
            }
          }
          continue
        }

        if (m?.type === 'colonize') {
          const p = this.planetById(m.planet)
          if (!p || !p.alive || p.owner) {
            sh.mission = null
            continue
          }
          this._steerPlanet(sh, p, h)
          if (dist(sh, p) < p.r + 10) {
            p.owner = sh.owner
            p.pop = m.settlers
            p.pvoUnits = 1
            p.pvoReady = 1
            this.log(`🏙 ${st.name} основало колонию на ${p.name}`)
            // корабль разбирают на стройматериалы — колонисты остаются жить
            sh.gone = true
          }
          continue
        }

        if (m?.type === 'invade') {
          const p = this.planetById(m.planet)
          if (!p || !p.alive || !p.owner || !this.hostile(sh.owner, p.owner)) {
            sh.mission = null
            continue
          }
          if (p.pvoUnits > 0) {
            // ждём на безопасном расстоянии, пока дредноуты не пробьют ПВО
            const ang = Math.atan2(sh.y - p.y, sh.x - p.x) + 0.5 * h
            this._steer(sh, p.x + Math.cos(ang) * 300, p.y + Math.sin(ang) * 300, h)
            continue
          }
          this._steerPlanet(sh, p, h)
          if (dist(sh, p) < p.r + 10) {
            const kills = m.troops * 2.5
            p.pop -= kills
            this.log(`🪖 десант ${st.name} на ${p.name}: −${(kills * 1000) | 0} населения`)
            if (p.pop <= 0) this._planetFalls(p, st, Math.max(m.troops, 1))
            sh.mission = null
            sh.hp = 0 // транспорт расходуется в десанте
          }
          continue
        }

        // без миссии — домой в док
        const hp2 = this.planetById(sh.home)
        if (hp2) {
          this._steerPlanet(sh, hp2, h)
          if (dist(sh, hp2) < hp2.r + 10) sh.gone = true
        }
        continue
      }

      if (sh.kind === 'miner') {
        if (!m) {
          // ближайший непустой астероид
          let best = null
          let bd = Infinity
          for (const a of this.asteroids) {
            if (a.res <= 0) continue
            const d = dist(sh, a)
            if (d < bd) {
              bd = d
              best = a
            }
          }
          if (best) sh.mission = { type: 'mine', ast: best.id, phase: 0, haul: 0 }
          else {
            // руды нигде нет — домой в док
            const hp3 = this.planetById(sh.home)
            if (hp3) {
              this._steerPlanet(sh, hp3, h)
              if (dist(sh, hp3) < hp3.r + 10) sh.gone = true
            }
          }
          continue
        }
        if (m.phase === 0) {
          const ast = this.asteroids.find((a) => a.id === m.ast)
          if (!ast || ast.res <= 0) {
            sh.mission = null
            continue
          }
          this._steer(sh, ast.x, ast.y, h)
          if (dist(sh, ast) < ast.size + 8) {
            // выгребаем руду; пустой астероид исчезает
            m.haul = Math.min(26, ast.res)
            ast.res -= m.haul
            if (ast.res <= 0) this.asteroids = this.asteroids.filter((a) => a.id !== ast.id)
            m.phase = 1
          }
        } else {
          const hp4 = this.planetById(sh.home)
          if (!hp4 || !hp4.alive) {
            sh.mission = null
            continue
          }
          this._steerPlanet(sh, hp4, h)
          if (dist(sh, hp4) < hp4.r + 12) {
            st.credits += m.haul
            sh.mission = null
          }
        }
      }
    }

    // гибель и трофеи
    for (const sh of this.ships) {
      if (sh.hp > 0 || sh.gone) continue
      const killer = sh.killer ? this.stateById(sh.killer) : null
      if (sh.kind === 'dread' && killer?.pirate) {
        // пираты захватывают дредноут с половиной хп
        sh.owner = killer.id
        sh.hp = sh.maxHp / 2
        sh.mission = null
        sh.home = this.planetsOf(killer)[0]?.id ?? sh.home
        this.log(`🏴‍☠️ пираты захватили дредноут! теперь он их`)
        continue
      }
      if ((sh.kind === 'transport' || sh.kind === 'miner') && killer?.pirate) {
        const loot = sh.kind === 'transport' ? 45 : 20 + (sh.mission?.haul || 0)
        killer.credits += loot
        const victim = this.stateById(sh.owner)
        if (victim) victim.pirateLosses += loot
        this.log(`🏴‍☠️ пираты ограбили ${sh.kind === 'transport' ? 'караван' : 'шахтёра'} (+${loot} кр)`)
      } else if (sh.kind === 'transport' && killer) {
        if (sh.mission?.type === 'trade') {
          // дредноут перехватил караван — маршрут переключается на захватчика
          sh.owner = killer.id
          sh.hp = sh.maxHp * 0.6
          const kHome = this.planetsOf(killer)[0]
          if (kHome) {
            sh.mission = { type: 'trade', a: killer.id, b: killer.id, from: sh.mission.from, to: kHome.id, leg: 0, boost: 1.5 }
            this.log(`⚓ ${killer.name} перехватило караван — теперь возит ему ×1.5`)
            continue
          }
        }
      }
      if (sh.kind === 'dread') {
        // гибель дредноута — событие
        this.e._burst(sh.x, sh.y, 70, ['#ffd9a0', '#ffffff', this.stateById(sh.owner)?.color || '#fff'], 60, 320)
        this.e.waves.push({ x: sh.x, y: sh.y, r: 4, vr: 240, life: 0.9, max: 0.9, color: '255,210,160', width: 3 })
        this.log(`💥 дредноут ${this.stateById(sh.owner)?.name || '?'} уничтожен в бою`)
      } else {
        this.e._burst(sh.x, sh.y, 14, ['#ffd9a0', '#ffffff', this.stateById(sh.owner)?.color || '#fff'], 40, 160)
      }
    }
    this.ships = this.ships.filter((s) => s.hp > 0 && !s.gone)
  }

  _damageShip(sh, dmg, attacker) {
    sh.hp -= dmg
    if (attacker && sh.hp <= 0) sh.killer = attacker.owner ?? attacker
    if (Math.random() < 0.1) this.e._burst(sh.x, sh.y, 2, ['#ffd9a0'], 20, 80)
  }

  // боевой заход лёгкого корабля: подлёт — укус — отворот в сторону — новый заход
  _attackRun(sh, target, h, power) {
    if (sh.breakT > 0) {
      sh.breakT -= h
      this._steer(sh, sh.bx, sh.by, h)
      return
    }
    this._steer(sh, target.x, target.y, h)
    if (dist(sh, target) < 24) {
      this._damageShip(target, power * 0.7, sh)
      if (this.beams.length < 60) {
        const st = this.stateById(sh.owner)
        this.beams.push({ x1: sh.x, y1: sh.y, x2: target.x, y2: target.y, life: 0.5, color: st?.color || '#fff' })
      }
      this.e._burst(target.x, target.y, 4, ['#ffd9a0', '#ffffff'], 30, 110)
      const a = Math.random() * TAU
      sh.bx = target.x + Math.cos(a) * rand(80, 150)
      sh.by = target.y + Math.sin(a) * rand(80, 150)
      sh.breakT = rand(0.7, 1.3)
    }
  }

  // выстрел с лазерным лучом — бой видно
  _fire(from, to, dmg, heavy = false) {
    this._damageShip(to, dmg, from)
    if (this.beams.length < 60 && Math.random() < (heavy ? 0.16 : 0.1)) {
      const st = this.stateById(from.owner)
      this.beams.push({ x1: from.x, y1: from.y, x2: to.x, y2: to.y, life: heavy ? 0.9 : 0.6, color: st?.color || '#fff' })
      this.e._burst(to.x, to.y, 3, ['#ffd9a0', '#ffffff'], 20, 90)
    }
  }

  _planetFalls(p, conqueror, newPop) {
    const old = this.stateById(p.owner)
    p.owner = conqueror.id
    p.pop = newPop
    p.pvoUnits = 1
    p.pvoReady = 1
    p.pvoReload = []
    p.pvoBuildT = 0
    this.log(`🚩 ${p.name} ${old ? `отбита у ${old.name}` : 'захвачена'} — теперь ${conqueror.name}`)
  }

  // ---------- баллистика и ПВО ----------

  _launchWarhead(from, to, st, kind = 'warhead') {
    // упреждение: куда планета придёт за время полёта
    const d0 = dist(from, to)
    const speed = 200
    const tof = d0 / speed
    const angVel = (to.x * to.vy - to.y * to.vx) / (to.x * to.x + to.y * to.y || 1)
    const da = angVel * tof
    const cosA = Math.cos(da)
    const sinA = Math.sin(da)
    const tx = to.x * cosA - to.y * sinA
    const ty = to.x * sinA + to.y * cosA
    const dx = tx - from.x
    const dy = ty - from.y
    const dd = Math.hypot(dx, dy) || 1
    if (this.e.meteors.length < 50) {
      this.e.meteors.push({
        kind,
        owner: st.id,
        target: to.id,
        x: from.x + (dx / dd) * (from.r + 8),
        y: from.y + (dy / dd) * (from.r + 8),
        vx: (dx / dd) * speed + from.vx * 0.4 + rand(-12, 12),
        vy: (dy / dd) * speed + from.vy * 0.4 + rand(-12, 12),
        r: kind === 'breaker' ? 3.4 : 2.4,
        mass: kind === 'breaker' ? 16 : 10,
        trail: [],
        age: 0,
      })
    }
  }

  onWarheadHit(p, m) {
    const att = this.stateById(m.owner)
    if (!p.owner || !att || !this.hostile(m.owner, p.owner)) return
    if (m.kind === 'breaker') {
      // разрушитель: бьёт по самой планете, население страдает заодно
      p.pop = Math.max(0, p.pop - rand(0.3, 0.5))
      this.setRel(m.owner, p.owner, this.getRel(m.owner, p.owner) - 16)
      return
    }
    // обычная боеголовка: чисто противонаселенческое оружие,
    // планету не ломает, ПВО лишь слегка царапает
    const kills = rand(0.18, 0.4)
    p.pop = Math.max(0, p.pop - kills)
    if (Math.random() < 0.5) this.damagePvo(p, 1.2)
    this.setRel(m.owner, p.owner, this.getRel(m.owner, p.owner) - 8)
    if (p.pop <= 0.01) {
      p.pop = 0
      p.owner = null
      p.pvoUnits = 0
      p.pvoReady = 0
      this.log(`☢️ ${p.name} выжжена баллистикой ${att.name}`)
    }
  }

  // Планетарная авиация: при вторжении планета поднимает ополчение —
  // своих истребителей у неё заметно больше, чем у носителей
  _planetDefense(h) {
    for (const p of this.e.planets) {
      if (!p.alive || !p.owner || p.pop <= 0) continue
      p.defT = (p.defT || 0) - h
      if (p.defT > 0) continue
      const militia = this.ships.filter((s) => s.militia && s.home === p.id && s.hp > 0).length
      const cap = clamp(2 + Math.round(p.pop * 1.2), 2, 12)
      if (militia >= cap) continue
      let threat = false
      for (const o of this.ships) {
        if (o.hp > 0 && o.kind !== 'miner' && this.hostile(p.owner, o.owner) && dist(o, p) < 320) {
          threat = true
          break
        }
      }
      if (!threat) continue
      // ополчение поднимается, только пока есть кому летать, и стоит людей
      if (p.pop < 0.08) continue
      p.defT = 1.6
      const st = this.stateById(p.owner)
      if (!st) continue
      const f = this._spawnShip('fighter', st, p)
      if (!f) continue
      p.pop = Math.max(p.pop - 0.004, 0.01)
      f.militia = true
      f.hp = f.maxHp = 12
    }
  }

  // ПВО: каждая заряженная установка сбивает одну ракету и уходит на перезарядку 3 с.
  // 5 установок = 5 одновременных перехватов; залп больше — лишние проходят.
  _pvoIntercept() {
    for (const m of this.e.meteors) {
      if ((m.kind !== 'warhead' && m.kind !== 'breaker') || m.dead) continue
      for (const p of this.e.planets) {
        if (!p.alive || !p.owner || p.pvoReady <= 0) continue
        if (!this.hostile(m.owner, p.owner)) continue
        if (dist(m, p) < 180) {
          m.dead = true
          p.pvoReady--
          p.pvoReload.push(3)
          this.beams.push({ x1: p.x, y1: p.y, x2: m.x, y2: m.y, life: 1, color: '#7df0ff' })
          this.e._burst(m.x, m.y, 12, ['#7df0ff', '#ffffff'], 40, 160)
          break
        }
      }
    }
  }

  // ---------- пояса астероидов ----------

  _spawnAsteroid(orbitR, ang = Math.random() * TAU, res = Math.round(rand(40, 110))) {
    const size = rand(2.2, 4.5)
    this.asteroids.push({
      id: uid++,
      orbitR,
      ang,
      // кеплеровская угловая скорость — летят вместе со всеми, не отстают
      w: Math.sqrt(this.gm) / Math.pow(orbitR, 1.5),
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

  _asteroidsTick(h) {
    // редкое пополнение пояса
    this.astTick -= h
    if (this.astTick <= 0) {
      this.astTick = 30
      if (this.asteroids.length < 50 && this.asteroids.length > 0) {
        this._spawnAsteroid(pick(this.asteroids).orbitR + rand(-40, 40))
      }
    }
    for (const a of this.asteroids) {
      a.ang += a.w * h
      a.rot += a.spin * h
      a.x = Math.cos(a.ang) * a.orbitR
      a.y = Math.sin(a.ang) * a.orbitR
    }
  }

  // ---------- справки для UI ----------

  shipAt(x, y, radius) {
    let best = null
    let bd = radius
    for (const sh of this.ships) {
      const d = Math.hypot(sh.x - x, sh.y - y)
      if (d < bd) {
        bd = d
        best = sh
      }
    }
    return best
  }

  shipLabel(sh) {
    return SHIP[sh.kind]?.label || sh.kind
  }

  astAt(x, y, radius) {
    let best = null
    let bd = radius
    for (const s of this.asteroids) {
      const d = Math.hypot(s.x - x, s.y - y)
      if (d < bd) {
        bd = d
        best = s
      }
    }
    return best
  }

  missionText(sh) {
    const m = sh.mission
    const pName = (id) => this.planetById(id)?.name || '?'
    if (sh.battle) return '⚔️ генеральное сражение!'
    if (sh.retreating) return '🏳️ отступает на ремонт'
    if (sh.militia) return 'ополчение — защищает дом'
    if (sh.kind === 'fighter' && sh.carrier) {
      const car = this.shipById(sh.carrier)
      if (car?.airTactic === 'massed' && !car.strike) return 'крыло собирается у носителя'
      if (car?.airTactic === 'cap') return 'прикрывает носитель'
    }
    if (!m) {
      if (sh.kind === 'dread') {
        const T = { free: 'свободная охота', massed: 'собранный налёт', cap: 'прикрытие' }
        return `дежурит на орбите · авиакрыло: ${T[sh.airTactic] || '—'}`
      }
      if (sh.kind === 'raider') return 'патрулирует базу'
      return 'возвращается в док'
    }
    switch (m.type) {
      case 'trade':
        return m.boost > 1 ? `возит дань → ${pName(m.to)} (×1.5)` : `торгует: ${pName(m.from)} ↔ ${pName(m.to)}`
      case 'colonize':
        return `везёт колонистов → ${pName(m.planet)}`
      case 'invade':
        return `десант → ${pName(m.planet)} (${(m.troops * 1000) | 0} чел)`
      case 'siege':
        return `осада ${pName(m.planet)}`
      case 'hunt':
        return 'охотится на добычу'
      case 'raid':
        return `рейд по тылам ${this.stateById(m.enemy)?.name || '?'}`
      case 'blockade':
        return `блокада ${pName(m.planet)}`
      case 'escort':
        return 'охраняет конвой'
      case 'pirateMove':
        return 'перевозит пиратское логово'
      case 'mine':
        return m.phase === 0 ? 'летит к астероиду' : `везёт руду домой (+${m.haul} кр)`
      default:
        return 'патрулирует'
    }
  }

  summary() {
    return this.states.map((st) => {
      const wars = []
      const allies = []
      for (const o of this.states) {
        if (o.id === st.id) continue
        if (this.isWar(st.id, o.id)) wars.push(o.name)
        else if (this.isAlly(st.id, o.id)) allies.push(o.name)
      }
      return {
        id: st.id,
        name: st.name,
        color: st.color,
        pirate: st.pirate,
        home: this.planetsOf(st)[0]?.id || null,
        tactic: st.tactic,
        planets: this.planetsOf(st).length,
        pop: this.popOf(st),
        ships: this.ships.filter((s) => s.owner === st.id).length,
        credits: Math.round(st.credits),
        wars,
        allies,
      }
    })
  }

  // ---------- хуки от движка ----------

  onPlanetHurt(p, dmg) {
    if (!p.owner || p.pop <= 0) return
    const kills = Math.min(p.pop, dmg * 0.06)
    if (kills > 0.05) {
      p.pop -= kills
      this.log(`💀 катастрофа на ${p.name}: −${(kills * 1000) | 0} населения`)
      if (p.pop <= 0.01) {
        p.pop = 0
        p.owner = null
        this.log(`⚰️ цивилизация на ${p.name} погибла`)
      }
    }
  }

  onPlanetLost(p) {
    if (p.pop > 0) this.log(`☄️ ${p.name} уничтожена вместе с ${(p.pop * 1000) | 0} жителей`)
    p.pop = 0
    p.owner = null
    p.pvoUnits = 0
    p.pvoReady = 0
  }

  // ---------- отрисовка ----------

  drawUnder(ctx) {
    // зоны контроля
    for (const st of this.states) {
      if (st.pirate) continue
      for (const p of this.planetsOf(st)) {
        const zone = Math.max(60, 200 + p.pop * 40)
        ctx.save()
        ctx.globalAlpha = 0.05
        ctx.fillStyle = st.color
        ctx.beginPath()
        ctx.ellipse(p.x, p.y * SQ, zone, zone * SQ, 0, 0, TAU)
        ctx.fill()
        ctx.globalAlpha = 0.14
        ctx.strokeStyle = st.color
        ctx.lineWidth = 1 / this.e.cam.zoom
        ctx.setLineDash([3 / this.e.cam.zoom, 8 / this.e.cam.zoom])
        ctx.stroke()
        ctx.restore()
      }
    }
  }

  drawOver(ctx) {
    const z = this.e.cam.zoom
    // астероиды: усыхают по мере выработки
    for (const a of this.asteroids) {
      const k = 0.55 + 0.45 * Math.min(1, a.res / a.res0)
      ctx.save()
      ctx.translate(a.x, a.y * SQ)
      ctx.rotate(a.rot)
      ctx.scale(k, k)
      ctx.fillStyle = '#7e7468'
      ctx.beginPath()
      a.verts.forEach((v, i) => (i ? ctx.lineTo(v.x, v.y) : ctx.moveTo(v.x, v.y)))
      ctx.closePath()
      ctx.fill()
      ctx.fillStyle = 'rgba(255,255,255,0.12)'
      ctx.beginPath()
      ctx.arc(-a.size * 0.25, -a.size * 0.25, a.size * 0.35, 0, TAU)
      ctx.fill()
      ctx.restore()
    }

    // корабли: SVG-спрайты в цвете владельца (нос вверх → +90°).
    // При отдалении не растворяются: масштаб компенсирует зум + подсветка-свечение
    const mul = clamp(0.55 / z, 1, 3.4)
    for (const sh of this.ships) {
      const st = this.stateById(sh.owner)
      const color = st?.color || '#59d6ff'
      const x = sh.x
      const y = sh.y * SQ
      const ang = Math.atan2(sh.vy * SQ, sh.vx) + Math.PI / 2

      let key = sh.kind
      let w = 10
      let hgt = 10
      if (sh.kind === 'dread') {
        key = 'dread'
        w = 14
        hgt = 28
      } else if (sh.kind === 'transport') {
        key = sh.mission?.type === 'invade' ? 'troop' : 'cargo'
        w = 13
        hgt = 13
      } else if (sh.kind === 'miner') {
        key = 'miner'
        w = 11
        hgt = 11
      }
      w *= mul
      hgt *= mul

      // подсветка под корпусом
      const glowR = Math.max(w, hgt) * 0.75
      ctx.save()
      ctx.globalCompositeOperation = 'lighter'
      const gg = ctx.createRadialGradient(x, y, 0, x, y, glowR)
      gg.addColorStop(0, color + '66')
      gg.addColorStop(1, color + '00')
      ctx.fillStyle = gg
      ctx.beginPath()
      ctx.arc(x, y, glowR, 0, TAU)
      ctx.fill()
      ctx.restore()

      const img = getSprite(key, color)
      ctx.save()
      ctx.translate(x, y)
      ctx.rotate(ang)
      if (img.complete && img.naturalWidth) {
        ctx.drawImage(img, -w / 2, -hgt / 2, w, hgt)
      } else {
        ctx.fillStyle = color
        ctx.beginPath()
        ctx.arc(0, 0, 3 * mul, 0, TAU)
        ctx.fill()
      }
      ctx.restore()

      if (sh.hp < sh.maxHp) {
        const bw = (sh.kind === 'dread' ? 22 : 12) * mul
        const by = y - 12 * mul
        ctx.fillStyle = 'rgba(0,0,0,0.5)'
        ctx.fillRect(x - bw / 2, by, bw, 2.4 * mul)
        ctx.fillStyle = sh.hp / sh.maxHp > 0.4 ? '#7dd87d' : '#ff6b5c'
        ctx.fillRect(x - bw / 2, by, (bw * sh.hp) / sh.maxHp, 2.4 * mul)
      }
    }

    // лучи ПВО / орудий
    ctx.save()
    ctx.globalCompositeOperation = 'lighter'
    for (const b of this.beams) {
      ctx.strokeStyle = b.color
      ctx.globalAlpha = clamp(b.life, 0, 1) * 0.7
      ctx.lineWidth = 1.4 / z
      ctx.beginPath()
      ctx.moveTo(b.x1, b.y1 * SQ)
      ctx.lineTo(b.x2, b.y2 * SQ)
      ctx.stroke()
    }
    ctx.restore()
  }
}
