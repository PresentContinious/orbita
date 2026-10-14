// Арена без экрана: npm run arena -- "A=3bb,1cv B=2bb,2ff" --n 20 --terrain orbit --steps 3000 --seed 1
import { createArena, parseArena, runArena, type ArenaResult } from '../src/sim/arena'

const args = process.argv.slice(2)
const flag = (name: string, def: string): string => {
  const i = args.indexOf('--' + name)
  return i >= 0 && args[i + 1] !== undefined ? args[i + 1] : def
}

if (args[0] === 'pairs') {
  console.log('pairs: балансные пары появятся в задаче 14')
  process.exit(0)
}

const comp = args[0] && !args[0].startsWith('--') ? args[0] : 'A=3bb B=3bb'
const q = new URLSearchParams(comp.trim().split(/\s+/).join('&'))
const terrain = flag('terrain', q.get('terrain') ?? 'empty')
q.set('terrain', terrain)
const n = Number(flag('n', '1'))
const steps = Number(flag('steps', '3000'))
const seed0 = Number(flag('seed', q.get('seed') ?? '1'))

const results: ArenaResult[] = []
for (let i = 0; i < n; i++) {
  q.set('seed', String(seed0 + i))
  const t0 = performance.now()
  const r = runArena(createArena(parseArena(q)), steps)
  results.push(r)
  console.log(
    `зерно ${seed0 + i}: бой ${r.battleId ?? '-'}; живых ${r.alive[0]}:${r.alive[1]}; потери ${r.losses[0]}:${r.losses[1]}; ` +
      `дистанция корпусов ${r.minHullDist.toFixed(1)} (х${r.minHullRatio.toFixed(2)}); капитальные ${r.minCapitalDist.toFixed(1)}; push-out ${r.pushOuts}; вне слота ${(r.capitalOffSlotT * 100).toFixed(1)}%; нарушений скорости ${r.minSpeedViolations}; ${(performance.now() - t0).toFixed(0)} мс`,
  )
  if (r.metrics) {
    const m = r.metrics
    console.log(
      `  фаза ${r.phase}; факторы [${r.factors.join(', ')}]; ракет ${m.missilesFired}/${m.missilesHit}; ` +
        `давление ×${m.pressureFlips}; лидер на 60 с ${m.leaderAt60 === null ? '-' : m.leaderAt60 === 0 ? 'A' : 'B'}; тишина ≤ ${m.maxQuiet.toFixed(0)} с; смен D* ${m.dStarChanges}; ` +
        `первый корвет погиб ${m.corvetteFirstDeathT === null ? '-' : m.corvetteFirstDeathT.toFixed(0) + ' с'}`,
    )
    if (r.verdict) console.log('  вердикт: ' + r.verdict)
  }
}
const avg = (f: (r: ArenaResult) => number): number => results.reduce((s, r) => s + f(r), 0) / results.length
console.log(
  `итог (${n}): потери A ${avg((r) => r.losses[0]).toFixed(0)}, B ${avg((r) => r.losses[1]).toFixed(0)}; ` +
    `мин. дистанция ${Math.min(...results.map((r) => r.minHullDist)).toFixed(1)}, отношение к 2 длинам меньшего ${Math.min(...results.map((r) => r.minHullRatio)).toFixed(2)}; push-out макс ${Math.max(...results.map((r) => r.pushOuts))}`,
)
