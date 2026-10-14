import { TRAIT_LIST } from './combat-config'
import { genName } from './names'
import type { Admiral, Civ, World } from './types'

/** новый адмирал державы: характер и имя из собственного потока */
export function createAdmiral(w: World, civ: Civ): Admiral {
  const id = w.nextId++
  const rng = w.rng.fork('admiral:' + id)
  const admiral: Admiral = { id, owner: civ.id, name: genName(rng), trait: rng.pick(TRAIT_LIST), fame: 0, wins: 0, alive: true }
  w.admirals.push(admiral)
  return admiral
}
