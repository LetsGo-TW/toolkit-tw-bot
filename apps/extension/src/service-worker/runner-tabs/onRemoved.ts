/// <reference types="chrome" />

import { removePreparedContext } from '../prepared-context'
import {
  ensureRunnerTabsLoaded,
  getCurrentRunner,
  getWindowLock,
} from '.'

type TabRemovedRemoveInfo = {
  isWindowClosing: boolean
  windowId: number
}

type OnRemovedDeps = {
  reconcileActiveRunner: (
    options?: string | { preferredWindowId?: number | null, reason?: string }
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

    const previousRunner = getCurrentRunner()
    const preferredWindowId = getWindowLock()?.windowId ?? previousRunner?.windowId ?? null
    const isRelevantTab = previousRunner?.tabId === tabId
    const isRelevantWindow = preferredWindowId === removeInfo.windowId

    await removePreparedContext(tabId)

    if (!isRelevantTab && !isRelevantWindow) {
      return
    }

    await reconcileActiveRunner({
      preferredWindowId: isRelevantWindow ? removeInfo.windowId : preferredWindowId,
      reason: 'tabs.onRemoved',
    })
  }
}
