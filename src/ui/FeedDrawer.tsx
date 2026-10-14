import type { GameEvent } from '../sim/types'
import { yearOf } from './format'

export function FeedDrawer({ events, onPick, onClose }: { events: GameEvent[]; onPick: (ev: GameEvent) => void; onClose: () => void }) {
  return (
    <aside className="panel feed">
      <header>
        <b>ЛЕНТА</b>
        <button onClick={onClose} aria-label="закрыть">✕</button>
      </header>
      <ol>
        {events.map((e) => (
          <li key={e.id} className={`pri${e.pri}`}>
            <button onClick={() => onPick(e)}>
              <span className="muted">г.{yearOf(e.t)}</span> {e.text}
            </button>
          </li>
        ))}
      </ol>
    </aside>
  )
}
