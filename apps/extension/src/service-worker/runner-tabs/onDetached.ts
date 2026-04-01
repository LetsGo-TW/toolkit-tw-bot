/// <reference types="chrome" />

import {
  ensureRunnerTabsLoaded,
  markRunnerTabInTransit,
} from '.'

type TabDetachedDetachInfo = {
  oldWindowId: number
}

export function createOnTabDetachedListener() {
  return async (
    tabId: number,
    _detachInfo: TabDetachedDetachInfo,
  ) => {
    await ensureRunnerTabsLoaded()
    markRunnerTabInTransit(tabId)
  }
}
