import { fmtRate } from './format'
import { EventIcon } from './icons'
import type { CivSummary } from './snapshot'

const ARROW = { 1: '↑', 0: '→', [-1]: '↓' } as const

export function CivBar({ civs, onPick, onFeed }: { civs: CivSummary[]; onPick: (id: number) => void; onFeed: () => void }) {
  return (
    <div className="panel civbar">
      <div className="civs">
        {civs.map((c) => (
          <button key={c.id} className="civ" onClick={() => onPick(c.id)} title={`${c.name}: ${c.planets} пл., казна ${c.treasury} кр, ${fmtRate(c.netPerMin)}`}>
            <span className="dot" style={{ background: c.color, color: c.color }} />
            <b>{c.name}</b>
            <span className="muted">{c.planets}пл</span>
            <span className={c.trend > 0 ? 'good' : c.trend < 0 ? 'bad' : 'muted'}>{ARROW[c.trend]}</span>
            {c.stage !== 'ok' && <span className="bad" title="долги"><EventIcon kind="deficit" size={12} /></span>}
          </button>
        ))}
      </div>
      <button className="feed-btn" onClick={onFeed} title="Вся лента событий — L">
        ☰ лента
      </button>
    </div>
  )
}
