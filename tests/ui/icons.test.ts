import { readFileSync, readdirSync } from 'node:fs'
import { describe, expect, test } from 'vitest'
import { KIND_ICON, iconFor } from '../../src/ui/icons'

/** kind-ы, которые src/sim отдаёт в pushEvent напрямую; port/shipyard идут через переменную kind */
function simKinds(): Set<string> {
  const kinds = new Set<string>(['port', 'shipyard'])
  for (const f of readdirSync('src/sim')) {
    if (!f.endsWith('.ts')) continue
    const src = readFileSync(`src/sim/${f}`, 'utf8')
    for (const m of src.matchAll(/pushEvent\(w, \{\s*kind: '([a-z-]+)'/g)) kinds.add(m[1])
  }
  return kinds
}

describe('значки событий', () => {
  test('у каждого kind из src/sim есть значок', () => {
    const kinds = simKinds()
    expect(kinds.size).toBeGreaterThan(8)
    for (const k of kinds) expect(KIND_ICON[k], k).toBeDefined()
  })
  test('неизвестный kind получает запасной значок', () => {
    expect(iconFor('nope')).toBe('other')
  })
})
