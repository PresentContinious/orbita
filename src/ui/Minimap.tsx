import { useEffect, useRef } from 'react'
import type { MinimapData } from './snapshot'

const W = 190
const H = 124

export function Minimap({ data, onJump }: { data: MinimapData; onJump: (x: number, y: number) => void }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const { bounds: b } = data
  const k = Math.min(W / (b.maxX - b.minX), H / (b.maxY - b.minY))
  const ox = (W - (b.maxX - b.minX) * k) / 2
  const oy = (H - (b.maxY - b.minY) * k) / 2
  const sx = (x: number) => ox + (x - b.minX) * k
  const sy = (y: number) => oy + (y - b.minY) * k

  useEffect(() => {
    const ctx = ref.current?.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, W, H)
    ctx.strokeStyle = '#3a4a6a'
    ctx.lineWidth = 1
    for (const [x1, y1, x2, y2] of data.corridors) {
      ctx.beginPath()
      ctx.moveTo(sx(x1), sy(y1))
      ctx.lineTo(sx(x2), sy(y2))
      ctx.stroke()
    }
    for (const s of data.systems) {
      if (s.owner) {
        ctx.fillStyle = s.owner + '55'
        ctx.beginPath()
        ctx.arc(sx(s.x), sy(s.y), 8, 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.fillStyle = s.star
      ctx.beginPath()
      ctx.arc(sx(s.x), sy(s.y), 3, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.strokeStyle = '#e6eeff'
    ctx.strokeRect(sx(data.view.x0), sy(data.view.y0), (data.view.x1 - data.view.x0) * k, (data.view.y1 - data.view.y0) * k)
  })

  return (
    <div className="panel minimap" title="Вся галактика — клик для перелёта, M — скрыть">
      <canvas
        ref={ref}
        width={W}
        height={H}
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect()
          onJump(b.minX + (e.clientX - r.left - ox) / k, b.minY + (e.clientY - r.top - oy) / k)
        }}
      />
    </div>
  )
}
