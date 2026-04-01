/// <reference types="chrome" />

import {
  ensureRunnerTabsLoaded,
} from '.'
import { getScopeForTab } from '../prepared-context'

type TabActivatedActiveInfo = {
  tabId: number
  windowId: number
}

type OnActivatedDeps = {
  reconcileActiveRunner: (
    options?: string | {
      preferredWindowId?: number | null
      reason?: string
      targetScopeKey?: string | null
    }
  ) => Promise<unknown>
}

export function createOnTabActivatedListener({
  reconcileActiveRunner,
}: OnActivatedDeps) {
  return async (activeInfo: TabActivatedActiveInfo) => {
    await ensureRunnerTabsLoaded()

    let activatedTab: chrome.tabs.Tab | null = null

    try {
      activatedTab = await chrome.tabs.get(activeInfo.tabId)
    } catch {
      activatedTab = null
    }

    const activatedScope = getScopeForTab(activatedTab)

    console.log('[SW][tabs.onActivated]', {
      at: new Date().toISOString(),
      tabId: activeInfo.tabId,
      windowId: activeInfo.windowId,
      url: activatedTab?.pendingUrl || activatedTab?.url || null,
      scopeKey: activatedScope?.scopeKey ?? null,
      status: activatedTab?.status ?? null,
    })

    await reconcileActiveRunner({
      preferredWindowId: activeInfo.windowId,
      reason: 'tabs.onActivated',
      targetScopeKey: activatedScope?.scopeKey ?? null,
    })
  }
}
