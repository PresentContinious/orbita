import { EVENTS } from './config'
import type { GameEvent, World } from './types'

export interface EventInput {
  kind: string
  pri: 0 | 1 | 2
  text: string
  /** текст для склеенной пачки из n однотипных P2-событий */
  textMany?: (n: number) => string
  civs: number[]
  at: { system: number; planet?: string }
}

export function pushEvent(w: World, e: EventInput): GameEvent {
  if (e.pri === 2 && e.textMany) {
    const key = `${e.kind}|${e.civs.join(',')}`
    for (let i = w.events.length - 1; i >= 0; i--) {
      const ev = w.events[i]
      if (w.t - ev.t > EVENTS.groupWindow) break
      if (ev.pri === 2 && `${ev.kind}|${ev.civs.join(',')}` === key) {
        ev.count++
        ev.text = e.textMany(ev.count)
        ev.t = w.t
        return ev
      }
    }
  }
  const ev: GameEvent = { id: w.nextId++, t: w.t, kind: e.kind, pri: e.pri, text: e.text, civs: e.civs, at: e.at, count: 1 }
  w.events.push(ev)
  if (w.events.length > EVENTS.maxLog) w.events.splice(0, w.events.length - EVENTS.maxLog)
  return ev
}
