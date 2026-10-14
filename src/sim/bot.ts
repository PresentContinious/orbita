import { BOT } from './config'
import { canAfford } from './economy'
import { execute, listOptions, score, type Option } from './options'
import type { Civ, World } from './types'

/** временный бот: покупает самый окупаемый вариант, на который хватает конверта и запаса */
export function decide(w: World, civ: Civ): Option | null {
  if (civ.eco.stage !== 'ok') return null
  const opts = listOptions(w, civ).filter(
    (o) => score(o) > 0 && civ.eco.envelopes[o.envelope] >= o.price && canAfford(civ, o.price, o.dUpkeep),
  )
  opts.sort((a, b) => score(b) - score(a))
  for (const o of opts) if (execute(w, civ, o)) return o
  return null
}

export function stepBots(w: World): void {
  for (const civ of w.civs) {
    if (w.t < civ.nextDecision) continue
    civ.nextDecision = w.t + w.rng.float(BOT.decideMin, BOT.decideMax)
    decide(w, civ)
  }
}
