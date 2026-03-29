/// <reference types="chrome" />

import {
  ensureRunnerTabsLoaded,
  getCurrentRunner,
  getWindowLock,
} from '.'

type TabDetachedDetachInfo = {
  oldWindowId: number
}

type OnDetachedDeps = {
  reconcileActiveRunner: (
    options?: string | { preferredWindowId?: number | null, reason?: string }
  ) => Promise<unknown>
}

export function createOnTabDetachedListener({
  reconcileActiveRunner,
}: OnDetachedDeps) {
  return async (
    tabId: number,
    detachInfo: TabDetachedDetachInfo,
  ) => {
    await ensureRunnerTabsLoaded()

    const previousRunner = getCurrentRunner()
    const preferredWindowId = getWindowLock()?.windowId ?? previousRunner?.windowId ?? null

    if (preferredWindowId !== detachInfo.oldWindowId) {
      return
    }

    await reconcileActiveRunner({
      preferredWindowId: detachInfo.oldWindowId,
      reason: 'tabs.onDetached',
    })
  }
}
