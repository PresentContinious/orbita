// Генератор случайной звёздной системы — новая карта каждую игру

const rand = (a, b) => a + Math.random() * (b - a)
const pick = (arr) => arr[(Math.random() * arr.length) | 0]

const SYL_A = ['Ал', 'Ве', 'Га', 'Дра', 'Зе', 'Ка', 'Ли', 'Ма', 'Не', 'Ор', 'Па', 'Ра', 'Се', 'Та', 'Фе', 'Эр', 'Юна', 'Ис']
const SYL_B = ['ра', 'но', 'ви', 'та', 'лу', 'ми', 'до', 'кс', 'ри', 'на', 'го', 'те', 'ла', 'зо']
const SYL_C = ['с', 'н', 'р', 'м', 'й', 'кс', 'нт', 'рий', 'дон', 'тис', 'лла', 'нда', 'ра', 'я']

export function genName() {
  let n = pick(SYL_A) + pick(SYL_B)
  if (Math.random() < 0.6) n += pick(SYL_C)
  return n
}

function hsl(h, s, l) {
  return `hsl(${Math.round(h)}, ${Math.round(s)}%, ${Math.round(l)}%)`
}

function makeLook(r) {
  // тип и палитра от размера
  if (r <= 10) {
    // каменистая
    const h = Math.random() < 0.5 ? rand(10, 50) : rand(180, 260)
    const s = rand(18, 55)
    return {
      type: 'каменистая планета',
      colors: [hsl(h, s, 78), hsl(h, s + 8, 48), hsl(h, s, 20)],
      glow: `hsla(${Math.round(h)}, 70%, 65%, 0.55)`,
      banded: false,
    }
  }
  if (r <= 16) {
    // ледяной гигант
    const h = rand(165, 230)
    return {
      type: 'ледяной гигант',
      colors: [hsl(h, 65, 85), hsl(h, 55, 55), hsl(h, 60, 22)],
      glow: `hsla(${Math.round(h)}, 75%, 65%, 0.5)`,
      banded: Math.random() < 0.3,
    }
  }
  // газовый гигант
  const h = Math.random() < 0.7 ? rand(20, 55) : rand(260, 320)
  return {
    type: 'газовый гигант',
    colors: [hsl(h, 55, 82), hsl(h, 50, 55), hsl(h, 55, 24)],
    glow: `hsla(${Math.round(h)}, 65%, 62%, 0.5)`,
    banded: true,
  }
}

export function generateSystem() {
  const count = 13 + ((Math.random() * 6) | 0) // 13–18 планет
  const planets = []
  let orbit = rand(120, 170)

  for (let i = 0; i < count; i++) {
    orbit += rand(95, 165) + orbit * 0.045

    // размер: мелких больше, гиганты ближе к середине-краю
    let r
    const roll = Math.random()
    if (roll < 0.45) r = rand(5, 9)
    else if (roll < 0.75) r = rand(9, 15)
    else r = rand(16, 26)
    r = Math.round(r * 10) / 10

    const look = makeLook(r)
    const name = genName()
    const temp = Math.round(420 - orbit * 0.28 + rand(-30, 30))

    planets.push({
      id: 'p' + i,
      name,
      type: look.type,
      r,
      orbit: Math.round(orbit),
      colors: look.colors,
      glow: look.glow,
      banded: look.banded,
      rings: look.banded && Math.random() < 0.4 ? { inner: 1.45, outer: 2.2, color: '#cdb27c' } : null,
      hasMoon: Math.random() < 0.25,
      stats: {
        'диаметр': `${Math.round(r * 1060).toLocaleString('ru-RU')} км`,
        'орбита': `${Math.round(orbit * 0.78)} млн км`,
        'температура': `${temp > 0 ? '+' : ''}${temp} °C`,
        'тип': look.type.split(' ')[0],
      },
      fact: null,
    })
  }

  // глыбы на окраине: не заселяются, богаты рудой — рай для шахтёров и пиратов
  const rocks = 4 + ((Math.random() * 3) | 0)
  for (let i = 0; i < rocks; i++) {
    orbit += rand(70, 130)
    const r = Math.round(rand(4.5, 6.5) * 10) / 10
    const h = rand(20, 40)
    planets.push({
      id: 'rock' + i,
      name: genName(),
      type: 'глыба',
      barren: true,
      r,
      orbit: Math.round(orbit),
      colors: [hsl(h, 10, 62), hsl(h, 12, 38), hsl(h, 10, 16)],
      glow: 'hsla(35, 20%, 60%, 0.35)',
      banded: false,
      rings: null,
      hasMoon: false,
      stats: {
        'диаметр': `${Math.round(r * 1060).toLocaleString('ru-RU')} км`,
        'орбита': `${Math.round(orbit * 0.78)} млн км`,
        'состав': 'руда и лёд',
        'жизнь': 'непригодна',
      },
      fact: null,
    })
  }
  return planets
}
