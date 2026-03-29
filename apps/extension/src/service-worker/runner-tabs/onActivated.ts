/// <reference types="chrome" />

import {
  ensureRunnerTabsLoaded,
  getCurrentRunner,
  getWindowLock,
} from '.'

type TabActivatedActiveInfo = {
  tabId: number
  windowId: number
}

type OnActivatedDeps = {
  reconcileActiveRunner: (
    options?: string | { preferredWindowId?: number | null, reason?: string }
  ) => Promise<unknown>
}

export function createOnTabActivatedListener({
  reconcileActiveRunner,
}: OnActivatedDeps) {
  return async (activeInfo: TabActivatedActiveInfo) => {
    await ensureRunnerTabsLoaded()

    const preferredWindowId = getWindowLock()?.windowId
      ?? getCurrentRunner()?.windowId
      ?? activeInfo.windowId

    let activatedTab: chrome.tabs.Tab | null = null

    try {
      activatedTab = await chrome.tabs.get(activeInfo.tabId)
    } catch {
      activatedTab = null
    }

    if (
      activatedTab
      && activatedTab.status !== 'complete'
      && Boolean(activatedTab.pendingUrl || activatedTab.url)
    ) {
      const onUpdatedAfterActivated = async (
        tabId: number,
        changeInfo: chrome.tabs.TabChangeInfo,
        tab: chrome.tabs.Tab,
      ) => {
        if (
          tabId === activeInfo.tabId
          && changeInfo.status === 'complete'
          && Boolean(tab.pendingUrl || tab.url)
        ) {
          chrome.tabs.onUpdated.removeListener(onUpdatedAfterActivated)

          await reconcileActiveRunner({
            preferredWindowId,
            reason: 'tabs.onActivated',
          })
        }
      }

      chrome.tabs.onUpdated.addListener(onUpdatedAfterActivated)
      return
    }

    await reconcileActiveRunner({
      preferredWindowId,
      reason: 'tabs.onActivated',
    })
  }
}
