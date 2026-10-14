import type { ReactNode } from 'react'

export type IconName = 'colony' | 'trade' | 'research' | 'port' | 'build' | 'crisis' | 'bankrupt' | 'recovered' | 'other'

/** kind события -> имя значка */
export const KIND_ICON: Record<string, IconName> = {
  colony: 'colony',
  'trade-route': 'trade',
  research: 'research',
  port: 'port',
  shipyard: 'port',
  station: 'build',
  infra: 'build',
  deficit: 'crisis',
  crisis: 'crisis',
  bankrupt: 'bankrupt',
  recovered: 'recovered',
  decommission: 'other',
  'station-sold': 'other',
}

export const iconFor = (kind: string): IconName => KIND_ICON[kind] ?? 'other'

const PATHS: Record<IconName, ReactNode> = {
  colony: (
    <>
      <circle cx="6" cy="8" r="3.5" />
      <path d="M11 3v4M9 5h4" />
    </>
  ),
  trade: (
    <>
      <path d="M2 5h10M9.5 2.5 12 5l-2.5 2.5" />
      <path d="M12 10H2M4.5 7.5 2 10l2.5 2.5" />
    </>
  ),
  research: <path d="M5.5 2h3M6 2v4L3 12h8L8 6V2" />,
  port: <path d="M7 2v9M4.5 5h5M3 8.5C3.5 10.5 5 12 7 12s3.5-1.5 4-3.5" />,
  build: <path d="M2 12h10M3.5 12V7h7v5M5.5 7V4.5h3V7" />,
  crisis: (
    <>
      <path d="M7 2 12.5 12h-11z" />
      <path d="M7 6v3M7 10.6v.1" />
    </>
  ),
  bankrupt: (
    <>
      <circle cx="7" cy="7" r="5" />
      <path d="M4.5 4.5l5 5M9.5 4.5l-5 5" />
    </>
  ),
  recovered: <path d="M2 10l3.5-3.5 2.5 2.5L12 4M9 4h3v3" />,
  other: <circle cx="7" cy="7" r="1.8" />,
}

export function EventIcon({ kind, size = 13 }: { kind: string; size?: number }) {
  const name = iconFor(kind)
  return (
    <svg
      className={`evicon ev-${name}`}
      width={size}
      height={size}
      viewBox="0 0 14 14"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.1"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {PATHS[name]}
    </svg>
  )
}
