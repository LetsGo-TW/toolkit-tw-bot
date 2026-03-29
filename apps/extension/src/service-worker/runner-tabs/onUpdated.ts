/// <reference types="chrome" />

import { syncTabActionByTabId } from '../action-state'
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

    if (changeInfo.url) {
      await updatePreparedContextFromUrl(tabId, changeInfo.url)
    }

    await syncTabActionByTabId(tabId)
  }
}
