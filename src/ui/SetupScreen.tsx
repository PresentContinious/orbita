import { useEffect, useMemo, useState } from 'react'
import { loadSetupValues, saveSetupValues, setupQuery, type SetupValues } from '../app/setup'
import { generateGalaxy } from '../sim/galaxy'
import { createRng } from '../sim/rng'
import { clampOptions, SETUP, setupOf, type GalaxyOptions } from '../sim/setup'
import type { SystemRole } from '../sim/types'

type Key = 'systems' | 'civs' | 'perSystem' | 'ore' | 'pits' | 'links' | 'size' | 'treasury'

const SLIDERS: { key: Key; label: string; step: number; show: (v: number) => string }[] = [
  { key: 'systems', label: 'Систем', step: 1, show: String },
  { key: 'civs', label: 'Держав', step: 1, show: String },
  { key: 'perSystem', label: 'Держав в одной системе', step: 1, show: String },
  { key: 'ore', label: 'Рудных систем', step: 1, show: String },
  { key: 'pits', label: 'Пиратских «Ям»', step: 1, show: String },
  { key: 'links', label: 'Плотность коридоров', step: 0.05, show: (v) => `${Math.round(v * 100)}%` },
  { key: 'size', label: 'Размер галактики', step: 0.05, show: (v) => `×${v.toFixed(2)}` },
  { key: 'treasury', label: 'Стартовая казна', step: 5, show: String },
]

const ROLE_COLOR: Record<SystemRole, string> = { inhabited: '#7df0ff', ore: '#ffd97a', pit: '#ff6b6b', nebula: '#8a7dff' }
const ROLE_NAME: Record<SystemRole, string> = { inhabited: 'обитаемая', ore: 'рудная', pit: 'Яма', nebula: 'туманность' }

function Preview({ seed, opts }: { seed: number; opts: GalaxyOptions }) {
  const g = useMemo(() => generateGalaxy(createRng(seed).fork('galaxy'), clampOptions(opts)), [seed, JSON.stringify(opts)])
  const xs = g.systems.map((s) => s.pos.x)
  const ys = g.systems.map((s) => s.pos.y)
  const pad = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) * 0.08
  const x0 = Math.min(...xs) - pad
  const y0 = Math.min(...ys) - pad
  const w = Math.max(...xs) + pad - x0
  const h = Math.max(...ys) + pad - y0
  return (
    <svg className="setup-preview" viewBox={`${x0} ${y0} ${w} ${h}`} preserveAspectRatio="xMidYMid meet">
      {g.corridors.map((k, i) => (
        <line key={i} x1={g.systems[k.a].pos.x} y1={g.systems[k.a].pos.y} x2={g.systems[k.b].pos.x} y2={g.systems[k.b].pos.y} stroke="#2b3756" strokeWidth={Math.max(w, h) / 400} />
      ))}
      {g.systems.map((s) => (
        <circle key={s.id} cx={s.pos.x} cy={s.pos.y} r={Math.max(w, h) / (s.role === 'inhabited' ? 55 : 80)} fill={ROLE_COLOR[s.role]} />
      ))}
    </svg>
  )
}

export function SetupScreen() {
  const [v, setV] = useState<SetupValues>(() => loadSetupValues())
  // превью пересчитывается не чаще раза в 100 мс при движении ползунка
  const [shown, setShown] = useState(v)
  useEffect(() => {
    const t = setTimeout(() => setShown(v), 100)
    return () => clearTimeout(t)
  }, [v])
  const { seed, ...opts } = shown
  const info = useMemo(() => {
    const g = generateGalaxy(createRng(seed).fork('galaxy'), clampOptions(opts))
    return setupOf(g, clampOptions(opts))
  }, [seed, JSON.stringify(opts)])
  const set = (patch: Partial<SetupValues>) => setV((o) => ({ ...o, ...patch }))
  const create = () => {
    saveSetupValues(v)
    const { seed: s, ...o } = v
    location.search = '?' + setupQuery(s, o)
  }
  return (
    <div className="setup">
      <div className="panel setup-box">
        <header className="setup-title">ОРБИТА · галактика под заказ</header>
        <div className="setup-body">
          <div className="setup-controls">
            {SLIDERS.map((sl) => (
              <label key={sl.key} className="srow">
                <span className="muted">{sl.label}</span>
                <input
                  type="range"
                  min={SETUP[sl.key].min}
                  max={SETUP[sl.key].max}
                  step={sl.step}
                  value={v[sl.key]}
                  onChange={(e) => set({ [sl.key]: Number(e.target.value) })}
                />
                <span className="sval">{sl.show(v[sl.key])}</span>
              </label>
            ))}
            <div className="srow">
              <span className="muted">Юнитов на карте</span>
              <span className="seg setup-cap">
                {SETUP.unitCap.options.map((n) => (
                  <button key={n} className={v.unitCap === n ? 'on' : ''} onClick={() => set({ unitCap: n })}>
                    {n.toLocaleString('ru-RU')}
                  </button>
                ))}
              </span>
              <span />
            </div>
            <div className="srow">
              <span className="muted">Зерно</span>
              <input
                className="seedinput"
                type="number"
                min={1}
                value={v.seed}
                onChange={(e) => {
                  const n = Math.floor(Number(e.target.value))
                  if (n > 0) set({ seed: n })
                }}
              />
              <button onClick={() => set({ seed: Math.floor(Math.random() * 1_000_000) + 1 })}>другое зерно</button>
            </div>
          </div>
          <div className="setup-side">
            <Preview seed={shown.seed} opts={opts} />
            <div className="legend">
              {(Object.keys(ROLE_COLOR) as SystemRole[]).map((r) => (
                <span key={r}>
                  <i style={{ background: ROLE_COLOR[r] }} /> {ROLE_NAME[r]}
                </span>
              ))}
            </div>
            <div className="setup-result">
              {info.systems} систем · {info.inhabited} обитаемых · {info.civs} держав · {info.links} коридоров
            </div>
          </div>
        </div>
        <button className="setup-go" onClick={create}>
          Создать
        </button>
      </div>
    </div>
  )
}
