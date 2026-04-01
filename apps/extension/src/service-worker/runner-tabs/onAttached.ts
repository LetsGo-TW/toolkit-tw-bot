/// <reference types="chrome" />

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
    await syncPreparedContextWindowId(tabId, attachInfo.newWindowId)

    const attachedScope = getScopeFromTabContext(tabId)

    await reconcileActiveRunner({
      reason: 'tabs.onAttached',
      targetScopeKey: attachedScope?.scopeKey ?? null,
    })
  }
}
