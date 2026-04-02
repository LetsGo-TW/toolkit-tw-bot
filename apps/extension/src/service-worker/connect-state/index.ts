/// <reference types="chrome" />

import { extensionId as RELEASE_EXTENSION_ID } from '@toolkit-tw-bot/release'
import { CONNECT_MESSAGE_TYPE } from '../message/types'

export function getConnectState(sender: chrome.runtime.MessageSender) {
  console.log('[SW][CONNECT]', {
    tabId: sender.tab?.id ?? null,
    windowId: sender.tab?.windowId ?? null,
    url: sender.tab?.url ?? null,
  })

  return {
    ok: true,
    extensionId: RELEASE_EXTENSION_ID,
    type: CONNECT_MESSAGE_TYPE,
    tabId: sender.tab?.id ?? null,
    windowId: sender.tab?.windowId ?? null,
  }
}
