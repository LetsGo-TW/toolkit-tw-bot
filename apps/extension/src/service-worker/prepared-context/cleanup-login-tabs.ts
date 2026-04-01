/// <reference types="chrome" />

import {
  ensurePreparedContextLoaded,
  getTabContextsByScopeKey,
} from '.'

export async function cleanupLoginTabsForScope({
  scopeKey,
  keepTabId,
}: {
  scopeKey?: string | null
  keepTabId?: number | null
}) {
  if (!scopeKey || typeof keepTabId !== 'number') {
    return {
      ok: false,
      closedTabIds: [],
      reason: 'missing-scope-or-keep-tab',
    }
  }

  await ensurePreparedContextLoaded()

  const closeTabIds = getTabContextsByScopeKey(scopeKey)
    .filter((tabContext) => tabContext.tabId !== keepTabId && tabContext.context === 'LOGIN')
    .map((tabContext) => tabContext.tabId)

  if (!closeTabIds.length) {
    return {
      ok: true,
      closedTabIds: [],
      scopeKey,
    }
  }

  try {
    await chrome.tabs.remove(closeTabIds)
  } catch {
    // ignore stale tab removals
  }

  console.log('[SW][CTX] cleanup login tabs', {
    scopeKey,
    keepTabId,
    closeTabIds,
  })

  return {
    ok: true,
    closedTabIds: closeTabIds,
    scopeKey,
  }
}
