// Нагрузка: npm run stress — 2000 кораблей, 600 в одной системе; цель — шаг ≤ 6 мс
import { spawnStressShips } from '../src/sim/stress'
import { createWorld, stepWorld } from '../src/sim/world'

const w = createWorld(1)
spawnStressShips(w, 2000, 600)
for (let i = 0; i < 50; i++) stepWorld(w)
const times: number[] = []
for (let i = 0; i < 600; i++) {
  const t0 = performance.now()
  stepWorld(w)
  times.push(performance.now() - t0)
}
times.sort((a, b) => a - b)
const avg = times.reduce((s, x) => s + x, 0) / times.length
const p95 = times[Math.floor(times.length * 0.95)]
console.log(`кораблей: ${w.ships.length}; шаг: в среднем ${avg.toFixed(2)} мс, 95% ≤ ${p95.toFixed(2)} мс (цель ≤ 6 мс)`)
process.exit(avg <= 6 ? 0 : 1)
