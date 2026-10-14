import type { GameEvent } from '../sim/types'
import { EventIcon } from './icons'
import type { Toast } from './model'

export function Toasts({ toasts, colors, onPick }: { toasts: Toast[]; colors: Record<number, string>; onPick: (ev: GameEvent) => void }) {
  return (
    <div className="toasts">
      {toasts.map((t) => {
        const c = colors[t.ev.civs[0]] ?? 'var(--muted)'
        return (
          <button key={t.ev.id} className={`panel toast pri${t.ev.pri}`} onClick={() => onPick(t.ev)} title="Показать на карте">
            <span className="dot" style={{ background: c, color: c }} />
            <EventIcon kind={t.ev.kind} />
            <span>{t.ev.text}</span>
          </button>
        )
      })}
    </div>
  )
}
