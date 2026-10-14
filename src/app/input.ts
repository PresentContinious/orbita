import { zoomAt } from '../render/camera'
import { pickAt } from '../render/hit'
import { alpha } from './loop'
import type { Controller } from './controller'

/** мышь и клавиатура → контроллер; возвращает функцию отписки */
export function attachInput(el: HTMLElement, c: Controller): () => void {
  let drag: { x: number; y: number; moved: number; t: number; vx: number; vy: number } | null = null
  const local = (e: MouseEvent) => {
    const r = el.getBoundingClientRect()
    return { x: e.clientX - r.left, y: e.clientY - r.top }
  }
  const pick = (e: MouseEvent) => pickAt(c.world, c.cam, c.view(), local(e), alpha(c.clock))

  const onWheel = (e: WheelEvent) => {
    e.preventDefault()
    c.userMoved()
    zoomAt(c.cam, c.view(), local(e), Math.exp(-e.deltaY * 0.0015), c.minZoom())
  }
  const onDown = (e: PointerEvent) => {
    el.setPointerCapture(e.pointerId)
    const p = local(e)
    drag = { x: p.x, y: p.y, moved: 0, t: performance.now(), vx: 0, vy: 0 }
    c.cam.vx = 0
    c.cam.vy = 0
  }
  const onMove = (e: PointerEvent) => {
    const p = local(e)
    if (!drag) {
      c.hover(pickAt(c.world, c.cam, c.view(), p, alpha(c.clock)), p)
      return
    }
    const dx = p.x - drag.x
    const dy = p.y - drag.y
    drag.moved += Math.abs(dx) + Math.abs(dy)
    drag.x = p.x
    drag.y = p.y
    if (drag.moved <= 4) return
    c.userMoved()
    const now = performance.now()
    const dt = Math.max(1, now - drag.t) / 1000
    drag.t = now
    c.cam.x -= dx / c.cam.zoom
    c.cam.y -= dy / c.cam.zoom
    drag.vx = -dx / c.cam.zoom / dt
    drag.vy = -dy / c.cam.zoom / dt
  }
  const onUp = (e: PointerEvent) => {
    if (drag && drag.moved <= 4) {
      const p = pick(e)
      if (p?.type === 'battle') c.flyToBattle(p.id)
      else c.select(p)
    } else if (drag) {
      // инерция после броска
      c.cam.vx = drag.vx
      c.cam.vy = drag.vy
    }
    drag = null
  }
  const onDbl = (e: MouseEvent) => {
    const p = pick(e)
    if (p?.type === 'system') c.flyToSystem(p.id, 'approach')
    else if (p?.type === 'planet') c.flyToPlanet(p.id)
  }
  const onKey = (e: KeyboardEvent) => {
    if (e.target instanceof HTMLInputElement) return
    switch (e.code) {
      case 'Space':
        e.preventDefault()
        c.togglePause()
        break
      case 'Digit1':
      case 'Digit2':
      case 'Digit3':
      case 'Digit4':
        c.setSpeed(Number(e.code.slice(5)) - 1)
        break
      case 'KeyF':
        c.toggleFollow()
        break
      case 'KeyM':
        c.toggleMinimap()
        break
      case 'KeyL':
        c.toggleFeed()
        break
      case 'Escape':
        c.back()
        break
    }
  }

  el.addEventListener('wheel', onWheel, { passive: false })
  el.addEventListener('pointerdown', onDown)
  el.addEventListener('pointermove', onMove)
  el.addEventListener('pointerup', onUp)
  el.addEventListener('dblclick', onDbl)
  window.addEventListener('keydown', onKey)
  return () => {
    el.removeEventListener('wheel', onWheel)
    el.removeEventListener('pointerdown', onDown)
    el.removeEventListener('pointermove', onMove)
    el.removeEventListener('pointerup', onUp)
    el.removeEventListener('dblclick', onDbl)
    window.removeEventListener('keydown', onKey)
  }
}
