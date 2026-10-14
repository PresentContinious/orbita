import type { GameEvent } from '../sim/types'
import { yearOf } from './format'
import { EventIcon } from './icons'

export function FeedDrawer({
  events,
  colors,
  all,
  onToggleAll,
  onPick,
  onClose,
}: {
  events: GameEvent[]
  colors: Record<number, string>
  all: boolean
  onToggleAll: () => void
  onPick: (ev: GameEvent) => void
  onClose: () => void
}) {
  return (
    <aside className="panel feed">
      <header>
        <b>ЛЕНТА</b>
        <span className="seg">
          <button className={all ? '' : 'on'} onClick={all ? onToggleAll : undefined}>важное</button>
          <button className={all ? 'on' : ''} onClick={all ? undefined : onToggleAll}>всё</button>
        </span>
        <button onClick={onClose} aria-label="закрыть">✕</button>
      </header>
      <ol>
        {events.map((e) => {
          const c = colors[e.civs[0]] ?? 'var(--muted)'
          return (
            <li key={e.id} className={`pri${e.pri}`}>
              <button onClick={() => onPick(e)}>
                <span className="muted yr">{yearOf(e.t)}</span>
                <span className="dot" style={{ background: c, color: c }} />
                <EventIcon kind={e.kind} />
                <span className="tx">{e.text}</span>
              </button>
            </li>
          )
        })}
        {events.length === 0 && <li className="muted empty">пока тихо</li>}
      </ol>
    </aside>
  )
}
