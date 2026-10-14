import { useSyncExternalStore } from 'react'
import type { Controller } from '../app/controller'
import { Breadcrumbs } from './Breadcrumbs'
import { CivBar } from './CivBar'
import { FeedDrawer } from './FeedDrawer'
import type { Store } from './store'
import { TimeControls } from './TimeControls'
import { Toasts } from './Toasts'
import './styles.css'

export function Hud({ store, controller }: { store: Store; controller: Controller }) {
  const s = useSyncExternalStore(store.subscribe, store.get)
  if (!s) return null
  return (
    <>
      <Breadcrumbs crumbs={s.crumbs} onPick={(c) => controller.goCrumb(c)} />
      <TimeControls s={s} controller={controller} />
      <Toasts toasts={s.toasts} onPick={(ev) => controller.flyToEvent(ev)} />
      <CivBar civs={s.civs} onPick={(id) => controller.flyToCiv(id)} onFeed={() => controller.toggleFeed()} />
      {s.feedOpen && <FeedDrawer events={s.feed} onPick={(ev) => controller.flyToEvent(ev)} onClose={() => controller.toggleFeed()} />}
    </>
  )
}
