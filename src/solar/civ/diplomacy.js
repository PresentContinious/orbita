// Дипломатия: отношения по причинам (не случайный дрейф), войны с поводом и счётом,
// мир с условиями (уступка планеты / контрибуция), альянсы, появление пиратов

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
  for (const store of [civ.rel, civ.warSince, civ.wars, civ.relCauses, civ.relTrend, civ.truce, civ.incidents]) {
    for (const key of Object.keys(store)) {
      const [a, b] = key.split(':')
      if (+a === id || +b === id) delete store[key]
    }
  }
}

export function isWar(civ, a, b) {
  const sa = civ.stateById(a)
  const sb = civ.stateById(b)
  if (!sa || !sb) return false
  if (sa.pirate !== sb.pirate) return true // пираты вне закона всегда
  // война — это запись с поводом и счётом, а не просто плохие отношения:
  // иначе инцидент, уронивший отношения между дип-тиками, рождал «войну без объявления»
  return !!civ.wars[relKey(a, b)]
}

export function isAlly(civ, a, b) {
  return a !== b && getRel(civ, a, b) > ALLY_AT
}

// объявление войны с поводом: снап отношений, запись счёта, оборонительные союзы
export function declareWar(civ, aggId, defId, casus) {
  const key = relKey(aggId, defId)
  setRel(civ, aggId, defId, Math.min(getRel(civ, aggId, defId), -65))
  civ.warSince[key] = civ.t
  // intelA/intelB — ошибка разведки каждой стороны о силе противника на всю войну
  civ.wars[key] = { a: Math.min(aggId, defId), b: Math.max(aggId, defId), since: civ.t, casus, scoreA: 0, scoreB: 0, intelA: rand(0.65, 1.45), intelB: rand(0.65, 1.45) }
  const agg = civ.stateById(aggId)
  const def = civ.stateById(defId)
  const home = civ.planetById(agg?.home)
  civ.log(`⚔️ ${agg?.name || '?'} объявляет войну ${def?.name || '?'} — повод: ${casus}`, { x: home?.x, y: home?.y, imp: true })
  maybeSpawnPirates(civ)
  // оборонительные союзы: за союзника вступаются
  for (const c of civ.states) {
    if (c.pirate || c.id === aggId || c.id === defId) continue
    if (isAlly(civ, c.id, defId) && !isWar(civ, c.id, aggId)) {
      const k2 = relKey(c.id, aggId)
      setRel(civ, c.id, aggId, -60)
      civ.warSince[k2] = civ.t
      civ.wars[k2] = { a: Math.min(c.id, aggId), b: Math.max(c.id, aggId), since: civ.t, casus: 'союзный долг', scoreA: 0, scoreB: 0, intelA: rand(0.65, 1.45), intelB: rand(0.65, 1.45) }
      civ.log(`🛡 ${c.name} вступается за союзника ${def?.name || '?'}!`, { imp: true })
    }
    if (isAlly(civ, c.id, aggId) && !isWar(civ, c.id, defId)) {
      const k2 = relKey(c.id, defId)
      setRel(civ, c.id, defId, -60)
      civ.warSince[k2] = civ.t
      civ.wars[k2] = { a: Math.min(c.id, defId), b: Math.max(c.id, defId), since: civ.t, casus: 'союзный долг', scoreA: 0, scoreB: 0, intelA: rand(0.65, 1.45), intelB: rand(0.65, 1.45) }
      civ.log(`🛡 ${c.name} вступается за союзника ${agg?.name || '?'}!`, { imp: true })
    }
  }
}

// очко в счёт войны между двумя государствами (если они реально воюют)
export function addWarScore(civ, winnerId, loserId, pts) {
  const war = civ.wars[relKey(winnerId, loserId)]
  if (!war) return
  if (winnerId === war.a) war.scoreA += pts
  else war.scoreB += pts
}

// мир: по счёту войны решаются условия — решительный победитель забирает
// приграничную планету или контрибуцию, при ничьей просто тишина
export function makePeace(civ, aId, bId, reason) {
  const key = relKey(aId, bId)
  const war = civ.wars[key]
  delete civ.warSince[key]
  delete civ.wars[key]
  setRel(civ, aId, bId, -10)
  // перемирие: сразу после мира те же двое снова не сцепятся
  civ.truce[key] = civ.t + 75
  const A = civ.stateById(aId)
  const B = civ.stateById(bId)
  if (!A || !B) return
  if (war) {
    const lead = war.scoreA - war.scoreB
    const winner = lead > 0 ? civ.stateById(war.a) : civ.stateById(war.b)
    const loser = lead > 0 ? civ.stateById(war.b) : civ.stateById(war.a)
    if (winner && loser && Math.abs(lead) >= 25) {
      // решительная победа: проигравший уступает планету, ближайшую к победителю
      const lPlanets = civ.planetsOf(loser).filter((p) => p.id !== loser.home)
      const wHome = civ.planetById(winner.home)
      if (lPlanets.length && wHome) {
        lPlanets.sort((p, q) => Math.hypot(p.x - wHome.x, p.y - wHome.y) - Math.hypot(q.x - wHome.x, q.y - wHome.y))
        const ceded = lPlanets[0]
        ceded.owner = winner.id
        ceded.pvoUnits = 1
        ceded.pvoReady = 1
        ceded.pvoReload = []
        ceded.pvoBuildT = 0
        civ.log(`📜 мир ${winner.name} — ${loser.name}: побеждённый уступает ${ceded.name}`, { x: ceded.x, y: ceded.y, imp: true })
        return
      }
      // отдавать нечего — платит контрибуцию
      const tribute = Math.min(Math.round(Math.max(loser.credits, 0) * 0.4), 250)
      if (tribute > 0) {
        loser.credits -= tribute
        winner.credits += tribute
        civ.log(`📜 мир ${winner.name} — ${loser.name}: контрибуция ${tribute} кр`, { imp: true })
        return
      }
    }
  }
  civ.log(`🕊 ${A.name} и ${B.name} заключили мир — ${reason}`)
}

// Отношения двигаются ПРИЧИНАМИ, а не случайностью: торговля и общий враг сближают,
// аппетит сильного, страх перед гегемоном, тесные границы и союзы с врагами — ссорят.
// Главная отрицательная причина становится поводом войны и видна в UI.
export function diplomacyDrift(civ, h) {
  civ.relTick -= h
  if (civ.relTick > 0) return
  civ.relTick = 6
  const civs = civ.states.filter((s) => !s.pirate)
  const totalPop = civs.reduce((s, c) => s + civ.popOf(c), 0) || 1
  for (let i = 0; i < civs.length; i++) {
    for (let j = i + 1; j < civs.length; j++) {
      const a = civs[i]
      const b = civs[j]
      const key = relKey(a.id, b.id)
      const cur = getRel(civ, a.id, b.id)
      const atWar = !!civ.wars[key] // статус войны — по записи, не по цифре отношений
      const young = civ.t - (a.bornT ?? 0) < 60 || civ.t - (b.bornT ?? 0) < 60
      const causes = []
      // лёгкий шум настроения — погоду делают причины ниже
      causes.push({ text: '', val: rand(-1.1, 1.1) })

      const pa = civ.popOf(a)
      const pb = civ.popOf(b)

      if (!atWar) {
        // активная торговля сближает
        if (civ.ships.some((s) => s.mission?.type === 'trade' && ((s.mission.a === a.id && s.mission.b === b.id) || (s.mission.a === b.id && s.mission.b === a.id))))
          causes.push({ text: 'торговый маршрут', val: 2.2 })
        // общий враг объединяет
        if (civs.some((c) => c.id !== a.id && c.id !== b.id && isWar(civ, a.id, c.id) && isWar(civ, b.id, c.id)))
          causes.push({ text: 'общий враг', val: 1.8 })
        // сильный смотрит на слабого как на обед
        if (!young && Math.max(pa, pb) > Math.min(pa, pb) * 2.3 + 0.5)
          causes.push({ text: 'аппетит сильного к слабому', val: -2.4 })
        // гегемона боятся все, и коалиции зреют сами
        if (civs.length >= 3 && (pa > totalPop * 0.45 || pb > totalPop * 0.45))
          causes.push({ text: 'страх перед гегемоном', val: -1.6 })
        // тесные орбиты — пограничный спор, но не вечная вендетта
        const ha = civ.planetById(a.home)
        const hb = civ.planetById(b.home)
        if (ha && hb && Math.abs(ha.orbit - hb.orbit) < 170)
          causes.push({ text: 'спор за приграничные орбиты', val: -0.8 })
        // друг моего врага — мой враг
        if (civs.some((c) => c.id !== a.id && c.id !== b.id && ((isWar(civ, a.id, c.id) && isAlly(civ, b.id, c.id)) || (isWar(civ, b.id, c.id) && isAlly(civ, a.id, c.id)))))
          causes.push({ text: 'союз с врагом', val: -1.7 })
        // свежие инциденты (шахтёры в чужой зоне и прочие обиды)
        const inc = civ.incidents[key]
        if (inc && civ.t < inc.until) causes.push({ text: inc.text, val: inc.val })
      } else {
        // война изматывает — со временем обе стороны ищут выход
        const dur = civ.t - (civ.warSince[key] ?? civ.t)
        if (dur > 90) causes.push({ text: 'усталость от войны', val: 1.7 })
        if (dur > 180) causes.push({ text: 'война всем надоела', val: 2.2 })
      }

      const drift = causes.reduce((s, c) => s + c.val, 0)
      let next = clamp(cur + drift, -100, 100)
      // дипломатический иммунитет новорождённых: 60 секунд их не трогают
      if (!atWar && young) next = Math.max(next, WAR_AT + 4)
      // действующее перемирие удерживает от новой войны
      if (!atWar && civ.truce[key] && civ.t < civ.truce[key]) next = Math.max(next, WAR_AT + 4)

      const wasWar = atWar
      let isWarNow = next < WAR_AT
      // войну так просто не закончить: минимум 75 секунд
      if (wasWar && !isWarNow && civ.t - (civ.warSince[key] ?? 0) < 75) {
        next = WAR_AT - 3
        isWarNow = true
      }
      setRel(civ, a.id, b.id, next)
      civ.relCauses[key] = causes.filter((c) => c.text).sort((x, y) => Math.abs(y.val) - Math.abs(x.val))
      civ.relTrend[key] = next - cur

      if (!wasWar && isWarNow) {
        // повод — самая весомая из накопившихся обид; агрессор — кто сильнее
        const casus = civ.relCauses[key].filter((c) => c.val < 0)[0]?.text || 'старые обиды'
        const agg = pa >= pb ? a : b
        const def = agg === a ? b : a
        declareWar(civ, agg.id, def.id, casus)
      } else if (wasWar && !isWarNow) {
        // решающий победитель посреди наступления мир не подписывает — добивает:
        // «мы устали» не работает, пока у планет проигравшего стоит его флот
        const war = civ.wars[key]
        const lead = war ? war.scoreA - war.scoreB : 0
        const loser = Math.abs(lead) >= 25 ? civ.stateById(lead > 0 ? war.b : war.a) : null
        if (loser && civ.planetsOf(loser).some((p) => p.siegeMark)) {
          setRel(civ, a.id, b.id, WAR_AT - 3)
        } else {
          makePeace(civ, a.id, b.id, 'переговоры сторон')
        }
      } else if (cur <= ALLY_AT && next > ALLY_AT) {
        civ.log(`🤝 ${a.name} и ${b.name} заключили альянс`, { imp: true })
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
  civ.log(`🏴‍☠️ на ${den.name} завелись пираты!`, { x: den.x, y: den.y })
}
