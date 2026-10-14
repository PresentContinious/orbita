import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { display, onDisplay, setDisplay } from '../app/display'
import { Icon } from './icons'
import { PLANET_OPTIONS, planetsPatch, TERRITORY_OPTIONS, territoryPatch, TRADE_OPTIONS, tradePatch } from './viewOptions'

let version = 0
const subscribe = (fn: () => void) =>
  onDisplay(() => {
    version++
    fn()
  })

function Row<T extends string | boolean>({ title, options, value, onPick }: { title: string; options: { value: T; label: string }[]; value: T; onPick: (v: T) => void }) {
  return (
    <div className="vrow">
      <span className="muted">{title}</span>
      <span className="seg">
        {options.map((o) => (
          <button key={String(o.value)} className={o.value === value ? 'on' : ''} onClick={() => onPick(o.value)}>
            {o.label}
          </button>
        ))}
      </span>
    </div>
  )
}

export function ViewMenu() {
  useSyncExternalStore(subscribe, () => version)
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return
      if (e.code === 'KeyV') setOpen((o) => !o)
      else if (e.code === 'Escape') setOpen(false)
    }
    const down = (e: PointerEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false)
    }
    window.addEventListener('keydown', key)
    window.addEventListener('pointerdown', down)
    return () => {
      window.removeEventListener('keydown', key)
      window.removeEventListener('pointerdown', down)
    }
  }, [])
  return (
    <span ref={box} className="viewmenu">
      <button className={open ? 'on' : ''} onClick={() => setOpen(!open)} title="Вид: территории, планеты, торговые пути — V">
        <Icon name="eye" size={14} />
      </button>
      {open && (
        <div className="panel viewpanel">
          <header className="muted">вид · V</header>
          <Row title="Территории" options={TERRITORY_OPTIONS} value={display.territory} onPick={(v) => setDisplay(territoryPatch(v))} />
          <Row title="Планеты" options={PLANET_OPTIONS} value={display.planets} onPick={(v) => setDisplay(planetsPatch(v))} />
          <Row title="Торговые пути" options={TRADE_OPTIONS} value={display.trade} onPick={(v) => setDisplay(tradePatch(v))} />
        </div>
      )}
    </span>
  )
}
