import { galaxyBounds, galaxyZoom, lodOf, startFly, updateCamera, ZOOM_MAX, type Camera, type CamTarget, type Lod, type View } from '../render/camera'
import type { Pick } from '../render/hit'
import { SIM_DT, SPEEDS } from '../sim/config'
import { clamp } from '../sim/math'
import { capitalOf, civById } from '../sim/query'
import { planetPos } from '../sim/system'
import type { GameEvent, World } from '../sim/types'
import { pickFocus, type Focus } from './director'
import { alpha, type Clock } from './loop'
import { saveUnitCap } from './setup'

export interface Crumb {
  label: string
  target: { type: 'galaxy' } | { type: 'system'; id: number } | { type: 'planet'; id: string }
}

export interface UiState {
  speedIndex: number
  paused: boolean
  follow: boolean
  minimap: boolean
  feedOpen: boolean
  /** false: в ленте и всплывашках только pri 0; true: pri 0-1 */
  feedAll: boolean
  selected: Pick | null
  hovered: Pick | null
  mouse: { x: number; y: number }
}

/** экранный радиус системы при обзоре «подлёт» */
const APPROACH_R = 420

export class Controller {
  readonly ui: UiState = { speedIndex: 0, paused: false, follow: false, minimap: true, feedOpen: false, feedAll: false, selected: null, hovered: null, mouse: { x: 0, y: 0 } }
  protected now = 0
  private focus: Focus | null = null
  private seenEvent = 0
  private directorAt = -Infinity
  /** отложенные новые события, пока камера «держит» прошлое */
  private pending: GameEvent[] = []

  constructor(
    readonly world: World,
    readonly cam: Camera,
    readonly clock: Clock,
    readonly view: () => View,
  ) {}

  minZoom(): number {
    return galaxyZoom(this.view(), this.world.galaxy) * 0.8
  }

  // ---------- время и переключатели ----------

  setSpeed(i: number): void {
    this.ui.speedIndex = clamp(i, 0, SPEEDS.length - 1)
    this.ui.paused = false
  }

  togglePause(): void {
    this.ui.paused = !this.ui.paused
  }

  toggleFollow(on = !this.ui.follow): void {
    this.ui.follow = on
    if (on) {
      // при включении учитываем события последних 30 игровых секунд
      this.focus = null
      this.pending = this.world.events.filter((e) => e.pri < 2 && this.world.t - e.t <= 30)
      this.seenEvent = this.world.events.length ? this.world.events[this.world.events.length - 1].id : 0
      this.directorAt = -Infinity
    }
  }

  setUnitCap(n: number): void {
    this.world.unitCap = n
    saveUnitCap(n)
  }

  toggleMinimap(): void {
    this.ui.minimap = !this.ui.minimap
  }

  toggleFeedAll(): void {
    this.ui.feedAll = !this.ui.feedAll
  }

  toggleFeed(): void {
    this.ui.feedOpen = !this.ui.feedOpen
  }

  // ---------- выбор ----------

  /** держава, чья карточка открыта кликом в полосе держав */
  civCardId: number | null = null
  private hoverSince = 0

  select(p: Pick | null): void {
    this.ui.selected = p
    this.civCardId = null
    if (p === null) {
      // снятие выбора (Esc, крошки) — ручное действие: слежка выключается, иначе камера застынет без привязки
      this.cam.follow = null
      this.ui.follow = false
    }
  }

  hover(p: Pick | null, mouse?: { x: number; y: number }): void {
    const prev = this.ui.hovered
    const changed = !prev || !p || prev.type !== p.type || prev.id !== p.id
    if (changed) this.hoverSince = this.now
    this.ui.hovered = p
    if (mouse) this.ui.mouse = mouse
  }

  /** подсказка готова: под курсором что-то есть уже 0.3 с и это не выбранный объект */
  hoverReady(): boolean {
    const h = this.ui.hovered
    const s = this.ui.selected
    if (!h || this.now - this.hoverSince < 0.3) return false
    return !(s && s.type === h.type && s.id === h.id)
  }

  /** клик по державе: перелёт к столице и карточка державы */
  showCiv(id: number): void {
    this.flyToCiv(id)
    this.ui.selected = null
    this.civCardId = id
  }

  selectedPlanet(): string | null {
    return this.ui.selected?.type === 'planet' ? this.ui.selected.id : null
  }

  /** пользователь сам двигает камеру — слежка и привязка к планете выключаются */
  userMoved(): void {
    this.ui.follow = false
    this.cam.follow = null
    this.cam.fly = null
  }

  // ---------- перелёты ----------

  protected go(to: CamTarget, instant: boolean): void {
    if (instant) {
      this.cam.x = to.x
      this.cam.y = to.y
      this.cam.zoom = to.zoom
      this.cam.fly = null
      this.cam.vx = 0
      this.cam.vy = 0
    } else {
      startFly(this.cam, to, this.now)
    }
  }

  flyToGalaxy(instant = false): void {
    const b = galaxyBounds(this.world.galaxy)
    this.cam.follow = null
    this.go({ x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2, zoom: galaxyZoom(this.view(), this.world.galaxy) }, instant)
  }

  flyToSystem(id: number, level: 'approach' | 'system' = 'approach', instant = false): void {
    const s = this.world.galaxy.systems[id]
    const v = this.view()
    const screenR = level === 'system' ? Math.max(900, Math.min(v.width, v.height)) : APPROACH_R
    this.cam.follow = null
    this.go({ x: s.pos.x, y: s.pos.y, zoom: clamp(screenR / s.radius, this.minZoom(), ZOOM_MAX) }, instant)
  }

  /** камера на планете: экранный радиус ~36 px, дальше следует за ней по орбите */
  flyToPlanet(id: string, instant = false, select = true): void {
    const p = this.world.planets.get(id)
    if (!p) return
    const s = this.world.galaxy.systems[p.systemId]
    const q = planetPos(p, this.world.t)
    if (select) this.ui.selected = { type: 'planet', id }
    this.cam.follow = id
    this.go({ x: s.pos.x + q.x, y: s.pos.y + q.y, zoom: clamp(36 / p.radius, 0.6, ZOOM_MAX) }, instant)
  }

  flyToCiv(id: number): void {
    const civ = civById(this.world, id)
    const cap = civ ? capitalOf(this.world, civ) : null
    if (cap) this.flyToPlanet(cap.id)
  }

  flyToEvent(ev: GameEvent): void {
    if (ev.at.planet) this.flyToPlanet(ev.at.planet)
    else this.flyToSystem(ev.at.system, 'approach')
  }

  flyToWorldPoint(x: number, y: number): void {
    this.cam.follow = null
    this.go({ x, y, zoom: this.cam.zoom }, false)
  }

  goCrumb(c: Crumb): void {
    if (c.target.type === 'galaxy') {
      this.select(null)
      this.flyToGalaxy()
    } else if (c.target.type === 'system') {
      this.select(null)
      this.flyToSystem(c.target.id, 'approach')
    } else {
      this.flyToPlanet(c.target.id)
    }
  }

  // ---------- где мы ----------

  /** система, на которую смотрим: раскрытая и ближайшая к центру кадра */
  focusSystem(): number | null {
    let best: number | null = null
    let bd = Infinity
    for (const s of this.world.galaxy.systems) {
      if (lodOf(s.radius, this.cam.zoom).approachAlpha < 0.5) continue
      const d = Math.hypot(s.pos.x - this.cam.x, s.pos.y - this.cam.y)
      if (d < s.radius * 1.5 && d < bd) {
        best = s.id
        bd = d
      }
    }
    return best
  }

  level(): Lod {
    const f = this.focusSystem()
    return f === null ? 'galaxy' : lodOf(this.world.galaxy.systems[f].radius, this.cam.zoom).level
  }

  crumbs(): Crumb[] {
    const out: Crumb[] = [{ label: 'Галактика', target: { type: 'galaxy' } }]
    const f = this.focusSystem()
    if (f === null) return out
    const s = this.world.galaxy.systems[f]
    out.push({ label: s.name, target: { type: 'system', id: f } })
    const sel = this.selectedPlanet()
    const p = sel ? this.world.planets.get(sel) : undefined
    if (p && p.systemId === f) out.push({ label: p.name, target: { type: 'planet', id: p.id } })
    return out
  }

  /** Esc: снять выбор → обзор системы → вся галактика */
  back(): void {
    this.ui.follow = false
    if (this.ui.selected || this.civCardId !== null) {
      this.select(null)
      return
    }
    const f = this.focusSystem()
    if (f !== null && this.level() === 'system') this.flyToSystem(f, 'approach')
    else this.flyToGalaxy()
  }

  update(now: number, dt: number): void {
    this.now = now
    this.clock.speed = this.ui.paused ? 0 : SPEEDS[this.ui.speedIndex]
    if (this.cam.follow) {
      const p = this.world.planets.get(this.cam.follow)
      if (p) {
        const s = this.world.galaxy.systems[p.systemId]
        const q = planetPos(p, this.world.t - SIM_DT * (1 - alpha(this.clock)))
        if (this.cam.fly) {
          this.cam.fly.to.x = s.pos.x + q.x
          this.cam.fly.to.y = s.pos.y + q.y
        } else {
          this.cam.x = s.pos.x + q.x
          this.cam.y = s.pos.y + q.y
        }
      }
    }
    updateCamera(this.cam, now, dt)
    if (this.ui.follow && now - this.directorAt >= 0.5) {
      this.directorAt = now
      for (const e of this.world.events) {
        if (e.id > this.seenEvent && e.pri < 2) this.pending.push(e)
      }
      if (this.world.events.length) this.seenEvent = Math.max(this.seenEvent, this.world.events[this.world.events.length - 1].id)
      const r = pickFocus(this.pending, now, this.focus)
      this.focus = r.focus
      if (r.event) {
        this.pending = []
        if (r.event.at.planet) this.flyToPlanet(r.event.at.planet, false, false)
        else this.flyToSystem(r.event.at.system, 'approach')
      }
    }
  }
}
