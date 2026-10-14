// Пространственная сетка: поиск соседей без перебора всех кораблей.
// Массивы клеток переиспользуются между шагами — без лишних аллокаций.
export class SpatialGrid {
  private readonly cells = new Map<number, number[]>()
  private readonly used: number[][] = []

  constructor(readonly cellSize: number) {}

  private key(cx: number, cy: number): number {
    return (cx + 0x8000) * 0x10000 + (cy + 0x8000)
  }

  clear(): void {
    for (const c of this.used) c.length = 0
    this.used.length = 0
  }

  insert(id: number, x: number, y: number): void {
    const k = this.key(Math.floor(x / this.cellSize), Math.floor(y / this.cellSize))
    let c = this.cells.get(k)
    if (!c) {
      c = []
      this.cells.set(k, c)
    }
    if (c.length === 0) this.used.push(c)
    c.push(id)
  }

  /** кандидаты из клеток вокруг (x, y) в радиусе r; точное расстояние проверяет вызывающий */
  query(x: number, y: number, r: number, out: number[]): number[] {
    out.length = 0
    const s = this.cellSize
    const x0 = Math.floor((x - r) / s)
    const x1 = Math.floor((x + r) / s)
    const y0 = Math.floor((y - r) / s)
    const y1 = Math.floor((y + r) / s)
    for (let cx = x0; cx <= x1; cx++) {
      for (let cy = y0; cy <= y1; cy++) {
        const c = this.cells.get(this.key(cx, cy))
        if (c) for (const id of c) out.push(id)
      }
    }
    return out
  }
}
