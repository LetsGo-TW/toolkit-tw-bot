/// <reference types="chrome" />

import { removePreparedContext } from '../prepared-context'
import {
  clearRunnerTabInTransit,
  ensureRunnerTabsLoaded,
} from '.'

type TabRemovedRemoveInfo = {
  isWindowClosing: boolean
  windowId: number
}

type OnRemovedDeps = {
  reconcileActiveRunner: (
    options?: string | {
      preferredWindowId?: number | null
      reason?: string
      targetScopeKey?: string | null
    }
  ) => Promise<unknown>
}

export function createOnTabRemovedListener({
  reconcileActiveRunner,
}: OnRemovedDeps) {
  return async (
    tabId: number,
    removeInfo: TabRemovedRemoveInfo,
  ) => {
    await ensureRunnerTabsLoaded()
    clearRunnerTabInTransit(tabId)

    await removePreparedContext(tabId)

    await reconcileActiveRunner({
      preferredWindowId: removeInfo.windowId,
      reason: 'tabs.onRemoved',
    })
  }
}
