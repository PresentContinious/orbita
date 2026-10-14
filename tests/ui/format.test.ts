import { expect, test } from 'vitest'
import { fmtCredits, fmtDuration, fmtInt, fmtPop, fmtRate, hex, roman, yearOf } from '../../src/ui/format'

test('числа и подписи', () => {
  expect(fmtInt(8400)).toBe('8 400')
  expect(fmtInt(12)).toBe('12')
  expect(fmtPop(8.4)).toBe('8 400')
  expect(fmtRate(72)).toBe('+1.2 кр/с')
  expect(fmtRate(-24)).toBe('−0.4 кр/с')
  expect(fmtCredits(-1250)).toBe('−1 250 кр')
  expect(fmtDuration(Infinity)).toBe('∞')
  expect(fmtDuration(42)).toBe('42 с')
  expect(fmtDuration(150)).toBe('3 мин')
  expect(roman(2)).toBe('II')
  expect(yearOf(41)).toBe(2)
  expect(hex(0x5da8ff)).toBe('#5da8ff')
  expect(hex(0x00ff00)).toBe('#00ff00')
})

test('бесконечный и нечисловой запас казны не печатается как Infinity/NaN', () => {
  for (const v of [Infinity, -Infinity, NaN]) {
    const s = fmtDuration(v)
    expect(s).toBe('∞')
    expect(s).not.toMatch(/Infinity|NaN/)
  }
})
