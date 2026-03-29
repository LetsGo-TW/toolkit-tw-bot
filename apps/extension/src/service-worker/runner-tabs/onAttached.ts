/// <reference types="chrome" />

import { syncPreparedContextWindowId } from '../prepared-context'

type TabAttachedAttachInfo = {
  newWindowId: number
}

export function createOnTabAttachedListener() {
  return async (
    tabId: number,
    attachInfo: TabAttachedAttachInfo,
  ) => {
    await syncPreparedContextWindowId(tabId, attachInfo.newWindowId)
  }
}
