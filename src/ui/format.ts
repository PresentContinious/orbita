import { YEAR_SECONDS } from '../sim/config'

export const yearOf = (t: number): number => Math.floor(t / YEAR_SECONDS)

/** 8400 → «8 400» (узкий неразрывный пробел) */
export function fmtInt(n: number): string {
  return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
}

/** население в тысячах → люди */
export const fmtPop = (popK: number): string => fmtInt(popK * 1000)

/** кредиты в минуту → «+1.2 кр/с» */
export function fmtRate(perMin: number): string {
  const v = perMin / 60
  return `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(1)} кр/с`
}

export const fmtCredits = (n: number): string => `${n < 0 ? '−' : ''}${fmtInt(Math.abs(n))} кр`

export function fmtDuration(sec: number): string {
  if (!Number.isFinite(sec)) return '∞'
  if (sec < 60) return `${Math.round(sec)} с`
  return `${Math.round(sec / 60)} мин`
}

export const roman = (n: number): string => ['', 'I', 'II', 'III', 'IV', 'V'][n] ?? String(n)

export const hex = (color: number): string => `#${color.toString(16).padStart(6, '0')}`
