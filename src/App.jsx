import { Component, useEffect, useRef, useState } from 'react'
import { Engine } from './solar/engine.js'

// предохранитель: если что-то падает, показываем кнопку перезагрузки, а не чёрный экран
export class Boundary extends Component {
  constructor(props) {
    super(props)
    this.state = { err: null }
  }

  static getDerivedStateFromError(err) {
    return { err }
  }

  render() {
    if (this.state.err) {
      return (
        <div className="crash">
          <p className="crash-title">что-то сломалось</p>
          <p className="crash-msg">{String(this.state.err)}</p>
          <button className="intro-btn" onClick={() => window.location.reload()}>
            перезагрузить
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

const SPEEDS = [
  { label: '×1', value: 1 },
  { label: '×2', value: 2 },
  { label: '×5', value: 5 },
  { label: '×10', value: 10 },
]

const TOOLS = [
  { id: 'hand', icon: '🖐', label: 'рука', hint: 'колесо — зум · тяни — обзор · клик по планете — инфо · наведись на корабль — кто это' },
  { id: 'meteor', icon: '☄️', label: 'метеор', hint: 'зажми и протяни — пунктир покажет полёт. заведи помедленнее в круг планеты — станет спутником' },
  { id: 'rocket', icon: '🚀', label: 'ракета', hint: 'ядерка: доворачивает на цель и кружит, пока не попадёт. вырывает кусок планеты' },
  { id: 'rock', icon: '🪨', label: 'глыба', hint: 'тяжёлый астероид: летает вечно, бьёт страшно. запусти аккуратно — будет луной' },
  { id: 'hole', icon: '🕳️', label: 'дыра', hint: 'кликни в пустоту — дыра тянет через полсистемы и растёт от еды. ~16 секунд' },
]

const TACTIC_RU = {
  assault: 'генеральное наступление',
  defense: 'глухая оборона',
  raid: 'рейды по тылам',
  blockade: 'блокада',
}

const TITLE = 'ОРБИТА'

export default function App() {
  const canvasRef = useRef(null)
  const engineRef = useRef(null)
  const [intro, setIntro] = useState(true)
  const [leaving, setLeaving] = useState(false)
  const [, setSelectedId] = useState(null)
  const [speedIdx, setSpeedIdx] = useState(0)
  const [paused, setPaused] = useState(false)
  const [tool, setTool] = useState('hand')
  const [years, setYears] = useState(0)
  const [fps, setFps] = useState(60)
  const [ms, setMs] = useState({ l: 0, d: 0 })
  const [sunAlive, setSunAlive] = useState(true)
  const [deadCount, setDeadCount] = useState(0)
  const [mapInfo, setMapInfo] = useState({ planets: 0, rocks: 0, asts: 0 })
  const [events, setEvents] = useState([])
  const [sel, setSel] = useState(null)
  const [showDiplo, setShowDiplo] = useState(false)
  const [diplo, setDiplo] = useState([])

  useEffect(() => {
    const engine = new Engine(canvasRef.current, { onSelect: setSelectedId })
    engineRef.current = engine

    const timer = setInterval(() => {
      try {
        setYears(engine.simYears)
        setFps(Math.round(engine.fps))
        setMs({ l: engine.msLogic || 0, d: engine.msDraw || 0 })
        setSunAlive(engine.sunAlive)
        setDeadCount(engine.planets.filter((p) => !p.alive).length)
        setMapInfo({
          planets: engine.planets.filter((p) => !p.barren).length,
          rocks: engine.planets.filter((p) => p.barren).length,
          asts: engine.civ.asteroids.length,
        })
        setEvents([...engine.civ.events.slice(-9)])
        setDiplo(engine.civ.summary())
        const id = engine.selectedId
        if (id) {
          const p = engine.planets.find((q) => q.id === id)
          if (p && p.alive) {
            const st = p.owner ? engine.civ.stateById(p.owner) : null
            setSel({
              id: p.id,
              name: p.name,
              type: p.type,
              barren: !!p.barren,
              stats: p.stats || {},
              pop: p.pop || 0,
              popCap: p.baseR * 1.3,
              ownerName: st?.name || null,
              ownerColor: st?.color || null,
              pirate: st?.pirate || false,
              credits: st ? Math.round(st.credits) : 0,
              stOre: st ? Math.round(st.ore) : 0,
              ore: Math.round(p.oreRes || 0),
              outpost: !!p.outpost,
              yard: !!p.shipyard,
              yardB: p.yardBuildT > 0,
              unrest: Math.round(p.unrest || 0),
              unrestWhy: p.unrestWhy || null,
              ground: p.ground ? { name: engine.civ.stateById(p.ground.owner)?.name || '?', troops: p.ground.troops } : null,
              tactic: st?.tactic || null,
              pvoUnits: p.pvoUnits || 0,
              pvoReady: p.pvoReady || 0,
              building: p.pvoBuildT > 0,
            })
          } else {
            setSel(null)
          }
        } else {
          setSel(null)
        }
      } catch (err) {
        console.error('snapshot error:', err)
      }
    }, 180)

    return () => {
      clearInterval(timer)
      engine.destroy()
    }
  }, [])

  const togglePause = () => {
    setPaused((p) => {
      const next = !p
      if (engineRef.current) engineRef.current.paused = next
      return next
    })
  }

  const setSpeed = (i) => {
    setSpeedIdx(i)
    if (engineRef.current) engineRef.current.timeScale = SPEEDS[i].value
  }

  const pickTool = (id) => {
    setTool(id)
    engineRef.current?.setTool(id)
  }

  const dismissIntro = () => {
    setLeaving(true)
    setTimeout(() => setIntro(false), 950)
  }

  useEffect(() => {
    const onKey = (e) => {
      if (intro) return
      if (e.code === 'Space') {
        e.preventDefault()
        togglePause()
      } else if (e.code === 'Escape') {
        engineRef.current?.resetView()
      } else if (e.code === 'Digit1') {
        pickTool('hand')
      } else if (e.code === 'Digit2') {
        pickTool('meteor')
      } else if (e.code === 'Digit3') {
        pickTool('rocket')
      } else if (e.code === 'Digit4') {
        pickTool('rock')
      } else if (e.code === 'Digit5') {
        pickTool('hole')
      } else if (e.code === 'KeyD') {
        setShowDiplo((v) => !v)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [intro])

  const activeTool = TOOLS.find((t) => t.id === tool)
  const pvoSlots = sel
    ? [
        ...Array.from({ length: sel.pvoReady }, () => 'ready'),
        ...Array.from({ length: Math.max(sel.pvoUnits - sel.pvoReady, 0) }, () => 'reload'),
        ...(sel.building ? ['build'] : []),
      ]
    : []

  return (
    <div className="stage">
      <canvas ref={canvasRef} className="space" />
      <div className="vignette" />

      <header className={`hud-top ${intro ? 'is-hidden' : ''}`}>
        <div className="brand glass">
          <span className="brand-name">ОРБИТА</span>
          <span className="brand-sub">живая система: колонии · войны · пираты</span>
          <span className="brand-info">
            <span>планет {mapInfo.planets}</span>
            <i>|</i>
            <span>глыб {mapInfo.rocks}</span>
            <i>|</i>
            <span>астероидов {mapInfo.asts}</span>
          </span>
        </div>

        <div className="clock glass">
          <div>
            <span className="clock-label">прошло лет</span>
            <span className="clock-value">{years.toFixed(1)}</span>
          </div>
          <div>
            <span className="clock-label">fps</span>
            <span className={`clock-value fps-value ${fps < 40 ? 'low' : ''}`}>{fps}</span>
          </div>
          <div title="миллисекунды на кадр: логика / отрисовка">
            <span className="clock-label">лог/рнд</span>
            <span className="clock-value">{ms.l.toFixed(1)}/{ms.d.toFixed(1)}</span>
          </div>
          <div className="clock-sep" />
          <div className="controls">
            <button className={`ctrl ${paused ? 'active' : ''}`} onClick={togglePause} title="пауза — пробел">
              {paused ? '▶' : '❚❚'}
            </button>
            {SPEEDS.map((s, i) => (
              <button key={s.label} className={`ctrl ${i === speedIdx ? 'active' : ''}`} onClick={() => setSpeed(i)}>
                {s.label}
              </button>
            ))}
            <button className="ctrl" onClick={() => engineRef.current?.resetView()} title="вся карта — esc">
              ⌖
            </button>
            <button className="ctrl" onClick={() => engineRef.current?.newGame()} title="новая случайная карта">
              🎲
            </button>
            <button
              className={`ctrl ${showDiplo ? 'active' : ''}`}
              onClick={() => setShowDiplo((v) => !v)}
              title="дипломатия — D"
            >
              ◫
            </button>
          </div>
        </div>
      </header>

      <aside className={`toolbar glass ${intro ? 'is-hidden' : ''}`}>
        <div className="toolbar-head">РУКА БОГА</div>
        {TOOLS.map((t, i) => (
          <button
            key={t.id}
            className={`tool-btn ${tool === t.id ? 'active' : ''}`}
            onClick={() => pickTool(t.id)}
            title={t.hint}
          >
            <span className="tool-icon">{t.icon}</span>
            <span className="tool-label">{t.label}</span>
            <span className="tool-key">{i + 1}</span>
          </button>
        ))}
        <div className="toolbar-sep" />
        <button className="tool-btn" onClick={() => engineRef.current?.spawnRain()} title="метеоритный дождь">
          <span className="tool-icon">🌠</span>
          <span className="tool-label">дождь</span>
        </button>
        <button
          className={`tool-btn nova ${sunAlive ? '' : 'disabled'}`}
          onClick={() => engineRef.current?.supernova()}
          title={sunAlive ? 'взорвать Солнце. серьёзно' : 'Солнце уже взорвано'}
        >
          <span className="tool-icon">🌟</span>
          <span className="tool-label">нова</span>
        </button>
      </aside>

      {!intro && events.length > 0 && (
        <div className="feed glass">
          <div className="feed-head">ЛЕНТА СОБЫТИЙ</div>
          <div className="feed-list">
            {events.map((ev) => (
              <p
                className={`feed-item ${ev.imp ? 'imp' : ''} ${ev.x != null ? 'has-pos' : ''}`}
                key={ev.id}
                title={ev.x != null ? 'кликни — камера полетит к месту события' : undefined}
                onClick={() => {
                  if (ev.x != null) engineRef.current?.flyTo(ev.x, ev.y)
                }}
              >
                {ev.text}
              </p>
            ))}
          </div>
        </div>
      )}

      {showDiplo && !intro && (
        <aside className="diplo glass">
          <div className="diplo-head">
            <h3>дипломатия</h3>
            <button className="panel-close diplo-close" onClick={() => setShowDiplo(false)} aria-label="закрыть">
              ✕
            </button>
          </div>
          <p className="diplo-hint">&gt;55 союз · &lt;−45 война · стрелка — тренд · серым — причина · ⚔ счёт войны</p>
          <div className="diplo-list">
            {diplo.length === 0 && <p className="diplo-empty">цивилизаций не осталось</p>}
            {diplo.map((st) => (
              <div className="diplo-state" key={st.id}>
                <p className="diplo-name">
                  <span className="civ-dot" style={{ background: st.color, color: st.color }} />
                  {st.pirate ? '🏴‍☠️ ' : ''}
                  {st.name}
                </p>
                <p className="diplo-stats">
                  планет {st.planets} · людей {(st.pop * 1000) | 0} · кораблей {st.ships} · {st.credits} кр · ⛏ {st.ore}
                </p>
                {st.rels && st.rels.length > 0 ? (
                  <div className="diplo-relrows">
                    {st.rels.map((r) => (
                      <div className={`relrow ${r.war ? 'is-war' : r.ally ? 'is-ally' : ''}`} key={r.id}>
                        <span className="civ-dot" style={{ background: r.color, color: r.color }} />
                        <span className="relrow-name">{r.name}</span>
                        <b className="relrow-val">{r.value > 0 ? `+${r.value}` : r.value}</b>
                        <span className={`relrow-trend ${r.trend > 0.3 ? 'up' : r.trend < -0.3 ? 'down' : ''}`}>
                          {r.trend > 0.3 ? '↗' : r.trend < -0.3 ? '↘' : '·'}
                        </span>
                        {r.war && <span className="relrow-tag war">⚔ {r.score || ''}</span>}
                        {r.ally && <span className="relrow-tag ally">🤝</span>}
                        {(r.war ? r.casus : r.cause) && (
                          <span className="relrow-cause">{r.war ? r.casus : r.cause}</span>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  (st.wars.length > 0 || st.allies.length > 0) && (
                    <div className="diplo-rels">
                      {st.wars.map((n) => (
                        <span className="rel rel-war" key={'w' + n}>
                          ⚔ {n}
                        </span>
                      ))}
                      {st.allies.map((n) => (
                        <span className="rel rel-ally" key={'a' + n}>
                          🤝 {n}
                        </span>
                      ))}
                    </div>
                  )
                )}
                {st.tactic && <p className="diplo-tactic">◉ тактика: {TACTIC_RU[st.tactic] || st.tactic}</p>}
                {st.mobilized && !st.tactic && <p className="diplo-tactic">🪖 мобилизация</p>}
              </div>
            ))}
          </div>
        </aside>
      )}

      <nav className={`scorebar glass ${intro ? 'is-hidden' : ''}`}>
        {diplo.length === 0 && <span className="score-empty">жизни нет</span>}
        {diplo.map((st) => (
          <button
            key={st.id}
            className="score-btn"
            onClick={() => st.home && engineRef.current?._select(st.home)}
            title={`${st.name}: планет ${st.planets}, кораблей ${st.ships}, ${st.credits} кр, ⛏ ${st.ore} руды`}
          >
            <span className="civ-dot" style={{ background: st.color, color: st.color }} />
            <span className="score-name">
              {st.pirate ? '🏴‍☠️ ' : ''}
              {st.name}
            </span>
            <span className="score-pop">{(st.pop * 1000) | 0}</span>
            {st.wars.length > 0 && <span className="score-war">⚔ {st.wars.length}</span>}
          </button>
        ))}
        <span className="score-spacer" />
        {(deadCount > 0 || !sunAlive) && (
          <button className="revive" onClick={() => engineRef.current?.resetSystem()}>
            ⟲ {sunAlive ? `вернуть планеты (${deadCount})` : 'возродить систему'}
          </button>
        )}
      </nav>

      {!intro && !sel && <p className="hint">{activeTool.hint}</p>}

      {sel && (
        <aside className={`panel glass ${showDiplo ? 'with-diplo' : ''}`} key={sel.id}>
          <div className="panel-head">
            <h2 className="panel-name">{sel.name}</h2>
            {sel.ownerName && (
              <span className="owner-chip" style={{ color: sel.ownerColor }}>
                {sel.pirate ? '🏴‍☠️ ' : ''}
                {sel.ownerName}
              </span>
            )}
            <button className="panel-close" onClick={() => engineRef.current?.deselect()} aria-label="закрыть">
              ✕
            </button>
          </div>

          {sel.ownerName && (
            <div className="panel-section">
              <div className="pop-row">
                <span className="panel-section-label" style={{ margin: 0 }}>
                  население · s-кривая
                </span>
                <span className="pop-value">
                  {(sel.pop * 1000) | 0} <span>/ {(sel.popCap * 1000) | 0}</span>
                </span>
              </div>
              <div className="bar">
                <div className="bar-fill" style={{ width: `${Math.min(100, (sel.pop / sel.popCap) * 100)}%` }} />
              </div>
            </div>
          )}

          <div className="panel-section">
            <div className="kv">
              <span>тип</span>
              <b>{sel.type}</b>
            </div>
            {sel.outpost && (
              <div className="kv">
                <span>статус</span>
                <b className="hot">⛏ шахтёрский аванпост</b>
              </div>
            )}
            {(sel.yard || sel.yardB) && (
              <div className="kv">
                <span>верфь</span>
                <b className="hot">{sel.yard ? '🏗 действует' : '🏗 строится…'}</b>
              </div>
            )}
            {sel.ground && (
              <div className="kv">
                <span>наземные бои</span>
                <b style={{ color: 'var(--red)' }}>🪖 десант {sel.ground.name}: {(sel.ground.troops * 1000) | 0} чел</b>
              </div>
            )}
            {sel.unrest > 5 && (
              <div className="kv">
                <span>недовольство</span>
                <b style={{ color: sel.unrest > 60 ? 'var(--red)' : 'var(--amber)' }}>
                  {sel.unrest}%{sel.unrestWhy ? ` · ${sel.unrestWhy}` : ''}
                </b>
              </div>
            )}
            {(sel.ore > 0 || sel.barren) && (
              <div className="kv">
                <span>руда в недрах</span>
                <b>{sel.ore}</b>
              </div>
            )}
            {sel.ownerName && (
              <>
                <div className="kv">
                  <span>казна</span>
                  <b className="hot">{sel.credits} кр</b>
                </div>
                <div className="kv">
                  <span>руда государства</span>
                  <b className="hot">⛏ {sel.stOre}</b>
                </div>
                {sel.tactic && (
                  <div className="kv">
                    <span>тактика</span>
                    <b className="hot">{TACTIC_RU[sel.tactic] || sel.tactic}</b>
                  </div>
                )}
              </>
            )}
            {Object.entries(sel.stats).map(([k, v]) => (
              <div className="kv" key={k}>
                <span>{k}</span>
                <b>{v}</b>
              </div>
            ))}
          </div>

          {(sel.pvoUnits > 0 || sel.building) && (
            <div className="panel-section">
              <div className="panel-section-label">ПВО · установки</div>
              <div className="pvo-slots">
                {pvoSlots.map((s, i) => (
                  <span className={`pvo-slot ${s}`} key={i}>
                    {s === 'ready' ? '▲' : s === 'reload' ? '◌' : '✚'}
                  </span>
                ))}
              </div>
            </div>
          )}
          <div className="panel-pad-bottom" />
        </aside>
      )}

      {intro && (
        <div className={`intro ${leaving ? 'leaving' : ''}`}>
          <p className="intro-over">живая гравитационная песочница</p>
          <h1 className="intro-title" aria-label={TITLE}>
            {TITLE.split('').map((ch, i) => (
              <span key={i} style={{ animationDelay: `${0.25 + i * 0.08}s` }}>
                {ch}
              </span>
            ))}
          </h1>
          <p className="intro-sub">
            случайная система, в которой сама заводится жизнь: колонии, войны, караваны и пираты.
            <br />а у тебя — метеориты, ядерки и чёрные дыры. наблюдай или вмешивайся.
          </p>
          <button className="intro-btn" onClick={dismissIntro}>
            запустить систему
          </button>
        </div>
      )}
    </div>
  )
}
