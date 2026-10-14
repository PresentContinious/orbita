import type { Controller, Crumb } from '../app/controller'
import { report } from '../sim/economy'
import { populatedOf } from '../sim/query'
import type { GameEvent, Stage, World } from '../sim/types'
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
  }
}
