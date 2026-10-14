import { describe, expect, test } from 'vitest'
import { advance, alpha, createClock } from '../../src/app/loop'

describe('часы симуляции', () => {
  test('пауза — ни одного шага', () => {
    const c = createClock(0)
    expect(advance(c, 0.016, () => {})).toBe(0)
  })

  test('×1: кадр 0.25 с — 2 шага по 0.1, остаток 0.05', () => {
    const c = createClock(1)
    let n = 0
    expect(advance(c, 0.25, () => n++)).toBe(2)
    expect(n).toBe(2)
    expect(alpha(c)).toBeCloseTo(0.5)
  })

  test('×50 при 60 кадрах: 8 шагов за кадр', () => {
    const c = createClock(50)
    expect(advance(c, 1 / 60, () => {})).toBe(8)
  })

  test('вернулись из фоновой вкладки: кадр 30 с обрезается до 0.25 с', () => {
    const c = createClock(1)
    expect(advance(c, 30, () => {})).toBe(2)
  })

  test('больше 60 шагов за кадр не делаем, лишнее время отбрасываем', () => {
    const c = createClock(50)
    expect(advance(c, 0.25, () => {})).toBe(60)
    expect(c.acc).toBe(0)
  })
})
