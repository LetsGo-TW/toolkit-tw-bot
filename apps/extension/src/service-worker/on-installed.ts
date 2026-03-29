/// <reference types="chrome" />

import { isAllowedOrigin } from './message/origins'
import { getTabUrl } from './prepared-context'

const RELOAD_DELAY_MS = 200

function shouldReloadTab(tab: chrome.tabs.Tab) {
  const tabUrl = getTabUrl(tab)

  if (!tabUrl) {
    return false
  }

  try {
    return isAllowedOrigin(new URL(tabUrl).origin)
  } catch {
    return false
  }
}

function delay(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

export async function onInstalledExtension(
  details: chrome.runtime.InstalledDetails,
) {
  if (details.reason !== 'install' && details.reason !== 'update') {
    return
  }

  const tabs = await chrome.tabs.query({})

  for (const tab of tabs) {
    if (typeof tab.id !== 'number' || !shouldReloadTab(tab)) {
      continue
    }

    await delay(RELOAD_DELAY_MS)

    try {
      await chrome.tabs.reload(tab.id)
    } catch (error) {
      console.warn('[SW][Install] tabs.reload failed', {
        tabId: tab.id,
        url: getTabUrl(tab),
        error,
      })
    }
  }
}
