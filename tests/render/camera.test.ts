import { describe, expect, test } from 'vitest'
import {
  createCamera, flyDuration, galaxyZoom, lodOf, screenToWorld, startFly, updateCamera, worldToScreen, zoomAt,
} from '../../src/render/camera'
import { createWorld } from '../../src/sim/world'

describe('камера', () => {
  const view = { width: 800, height: 600 }

  test('мир ↔ экран', () => {
    const cam = { ...createCamera(), x: 100, y: 50, zoom: 2 }
    expect(worldToScreen(cam, view, { x: 110, y: 60 })).toEqual({ x: 420, y: 320 })
    expect(screenToWorld(cam, view, { x: 420, y: 320 })).toEqual({ x: 110, y: 60 })
  })

  test('зум колесом держит точку под курсором', () => {
    const cam = { ...createCamera(), x: 0, y: 0, zoom: 0.5 }
    const cursor = { x: 650, y: 120 }
    const before = screenToWorld(cam, view, cursor)
    zoomAt(cam, view, cursor, 2, 0.01)
    const after = screenToWorld(cam, view, cursor)
    expect(after.x).toBeCloseTo(before.x)
    expect(after.y).toBeCloseTo(before.y)
    expect(cam.zoom).toBe(1)
  })

  test('зум ограничен снизу и сверху (3)', () => {
    const cam = { ...createCamera(), zoom: 2 }
    zoomAt(cam, view, { x: 0, y: 0 }, 100, 0.01)
    expect(cam.zoom).toBe(3)
    zoomAt(cam, view, { x: 0, y: 0 }, 1e-6, 0.01)
    expect(cam.zoom).toBe(0.01)
  })

  test('длительность перелёта: 0.6 с без смены зума, 1.0 при ×4, не больше 1.4', () => {
    expect(flyDuration(1, 1)).toBeCloseTo(0.6)
    expect(flyDuration(1, 4)).toBeCloseTo(1.0)
    expect(flyDuration(1, 16)).toBeCloseTo(1.4)
    expect(flyDuration(1, 1000)).toBeCloseTo(1.4)
  })

  test('перелёт: на середине зум — среднее геометрическое, в конце — ровно цель', () => {
    const cam = { ...createCamera(), x: 0, y: 0, zoom: 1 }
    startFly(cam, { x: 100, y: 0, zoom: 4 }, 0)
    updateCamera(cam, 0.5, 0)
    expect(cam.zoom).toBeCloseTo(2)
    expect(cam.x).toBeCloseTo(50)
    updateCamera(cam, 1.0, 0)
    expect(cam).toMatchObject({ x: 100, y: 0, zoom: 4, fly: null })
  })

  test('инерция гаснет: через секунду остаётся ~e⁻⁵ скорости', () => {
    const cam = { ...createCamera(), vx: 100 }
    for (let i = 0; i < 10; i++) updateCamera(cam, i * 0.1, 0.1)
    expect(cam.vx).toBeCloseTo(100 * Math.exp(-5), 3)
  })

  test('уровни детализации по экранному радиусу системы', () => {
    expect(lodOf(1000, 0.1)).toEqual({ level: 'galaxy', approachAlpha: 0, systemAlpha: 0 })
    expect(lodOf(1000, 0.18).approachAlpha).toBeCloseTo(0.5)
    expect(lodOf(1000, 0.18).level).toBe('approach')
    expect(lodOf(1000, 0.216).approachAlpha).toBeCloseTo(1)
    expect(lodOf(1000, 0.7)).toMatchObject({ level: 'system', approachAlpha: 1 })
    expect(lodOf(1000, 0.7).systemAlpha).toBeCloseTo(0.5)
  })

  test('вся галактика в кадре — уровень «галактика» на экранах 1280×720 и 2560×1440', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const g = createWorld(seed).galaxy
      for (const v of [{ width: 1280, height: 720 }, { width: 2560, height: 1440 }]) {
        const z = galaxyZoom(v, g)
        for (const s of g.systems) {
          const l = lodOf(s.radius, z)
          expect(l.level, `seed ${seed}`).toBe('galaxy')
          expect(l.approachAlpha, `seed ${seed}`).toBe(0)
        }
      }
    }
  })
})
