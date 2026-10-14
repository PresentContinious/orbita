import type { Controller } from '../app/controller'
import { SPEEDS } from '../sim/config'
import { Icon } from './icons'
import type { Snapshot } from './snapshot'

export function TimeControls({ s, controller }: { s: Snapshot; controller: Controller }) {
  const newSeed = (seed: number) => {
    location.search = `?seed=${seed}`
  }
  return (
    <div className="panel time">
      <span className="year">год {s.year}</span>
      <span className="epoch">эпоха I</span>
      <span className="seg">
        <button className={s.paused ? 'on' : ''} onClick={() => controller.togglePause()} title="Пауза — Пробел">
          {s.paused ? '▶' : '❚❚'}
        </button>
        {SPEEDS.map((v, i) => (
          <button key={v} className={!s.paused && s.speedIndex === i ? 'on' : ''} onClick={() => controller.setSpeed(i)} title={`×${v} — клавиша ${i + 1}`}>
            ×{v}
          </button>
        ))}
      </span>
      <button className={s.follow ? 'on' : ''} onClick={() => controller.toggleFollow()} title="Камера следит за самым интересным — F">
        <Icon name="target" size={14} />
      </button>
      <button
        className="seed"
        title="Зерно галактики: щёлкни, чтобы ввести своё"
        onClick={() => {
          const v = prompt('Зерно галактики', String(s.seed))
          if (v && Number(v)) newSeed(Number(v))
        }}
      >
        зерно {s.seed}
      </button>
      <button title="Новая случайная галактика" onClick={() => newSeed(Math.floor(Math.random() * 1_000_000))}>
        <Icon name="dice" size={14} />
      </button>
    </div>
  )
}
