/// <reference types="chrome" />

import { syncTabActionByTabId } from '../action-state'
import { cleanupAttachedNativeDebuggers } from '../message/native'
import { updatePreparedContextFromUrl } from '../prepared-context'

type TabUpdatedChangeInfo = {
  url?: string
  status?: string
}

export function createOnTabUpdatedListener() {
  return async (
    tabId: number,
    changeInfo: TabUpdatedChangeInfo,
  ) => {
    if (!changeInfo.url && !changeInfo.status) {
      return
    }

    await cleanupAttachedNativeDebuggers({
      reason: `tab-updated:${changeInfo.status ?? 'unknown'}`,
      tabId,
    })

    if (changeInfo.url) {
      await updatePreparedContextFromUrl(tabId, changeInfo.url)
    }

    await syncTabActionByTabId(tabId)
  }
}
