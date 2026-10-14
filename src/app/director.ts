import type { GameEvent } from '../sim/types'

export interface Focus {
  eventId: number
  /** реальное время, когда камера переключилась */
  since: number
}

/** выбор, куда смотреть: важнее (меньше pri) и новее; не чаще раза в minDwell секунд */
export function pickFocus(fresh: GameEvent[], now: number, current: Focus | null, minDwell = 8): { focus: Focus | null; event: GameEvent | null } {
  if (current && now - current.since < minDwell) return { focus: current, event: null }
  let best: GameEvent | null = null
  for (const e of fresh) {
    if (current && e.id === current.eventId) continue
    if (!best || e.pri < best.pri || (e.pri === best.pri && e.id > best.id)) best = e
  }
  if (!best) return { focus: current, event: null }
  return { focus: { eventId: best.id, since: now }, event: best }
}
