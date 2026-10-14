import type { Snapshot } from './snapshot'

export interface Store {
  get: () => Snapshot | null
  set: (s: Snapshot) => void
  subscribe: (listener: () => void) => () => void
}

export function createStore(): Store {
  let snap: Snapshot | null = null
  const listeners = new Set<() => void>()
  return {
    get: () => snap,
    set: (s) => {
      snap = s
      for (const l of listeners) l()
    },
    subscribe: (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
  }
}
