import { Particle, ParticleContainer, type Texture } from 'pixi.js'
import type { Camera, View } from './camera'

interface BgStar {
  p: Particle
  u: number
  v: number
  depth: number
}

const mod = (a: number, n: number) => ((a % n) + n) % n

/** фоновые звёзды в экранных координатах с лёгким параллаксом */
export class Starfield {
  readonly root = new ParticleContainer({ dynamicProperties: { position: true } })
  private readonly stars: BgStar[] = []

  constructor(glow: Texture, count = 500) {
    let seed = 12345
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647
    for (let i = 0; i < count; i++) {
      const size = (1 + rnd() * 2.2) / 32
      const tint = rnd() < 0.85 ? 0xffffff : rnd() < 0.5 ? 0xa0c8ff : 0xffdcb4
      const p = new Particle({ texture: glow, anchorX: 0.5, anchorY: 0.5, scaleX: size, scaleY: size, alpha: 0.2 + rnd() * 0.45, tint })
      this.root.addParticle(p)
      this.stars.push({ p, u: rnd(), v: rnd(), depth: 0.2 + rnd() * 0.8 })
    }
  }

  update(cam: Camera, view: View): void {
    for (const s of this.stars) {
      s.p.x = mod(s.u * view.width - cam.x * cam.zoom * 0.03 * s.depth, view.width)
      s.p.y = mod(s.v * view.height - cam.y * cam.zoom * 0.03 * s.depth, view.height)
    }
  }
}
