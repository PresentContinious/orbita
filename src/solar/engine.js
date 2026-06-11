import { generateSystem } from './gen.js'
import { Civ } from './civ/index.js'
import { getSprite } from './sprites.js'

const TAU = Math.PI * 2
// Сплющивание плоскости системы для псевдо-3/4 ракурса (только отрисовка)
const SQ = 0.74
// Гравитационный параметр Солнца
const GM_SUN = 550000
// Мелкие тела чувствуют Солнце сильнее — чтобы кривизну было видно издалека
const SUN_BOOST_SMALL = 1.8
const EARTH_YEAR_S = TAU * Math.sqrt(190 ** 3 / GM_SUN)
const SUN_R = 34
// Радиус белого карлика после сверхновой
const DWARF_R = 9
// Масса планеты в единицах GM
const MASS_K = 0.35
// Игровой буст: мелкие тела (метеоры, обломки) чувствуют планеты в N раз сильнее,
// иначе захват на орбиту спутника физически почти невозможен
const G_BOOST = 9
// Смягчение гравитации — небольшое, чтобы близкие пролёты реально швыряло
const EPS2 = 60
const LOST_DIST = 3600
// Логика цивилизаций тикает фиксированным шагом — поведение не зависит от скорости и FPS
const CIV_TICK = 0.05

// Сфера влияния планеты: внутри неё работает захват на орбиту
const soiOf = (r) => clamp(r * 5, 45, 160)

// Типы снарядов: f — множитель замаха, vmax — предел скорости
const PROJ = {
  meteor: { f: 1.1, vmax: 420, r: 3.2, mass: 22, life: 45 },
  rocket: { f: 1.2, vmax: 460, r: 3.4, mass: 30, life: Infinity },
  rock: { f: 0.9, vmax: 320, r: 7, mass: 350, life: Infinity },
  warhead: { f: 1, vmax: 400, r: 2.4, mass: 10, life: 60 },
  breaker: { f: 1, vmax: 400, r: 3.4, mass: 16, life: 60 },
}
const AIM_TOOLS = new Set(['meteor', 'rocket', 'rock'])

const clamp = (v, a, b) => Math.min(b, Math.max(a, v))
const lerp = (a, b, t) => a + (b - a) * t
const rand = (a, b) => a + Math.random() * (b - a)

export class Engine {
  constructor(canvas, callbacks = {}) {
    this.canvas = canvas
    this.ctx = canvas.getContext('2d')
    this.cb = callbacks

    this.genId = 0
    this._buildSystem()

    this.meteors = []
    this.debris = []
    this.sparks = []
    this.waves = []
    this.holes = []
    this.sunFlares = []
    this.flareTimer = 2

    this.sunAlive = true
    this.nova = null

    this.cam = { x: 0, y: 0, zoom: 0.12 }
    this.target = { x: 0, y: 0, zoom: 0.3 }
    this.timeScale = 1
    this.paused = false
    this.simT = 0
    this.civAcc = 0
    this.civTickSize = CIV_TICK
    this.fps = 60
    this.visT = 0
    this.followId = null
    this.hoverId = null
    this.selectedId = null
    this.tool = 'hand'
    this.aim = null
    this.shake = 0
    this.flash = 0
    this.sunFlare = 0

    this.pointer = {
      down: false,
      sx: 0,
      sy: 0,
      x: 0,
      y: 0,
      moved: 0,
      dragPlanet: null,
      panning: false,
      samples: [],
    }
    this.mouse = { x: 0, y: 0 }

    this.stars = []
    this.comets = []
    this.shoots = []
    this.cometTimer = 5
    this.shootTimer = 3
    this.moonAngle = 0

    this._onResize = () => this.resize()
    window.addEventListener('resize', this._onResize)
    this._bindPointer()
    this.resize()
    this._makeStars()

    this.civ = new Civ(this)
    this.target.zoom = this.fitZoom

    this.running = true
    this.last = performance.now()
    this._loop = this._loop.bind(this)
    requestAnimationFrame(this._loop)
  }

  destroy() {
    this.running = false
    window.removeEventListener('resize', this._onResize)
  }

  _placeOnOrbit(b, th) {
    b.x = Math.cos(th) * b.orbit
    b.y = Math.sin(th) * b.orbit
    const v = Math.sqrt(GM_SUN / b.orbit)
    b.vx = -Math.sin(th) * v
    b.vy = Math.cos(th) * v
  }

  _buildSystem() {
    this.planets = generateSystem().map((p) => {
      const b = {
        ...p,
        baseR: p.r,
        soi: soiOf(p.r),
        mass: p.r ** 3 * MASS_K,
        maxHp: p.r,
        hp: p.r,
        alive: true,
        fate: null,
        dragging: false,
        disturbed: false,
        trail: [],
        craters: [],
        // радиальный профиль формы: 1 = целый контур, меньше = выгрызенный кусок
        shape: new Array(48).fill(1),
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
      }
      this._placeOnOrbit(b, Math.random() * TAU)
      return b
    })
    this.maxOrbit = Math.max(...this.planets.map((p) => p.orbit))
    this.lostDist = this.maxOrbit * 1.3 + 800
  }

  get fitZoom() {
    const m = Math.min(this.w || 900, this.h || 600)
    return clamp(m / 2 / (this.maxOrbit * 1.12), 0.1, 0.85)
  }

  newGame() {
    this._buildSystem()
    this.meteors = []
    this.debris = []
    this.holes = []
    this.sparks = []
    this.waves = []
    this.sunAlive = true
    this.nova = null
    this.civ.reset()
    this.civAcc = 0
    this.genId++
    this.resetView()
    this.flash = Math.max(this.flash, 0.25)
  }

  get _sunR() {
    return this.sunAlive ? SUN_R : DWARF_R
  }

  // ---------- публичное API ----------

  setTool(tool) {
    this.tool = tool
    this.aim = null
    this.canvas.style.cursor = tool === 'hand' ? 'default' : 'crosshair'
  }

  resetSystem() {
    for (const p of this.planets) {
      p.alive = true
      p.fate = null
      p.hp = p.maxHp
      p.r = p.baseR
      p.trail = []
      p.craters = []
      p.shape = new Array(48).fill(1)
      p.dragging = false
      p.disturbed = false
      this._placeOnOrbit(p, Math.random() * TAU)
    }
    this.meteors = []
    this.debris = []
    this.holes = []
    this.sunAlive = true
    this.nova = null
    this.civ?.reset()
    this.civAcc = 0
    this.flash = Math.max(this.flash, 0.18)
  }

  resetView() {
    this.followId = null
    this.selectedId = null
    this.target.x = 0
    this.target.y = 0
    this.target.zoom = this.fitZoom
    this.cb.onSelect?.(null)
  }

  // снять выбор, не трогая камеру
  deselect() {
    this.followId = null
    this.selectedId = null
    this.cb.onSelect?.(null)
  }

  // перелёт камеры к точке мира (клик по событию в ленте)
  flyTo(x, y, zoom = 1.1) {
    this.followId = null
    this.target.x = x
    this.target.y = y * SQ
    this.target.zoom = Math.max(this.target.zoom, zoom)
  }

  spawnRain() {
    const alive = this.planets.filter((p) => p.alive)
    const n = 14
    for (let i = 0; i < n && this.meteors.length < 40; i++) {
      const ang = Math.random() * TAU
      const R = rand(this.maxOrbit * 1.05, this.maxOrbit * 1.3)
      const x = Math.cos(ang) * R
      const y = Math.sin(ang) * R
      let tx
      let ty
      if (alive.length && Math.random() < 0.7) {
        const t = alive[(Math.random() * alive.length) | 0]
        tx = t.x
        ty = t.y
      } else {
        tx = rand(-220, 220)
        ty = rand(-220, 220)
      }
      const d = Math.hypot(tx - x, ty - y) || 1
      const sp = rand(140, 260)
      this.meteors.push({
        kind: 'meteor',
        x,
        y,
        vx: ((tx - x) / d) * sp + rand(-25, 25),
        vy: ((ty - y) / d) * sp + rand(-25, 25),
        r: 3.2,
        mass: 22,
        trail: [],
        age: 0,
      })
    }
    this.flash = Math.max(this.flash, 0.08)
  }

  supernova() {
    if (!this.sunAlive) return
    this.sunAlive = false
    this.nova = { r: SUN_R, kicked: false }
    for (const p of this.planets) p.disturbed = true
    this.flash = 0.75
    this.shake = 1.8
    this.sunFlares = []
    this._burst(0, 0, 280, ['#fffdf4', '#ffd984', '#ff9d42', '#ff6a3a'], 150, 750)
    this.waves.push({ x: 0, y: 0, r: SUN_R, vr: 320, life: 5, max: 5, color: '255, 190, 120', width: 9 })
  }

  get simYears() {
    return this.simT / EARTH_YEAR_S
  }

  // ---------- размеры / координаты ----------

  resize() {
    // DPR ограничен 1.5: на 2K/4K-мониторах рендер в полные ×2 съедал половину FPS
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5)
    this.dpr = dpr
    this.w = this.canvas.clientWidth
    this.h = this.canvas.clientHeight
    this.canvas.width = Math.round(this.w * dpr)
    this.canvas.height = Math.round(this.h * dpr)
    this._makeStars()
  }

  screenToWorld(sx, sy) {
    return {
      x: this.cam.x + (sx - this.w / 2) / this.cam.zoom,
      y: this.cam.y + (sy - this.h / 2) / this.cam.zoom,
    }
  }

  screenToPlane(sx, sy) {
    const w = this.screenToWorld(sx, sy)
    return { x: w.x, y: w.y / SQ }
  }

  // ---------- звёзды ----------

  _makeStars() {
    // фон сдержанный, чтобы звёзды не путались с кораблями
    const count = Math.round((this.w * this.h) / 6200)
    this.stars = Array.from({ length: count }, () => ({
      x: Math.random() * this.w,
      y: Math.random() * this.h,
      depth: 0.25 + Math.random() * 0.75,
      size: Math.random() * 0.9 + 0.25,
      base: 0.1 + Math.random() * 0.22,
      amp: Math.random() * 0.12,
      speed: 0.4 + Math.random() * 1.6,
      phase: Math.random() * TAU,
      tint: Math.random() < 0.85 ? '255,255,255' : Math.random() < 0.5 ? '160,200,255' : '255,220,180',
    }))
  }

  // ---------- ввод ----------

  _bindPointer() {
    const c = this.canvas

    c.addEventListener('pointerdown', (e) => {
      c.setPointerCapture(e.pointerId)
      const p = this.pointer
      p.down = true
      p.sx = p.x = e.clientX
      p.sy = p.y = e.clientY
      p.moved = 0
      p.samples = []

      if (AIM_TOOLS.has(this.tool)) {
        const pl = this.screenToPlane(e.clientX, e.clientY)
        this.aim = { start: pl, cur: pl, kind: this.tool }
        return
      }
      // рука и дыра — только обзор и клик; планеты больше не таскаются
      p.panning = true
    })

    c.addEventListener('pointermove', (e) => {
      const p = this.pointer
      const dx = e.clientX - p.x
      const dy = e.clientY - p.y
      p.x = e.clientX
      p.y = e.clientY
      this.mouse.x = (e.clientX / this.w - 0.5) * 2
      this.mouse.y = (e.clientY / this.h - 0.5) * 2

      if (!p.down) {
        const hit = this._hitTest(e.clientX, e.clientY)
        const id = hit ? hit.id : null
        if (id !== this.hoverId) {
          this.hoverId = id
          if (this.tool === 'hand') this.canvas.style.cursor = id ? 'pointer' : 'default'
          this.cb.onHover?.(id)
        }
        // наведение на корабль / спутник
        const pl2 = this.screenToPlane(e.clientX, e.clientY)
        this.hoverShip = id ? null : this.civ?.shipAt(pl2.x, pl2.y, 16 / Math.sqrt(this.cam.zoom)) || null
        this.hoverSat = id || this.hoverShip ? null : this.civ?.astAt(pl2.x, pl2.y, 14 / Math.sqrt(this.cam.zoom)) || null
        return
      }

      p.moved += Math.abs(dx) + Math.abs(dy)

      if (this.aim) {
        this.aim.cur = this.screenToPlane(e.clientX, e.clientY)
        return
      }

      if (p.panning && p.moved > 4) {
        this.followId = null
        this.target.x -= dx / this.cam.zoom
        this.target.y -= dy / this.cam.zoom
        this.cam.x = this.target.x
        this.cam.y = this.target.y
      }
    })

    const release = (e) => {
      const p = this.pointer
      if (!p.down) return
      p.down = false

      if (this.aim) {
        const a = this.aim
        this.aim = null
        const dx = a.cur.x - a.start.x
        const dy = a.cur.y - a.start.y
        if (Math.hypot(dx, dy) > 6) this._launchProjectile(a.start, dx, dy, a.kind)
        return
      }

      if (p.panning) {
        p.panning = false
        if (p.moved < 6) {
          if (this.tool === 'hole') {
            this._spawnHole(this.screenToPlane(p.x, p.y))
          } else if (this.tool === 'hand') {
            const hit = this._hitTest(p.x, p.y)
            this._select(hit ? hit.id : null)
          }
        }
      }
    }
    c.addEventListener('pointerup', release)
    c.addEventListener('pointercancel', release)

    c.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault()
        const factor = Math.exp(-e.deltaY * 0.0012)
        const before = this.screenToWorld(e.clientX, e.clientY)
        this.target.zoom = Math.min(3.5, Math.max(0.07, this.target.zoom * factor))
        const z = this.target.zoom
        this.target.x = before.x - (e.clientX - this.w / 2) / z
        this.target.y = before.y - (e.clientY - this.h / 2) / z
        if (this.followId) {
          const pl = this.planets.find((q) => q.id === this.followId)
          if (pl) {
            this.target.x = pl.x
            this.target.y = pl.y * SQ
          }
        }
      },
      { passive: false },
    )
  }

  _hitTest(sx, sy) {
    const w = this.screenToWorld(sx, sy)
    const pad = 10 / this.cam.zoom
    let best = null
    let bestD = Infinity
    for (const pl of this.planets) {
      if (!pl.alive) continue
      const d = Math.hypot(w.x - pl.x, w.y - pl.y * SQ)
      if (d < pl.r + pad && d < bestD) {
        best = pl
        bestD = d
      }
    }
    return best
  }

  _select(id) {
    if (id) {
      const pl = this.planets.find((q) => q.id === id)
      if (!pl || !pl.alive) return
    }
    this.selectedId = id
    this.followId = id
    if (id) this.target.zoom = Math.max(this.target.zoom, 1.8)
    this.cb.onSelect?.(id)
  }

  // ---------- спавн объектов ----------

  _launchProjectile(start, dx, dy, kind) {
    if (this.meteors.length >= 40) return
    const cfg = PROJ[kind]
    let vx = dx * cfg.f
    let vy = dy * cfg.f
    const sp = Math.hypot(vx, vy)
    if (sp > cfg.vmax) {
      vx *= cfg.vmax / sp
      vy *= cfg.vmax / sp
    }
    const proj = {
      kind,
      x: start.x,
      y: start.y,
      vx,
      vy,
      r: cfg.r,
      mass: cfg.mass,
      trail: [],
      age: 0,
    }
    if (kind === 'rock') {
      proj.verts = Array.from({ length: 8 }, (_, k) => {
        const va = (k / 8) * TAU
        const vr = cfg.r * rand(0.7, 1.25)
        return { x: Math.cos(va) * vr, y: Math.sin(va) * vr }
      })
      proj.rot = Math.random() * TAU
      proj.spin = rand(-1.5, 1.5)
    }
    this.meteors.push(proj)
  }

  _spawnHole(pos) {
    if (this.holes.length >= 2) this._popHole(this.holes.shift())
    this.holes.push({
      x: pos.x,
      y: pos.y,
      r: 13,
      gm: 90000,
      life: 16,
      max: 16,
      swirl: Math.random() * TAU,
    })
    this._burst(pos.x, pos.y, 26, ['#c9a5ff', '#8f6cff', '#ffffff'], 90, 200)
    this.shake = Math.min(1.2, this.shake + 0.35)
  }

  _popHole(hole) {
    this._burst(hole.x, hole.y, 60, ['#c9a5ff', '#b18cff', '#ffffff'], 120, 320)
    this.waves.push({ x: hole.x, y: hole.y, r: hole.r, vr: 320, life: 0.9, max: 0.9, color: '200,160,255', width: 3 })
  }

  // ---------- разрушение ----------

  _burst(x, y, n, colors, vMin, vMax) {
    for (let i = 0; i < n && this.sparks.length < 600; i++) {
      const a = Math.random() * TAU
      const v = rand(vMin, vMax)
      this.sparks.push({
        x,
        y,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v * 0.8,
        life: rand(0.4, 1.3),
        max: 1.3,
        size: rand(1, 3),
        color: colors[(Math.random() * colors.length) | 0],
      })
    }
  }

  _makeChunk(x, y, vx, vy, r, color, life, immune = null) {
    const verts = Array.from({ length: 7 }, (_, k) => {
      const va = (k / 7) * TAU
      const vr = r * rand(0.65, 1.25)
      return { x: Math.cos(va) * vr, y: Math.sin(va) * vr }
    })
    return {
      x,
      y,
      vx,
      vy,
      r,
      verts,
      rot: Math.random() * TAU,
      spin: rand(-3, 3),
      life,
      color,
      immune,
      immuneT: immune ? 1 : 0,
    }
  }

  // Кратерный выброс: осколки летят конусом от точки удара и сами наносят урон
  _spawnEjecta(pl, ix, iy, n, power = 1) {
    const dx = ix - pl.x
    const dy = iy - pl.y
    const base = Math.atan2(dy, dx)
    for (let i = 0; i < n && this.debris.length < 170; i++) {
      const a = base + rand(-1.15, 1.15)
      const v = rand(50, 175) * power
      this.debris.push(
        this._makeChunk(
          ix + Math.cos(a) * 2,
          iy + Math.sin(a) * 2,
          pl.vx + Math.cos(a) * v,
          pl.vy + Math.sin(a) * v,
          rand(1.2, 2.6),
          pl.colors[(Math.random() * pl.colors.length) | 0],
          rand(9, 16),
          pl,
        ),
      )
    }
  }

  // Выгрызть кусок контура планеты в точке удара
  _bite(pl, ix, iy, dmg) {
    const ang = Math.atan2(iy - pl.y, ix - pl.x)
    const N = pl.shape.length
    const c = ((ang / TAU) * N + N) % N
    const depth = clamp(dmg / pl.maxHp, 0.05, 0.5) * 0.9
    const width = dmg > 6 ? 5 : 3
    for (let k = -width; k <= width; k++) {
      const i = (Math.round(c) + k + N) % N
      const fall = Math.exp(-(k * k) / (width * 0.9))
      pl.shape[i] = Math.max(0.32, pl.shape[i] - depth * fall)
    }
  }

  // Урон планете: hp, усадка радиуса, кратер и деформация в точке удара
  _applyDamage(pl, dmg, ix = null, iy = null, crater = true) {
    pl.hp -= dmg
    pl.r = pl.baseR * (0.7 + 0.3 * clamp(pl.hp / pl.maxHp, 0, 1))
    if (dmg > 1.5) this.civ?.onPlanetHurt(pl, dmg)
    if (ix !== null && dmg > 0.4) this._bite(pl, ix, iy, dmg)
    if (crater && ix !== null) {
      const dx = ix - pl.x
      const dy = iy - pl.y
      const dd = Math.hypot(dx, dy) || 1
      pl.craters.push({
        ox: (dx / dd) * rand(0.35, 0.75),
        oy: (dy / dd) * rand(0.35, 0.75),
        s: clamp(0.16 + dmg * 0.035, 0.16, 0.45),
      })
      if (pl.craters.length > 10) pl.craters.shift()
    }
    if (pl.hp <= 0 && pl.alive) this._explodePlanet(pl)
    return pl.alive
  }

  _explodePlanet(pl, fate = 'exploded') {
    const n = clamp(Math.round(pl.baseR / 2) + 5, 7, 18)
    for (let i = 0; i < n && this.debris.length < 170; i++) {
      const a = Math.random() * TAU
      const v = rand(40, 160)
      this.debris.push(
        this._makeChunk(
          pl.x + Math.cos(a) * pl.r * 0.5,
          pl.y + Math.sin(a) * pl.r * 0.5,
          pl.vx * 0.6 + Math.cos(a) * v,
          pl.vy * 0.6 + Math.sin(a) * v,
          rand(1.6, 1.6 + pl.baseR * 0.22),
          pl.colors[(Math.random() * pl.colors.length) | 0],
          rand(12, 20),
        ),
      )
    }
    this._burst(pl.x, pl.y, 90, [...pl.colors, '#ffffff', '#ffd9a0'], 60, 360)
    this.waves.push({
      x: pl.x,
      y: pl.y,
      r: pl.r,
      vr: 260 + pl.baseR * 6,
      life: 1.1,
      max: 1.1,
      color: '255,200,150',
      width: 3.5,
    })
    this.flash = Math.min(0.45, this.flash + 0.1 + pl.baseR * 0.01)
    this.shake = Math.min(1.4, this.shake + 0.4 + pl.baseR * 0.02)
    this._kill(pl, fate)
  }

  // Ядерный взрыв: жертве — фатально, соседям — по дистанции
  _nuke(x, y, hitPlanet) {
    this.flash = Math.min(0.6, this.flash + 0.45)
    this.shake = Math.min(1.6, this.shake + 1)
    this._burst(x, y, 160, ['#ffffff', '#fff3c0', '#ffd984', '#ff9d42'], 100, 520)
    this.waves.push({ x, y, r: 4, vr: 420, life: 1.5, max: 1.5, color: '255, 235, 200', width: 5 })
    this.waves.push({ x, y, r: 2, vr: 260, life: 1.1, max: 1.1, color: '255, 170, 110', width: 3 })

    for (const p of this.planets) {
      if (!p.alive) continue
      const d = Math.hypot(p.x - x, p.y - y)
      if (p === hitPlanet) {
        this._spawnEjecta(p, x, y, 28, 2.4)
        this._applyDamage(p, 8, x, y)
      } else if (d < 220) {
        const k = 1 - d / 220
        p.disturbed = true
        const dd = d || 1
        p.vx += ((p.x - x) / dd) * 90 * k
        p.vy += ((p.y - y) / dd) * 90 * k
        this._spawnEjecta(p, p.x + ((x - p.x) / dd) * p.r, p.y + ((y - p.y) / dd) * p.r, 7, 1 + k)
        this._applyDamage(p, 6 * k, p.x + ((x - p.x) / dd) * p.r, p.y + ((y - p.y) / dd) * p.r)
      }
    }
  }

  _kill(pl, fate) {
    pl.alive = false
    pl.fate = fate
    this.civ?.onPlanetLost(pl)
    pl.dragging = false
    pl.trail = []
    if (this.pointer.dragPlanet === pl) this.pointer.dragPlanet = null
    if (this.followId === pl.id) this.followId = null
    if (this.selectedId === pl.id) {
      this.selectedId = null
      this.cb.onSelect?.(null)
    }
    if (this.hoverId === pl.id) this.hoverId = null
  }

  // ---------- физика ----------

  // kind: 'body' — планета. Взаимное притяжение планет включается только если
  //   планету потревожили (бросок, попадание) — нетронутая система стабильна.
  // 'small' — метеоры и обломки: планеты с бустом ×G_BOOST, солнце ярче ×SUN_BOOST_SMALL
  _gravityAt(x, y, self, kind = 'small') {
    let ax = 0
    let ay = 0
    let gmSun = this.sunAlive ? GM_SUN : GM_SUN * 0.45
    if (kind === 'small') gmSun *= SUN_BOOST_SMALL
    let d2 = x * x + y * y
    let f = -gmSun / Math.pow(d2 + EPS2, 1.5)
    ax += f * x
    ay += f * y
    // дыра: спад 1/r^1.5 — тянет издалека, как и положено приличной аномалии
    for (const hl of this.holes) {
      const dx = x - hl.x
      const dy = y - hl.y
      d2 = dx * dx + dy * dy
      f = -hl.gm / Math.pow(d2 + EPS2, 1.25)
      ax += f * dx
      ay += f * dy
    }
    const planetPull = kind === 'small' || (self && self.disturbed)
    if (planetPull) {
      for (const q of this.planets) {
        if (!q.alive || q === self) continue
        let gm = q.mass
        if (kind === 'small') gm *= G_BOOST
        else if (self && q.mass > self.mass * 8) gm *= 4
        else if (kind === 'body') gm *= 0.4
        const dx = x - q.x
        const dy = y - q.y
        d2 = dx * dx + dy * dy
        f = -gm / Math.pow(d2 + EPS2, 1.5)
        ax += f * dx
        ay += f * dy
      }
    }
    return { x: ax, y: ay }
  }

  // Захват на орбиту: внутри сферы влияния лишняя относительная скорость
  // плавно гасится к круговой — так метеорит может стать спутником
  _captureAssist(b, hs, selfMass = 0) {
    let best = null
    let bd = Infinity
    for (const p of this.planets) {
      if (!p.alive || p === b || p.dragging) continue
      if (selfMass > 0 && p.mass <= selfMass * 8) continue
      const d = Math.hypot(b.x - p.x, b.y - p.y)
      if (d < p.soi && d < bd) {
        bd = d
        best = p
      }
    }
    if (!best || bd < best.r + 2) return
    const gm = best.mass * (selfMass > 0 ? 4 : G_BOOST)
    const vrx = b.vx - best.vx
    const vry = b.vy - best.vy
    const mag = Math.hypot(vrx, vry)
    if (mag < 1) return
    const vc = Math.sqrt(gm / Math.max(bd, best.r + 4))
    const target = vc * 1.15
    if (mag > target) {
      const nm = target + (mag - target) * Math.exp(-hs * 0.6)
      b.vx = best.vx + (vrx / mag) * nm
      b.vy = best.vy + (vry / mag) * nm
    }
  }

  _step(hs) {
    const movers = this.planets.filter((p) => p.alive && !p.dragging)

    const acc = movers.map((p) => this._gravityAt(p.x, p.y, p, 'body'))
    movers.forEach((p, i) => {
      p.vx += acc[i].x * hs
      p.vy += acc[i].y * hs
    })
    for (const p of movers) {
      p.x += p.vx * hs
      p.y += p.vy * hs
      if (p.disturbed) this._captureAssist(p, hs, p.mass)
    }

    for (const m of this.meteors) {
      const a = this._gravityAt(m.x, m.y, null, 'small')
      m.vx += a.x * hs
      m.vy += a.y * hs
      // боеголовка государств: лёгкое донаведение на цель в конце пути
      if ((m.kind === 'warhead' || m.kind === 'breaker') && m.target) {
        const p = this.planets.find((q) => q.id === m.target)
        if (p && p.alive) {
          const d = Math.hypot(p.x - m.x, p.y - m.y)
          if (d < 320) {
            const sp = Math.hypot(m.vx, m.vy) || 1
            const want = Math.atan2(p.y - m.y, p.x - m.x)
            const cur = Math.atan2(m.vy, m.vx)
            let diff = want - cur
            while (diff > Math.PI) diff -= TAU
            while (diff < -Math.PI) diff += TAU
            const turn = clamp(diff, -0.9 * hs, 0.9 * hs)
            m.vx = Math.cos(cur + turn) * sp
            m.vy = Math.sin(cur + turn) * sp
          }
        }
      }
      // ракета доворачивает на ближайшую планету
      if (m.kind === 'rocket' && m.age > 0.25) {
        let best = null
        let bd = 320
        for (const p of this.planets) {
          if (!p.alive) continue
          const d = Math.hypot(p.x - m.x, p.y - m.y)
          if (d < bd) {
            bd = d
            best = p
          }
        }
        if (best) {
          const sp = Math.hypot(m.vx, m.vy) || 1
          const want = Math.atan2(best.y - m.y, best.x - m.x)
          const cur = Math.atan2(m.vy, m.vx)
          let diff = want - cur
          while (diff > Math.PI) diff -= TAU
          while (diff < -Math.PI) diff += TAU
          const turn = clamp(diff, -1.1 * hs, 1.1 * hs)
          m.vx = Math.cos(cur + turn) * sp
          m.vy = Math.sin(cur + turn) * sp
        }
      }
      m.x += m.vx * hs
      m.y += m.vy * hs
      if (m.kind !== 'rocket' && m.kind !== 'warhead' && m.kind !== 'breaker') this._captureAssist(m, hs)
    }

    for (const d of this.debris) {
      const a = this._gravityAt(d.x, d.y, null, 'small')
      d.vx += a.x * hs
      d.vy += a.y * hs
      d.x += d.vx * hs
      d.y += d.vy * hs
      this._captureAssist(d, hs)
    }

    this._collide()
  }

  _collide() {
    const alive = this.planets.filter((p) => p.alive)

    // планета × планета
    for (let i = 0; i < alive.length; i++) {
      for (let j = i + 1; j < alive.length; j++) {
        const a = alive[i]
        const b = alive[j]
        if (!a.alive || !b.alive) continue
        const d = Math.hypot(a.x - b.x, a.y - b.y)
        if (d < a.r + b.r) {
          const small = a.r < b.r ? a : b
          const big = a.r < b.r ? b : a
          const cx = (small.x + big.x) / 2
          const cy = (small.y + big.y) / 2
          if (small.r / big.r > 0.72) {
            this._explodePlanet(small)
            this._explodePlanet(big)
          } else {
            big.disturbed = true
            big.vx += clamp((small.mass / big.mass) * (small.vx - big.vx) * 0.7, -90, 90)
            big.vy += clamp((small.mass / big.mass) * (small.vy - big.vy) * 0.7, -90, 90)
            this._spawnEjecta(big, cx, cy, 7, 1.2)
            this._explodePlanet(small)
            this._applyDamage(big, small.baseR * 0.8, cx, cy)
          }
        }
      }
    }

    // планета × солнце / дыры / потеря
    for (const p of this.planets) {
      if (!p.alive || p.dragging) continue
      const dSun = Math.hypot(p.x, p.y)
      if (dSun < this._sunR + p.r * 0.6) {
        this.sunFlare = 1
        this._burst(p.x, p.y, 70, ['#ffd9a0', '#ff9d42', '#ffffff'], 80, 380)
        this.flash = Math.min(0.5, this.flash + 0.22)
        this.shake = Math.min(1.4, this.shake + 0.7)
        this._kill(p, 'sun')
        continue
      }
      for (const hl of this.holes) {
        if (Math.hypot(p.x - hl.x, p.y - hl.y) < hl.r + p.r * 0.5) {
          this._burst(p.x, p.y, 50, [...p.colors, '#c9a5ff'], 60, 260)
          hl.gm *= 1.18
          hl.r += 2.5
          this.shake = Math.min(1.4, this.shake + 0.5)
          this._kill(p, 'hole')
          break
        }
      }
      if (p.alive && dSun > this.lostDist) this._kill(p, 'lost')
    }

    // снаряды
    for (const m of this.meteors) {
      if (m.dead) continue
      const dSun = Math.hypot(m.x, m.y)
      if (dSun < this._sunR + m.r) {
        m.dead = true
        this.sunFlare = Math.max(this.sunFlare, m.kind === 'rocket' ? 1 : 0.5)
        this._burst(m.x, m.y, m.kind === 'rocket' ? 70 : 24, ['#ffd9a0', '#ffffff'], 60, 300)
        if (m.kind === 'rocket') this.flash = Math.min(0.4, this.flash + 0.2)
        continue
      }
      for (const hl of this.holes) {
        if (Math.hypot(m.x - hl.x, m.y - hl.y) < hl.r + m.r) {
          m.dead = true
          hl.gm *= m.kind === 'rock' ? 1.08 : 1.04
          break
        }
      }
      if (m.dead) continue
      for (const p of this.planets) {
        if (!p.alive) continue
        if (Math.hypot(m.x - p.x, m.y - p.y) < p.r + m.r) {
          m.dead = true
          const rel = Math.hypot(m.vx - p.vx, m.vy - p.vy)
          if (m.kind === 'warhead') {
            // баллистика государств: оружие по населению — планету не ломает
            this._burst(m.x, m.y, 30, ['#ffd9a0', '#ff9d42', '#ffffff'], 50, 240)
            this.waves.push({ x: m.x, y: m.y, r: 2, vr: 180, life: 0.5, max: 0.5, color: '255,200,150', width: 2 })
            this.shake = Math.min(1.4, this.shake + 0.15)
            this.civ?.onWarheadHit(p, m)
            break
          }
          if (m.kind === 'breaker') {
            // разрушитель планет: вырывает кусок — четверть средней, половину мелкой
            this._burst(m.x, m.y, 70, ['#ffd9a0', '#ff9d42', '#ffffff', ...p.colors], 60, 360)
            this.waves.push({ x: m.x, y: m.y, r: 3, vr: 300, life: 1, max: 1, color: '255,180,130', width: 4 })
            this.shake = Math.min(1.5, this.shake + 0.6)
            this.flash = Math.min(0.4, this.flash + 0.18)
            this._spawnEjecta(p, m.x, m.y, 12, 1.8)
            this._applyDamage(p, 3.2, m.x, m.y)
            this.civ?.onWarheadHit(p, m)
            break
          }
          p.disturbed = true
          if (m.kind === 'rocket') {
            this._nuke(m.x, m.y, p)
          } else {
            const heavy = m.kind === 'rock'
            const dmg = heavy ? rel / 55 + 7 : rel / 90 + 1.2
            const kick = clamp((m.mass / p.mass) * rel, 0, heavy ? 220 : 130)
            const kd = Math.hypot(m.vx, m.vy) || 1
            p.vx += (m.vx / kd) * kick
            p.vy += (m.vy / kd) * kick
            this._burst(m.x, m.y, heavy ? 60 : 36, [...p.colors, '#ffd9a0', '#ffffff'], 60, heavy ? 380 : 300)
            this.waves.push({ x: m.x, y: m.y, r: 2, vr: heavy ? 280 : 200, life: 0.55, max: 0.55, color: '255,210,160', width: heavy ? 3 : 2 })
            this.shake = Math.min(1.4, this.shake + (heavy ? 0.6 : 0.25))
            this._spawnEjecta(p, m.x, m.y, Math.round(rand(heavy ? 9 : 5, heavy ? 14 : 9)), (heavy ? 1 : 0.5) + rel / 400)
            this._applyDamage(p, dmg, m.x, m.y)
          }
          break
        }
      }
    }
    this.meteors = this.meteors.filter(
      (m) => !m.dead && Math.hypot(m.x, m.y) < this.lostDist + 400 && m.age < PROJ[m.kind ?? 'meteor'].life,
    )
  }

  // Осколки наносят урон — раз в кадр, не в подшаг
  _collideDebris() {
    for (const d of this.debris) {
      const dSun = Math.hypot(d.x, d.y)
      if (dSun < this._sunR + d.r) {
        d.life = 0
        if (this.sunAlive) this.sunFlare = Math.max(this.sunFlare, 0.2)
        continue
      }
      let eaten = false
      for (const hl of this.holes) {
        if (Math.hypot(d.x - hl.x, d.y - hl.y) < hl.r + d.r) {
          d.life = 0
          hl.gm *= 1.01
          eaten = true
          break
        }
      }
      if (eaten) continue
      for (const p of this.planets) {
        if (!p.alive) continue
        if (d.immune === p && d.immuneT > 0) continue
        if (Math.hypot(d.x - p.x, d.y - p.y) < p.r + d.r) {
          const rel = Math.hypot(d.vx - p.vx, d.vy - p.vy)
          if (rel > 50) {
            const dmg = (d.r * rel) / 650
            this._burst(d.x, d.y, 10, [...p.colors, '#ffd9a0'], 40, 160)
            this._applyDamage(p, dmg, d.x, d.y, dmg > 0.5)
          }
          d.life = 0
          break
        }
      }
    }
  }

  // ---------- цикл ----------

  _loop(now) {
    if (!this.running) return
    const dt = Math.min((now - this.last) / 1000, 0.05)
    this.last = now
    // сглаженный FPS для HUD
    if (dt > 0) this.fps += (1 / dt - this.fps) * 0.08
    this._update(dt)
    this._draw()
    requestAnimationFrame(this._loop)
  }

  _update(dt) {
    this.visT += dt
    const ts = this.paused ? 0 : this.timeScale
    const h = dt * ts
    this.simT += h

    if (h > 0) {
      const sub = clamp(Math.ceil(h / 0.02), 1, 40)
      const hs = h / sub
      for (let i = 0; i < sub; i++) this._step(hs)
      this._collideDebris()

      for (const p of this.planets) {
        if (!p.alive) continue
        p.trail.push({ x: p.x, y: p.y })
        if (p.trail.length > 120) p.trail.shift()
      }
      for (const m of this.meteors) {
        m.age += h
        if (m.kind === 'rock') m.rot += m.spin * h
        m.trail.push({ x: m.x, y: m.y })
        if (m.trail.length > 26) m.trail.shift()
      }
    }

    this.moonAngle += h * (TAU / 2.4)
    // затухание визуальных эффектов — каждый кадр, даже на паузе
    this.civ?.updateVisual(dt)
    // логика — фиксированными тиками; потолок 10 тиков = бюджет максимальной скорости (×10),
    // излишек сбрасывается (защита от спирали смерти на слабом железе)
    this.civAcc = Math.min(this.civAcc + h, CIV_TICK * 10)
    const civTicks = Math.floor(this.civAcc / CIV_TICK)
    this.civAcc -= civTicks * CIV_TICK
    for (let i = 0; i < civTicks; i++) this.civ?.tick(CIV_TICK)

    const pdt = this.paused ? 0 : dt * Math.min(this.timeScale, 2.5)

    // сверхновая: волна испепеляет всё на своём пути
    if (this.nova) {
      this.nova.r += 320 * pdt
      this.shake = Math.max(this.shake, 0.25)
      for (const p of this.planets) {
        if (p.alive && Math.hypot(p.x, p.y) < this.nova.r) this._explodePlanet(p, 'nova')
      }
      for (const m of this.meteors) {
        if (Math.hypot(m.x, m.y) < this.nova.r) m.dead = true
      }
      for (const d of this.debris) {
        if (!d.kicked && Math.hypot(d.x, d.y) < this.nova.r) {
          d.kicked = true
          const dd = Math.hypot(d.x, d.y) || 1
          d.vx += (d.x / dd) * 280
          d.vy += (d.y / dd) * 280
        }
      }
      this.meteors = this.meteors.filter((m) => !m.dead)
      if (this.nova.r > this.lostDist) this.nova = null
    }

    for (const s of this.sparks) {
      if (s.pull) {
        const hl = s.pull
        const dx = hl.x - s.x
        const dy = hl.y - s.y
        const d = Math.hypot(dx, dy) || 1
        const a = 1400 / (d + 30)
        s.vx += (dx / d) * a * pdt * 60
        s.vy += (dy / d) * a * pdt * 60
        if (d < hl.r) s.life = 0
      }
      s.x += s.vx * pdt
      s.y += s.vy * pdt
      s.vx *= Math.exp(-pdt * 1.4)
      s.vy *= Math.exp(-pdt * 1.4)
      s.life -= pdt
    }
    this.sparks = this.sparks.filter((s) => s.life > 0)

    for (const wv of this.waves) {
      wv.r += wv.vr * pdt
      wv.life -= pdt
    }
    this.waves = this.waves.filter((w) => w.life > 0)

    for (const d of this.debris) {
      d.rot += d.spin * pdt
      d.life -= pdt
      if (d.immuneT > 0) d.immuneT -= pdt
    }
    this.debris = this.debris.filter((d) => d.life > 0 && Math.hypot(d.x, d.y) < this.lostDist + 400)

    for (const hl of this.holes) {
      hl.life -= pdt
      if (Math.random() < 0.45 && this.sparks.length < 580) {
        const a = Math.random() * TAU
        const r0 = rand(55, 95)
        this.sparks.push({
          x: hl.x + Math.cos(a) * r0,
          y: hl.y + Math.sin(a) * r0,
          vx: -Math.sin(a) * 70,
          vy: Math.cos(a) * 70,
          life: rand(0.6, 1.2),
          max: 1.2,
          size: rand(0.8, 2),
          color: Math.random() < 0.6 ? '#c9a5ff' : '#ffffff',
          pull: hl,
        })
      }
    }
    for (const hl of this.holes) if (hl.life <= 0) this._popHole(hl)
    this.holes = this.holes.filter((h2) => h2.life > 0)

    // протуберанцы солнца
    if (this.sunAlive) {
      this.flareTimer -= dt
      if (this.flareTimer <= 0) {
        this.sunFlares.push({ a: Math.random() * TAU, life: rand(1.5, 2.6), max: 2.6 })
        this.flareTimer = rand(1.2, 3.2)
      }
    }
    for (const f of this.sunFlares) f.life -= dt
    this.sunFlares = this.sunFlares.filter((f) => f.life > 0)

    this.shake *= Math.exp(-dt * 3)
    this.flash *= Math.exp(-dt * 4.2)
    this.sunFlare *= Math.exp(-dt * 1.8)

    if (this.followId) {
      const pl = this.planets.find((q) => q.id === this.followId)
      if (pl && pl.alive) {
        this.target.x = pl.x
        this.target.y = pl.y * SQ
      }
    }
    const s = 1 - Math.exp(-dt * 5)
    this.cam.x = lerp(this.cam.x, this.target.x, s)
    this.cam.y = lerp(this.cam.y, this.target.y, s)
    this.cam.zoom = lerp(this.cam.zoom, this.target.zoom, 1 - Math.exp(-dt * 3.2))

    this.cometTimer -= dt
    if (this.cometTimer <= 0) {
      this._spawnComet()
      this.cometTimer = 9 + Math.random() * 9
    }
    for (const cm of this.comets) {
      cm.x += cm.vx * dt
      cm.y += cm.vy * dt
      cm.tail.unshift({ x: cm.x, y: cm.y })
      if (cm.tail.length > 46) cm.tail.pop()
      cm.life -= dt
    }
    this.comets = this.comets.filter((cm) => cm.life > 0)

    this.shootTimer -= dt
    if (this.shootTimer <= 0) {
      this._spawnShoot()
      this.shootTimer = 5 + Math.random() * 7
    }
    for (const sh of this.shoots) {
      sh.x += sh.vx * dt
      sh.y += sh.vy * dt
      sh.life -= dt
    }
    this.shoots = this.shoots.filter((sh) => sh.life > 0)
  }

  _spawnComet() {
    const ang = Math.random() * TAU
    const R = this.maxOrbit * 0.9
    const x = Math.cos(ang) * R
    const y = Math.sin(ang) * R * SQ
    const tx = (Math.random() - 0.5) * 460
    const ty = (Math.random() - 0.5) * 320
    const d = Math.hypot(tx - x, ty - y)
    const speed = 200 + Math.random() * 140
    this.comets.push({
      x,
      y,
      vx: ((tx - x) / d) * speed,
      vy: ((ty - y) / d) * speed,
      tail: [],
      life: 14,
    })
  }

  _spawnShoot() {
    const fromTop = Math.random() < 0.6
    const x = Math.random() * this.w
    const y = fromTop ? -10 : Math.random() * this.h * 0.4
    const speed = 500 + Math.random() * 400
    const dir = Math.PI * (0.2 + Math.random() * 0.15)
    this.shoots.push({
      x,
      y,
      vx: Math.cos(dir) * speed,
      vy: Math.sin(dir) * speed,
      life: 0.7,
      max: 0.7,
    })
  }

  // ---------- отрисовка ----------

  _draw() {
    const { ctx, w, h, dpr, cam } = this
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, w, h)

    this._drawStars(ctx)
    this._drawShoots(ctx)

    const shx = (Math.random() - 0.5) * this.shake * 16
    const shy = (Math.random() - 0.5) * this.shake * 16

    ctx.save()
    ctx.translate(w / 2 + shx, h / 2 + shy)
    ctx.scale(cam.zoom, cam.zoom)
    ctx.translate(-cam.x, -cam.y)

    this.civ?.drawUnder(ctx)
    if (this.sunAlive) this._drawOrbits(ctx)
    if (AIM_TOOLS.has(this.tool)) this._drawSoi(ctx)
    for (const hl of this.holes) this._drawHole(ctx, hl)
    this._drawSun(ctx)
    for (const pl of this.planets) if (pl.alive) this._drawTrail(ctx, pl)
    for (const d of this.debris) this._drawDebris(ctx, d)
    for (const pl of this.planets) if (pl.alive) this._drawPlanet(ctx, pl)
    for (const m of this.meteors) this._drawMeteor(ctx, m)
    this.civ?.drawOver(ctx)
    this._drawComets(ctx)
    this._drawFx(ctx)
    if (this.aim) this._drawAim(ctx)

    ctx.restore()

    this._drawShipTip(ctx)

    if (this.flash > 0.005) {
      ctx.fillStyle = `rgba(255, 240, 222, ${this.flash})`
      ctx.fillRect(0, 0, w, h)
    }
  }

  // плашка с информацией о корабле или спутнике под курсором
  _drawShipTip(ctx) {
    if (!this.civ) return
    let px
    let py
    let color
    let lines
    const sh = this.hoverShip
    if (sh && this.civ.ships.includes(sh)) {
      const st = this.civ.stateById(sh.owner)
      color = st?.color || '#fff'
      px = sh.x
      py = sh.y
      lines = [
        { text: `${this.civ.shipLabel(sh)} · ${st?.name || '?'}`, color, bold: true },
        { text: this.civ.missionText(sh), color: 'rgba(214, 226, 250, 0.85)' },
        {
          text: `прочность ${Math.ceil(sh.hp)} / ${sh.maxHp}`,
          color: sh.hp / sh.maxHp > 0.4 ? 'rgba(125, 216, 125, 0.9)' : 'rgba(255, 107, 92, 0.9)',
        },
      ]
    } else {
      this.hoverShip = null
      const ast = this.hoverSat
      if (!ast || !this.civ.asteroids.includes(ast)) {
        this.hoverSat = null
        return
      }
      color = '#b9aa90'
      px = ast.x
      py = ast.y
      lines = [
        { text: 'астероид', color, bold: true },
        { text: `руды осталось: ${ast.res} — выработают и исчезнет`, color: 'rgba(214, 226, 250, 0.85)' },
      ]
    }

    const { cam, w, h } = this
    const sx = (px - cam.x) * cam.zoom + w / 2
    const sy = (py * 0.74 - cam.y) * cam.zoom + h / 2

    ctx.save()
    ctx.font = "600 12px 'JetBrains Mono', monospace"
    const tw = Math.max(...lines.map((l) => ctx.measureText(l.text).width))
    const bw = tw + 22
    const bh = 10 + lines.length * 16
    let bx = sx + 16
    let by = sy - bh - 10
    if (bx + bw > w - 8) bx = sx - bw - 16
    if (by < 8) by = sy + 16

    ctx.fillStyle = 'rgba(10, 16, 33, 0.88)'
    ctx.strokeStyle = color
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.roundRect(bx, by, bw, bh, 8)
    ctx.fill()
    ctx.stroke()

    lines.forEach((l, i) => {
      ctx.font = `${l.bold ? '600 ' : ''}12px 'JetBrains Mono', monospace`
      ctx.fillStyle = l.color
      ctx.fillText(l.text, bx + 11, by + 18 + i * 16)
    })
    ctx.restore()
  }

  _drawStars(ctx) {
    const { w, h, cam, mouse, visT } = this
    for (const st of this.stars) {
      const px = (((st.x - cam.x * cam.zoom * 0.04 * st.depth - mouse.x * 14 * st.depth) % w) + w) % w
      const py = (((st.y - cam.y * cam.zoom * 0.04 * st.depth - mouse.y * 10 * st.depth) % h) + h) % h
      const a = st.base + Math.sin(visT * st.speed + st.phase) * st.amp
      const r = st.size * st.depth
      // звёзды — квадратики субпиксельного размера: сотни arc() на кадр не нужны
      ctx.fillStyle = `rgba(${st.tint},${Math.max(0, a)})`
      ctx.fillRect(px - r, py - r, r * 2, r * 2)
    }
  }

  _drawShoots(ctx) {
    for (const sh of this.shoots) {
      const t = sh.life / sh.max
      const len = 0.1
      const x2 = sh.x - sh.vx * len
      const y2 = sh.y - sh.vy * len
      const g = ctx.createLinearGradient(sh.x, sh.y, x2, y2)
      g.addColorStop(0, `rgba(255,255,255,${0.9 * t})`)
      g.addColorStop(1, 'rgba(255,255,255,0)')
      ctx.strokeStyle = g
      ctx.lineWidth = 1.6
      ctx.beginPath()
      ctx.moveTo(sh.x, sh.y)
      ctx.lineTo(x2, y2)
      ctx.stroke()
    }
  }

  _drawSoi(ctx) {
    ctx.save()
    ctx.strokeStyle = 'rgba(140, 210, 190, 0.22)'
    ctx.lineWidth = 1 / this.cam.zoom
    ctx.setLineDash([4 / this.cam.zoom, 6 / this.cam.zoom])
    for (const pl of this.planets) {
      if (!pl.alive) continue
      ctx.beginPath()
      ctx.ellipse(pl.x, pl.y * SQ, pl.soi, pl.soi * SQ, 0, 0, TAU)
      ctx.stroke()
    }
    ctx.restore()
  }

  _drawOrbits(ctx) {
    for (const pl of this.planets) {
      const active = pl.alive && (pl.id === this.hoverId || pl.id === this.selectedId)
      ctx.strokeStyle = active ? 'rgba(160, 200, 255, 0.32)' : 'rgba(255, 255, 255, 0.05)'
      ctx.lineWidth = (active ? 1.4 : 1) / this.cam.zoom
      ctx.beginPath()
      ctx.ellipse(0, 0, pl.orbit, pl.orbit * SQ, 0, 0, TAU)
      ctx.stroke()
    }
  }

  _drawSun(ctx) {
    const t = this.visT

    if (!this.sunAlive) {
      // белый карлик
      const p2 = 1 + Math.sin(t * 2.6) * 0.08
      let g = ctx.createRadialGradient(0, 0, 0, 0, 0, DWARF_R * 5 * p2)
      g.addColorStop(0, 'rgba(200, 225, 255, 0.5)')
      g.addColorStop(1, 'rgba(150, 190, 255, 0)')
      ctx.fillStyle = g
      ctx.beginPath()
      ctx.arc(0, 0, DWARF_R * 5 * p2, 0, TAU)
      ctx.fill()
      g = ctx.createRadialGradient(0, 0, 0, 0, 0, DWARF_R)
      g.addColorStop(0, '#ffffff')
      g.addColorStop(1, '#a9c8ff')
      ctx.fillStyle = g
      ctx.beginPath()
      ctx.arc(0, 0, DWARF_R, 0, TAU)
      ctx.fill()

      if (this.nova) {
        const r = this.nova.r
        ctx.save()
        ctx.scale(1, SQ)
        const ng = ctx.createRadialGradient(0, 0, r * 0.78, 0, 0, r * 1.18)
        ng.addColorStop(0, 'rgba(255, 120, 60, 0)')
        ng.addColorStop(0.55, 'rgba(255, 180, 110, 0.5)')
        ng.addColorStop(0.75, 'rgba(255, 240, 220, 0.85)')
        ng.addColorStop(1, 'rgba(255, 200, 140, 0)')
        ctx.fillStyle = ng
        ctx.beginPath()
        ctx.arc(0, 0, r * 1.18, 0, TAU)
        ctx.fill()
        ctx.restore()
      }
      return
    }

    const flare = 1 + this.sunFlare * 0.7
    const pulse = (1 + Math.sin(t * 1.3) * 0.035 + Math.sin(t * 3.7) * 0.015) * flare
    const R = SUN_R

    // лучи короны
    ctx.save()
    ctx.globalCompositeOperation = 'lighter'
    for (let i = 0; i < 12; i++) {
      const a = t * 0.05 + (i * TAU) / 12
      const len = R * (2 + Math.sin(t * 0.7 + i * 1.7) * 0.45) * pulse
      const g = ctx.createLinearGradient(Math.cos(a) * R, Math.sin(a) * R, Math.cos(a) * len, Math.sin(a) * len)
      g.addColorStop(0, 'rgba(255, 180, 100, 0.20)')
      g.addColorStop(1, 'rgba(255, 160, 80, 0)')
      ctx.strokeStyle = g
      ctx.lineWidth = 7
      ctx.beginPath()
      ctx.moveTo(Math.cos(a) * R * 1.05, Math.sin(a) * R * 1.05)
      ctx.lineTo(Math.cos(a) * len, Math.sin(a) * len)
      ctx.stroke()
    }
    // протуберанцы
    for (const f of this.sunFlares) {
      const ft = f.life / f.max
      const fr = R * (1.05 + (1 - ft) * 0.5)
      ctx.strokeStyle = `rgba(255, 170, 90, ${ft * 0.55})`
      ctx.lineWidth = 3 * ft + 0.5
      ctx.beginPath()
      ctx.arc(0, 0, fr, f.a - 0.32, f.a + 0.32)
      ctx.stroke()
    }
    ctx.restore()

    let g = ctx.createRadialGradient(0, 0, 0, 0, 0, 170 * pulse)
    g.addColorStop(0, 'rgba(255, 190, 110, 0.30)')
    g.addColorStop(0.35, 'rgba(255, 150, 70, 0.12)')
    g.addColorStop(1, 'rgba(255, 120, 50, 0)')
    ctx.fillStyle = g
    ctx.beginPath()
    ctx.arc(0, 0, 170 * pulse, 0, TAU)
    ctx.fill()

    g = ctx.createRadialGradient(0, 0, R * 0.6, 0, 0, R * 2.4 * pulse)
    g.addColorStop(0, 'rgba(255, 220, 150, 0.55)')
    g.addColorStop(1, 'rgba(255, 160, 80, 0)')
    ctx.fillStyle = g
    ctx.beginPath()
    ctx.arc(0, 0, R * 2.4 * pulse, 0, TAU)
    ctx.fill()

    g = ctx.createRadialGradient(-R * 0.25, -R * 0.25, R * 0.1, 0, 0, R)
    g.addColorStop(0, '#fffdf4')
    g.addColorStop(0.45, '#ffd984')
    g.addColorStop(0.85, '#ff9d42')
    g.addColorStop(1, '#f57c1f')
    ctx.fillStyle = g
    ctx.beginPath()
    ctx.arc(0, 0, R, 0, TAU)
    ctx.fill()
  }

  _drawTrail(ctx, pl) {
    const tr = pl.trail
    if (tr.length < 2) return
    // хвост тремя пачками вместо штриха на сегмент: 18 планет × 120 точек
    // давали ~2000 stroke() на кадр — ступенчатое затухание глазу не видно
    const B = 3
    const n = tr.length
    for (let b = 0; b < B; b++) {
      const i0 = Math.max(1, Math.floor((b * n) / B))
      const i1 = Math.floor(((b + 1) * n) / B)
      if (i1 <= i0) continue
      const f = (b + 0.7) / B
      ctx.strokeStyle = `rgba(170, 200, 255, ${0.28 * f})`
      ctx.lineWidth = Math.max(0.6, (pl.r * 0.2 * f) / Math.sqrt(this.cam.zoom))
      ctx.beginPath()
      ctx.moveTo(tr[i0 - 1].x, tr[i0 - 1].y * SQ)
      for (let i = i0; i < i1; i++) ctx.lineTo(tr[i].x, tr[i].y * SQ)
      ctx.stroke()
    }
  }

  _drawDebris(ctx, d) {
    const alpha = clamp(d.life / 1.2, 0, 1)
    ctx.save()
    ctx.translate(d.x, d.y * SQ)
    ctx.rotate(d.rot)
    ctx.globalAlpha = alpha
    ctx.fillStyle = d.color
    ctx.beginPath()
    d.verts.forEach((v, i) => (i ? ctx.lineTo(v.x, v.y) : ctx.moveTo(v.x, v.y)))
    ctx.closePath()
    ctx.fill()
    ctx.fillStyle = 'rgba(0,0,0,0.3)'
    ctx.beginPath()
    d.verts.forEach((v, i) =>
      i
        ? ctx.lineTo(v.x * 0.55 + d.r * 0.2, v.y * 0.55 + d.r * 0.2)
        : ctx.moveTo(v.x * 0.55 + d.r * 0.2, v.y * 0.55 + d.r * 0.2),
    )
    ctx.closePath()
    ctx.fill()
    ctx.restore()
  }

  _drawMeteor(ctx, m) {
    const tr = m.trail
    const trailColor =
      m.kind === 'rocket' ? '120, 200, 255' : m.kind === 'rock' ? '180, 170, 160' : m.kind === 'warhead' ? '255, 90, 70' : '255, 170, 80'
    if (tr.length > 1) {
      ctx.save()
      ctx.globalCompositeOperation = 'lighter'
      // хвост тремя пачками — как у планетных трейлов
      const B = 3
      const n = tr.length
      const aMax = m.kind === 'rock' ? 0.3 : 0.55
      for (let b = 0; b < B; b++) {
        const i0 = Math.max(1, Math.floor((b * n) / B))
        const i1 = Math.floor(((b + 1) * n) / B)
        if (i1 <= i0) continue
        const f = (b + 0.7) / B
        ctx.strokeStyle = `rgba(${trailColor}, ${aMax * f})`
        ctx.lineWidth = Math.max(0.6, 3 * f)
        ctx.beginPath()
        ctx.moveTo(tr[i0 - 1].x, tr[i0 - 1].y * SQ)
        for (let i = i0; i < i1; i++) ctx.lineTo(tr[i].x, tr[i].y * SQ)
        ctx.stroke()
      }
      ctx.restore()
    }

    const x = m.x
    const y = m.y * SQ

    if (m.kind === 'rocket') {
      const ang = Math.atan2(m.vy * SQ, m.vx)
      ctx.save()
      ctx.translate(x, y)
      ctx.rotate(ang)
      // пламя
      const ft = 1 + Math.sin(this.visT * 30) * 0.3
      const fg = ctx.createLinearGradient(-m.r * 5 * ft, 0, -m.r, 0)
      fg.addColorStop(0, 'rgba(120, 200, 255, 0)')
      fg.addColorStop(1, 'rgba(180, 225, 255, 0.9)')
      ctx.fillStyle = fg
      ctx.beginPath()
      ctx.moveTo(-m.r, -m.r * 0.55)
      ctx.lineTo(-m.r * 5 * ft, 0)
      ctx.lineTo(-m.r, m.r * 0.55)
      ctx.closePath()
      ctx.fill()
      // корпус
      ctx.fillStyle = '#e8eef8'
      ctx.beginPath()
      ctx.moveTo(m.r * 2.2, 0)
      ctx.lineTo(-m.r, -m.r * 0.85)
      ctx.lineTo(-m.r, m.r * 0.85)
      ctx.closePath()
      ctx.fill()
      // боеголовка
      ctx.fillStyle = '#ff5d4d'
      ctx.beginPath()
      ctx.arc(m.r * 1.1, 0, m.r * 0.55, 0, TAU)
      ctx.fill()
      ctx.restore()
      return
    }

    if (m.kind === 'rock') {
      ctx.save()
      ctx.translate(x, y)
      ctx.rotate(m.rot)
      ctx.fillStyle = '#8f8378'
      ctx.beginPath()
      m.verts.forEach((v, i) => (i ? ctx.lineTo(v.x, v.y) : ctx.moveTo(v.x, v.y)))
      ctx.closePath()
      ctx.fill()
      ctx.fillStyle = 'rgba(0,0,0,0.35)'
      ctx.beginPath()
      ctx.arc(m.r * 0.3, m.r * 0.25, m.r * 0.35, 0, TAU)
      ctx.fill()
      ctx.fillStyle = 'rgba(255,255,255,0.12)'
      ctx.beginPath()
      ctx.arc(-m.r * 0.3, -m.r * 0.3, m.r * 0.4, 0, TAU)
      ctx.fill()
      ctx.restore()
      return
    }

    if (m.kind === 'warhead' || m.kind === 'breaker') {
      const st = this.civ?.stateById(m.owner)
      const color = m.kind === 'breaker' ? '#ff5d5d' : st?.color || '#ff6a5c'
      const img = getSprite('missile', color)
      const ang = Math.atan2(m.vy * 0.74, m.vx) + Math.PI / 2
      let mul = Math.min(Math.max(0.55 / this.cam.zoom, 1), 3.4)
      if (m.kind === 'breaker') mul *= 1.7
      // подсветка, чтобы ракету было видно издалека
      ctx.save()
      ctx.globalCompositeOperation = 'lighter'
      const gg = ctx.createRadialGradient(x, y, 0, x, y, 8 * mul)
      gg.addColorStop(0, color + '77')
      gg.addColorStop(1, color + '00')
      ctx.fillStyle = gg
      ctx.beginPath()
      ctx.arc(x, y, 8 * mul, 0, TAU)
      ctx.fill()
      ctx.restore()
      ctx.save()
      ctx.translate(x, y)
      ctx.rotate(ang)
      if (img.complete && img.naturalWidth) ctx.drawImage(img, -2.4 * mul, -6.4 * mul, 4.8 * mul, 12.8 * mul)
      else {
        ctx.fillStyle = color
        ctx.beginPath()
        ctx.arc(0, 0, m.r * mul, 0, TAU)
        ctx.fill()
      }
      ctx.restore()
      return
    }

    const g = ctx.createRadialGradient(x, y, 0, x, y, m.r * 3)
    g.addColorStop(0, 'rgba(255,255,255,0.95)')
    g.addColorStop(0.35, 'rgba(255,190,110,0.7)')
    g.addColorStop(1, 'rgba(255,140,60,0)')
    ctx.fillStyle = g
    ctx.beginPath()
    ctx.arc(x, y, m.r * 3, 0, TAU)
    ctx.fill()
    ctx.fillStyle = '#caa284'
    ctx.beginPath()
    ctx.arc(x, y, m.r, 0, TAU)
    ctx.fill()
  }

  _drawHole(ctx, hl) {
    const x = hl.x
    const y = hl.y * SQ
    const k = hl.life < 1 ? Math.max(hl.life, 0.05) : 1
    const R = hl.r * k
    const t = this.visT

    let g = ctx.createRadialGradient(x, y, R * 0.4, x, y, R * 6)
    g.addColorStop(0, 'rgba(0, 0, 0, 0.9)')
    g.addColorStop(0.4, 'rgba(26, 12, 48, 0.45)')
    g.addColorStop(1, 'rgba(0, 0, 0, 0)')
    ctx.fillStyle = g
    ctx.beginPath()
    ctx.arc(x, y, R * 6, 0, TAU)
    ctx.fill()

    ctx.save()
    ctx.translate(x, y)
    ctx.rotate(t * 1.7 + hl.swirl)
    ctx.scale(1, 0.5)
    ctx.strokeStyle = 'rgba(195, 155, 255, 0.85)'
    ctx.lineWidth = 2
    for (let i = 0; i < 3; i++) {
      ctx.beginPath()
      ctx.arc(0, 0, R * (1.7 + i * 0.4), (i * TAU) / 3, (i * TAU) / 3 + TAU * 0.24)
      ctx.stroke()
    }
    ctx.restore()

    ctx.fillStyle = '#000'
    ctx.beginPath()
    ctx.arc(x, y, R, 0, TAU)
    ctx.fill()
    ctx.strokeStyle = 'rgba(214, 178, 255, 0.9)'
    ctx.lineWidth = 1.2
    ctx.beginPath()
    ctx.arc(x, y, R, 0, TAU)
    ctx.stroke()
  }

  // Контур планеты с учётом выгрызенных кусков
  _planetPath(ctx, pl, x, y) {
    const N = pl.shape.length
    ctx.beginPath()
    for (let i = 0; i <= N; i++) {
      const idx = i % N
      const a = (i / N) * TAU
      const rr = pl.r * pl.shape[idx]
      const px = x + Math.cos(a) * rr
      const py = y + Math.sin(a) * rr
      if (i) ctx.lineTo(px, py)
      else ctx.moveTo(px, py)
    }
    ctx.closePath()
  }

  _drawPlanet(ctx, pl) {
    const x = pl.x
    const y = pl.y * SQ
    const r = pl.r
    const d = Math.hypot(x, y) || 1
    const lx = -x / d
    const ly = -y / d

    let g = ctx.createRadialGradient(x, y, r * 0.6, x, y, r * 2.3)
    g.addColorStop(0, pl.glow)
    g.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = g
    ctx.beginPath()
    ctx.arc(x, y, r * 2.3, 0, TAU)
    ctx.fill()

    if (pl.rings) this._drawRing(ctx, pl, x, y, Math.PI, TAU)

    g = ctx.createRadialGradient(x + lx * r * 0.5, y + ly * r * 0.5, r * 0.12, x, y, r * 1.04)
    g.addColorStop(0, pl.colors[0])
    g.addColorStop(0.55, pl.colors[1])
    g.addColorStop(1, pl.colors[2])
    ctx.fillStyle = g
    this._planetPath(ctx, pl, x, y)
    ctx.fill()

    if (pl.banded) {
      ctx.save()
      this._planetPath(ctx, pl, x, y)
      ctx.clip()
      ctx.globalAlpha = 0.16
      ctx.fillStyle = pl.colors[2]
      const bands = 4
      for (let i = 0; i < bands; i++) {
        const by = y - r + ((i + 0.5) * 2 * r) / bands
        ctx.fillRect(x - r, by - r * 0.08, r * 2, r * 0.18)
      }
      ctx.restore()
    }

    // кратеры от попаданий
    if (pl.craters.length) {
      ctx.save()
      this._planetPath(ctx, pl, x, y)
      ctx.clip()
      for (const cr of pl.craters) {
        const cx = x + cr.ox * r
        const cy = y + cr.oy * r
        const cs = cr.s * r
        const cg = ctx.createRadialGradient(cx, cy, 0, cx, cy, cs)
        cg.addColorStop(0, 'rgba(0, 0, 0, 0.5)')
        cg.addColorStop(0.7, 'rgba(0, 0, 0, 0.3)')
        cg.addColorStop(1, 'rgba(0, 0, 0, 0)')
        ctx.fillStyle = cg
        ctx.beginPath()
        ctx.arc(cx, cy, cs, 0, TAU)
        ctx.fill()
      }
      ctx.restore()
    }

    // огни городов: чем больше население, тем гуще застройка
    if (pl.pop > 0.05) {
      ctx.save()
      this._planetPath(ctx, pl, x, y)
      ctx.clip()
      ctx.globalCompositeOperation = 'lighter'
      const n = clamp(Math.round(3 + pl.pop * 9), 3, 40)
      let seed = pl.lightsSeed || 1
      const rng = () => {
        seed = (seed * 9301 + 49297) % 233280
        return seed / 233280
      }
      for (let i = 0; i < n; i++) {
        const a = rng() * TAU
        const rr = Math.sqrt(rng()) * r * 0.85
        const tw = 0.55 + Math.sin(this.visT * 2 + i * 2.4) * 0.25
        const lr = Math.max(0.5, r * 0.045)
        ctx.fillStyle = `rgba(255, 214, 130, ${tw})`
        ctx.fillRect(x + Math.cos(a) * rr - lr, y + Math.sin(a) * rr * 0.9 - lr, lr * 2, lr * 2)
      }
      ctx.restore()
    }

    // установки ПВО: точки на орбите планеты (яркая — заряжена, тусклая — перезаряжается)
    if (pl.pvoUnits > 0 && pl.owner) {
      ctx.save()
      const orbR = r + 11 / Math.sqrt(this.cam.zoom)
      for (let i = 0; i < pl.pvoUnits; i++) {
        const a = this.visT * 0.35 + (i / pl.pvoUnits) * TAU
        const px = x + Math.cos(a) * orbR
        const py = y + Math.sin(a) * orbR * 0.85
        const ready = i < pl.pvoReady
        ctx.fillStyle = ready ? '#7df0ff' : 'rgba(125, 240, 255, 0.25)'
        ctx.beginPath()
        ctx.arc(px, py, 2.2 / Math.sqrt(this.cam.zoom), 0, TAU)
        ctx.fill()
      }
      // радиус действия ПВО
      ctx.strokeStyle = '#7df0ff'
      ctx.globalAlpha = pl.id === this.selectedId ? 0.3 : 0.09
      ctx.lineWidth = 1 / this.cam.zoom
      ctx.setLineDash([4 / this.cam.zoom, 9 / this.cam.zoom])
      ctx.beginPath()
      ctx.ellipse(x, y, 180, 180 * 0.74, 0, 0, TAU)
      ctx.stroke()
      ctx.restore()
    }

    if (pl.rings) this._drawRing(ctx, pl, x, y, 0, Math.PI)

    if (pl.hasMoon) {
      const mr = 2.4
      const mx = x + Math.cos(this.moonAngle) * (r + 9)
      const my = y + Math.sin(this.moonAngle) * (r + 9) * 0.7
      ctx.fillStyle = '#c9c9d4'
      ctx.beginPath()
      ctx.arc(mx, my, mr, 0, TAU)
      ctx.fill()
    }

    if (pl.hp < pl.maxHp) {
      const frac = clamp(pl.hp / pl.maxHp, 0, 1)
      ctx.strokeStyle = `rgba(255, ${Math.round(120 + 135 * frac)}, 90, 0.85)`
      ctx.lineWidth = 2 / this.cam.zoom
      ctx.beginPath()
      ctx.arc(x, y, r + 4 / this.cam.zoom, -Math.PI / 2, -Math.PI / 2 + TAU * frac)
      ctx.stroke()
    }

    if (pl.id === this.selectedId) {
      ctx.save()
      ctx.strokeStyle = 'rgba(140, 190, 255, 0.85)'
      ctx.lineWidth = 1.4 / this.cam.zoom
      ctx.setLineDash([6 / this.cam.zoom, 7 / this.cam.zoom])
      ctx.lineDashOffset = -this.visT * 22
      ctx.beginPath()
      ctx.arc(x, y, r + 9 / this.cam.zoom, 0, TAU)
      ctx.stroke()
      ctx.restore()
    } else if (pl.id === this.hoverId) {
      ctx.strokeStyle = 'rgba(180, 210, 255, 0.5)'
      ctx.lineWidth = 1.2 / this.cam.zoom
      ctx.beginPath()
      ctx.arc(x, y, r + 7 / this.cam.zoom, 0, TAU)
      ctx.stroke()
    }

    if (pl.id === this.hoverId || pl.id === this.selectedId || this.cam.zoom < 0.55) {
      ctx.save()
      ctx.font = `${11 / this.cam.zoom}px 'JetBrains Mono', monospace`
      ctx.fillStyle = 'rgba(220, 232, 255, 0.85)'
      ctx.textAlign = 'center'
      ctx.fillText(pl.name.toUpperCase(), x, y - r - 14 / this.cam.zoom)
      ctx.restore()
    }
  }

  _drawRing(ctx, pl, x, y, a0, a1) {
    const r = pl.r
    ctx.save()
    ctx.translate(x, y)
    ctx.rotate(-0.18)
    ctx.scale(1, 0.32)
    const mid = (pl.rings.inner + pl.rings.outer) / 2
    const width = (pl.rings.outer - pl.rings.inner) * r
    ctx.strokeStyle = pl.rings.color + 'aa'
    ctx.lineWidth = width * 0.55
    ctx.beginPath()
    ctx.arc(0, 0, r * mid, a0, a1)
    ctx.stroke()
    ctx.strokeStyle = pl.rings.color + '55'
    ctx.lineWidth = width
    ctx.beginPath()
    ctx.arc(0, 0, r * mid, a0, a1)
    ctx.stroke()
    ctx.restore()
  }

  _drawComets(ctx) {
    for (const cm of this.comets) {
      const tl = cm.tail
      const B = 3
      const n = tl.length
      for (let b = 0; b < B && n > 1; b++) {
        const i0 = Math.max(1, Math.floor((b * n) / B))
        const i1 = Math.floor(((b + 1) * n) / B)
        if (i1 <= i0) continue
        const f = 1 - (b + 0.7) / B
        ctx.strokeStyle = `rgba(155, 232, 255, ${f * 0.5})`
        ctx.lineWidth = Math.max(0.4, 2.6 * f)
        ctx.beginPath()
        ctx.moveTo(tl[i0 - 1].x, tl[i0 - 1].y)
        for (let i = i0; i < i1; i++) ctx.lineTo(tl[i].x, tl[i].y)
        ctx.stroke()
      }
      const g = ctx.createRadialGradient(cm.x, cm.y, 0, cm.x, cm.y, 9)
      g.addColorStop(0, 'rgba(255,255,255,0.95)')
      g.addColorStop(0.3, 'rgba(155,232,255,0.6)')
      g.addColorStop(1, 'rgba(155,232,255,0)')
      ctx.fillStyle = g
      ctx.beginPath()
      ctx.arc(cm.x, cm.y, 9, 0, TAU)
      ctx.fill()
    }
  }

  _drawFx(ctx) {
    ctx.save()
    ctx.globalCompositeOperation = 'lighter'

    // искры — квадратики: на сотнях частиц fillRect в разы дешевле arc()+fill()
    for (const s of this.sparks) {
      const a = clamp(s.life / s.max, 0, 1)
      ctx.globalAlpha = a
      ctx.fillStyle = s.color
      ctx.fillRect(s.x - s.size, s.y * SQ - s.size, s.size * 2, s.size * 2)
    }
    ctx.globalAlpha = 1

    for (const wv of this.waves) {
      const a = clamp(wv.life / wv.max, 0, 1)
      ctx.save()
      ctx.translate(wv.x, wv.y * SQ)
      ctx.scale(1, SQ)
      ctx.strokeStyle = `rgba(${wv.color}, ${a * 0.8})`
      ctx.lineWidth = wv.width * a + 0.5
      ctx.beginPath()
      ctx.arc(0, 0, wv.r, 0, TAU)
      ctx.stroke()
      ctx.restore()
    }

    ctx.restore()
  }

  _drawAim(ctx) {
    const a = this.aim
    const z = this.cam.zoom
    const x0 = a.start.x
    const y0 = a.start.y * SQ
    const x1 = a.cur.x
    const y1 = a.cur.y * SQ

    ctx.save()
    ctx.strokeStyle = 'rgba(255, 190, 110, 0.55)'
    ctx.lineWidth = 1.4 / z
    ctx.setLineDash([6 / z, 6 / z])
    ctx.beginPath()
    ctx.moveTo(x0, y0)
    ctx.lineTo(x1, y1)
    ctx.stroke()
    ctx.setLineDash([])

    // прогноз траектории — той же физикой, что и полёт
    const cfg = PROJ[a.kind] || PROJ.meteor
    let px = a.start.x
    let py = a.start.y
    let vx = (a.cur.x - a.start.x) * cfg.f
    let vy = (a.cur.y - a.start.y) * cfg.f
    const sp = Math.hypot(vx, vy)
    if (sp > cfg.vmax) {
      vx *= cfg.vmax / sp
      vy *= cfg.vmax / sp
    }
    const hSim = 0.04
    ctx.fillStyle = 'rgba(255, 200, 130, 0.8)'
    const fake = { x: px, y: py, vx, vy }
    for (let i = 0; i < 320; i++) {
      const g = this._gravityAt(fake.x, fake.y, null, 'small')
      fake.vx += g.x * hSim
      fake.vy += g.y * hSim
      fake.x += fake.vx * hSim
      fake.y += fake.vy * hSim
      this._captureAssist(fake, hSim)
      const dSun = Math.hypot(fake.x, fake.y)
      if (dSun < this._sunR || dSun > this.lostDist) break
      let hitPlanet = false
      for (const p of this.planets) {
        if (p.alive && Math.hypot(fake.x - p.x, fake.y - p.y) < p.r) {
          hitPlanet = true
          break
        }
      }
      if (hitPlanet) {
        ctx.globalAlpha = 0.9
        ctx.strokeStyle = 'rgba(255, 140, 90, 0.9)'
        ctx.lineWidth = 1.5 / z
        ctx.beginPath()
        ctx.arc(fake.x, fake.y * SQ, 6 / Math.sqrt(z), 0, TAU)
        ctx.stroke()
        break
      }
      if (i % 5 === 0) {
        const fade = 1 - i / 320
        ctx.globalAlpha = fade * 0.8
        ctx.beginPath()
        ctx.arc(fake.x, fake.y * SQ, 1.6 / Math.sqrt(z), 0, TAU)
        ctx.fill()
      }
    }
    ctx.restore()
  }
}

