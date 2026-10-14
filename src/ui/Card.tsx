import type { CardData } from './cards'

export function Card({ card, onClose }: { card: CardData; onClose: () => void }) {
  return (
    <aside className="panel card">
      <header>
        <b style={{ color: card.color }}>{card.title.toUpperCase()}</b>
        <button onClick={onClose} aria-label="закрыть" title="Закрыть — Esc">
          ✕
        </button>
      </header>
      {card.subtitle && <div className="subtitle">{card.subtitle}</div>}
      <dl>
        {card.rows.map((r) => (
          <div key={r.label} className="row">
            <dt>{r.label}</dt>
            <dd className={r.tone}>{r.value}</dd>
          </div>
        ))}
      </dl>
    </aside>
  )
}
