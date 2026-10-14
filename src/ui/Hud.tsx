import { useSyncExternalStore } from 'react'
import type { Controller } from '../app/controller'
import { Breadcrumbs } from './Breadcrumbs'
import { Card } from './Card'
import { CivBar } from './CivBar'
import { FeedDrawer } from './FeedDrawer'
import { Minimap } from './Minimap'
import type { Store } from './store'
import { TimeControls } from './TimeControls'
import { Toasts } from './Toasts'
import { Tooltip } from './Tooltip'
import './styles.css'

export function Hud({ store, controller }: { store: Store; controller: Controller }) {
  const s = useSyncExternalStore(store.subscribe, store.get)
  if (!s) return null
  const colors: Record<number, string> = {}
  for (const c of s.civs) colors[c.id] = c.color
  return (
    <>
      <Breadcrumbs crumbs={s.crumbs} onPick={(c) => controller.goCrumb(c)} />
      <TimeControls s={s} controller={controller} />
      {s.minimap && <Minimap data={s.minimap} onJump={(x, y) => controller.flyToWorldPoint(x, y)} />}
      {s.card && <Card card={s.card} onClose={() => controller.select(null)} />}
      <Toasts toasts={s.toasts} colors={colors} onPick={(ev) => controller.flyToEvent(ev)} />
      <CivBar civs={s.civs} onPick={(id) => controller.showCiv(id)} onFeed={() => controller.toggleFeed()} />
      {s.feedOpen && <FeedDrawer events={s.feed} colors={colors} all={s.feedAll} onToggleAll={() => controller.toggleFeedAll()} onPick={(ev) => controller.flyToEvent(ev)} onClose={() => controller.toggleFeed()} />}
      {s.hover && <Tooltip x={s.hover.x} y={s.hover.y} card={s.hover.card} />}
    </>
  )
}
