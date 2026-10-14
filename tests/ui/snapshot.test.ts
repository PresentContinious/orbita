import { expect, test } from 'vitest'
import { Controller } from '../../src/app/controller'
import { createClock } from '../../src/app/loop'
import { createCamera } from '../../src/render/camera'
import { UiModel } from '../../src/ui/model'
import { buildSnapshot } from '../../src/ui/snapshot'
import { quietWorld, run } from '../helpers'

test('снимок для интерфейса: держав столько же, деньги и год берутся из мира', () => {
  const w = quietWorld(4815)
  run(w, 45)
  const c = new Controller(w, createCamera(), createClock(1), () => ({ width: 1600, height: 900 }))
  c.flyToGalaxy(true)
  const s = buildSnapshot(w, c, new UiModel())
  expect(s.seed).toBe(4815)
  expect(s.year).toBe(2)
  expect(s.civs.length).toBe(w.civs.length)
  expect(s.civs[0].name).toBe(w.civs[0].name)
  expect(s.civs[0].treasury).toBe(Math.round(w.civs[0].treasury))
  expect(s.civs[0].color).toMatch(/^#[0-9a-f]{6}$/)
  expect(s.crumbs.map((x) => x.label)).toEqual(['Галактика'])
})
