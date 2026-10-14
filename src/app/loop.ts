import { MAX_FRAME_DT, MAX_STEPS_PER_FRAME, SIM_DT } from '../sim/config'

export interface Clock {
  /** накопленное и ещё не просчитанное игровое время, с */
  acc: number
  /** 0 — пауза */
  speed: number
}

export function createClock(speed = 1): Clock {
  return { acc: 0, speed }
}

/** продвигает симуляцию фиксированными шагами; возвращает число шагов за кадр */
export function advance(clock: Clock, realDt: number, step: () => void): number {
  clock.acc += Math.min(Math.max(realDt, 0), MAX_FRAME_DT) * clock.speed
  let n = 0
  while (clock.acc >= SIM_DT - 1e-9 && n < MAX_STEPS_PER_FRAME) {
    step()
    clock.acc -= SIM_DT
    n++
  }
  if (n === MAX_STEPS_PER_FRAME && clock.acc >= SIM_DT) clock.acc = 0
  if (clock.acc < 0) clock.acc = 0
  return n
}

/** доля шага между последним и следующим состоянием — для плавной отрисовки */
export function alpha(clock: Clock): number {
  return Math.min(1, clock.acc / SIM_DT)
}
