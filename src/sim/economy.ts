import { ECON, ENVELOPE_SHARES } from './config'
import type { CivEconomy } from './types'

export function newEconomy(start: number): CivEconomy {
  return {
    ledger: {
      start,
      income: { tax: 0, trade: 0, tradePartner: 0, mining: 0, station: 0, refund: 0 },
      expense: { colony: 0, caravan: 0, miner: 0, station: 0, infra: 0, port: 0, shipyard: 0, research: 0, upkeep: 0, admin: 0 },
    },
    envelopes: {
      expand: start * ENVELOPE_SHARES.expand,
      develop: start * ENVELOPE_SHARES.develop,
      trade: start * ENVELOPE_SHARES.trade,
      reserve: start * ENVELOPE_SHARES.reserve,
    },
    stage: 'ok',
    grossEma: 0,
    upkeepEma: 0,
    tradeEma: 0,
    earnedStep: 0,
    upkeepStep: 0,
    tradeStep: 0,
    deficitSince: null,
    positiveSince: null,
    lastDecommission: -ECON.bankruptEvery,
  }
}
