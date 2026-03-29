/// <reference types="chrome" />

import { CONNECT_MESSAGE_TYPE } from '../message/types'

export function getConnectState(sender: chrome.runtime.MessageSender) {
  return {
    ok: true,
    extensionId: chrome.runtime.id,
    type: CONNECT_MESSAGE_TYPE,
    tabId: sender.tab?.id ?? null,
    windowId: sender.tab?.windowId ?? null,
  }
}
