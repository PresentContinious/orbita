import type { CardData } from './cards'

export function Card({ card, onClose }: { card: CardData; onClose: () => void }) {
  return (
    <aside className={`panel card${card.kind === 'battle' ? ' wide' : ''}`}>
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
      {card.meter?.map((m) => (
        <div key={m.label} className="meter">
          <div className="meter-names">
            <span>{m.left}</span>
            <span>{m.right}</span>
          </div>
          <div className="meter-bar">
            <i style={{ width: `${Math.round(m.value * 100)}%` }} />
          </div>
        </div>
      ))}
      {card.sections?.map((s) => (
        <section key={s.title} className="cardsec">
          <h4 style={{ color: s.color }}>{s.title}</h4>
          <dl>
            {s.rows.map((r) => (
              <div key={r.label} className="row">
                <dt>{r.label}</dt>
                <dd className={r.tone}>{r.value}</dd>
              </div>
            ))}
          </dl>
        </section>
      ))}
      {card.table && (
        <table className="cardtable">
          <thead>
            <tr>
              {card.table.head.map((h, i) => (
                <th key={i}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {card.table.rows.map((r) => (
              <tr key={r[0]}>
                {r.map((c, i) => (
                  <td key={i}>{c}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {card.log && card.log.length > 0 && (
        <ul className="cardlog">
          {card.log.map((e, i) => (
            <li key={i}>{e.text}</li>
          ))}
        </ul>
      )}
    </aside>
  )
}
