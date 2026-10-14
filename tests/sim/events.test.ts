import { describe, expect, test } from 'vitest'
import { pushEvent } from '../../src/sim/events'
import { quietWorld } from '../helpers'

describe('pushEvent', () => {
  test('P2 одного вида и участников за 20 с склеиваются', () => {
    const w = quietWorld(1)
    pushEvent(w, { kind: 'x', pri: 2, text: 'одна', textMany: (n) => `всего ${n}`, civs: [1], at: { system: 0 } })
    w.t = 10
    const ev = pushEvent(w, { kind: 'x', pri: 2, text: 'одна', textMany: (n) => `всего ${n}`, civs: [1], at: { system: 0 } })
    expect(w.events.length).toBe(1)
    expect(ev.count).toBe(2)
    expect(ev.text).toBe('всего 2')
  })

  test('другие участники, P0 и старые события не склеиваются', () => {
    const w = quietWorld(1)
    const many = (n: number) => `${n}`
    pushEvent(w, { kind: 'x', pri: 2, text: 'a', textMany: many, civs: [1], at: { system: 0 } })
    pushEvent(w, { kind: 'x', pri: 2, text: 'b', textMany: many, civs: [2], at: { system: 0 } })
    pushEvent(w, { kind: 'x', pri: 0, text: 'c', civs: [1], at: { system: 0 } })
    pushEvent(w, { kind: 'x', pri: 0, text: 'd', civs: [1], at: { system: 0 } })
    w.t = 25
    pushEvent(w, { kind: 'x', pri: 2, text: 'e', textMany: many, civs: [1], at: { system: 0 } })
    expect(w.events.map((e) => e.text)).toEqual(['a', 'b', 'c', 'd', 'e'])
  })

  test('журнал не длиннее 500', () => {
    const w = quietWorld(1)
    for (let i = 0; i < 700; i++) pushEvent(w, { kind: 'x', pri: 1, text: String(i), civs: [], at: { system: 0 } })
    expect(w.events.length).toBe(500)
    expect(w.events[0].text).toBe('200')
  })
})
