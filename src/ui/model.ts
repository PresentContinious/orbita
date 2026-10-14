import type { GameEvent, World } from '../sim/types'

export interface Toast {
  ev: GameEvent
  /** реальное время, до которого показываем */
  until: number
}

export const TOAST_LIFE: Record<0 | 1, number> = { 0: 8, 1: 5 }
export const MAX_TOASTS = 3

/** новые P0/P1 события становятся всплывашками; не больше трёх, лишние P1 уходят первыми */
export function updateToasts(toasts: Toast[], events: GameEvent[], lastId: number, now: number): { toasts: Toast[]; lastId: number } {
  const next = toasts.filter((t) => t.until > now)
  let maxId = lastId
  for (const ev of events) {
    if (ev.id <= lastId) continue
    maxId = Math.max(maxId, ev.id)
    if (ev.pri === 2) continue
    next.push({ ev, until: now + TOAST_LIFE[ev.pri] })
  }
  while (next.length > MAX_TOASTS) {
    const i = next.findIndex((t) => t.ev.pri === 1)
    next.splice(i >= 0 ? i : 0, 1)
  }
  return { toasts: next, lastId: maxId }
}

/** тренд населения державы: сравнение с замером не моложе 30 с, порог 2% */
export class TrendTracker {
  private readonly hist = new Map<number, { t: number; pop: number }[]>()

  trend(id: number, pop: number, t: number): -1 | 0 | 1 {
    let h = this.hist.get(id)
    if (!h) {
      h = []
      this.hist.set(id, h)
    }
    if (!h.length || t - h[h.length - 1].t >= 10) h.push({ t, pop })
    while (h.length > 1 && t - h[1].t >= 30) h.shift()
    const old = h[0]
    if (t - old.t < 30) return 0
    if (pop > old.pop * 1.02) return 1
    if (pop < old.pop * 0.98) return -1
    return 0
  }
}

export class UiModel {
  toasts: Toast[] = []
  lastId = 0
  readonly trends = new TrendTracker()

  tick(w: World, now: number): void {
    const r = updateToasts(this.toasts, w.events, this.lastId, now)
    this.toasts = r.toasts
    this.lastId = r.lastId
  }
}
