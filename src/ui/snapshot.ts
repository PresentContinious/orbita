import type { Controller, Crumb } from '../app/controller'
import { galaxyBounds, screenToWorld, type Bounds } from '../render/camera'
import { territoryShares } from '../render/territory'
import { report } from '../sim/economy'
import { populatedOf } from '../sim/query'
import { gateGalaxyPos, gateTo } from '../sim/routing'
import type { GameEvent, Stage, World } from '../sim/types'
import { cardFor, civCard, type CardData } from './cards'
import { hex, yearOf } from './format'
import type { Toast, UiModel } from './model'

export interface CivSummary {
  id: number
  name: string
  color: string
  planets: number
  pop: number
  treasury: number
  netPerMin: number
  stage: Stage
  trend: -1 | 0 | 1
}

export interface MinimapData {
  systems: { x: number; y: number; star: string; owner: string | null }[]
  corridors: [number, number, number, number][]
  bounds: Bounds
  view: { x0: number; y0: number; x1: number; y1: number }
}

export interface Snapshot {
  seed: number
  year: number
  speedIndex: number
  paused: boolean
  follow: boolean
  minimapOn: boolean
  feedOpen: boolean
  crumbs: Crumb[]
  civs: CivSummary[]
  toasts: Toast[]
  feed: GameEvent[]
  card: CardData | null
  hover: { x: number; y: number; card: CardData } | null
  minimap: MinimapData | null
}

function minimapOf(w: World, c: Controller): MinimapData {
  const v = c.view()
  const a = screenToWorld(c.cam, v, { x: 0, y: 0 })
  const b = screenToWorld(c.cam, v, { x: v.width, y: v.height })
  return {
    systems: w.galaxy.systems.map((s) => {
      const lead = territoryShares(w, s)[0]
      return { x: s.pos.x, y: s.pos.y, star: hex(s.star.color), owner: lead ? hex(lead.color) : null }
    }),
    corridors: w.galaxy.corridors.map((k) => {
      const A = w.galaxy.systems[k.a]
      const B = w.galaxy.systems[k.b]
      const ga = gateGalaxyPos(A, gateTo(A, k.b)!)
      const gb = gateGalaxyPos(B, gateTo(B, k.a)!)
      return [ga.x, ga.y, gb.x, gb.y]
    }),
    bounds: galaxyBounds(w.galaxy),
    view: { x0: a.x, y0: a.y, x1: b.x, y1: b.y },
  }
}

export function buildSnapshot(w: World, c: Controller, model: UiModel): Snapshot {
  const civs = w.civs.map((civ) => {
    const mine = populatedOf(w, civ)
    const pop = mine.reduce((s, p) => s + p.pop, 0)
    const r = report(civ)
    return {
      id: civ.id,
      name: civ.name,
      color: hex(civ.color),
      planets: mine.length,
      pop,
      treasury: Math.round(civ.treasury),
      netPerMin: r.netPerMin,
      stage: civ.eco.stage,
      trend: model.trends.trend(civ.id, pop, w.t),
    }
  })
  return {
    seed: w.seed,
    year: yearOf(w.t),
    speedIndex: c.ui.speedIndex,
    paused: c.ui.paused,
    follow: c.ui.follow,
    minimapOn: c.ui.minimap,
    feedOpen: c.ui.feedOpen,
    crumbs: c.crumbs(),
    civs,
    toasts: model.toasts,
    feed: c.ui.feedOpen ? w.events.slice(-200).reverse() : [],
    card: c.civCardId !== null && !c.ui.selected ? civCard(w, c.civCardId) : cardFor(w, c.ui.selected),
    hover: (() => {
      if (!c.hoverReady()) return null
      const card = cardFor(w, c.ui.hovered)
      return card ? { x: c.ui.mouse.x, y: c.ui.mouse.y, card } : null
    })(),
    minimap: c.ui.minimap ? minimapOf(w, c) : null,
  }
}
