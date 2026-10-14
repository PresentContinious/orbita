// Балансный прогон: npm run balance [зёрен=12] [минут=30]. Цели — раздел 12.2 спеки.
import { SIM_DT } from '../src/sim/config'
import { ledgerBalance, report } from '../src/sim/economy'
import { populatedOf } from '../src/sim/query'
import { createWorld, stepWorld } from '../src/sim/world'

const SEEDS = Number(process.argv[2] ?? 12)
const MINUTES = Number(process.argv[3] ?? 30)
const PURCHASES = ['colony', 'caravan', 'miner', 'station', 'infra', 'port', 'shipyard', 'research'] as const
const INVEST = ['station', 'infra', 'port', 'shipyard', 'research'] as const

interface SeedResult {
  seed: number
  civs: number
  twoPlanetsAt10: boolean
  corridorHits: number
  corridorSamples: number
  hoarders: number
  upkeepShares: number[]
  investSpend: number
  totalSpend: number
  crossColonies: number
  interTradeBy15: number
  leaderRatio: number
  bankrupt: number
  stepMs: number
  ledgerOk: boolean
}

function runSeed(seed: number): SeedResult {
  const w = createWorld(seed)
  const steps = Math.round((MINUTES * 60) / SIM_DT)
  const every = Math.round(10 / SIM_DT)
  const r: SeedResult = {
    seed, civs: w.civs.length, twoPlanetsAt10: false, corridorHits: 0, corridorSamples: 0, hoarders: 0, upkeepShares: [],
    investSpend: 0, totalSpend: 0, crossColonies: 0, interTradeBy15: 0, leaderRatio: 0, bankrupt: 0, stepMs: 0, ledgerOk: true,
  }
  const hoardSince = new Map<number, number>()
  const hoarders = new Set<number>()
  const bankrupt = new Set<number>()
  let lastEvent = 0
  let ms = 0
  for (let i = 1; i <= steps; i++) {
    const t0 = performance.now()
    stepWorld(w)
    ms += performance.now() - t0
    if (i % every !== 0) continue
    for (const e of w.events) {
      if (e.id <= lastEvent) continue
      if (e.kind === 'colony' && e.pri === 0) r.crossColonies++
      if (e.kind === 'trade-route' && e.t <= 900) r.interTradeBy15++
    }
    lastEvent = w.events.length ? Math.max(lastEvent, w.events[w.events.length - 1].id) : lastEvent
    for (const c of w.civs) {
      if (c.eco.stage === 'bankrupt') bankrupt.add(c.id)
      const rep = report(c)
      if (w.t >= 180) {
        r.corridorSamples++
        if (rep.reserveMin >= 0.5 && rep.reserveMin <= 4) r.corridorHits++
      }
      if (rep.reserveMin > 5) {
        const since = hoardSince.get(c.id) ?? w.t
        hoardSince.set(c.id, since)
        if (w.t - since > 120) hoarders.add(c.id)
      } else {
        hoardSince.delete(c.id)
      }
      if (w.t >= 600 && rep.grossPerMin > 0) r.upkeepShares.push(rep.upkeepPerMin / rep.grossPerMin)
    }
    if (Math.abs(w.t - 600) < SIM_DT) r.twoPlanetsAt10 = w.civs.every((c) => populatedOf(w, c).length >= 2)
  }
  const pops = w.civs.map((c) => populatedOf(w, c).reduce((s, p) => s + p.pop, 0)).sort((a, b) => b - a)
  r.leaderRatio = pops.length > 1 && pops[1] > 0 ? pops[0] / pops[1] : Infinity
  for (const c of w.civs) {
    for (const k of PURCHASES) r.totalSpend += c.eco.ledger.expense[k]
    for (const k of INVEST) r.investSpend += c.eco.ledger.expense[k]
    if (Math.abs(ledgerBalance(c) - c.treasury) > 1e-6 * Math.max(1, Math.abs(c.treasury)) + 1e-6) r.ledgerOk = false
  }
  r.hoarders = hoarders.size
  r.bankrupt = bankrupt.size
  r.stepMs = ms / steps
  return r
}

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b)
  return s.length ? s[Math.floor(s.length / 2)] : 0
}

const results: SeedResult[] = []
for (let s = 1; s <= SEEDS; s++) {
  const r = runSeed(s)
  results.push(r)
  console.log(
    `зерно ${s}: держав ${r.civs}, ≥2 планет к 10 мин: ${r.twoPlanetsAt10 ? 'да' : 'нет'}, колоний в чужих системах ${r.crossColonies}, ` +
      `трасс к 15 мин ${r.interTradeBy15}, лидер/второй ${r.leaderRatio.toFixed(2)}, банкротов ${r.bankrupt}, шаг ${r.stepMs.toFixed(2)} мс`,
  )
}

const all = results
const share = (n: number) => n / all.length
const checks: [string, boolean, string][] = [
  ['все стартовые державы с ≥ 2 планетами к 10-й мин', share(all.filter((r) => r.twoPlanetsAt10).length) >= 0.8, `${all.filter((r) => r.twoPlanetsAt10).length}/${all.length} зёрен (нужно ≥ 80%)`],
  ['запас казны 0.5–4 мин дохода', all.reduce((s, r) => s + r.corridorHits, 0) / Math.max(1, all.reduce((s, r) => s + r.corridorSamples, 0)) >= 0.7, `${((100 * all.reduce((s, r) => s + r.corridorHits, 0)) / Math.max(1, all.reduce((s, r) => s + r.corridorSamples, 0))).toFixed(0)}% времени (нужно ≥ 70%)`],
  ['никто не копит > 5 мин дохода дольше 120 с', all.every((r) => r.hoarders === 0), `${all.reduce((s, r) => s + r.hoarders, 0)} держав`],
  ['содержание / доход с 10-й мин — медиана 0.35–0.65', (() => { const m = median(all.flatMap((r) => r.upkeepShares)); return m >= 0.35 && m <= 0.65 })(), median(all.flatMap((r) => r.upkeepShares)).toFixed(2)],
  ['инвестиции ≥ 20% трат', all.reduce((s, r) => s + r.investSpend, 0) / Math.max(1, all.reduce((s, r) => s + r.totalSpend, 0)) >= 0.2, `${((100 * all.reduce((s, r) => s + r.investSpend, 0)) / Math.max(1, all.reduce((s, r) => s + r.totalSpend, 0))).toFixed(0)}%`],
  ['колония в чужой системе в каждой партии', all.every((r) => r.crossColonies >= 1), `${all.filter((r) => r.crossColonies >= 1).length}/${all.length}`],
  ['≥ 2 межсистемные трассы к 15-й мин в каждой партии', all.every((r) => r.interTradeBy15 >= 2), `${all.filter((r) => r.interTradeBy15 >= 2).length}/${all.length}`],
  ['лидер ≤ 2× второго к концу в ≥ 70% зёрен', share(all.filter((r) => r.leaderRatio <= 2).length) >= 0.7, `${all.filter((r) => r.leaderRatio <= 2).length}/${all.length}`],
  ['банкротов ≤ 30% держав', all.reduce((s, r) => s + r.bankrupt, 0) / all.reduce((s, r) => s + r.civs, 0) <= 0.3, `${all.reduce((s, r) => s + r.bankrupt, 0)}/${all.reduce((s, r) => s + r.civs, 0)}`],
  ['средний шаг ≤ 2 мс', all.every((r) => r.stepMs <= 2), `макс ${Math.max(...all.map((r) => r.stepMs)).toFixed(2)} мс`],
  ['журнал денег сходится', all.every((r) => r.ledgerOk), all.every((r) => r.ledgerOk) ? 'да' : 'НЕТ'],
]
console.log('\nИТОГ')
for (const [name, ok, value] of checks) console.log(`${ok ? 'OK  ' : 'FAIL'} ${name}: ${value}`)
process.exit(checks.every(([, ok]) => ok) ? 0 : 1)
