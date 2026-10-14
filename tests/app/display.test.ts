import { describe, expect, test } from 'vitest'
import { DEFAULT_DISPLAY, resolveDisplay } from '../../src/app/display'

describe('настройки вида', () => {
  test('без сохранённого и без URL — умолчания', () => {
    expect(resolveDisplay(null, '')).toEqual(DEFAULT_DISPLAY)
  })

  test('сохранённое применяется, мусор игнорируется', () => {
    expect(resolveDisplay({ territory: 'clouds', planets: 'contrast', trade: false }, '')).toEqual({ territory: 'clouds', planets: 'contrast', trade: false })
    expect(resolveDisplay({ territory: 'zzz', planets: 42, trade: 'yes' }, '')).toEqual(DEFAULT_DISPLAY)
  })

  test('URL перекрывает сохранённое; старые a/b понимаются', () => {
    expect(resolveDisplay({ territory: 'off' }, '?territory=b&planets=b&trade=0')).toEqual({ territory: 'clouds', planets: 'contrast', trade: false })
    expect(resolveDisplay(null, '?territory=a&planets=a').territory).toBe('zones')
    expect(resolveDisplay(null, '?territory=off').territory).toBe('off')
  })
})
