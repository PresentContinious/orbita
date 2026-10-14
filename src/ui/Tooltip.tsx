import type { CardData } from './cards'

export function Tooltip({ x, y, card }: { x: number; y: number; card: CardData }) {
  return (
    <div className="panel tooltip" style={{ left: x + 16, top: y + 12 }}>
      <b style={{ color: card.color }}>{card.title}</b>
      {card.subtitle && <span className="muted"> · {card.subtitle}</span>}
      {card.rows.slice(0, 2).map((r) => (
        <div key={r.label} className="muted">
          {r.label}: {r.value}
        </div>
      ))}
    </div>
  )
}
