/// <reference types="chrome" />

import { ensureRunnerTabsLoaded } from '.'
import { getScopeFromTabContext } from '../prepared-context'

type TabDetachedDetachInfo = {
  oldWindowId: number
}

type OnDetachedDeps = {
  reconcileActiveRunner: (
    options?: string | {
      preferredWindowId?: number | null
      reason?: string
      targetScopeKey?: string | null
    }
  ) => Promise<unknown>
}

export function createOnTabDetachedListener({
  reconcileActiveRunner,
}: OnDetachedDeps) {
  return async (
    tabId: number,
    _detachInfo: TabDetachedDetachInfo,
  ) => {
    await ensureRunnerTabsLoaded()
    const detachedScope = getScopeFromTabContext(tabId)

    await reconcileActiveRunner({
      reason: 'tabs.onDetached',
      targetScopeKey: detachedScope?.scopeKey ?? null,
    })
  }
}
