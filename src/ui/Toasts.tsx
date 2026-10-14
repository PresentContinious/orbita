import type { GameEvent } from '../sim/types'
import type { Toast } from './model'

export function Toasts({ toasts, onPick }: { toasts: Toast[]; onPick: (ev: GameEvent) => void }) {
  return (
    <div className="toasts">
      {toasts.map((t) => (
        <button key={t.ev.id} className={`panel toast pri${t.ev.pri}`} onClick={() => onPick(t.ev)} title="Показать на карте">
          {t.ev.text}
        </button>
      ))}
    </div>
  )
}
