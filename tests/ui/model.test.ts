import { describe, expect, test } from 'vitest'
import type { GameEvent } from '../../src/sim/types'
import { TrendTracker, updateToasts } from '../../src/ui/model'

const ev = (id: number, pri: 0 | 1 | 2): GameEvent => ({ id, t: 0, kind: 'x', pri, text: String(id), civs: [], at: { system: 0 }, count: 1 })

describe('всплывающие события', () => {
  test('новые P0/P1 появляются, P2 — нет; живут 8 и 5 с', () => {
    const r = updateToasts([], [ev(1, 0), ev(2, 1), ev(3, 2)], 0, 100)
    expect(r.toasts.map((t) => [t.ev.id, t.until])).toEqual([[1, 108], [2, 105]])
    expect(r.lastId).toBe(3)
    expect(updateToasts(r.toasts, [], r.lastId, 106).toasts.map((t) => t.ev.id)).toEqual([1])
  })

  test('не больше трёх; лишние P1 вытесняются раньше P0', () => {
    const r = updateToasts([], [ev(1, 0), ev(2, 1), ev(3, 1), ev(4, 1)], 0, 0)
    expect(r.toasts.map((t) => t.ev.id)).toEqual([1, 3, 4])
  })

  test('уже показанные события не повторяются', () => {
    const r = updateToasts([], [ev(1, 1)], 0, 0)
    expect(updateToasts([], [ev(1, 1)], r.lastId, 1).toasts).toEqual([])
  })
})

describe('тренд населения', () => {
  test('сравнивает с замером 30-секундной давности, порог 2%', () => {
    const tr = new TrendTracker()
    expect(tr.trend(1, 10, 0)).toBe(0)
    expect(tr.trend(1, 10.1, 10)).toBe(0)
    expect(tr.trend(1, 10.3, 20)).toBe(0)
    expect(tr.trend(1, 10.5, 30)).toBe(1)
    expect(tr.trend(2, 10, 0)).toBe(0)
    expect(tr.trend(2, 9.5, 30)).toBe(-1)
  })
})
