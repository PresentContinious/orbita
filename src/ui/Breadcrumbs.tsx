import type { Crumb } from '../app/controller'

export function Breadcrumbs({ crumbs, onPick }: { crumbs: Crumb[]; onPick: (c: Crumb) => void }) {
  return (
    <nav className="panel crumbs">
      <span className="brand">ОРБИТА</span>
      {crumbs.map((c, i) => (
        <span key={c.label + i}>
          <span className="sep">{i === 0 ? '·' : '›'}</span>
          <button className={i === crumbs.length - 1 ? 'crumb current' : 'crumb'} onClick={() => onPick(c)}>
            {c.label}
          </button>
        </span>
      ))}
    </nav>
  )
}
