/// <reference types="chrome" />

import { CONNECT_MESSAGE_TYPE } from '../message/types'

export function getConnectState(sender: chrome.runtime.MessageSender) {
  console.log('[SW][CONNECT]', {
    tabId: sender.tab?.id ?? null,
    windowId: sender.tab?.windowId ?? null,
    url: sender.tab?.url ?? null,
  })

  return {
    ok: true,
    extensionId: chrome.runtime.id,
    type: CONNECT_MESSAGE_TYPE,
    tabId: sender.tab?.id ?? null,
    windowId: sender.tab?.windowId ?? null,
  }
}
