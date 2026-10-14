import type { Rng } from './rng'

// Слоги из старой ОРБИТЫ
const SYL_A = ['Ал', 'Ве', 'Га', 'Дра', 'Зе', 'Ка', 'Ли', 'Ма', 'Не', 'Ор', 'Па', 'Ра', 'Се', 'Та', 'Фе', 'Эр', 'Юна', 'Ис']
const SYL_B = ['ра', 'но', 'ви', 'та', 'лу', 'ми', 'до', 'кс', 'ри', 'на', 'го', 'те', 'ла', 'зо']
const SYL_C = ['с', 'н', 'р', 'м', 'й', 'кс', 'нт', 'рий', 'дон', 'тис', 'лла', 'нда', 'ра', 'я']

export function genName(rng: Rng): string {
  let n = rng.pick(SYL_A) + rng.pick(SYL_B)
  if (rng.chance(0.6)) n += rng.pick(SYL_C)
  return n
}

/** имя, которого ещё нет в used; добавляет его туда */
export function uniqueName(rng: Rng, used: Set<string>): string {
  for (let i = 0; i < 50; i++) {
    const n = genName(rng)
    if (!used.has(n)) {
      used.add(n)
      return n
    }
  }
  const n = `${genName(rng)}-${used.size + 1}`
  used.add(n)
  return n
}
