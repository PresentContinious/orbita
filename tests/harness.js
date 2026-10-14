// Прогон симуляции без браузера: движку нужен canvas и window, но рисовать мы не будем
import { vi } from 'vitest'
import { Engine } from '../src/solar/engine.js'

function stubCanvas() {
  return {
    clientWidth: 1600,
    clientHeight: 900,
    width: 0,
    height: 0,
    style: {},
    getContext: () => ({}),
    addEventListener() {},
    setPointerCapture() {},
  }
}

// детерминированный Math.random — одна и та же партия при каждом прогоне
export function seedRandom(seed) {
  let a = seed >>> 0
  vi.spyOn(Math, 'random').mockImplementation(() => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  })
}

export function makeEngine() {
  globalThis.window ??= { addEventListener() {}, removeEventListener() {}, devicePixelRatio: 1 }
  globalThis.requestAnimationFrame ??= () => 0
  const e = new Engine(stubCanvas())
  e.running = false
  return e
}

// крутим симуляцию кадрами: dt — реальная длина кадра, speed — множитель времени (×1, ×10, ×50)
export function run(e, simSeconds, { speed = 1, dt = 0.05 } = {}) {
  e.timeScale = speed
  const frames = Math.ceil(simSeconds / (dt * speed))
  for (let i = 0; i < frames; i++) e._update(dt)
}

// оставить в системе только указанные государства, остальные планеты — ничьи
export function onlyStates(c, ...keep) {
  for (const p of c.e.planets) {
    if (p.owner && !keep.some((s) => s.id === p.owner)) {
      p.owner = null
      p.pop = 0
      p.pvoUnits = 0
      p.pvoReady = 0
    }
  }
  c.states = keep
  c.ships = []
}

export function atWar(c, a, b) {
  c.setRel(a.id, b.id, -90)
  c.warSince[c.relKey(a.id, b.id)] = c.t - 100
}

// государство перестаёт принимать решения (чтобы проверять одно поведение за раз)
export function freeze(...states) {
  for (const st of states) {
    st.decideT = 1e9
    st.missileT = 1e9
    st.breakerT = 1e9
  }
}
