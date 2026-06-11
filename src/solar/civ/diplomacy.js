// Дипломатия: отношения, дрейф, войны и союзы, появление пиратов

import { genName } from '../gen.js'
import { clamp, rand, pick, WAR_AT, ALLY_AT } from './constants.js'

export const relKey = (a, b) => (a < b ? `${a}:${b}` : `${b}:${a}`)

export function getRel(civ, a, b) {
  if (a === b) return 100
  return civ.rel[relKey(a, b)] ?? 0
}

export function setRel(civ, a, b, v) {
  civ.rel[relKey(a, b)] = clamp(v, -100, 100)
}

// при смерти государства вычищаем его дипломатические следы
export function purgeRelations(civ, id) {
  for (const key of Object.keys(civ.rel)) {
    const [a, b] = key.split(':')
    if (+a === id || +b === id) delete civ.rel[key]
  }
  for (const key of Object.keys(civ.warSince)) {
    const [a, b] = key.split(':')
    if (+a === id || +b === id) delete civ.warSince[key]
  }
}

export function isWar(civ, a, b) {
  const sa = civ.stateById(a)
  const sb = civ.stateById(b)
  if (!sa || !sb) return false
  if (sa.pirate !== sb.pirate) return true // пираты вне закона всегда
  return getRel(civ, a, b) < WAR_AT
}

export function isAlly(civ, a, b) {
  return a !== b && getRel(civ, a, b) > ALLY_AT
}

export function diplomacyDrift(civ, h) {
  civ.relTick -= h
  if (civ.relTick > 0) return
  civ.relTick = 6
  const civs = civ.states.filter((s) => !s.pirate)
  for (let i = 0; i < civs.length; i++) {
    for (let j = i + 1; j < civs.length; j++) {
      const a = civs[i]
      const b = civs[j]
      const key = relKey(a.id, b.id)
      const cur = getRel(civ, a.id, b.id)
      const atWar = cur < WAR_AT
      let drift = atWar ? rand(-1.5, 1.5) : rand(-4, 4)
      // активная торговля сближает
      if (civ.ships.some((s) => s.mission?.type === 'trade' && ((s.mission.a === a.id && s.mission.b === b.id) || (s.mission.a === b.id && s.mission.b === a.id)))) drift += 2
      // дипломатический иммунитет новорождённых: 60 секунд их не трогают
      const young = civ.t - (a.bornT ?? 0) < 60 || civ.t - (b.bornT ?? 0) < 60
      // сильный смотрит на слабого как на обед
      const pa = civ.popOf(a)
      const pb = civ.popOf(b)
      if (!atWar && !young && Math.max(pa, pb) > Math.min(pa, pb) * 2.3 + 0.5) drift -= 2.5
      let next = clamp(cur + drift, -100, 100)
      if (!atWar && young) next = Math.max(next, WAR_AT + 4)

      const wasWar = atWar
      let isWarNow = next < WAR_AT
      // войну так просто не закончить: минимум 45 секунд
      if (wasWar && !isWarNow && civ.t - (civ.warSince[key] ?? 0) < 45) {
        next = WAR_AT - 3
        isWarNow = true
      }
      setRel(civ, a.id, b.id, next)

      if (!wasWar && isWarNow) {
        // объявление войны — это всерьёз
        setRel(civ, a.id, b.id, Math.min(next, -65))
        civ.warSince[key] = civ.t
        civ.log(`⚔️ ${a.name} и ${b.name} объявили войну!`)
        maybeSpawnPirates(civ)
        // оборонительные союзы: за союзника вступаются
        for (const c of civs) {
          if (c.id === a.id || c.id === b.id) continue
          if (isAlly(civ, c.id, b.id) && !isWar(civ, c.id, a.id)) {
            setRel(civ, c.id, a.id, -60)
            civ.warSince[relKey(c.id, a.id)] = civ.t
            civ.log(`🛡 ${c.name} вступается за союзника ${b.name}!`)
          }
          if (isAlly(civ, c.id, a.id) && !isWar(civ, c.id, b.id)) {
            setRel(civ, c.id, b.id, -60)
            civ.warSince[relKey(c.id, b.id)] = civ.t
            civ.log(`🛡 ${c.name} вступается за союзника ${a.name}!`)
          }
        }
      } else if (wasWar && !isWarNow) {
        delete civ.warSince[key]
        civ.log(`🕊 ${a.name} и ${b.name} заключили мир`)
      } else if (cur <= ALLY_AT && next > ALLY_AT) {
        civ.log(`🤝 ${a.name} и ${b.name} заключили альянс`)
      }
    }
  }
}

export function maybeSpawnPirates(civ) {
  if (civ.states.some((s) => s.pirate)) return
  if (Math.random() > 0.4) return
  // гнездо — на глыбе на окраине; если глыб нет, сойдёт мелкая планета
  const rocks = civ.e.planets.filter((p) => p.alive && !p.owner && p.barren)
  const small = rocks.length ? rocks : civ.e.planets.filter((p) => p.alive && !p.owner && p.baseR <= 8)
  if (!small.length) return
  const den = pick(small)
  civ._makeState(den, 0.3, { pirate: true, name: 'Вольница ' + genName(), credits: 50 })
  civ.log(`🏴‍☠️ на ${den.name} завелись пираты!`)
}
