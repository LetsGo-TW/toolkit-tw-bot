/// <reference types="chrome" />

import {
  clearRunnerTabInTransit,
  ensureRunnerTabsLoaded,
  syncRunnerWindowIdByTabId,
} from '.'
import {
  getScopeFromTabContext,
  syncPreparedContextWindowId,
} from '../prepared-context'

type TabAttachedAttachInfo = {
  newWindowId: number
}

type OnAttachedDeps = {
  reconcileActiveRunner: (
    options?: string | {
      preferredWindowId?: number | null
      reason?: string
      targetScopeKey?: string | null
    }
  ) => Promise<unknown>
}

export function createOnTabAttachedListener({
  reconcileActiveRunner,
}: OnAttachedDeps) {
  return async (
    tabId: number,
    attachInfo: TabAttachedAttachInfo,
  ) => {
    await ensureRunnerTabsLoaded()
    await syncPreparedContextWindowId(tabId, attachInfo.newWindowId)

    const transitRecord = clearRunnerTabInTransit(tabId)

    if (transitRecord) {
      await syncRunnerWindowIdByTabId(tabId, attachInfo.newWindowId)
      return
    }

    const attachedScope = getScopeFromTabContext(tabId)

    await reconcileActiveRunner({
      reason: 'tabs.onAttached',
      targetScopeKey: attachedScope?.scopeKey ?? null,
    })
  }
}
