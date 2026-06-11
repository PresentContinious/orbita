// Общие константы и хелперы цивилизаций

export const TAU = Math.PI * 2
export const SQ = 0.74

export const clamp = (v, a, b) => Math.min(b, Math.max(a, v))
export const rand = (a, b) => a + Math.random() * (b - a)
export const pick = (arr) => arr[(Math.random() * arr.length) | 0]
export const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y)

export const STATE_COLORS = ['#5da8ff', '#ff8a5c', '#7dd87d', '#e0c060', '#c98bff', '#5ce0d8', '#ff8fc8', '#a8c84d', '#8aa0ff', '#ffd07a']
export const PIRATE_COLOR = '#ff5555'

// Война при отношениях ниже, союз — выше
export const WAR_AT = -45
export const ALLY_AT = 55

export const SHIP = {
  transport: { hp: 60, speed: 60, cost: 60, label: 'транспорт' },
  dread: { hp: 420, speed: 30, cost: 320, label: 'дредноут' },
  fighter: { hp: 14, speed: 115, cost: 0, label: 'истребитель' },
  raider: { hp: 16, speed: 100, cost: 28, label: 'рейдер' },
  miner: { hp: 30, speed: 52, cost: 45, label: 'шахтёр' },
  escort: { hp: 24, speed: 108, cost: 22, label: 'эскорт' },
}

// сквозной счётчик id — единый для всех модулей
let uid = 1
export const nextId = () => uid++
