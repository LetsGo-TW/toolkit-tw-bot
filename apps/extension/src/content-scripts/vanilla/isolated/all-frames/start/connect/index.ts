/// <reference types="chrome" />

import { extensionId as RELEASE_EXTENSION_ID } from '@toolkit-tw-bot/release'
import {
  PREPARED_READY_ATTRIBUTE,
  STARTER_PREPARED_READY,
} from '../../../../shared/preparedBootstrap'
import { START_MESSAGE_TYPE, STOP_MESSAGE_TYPE } from '../../../../../../service-worker/message/types'
import { setActiveTitle } from '../../../../shared/setActiveTitle'
import { removeShit } from "./removeShit"

const CS = 'CONNECT'
const BOOTSTRAP_KEY = '__toolkitTwBotIsolatedAllFramesIdleInstalled__'
const CONNECT_POSTED_KEY = '__toolkitTwBotIsolatedAllFramesStartConnectPosted__'

type ToolkitWindow = Window & {
  [BOOTSTRAP_KEY]?: boolean
  [CONNECT_POSTED_KEY]?: boolean
}

function getPageMessageData(event: MessageEvent<unknown>) {
  if (event.source !== window) {
    return null
  }

  if (event.origin !== window.location.origin) {
    return null
  }

  if (!event.data || typeof event.data !== 'object') {
    return null
  }

  return event.data as Record<string, unknown>
}

function onExtensionMessage(
  received: unknown,
  sender: chrome.runtime.MessageSender,
) {
  if (sender.id === chrome.runtime.id) {
    console.log('[CS][CONNECT] from SW', received)

    if (
      window.top === window.self
      && received
      && typeof received === 'object'
      && (
        (received as { type?: string }).type === START_MESSAGE_TYPE
        || (received as { type?: string }).type === STOP_MESSAGE_TYPE
      )
    ) {
      setActiveTitle((received as { data?: Record<string, unknown> }).data || {})
    }

    window.postMessage(received, window.location.origin)
    removeShit(received);
  }

  return false
}

async function postConnectToPage() {
  const response = {
    extensionId: RELEASE_EXTENSION_ID,
    type: CS,
  }

  console.log('[CS][CONNECT] posting CONNECT to PREPARED', response)
  window.postMessage(response, window.location.origin)
}

function isValidPageMessage(event: MessageEvent<unknown>) {
  return getPageMessageData(event) !== null
}

function isValidStarterReadyMessage(event: MessageEvent<unknown>) {
  const data = getPageMessageData(event)

  return data?.type === STARTER_PREPARED_READY
}

function isPreparedReady() {
  return document.documentElement?.getAttribute(PREPARED_READY_ATTRIBUTE) === 'true'
}

async function postConnectWhenPreparedReady() {
  const scope = window as ToolkitWindow

  if (scope[CONNECT_POSTED_KEY]) {
    return
  }

  if (!isPreparedReady()) {
    return
  }

  scope[CONNECT_POSTED_KEY] = true
  window.removeEventListener('message', onStarterPreparedReady, true)

  try {
    await postConnectToPage()
  } catch (error) {
    delete scope[CONNECT_POSTED_KEY]
    window.addEventListener('message', onStarterPreparedReady, true)
    throw error
  }
}

function onStarterPreparedReady(event: MessageEvent<unknown>) {
  if (!isValidStarterReadyMessage(event)) {
    return
  }

  console.log('[CS][CONNECT] starter prepared ready')
  void postConnectWhenPreparedReady()
}

async function bootstrap() {
  const scope = window as ToolkitWindow

  if (scope[BOOTSTRAP_KEY]) {
    return
  }

  scope[BOOTSTRAP_KEY] = true

  console.log('[CS][CONNECT] bootstrap', {
    href: window.location.href,
    isTop: window.top === window.self,
  })

  chrome.runtime.onMessage.addListener(onExtensionMessage)

  if (window.top !== window.self) {
    return
  }

  try {
    window.addEventListener('message', onStarterPreparedReady, true)
    await postConnectWhenPreparedReady()
  } catch (error) {
    chrome.runtime.onMessage.removeListener(onExtensionMessage)
    window.removeEventListener('message', onStarterPreparedReady, true)
    delete scope[BOOTSTRAP_KEY]
    delete scope[CONNECT_POSTED_KEY]
    console.error(`[CS][${CS}]`, error)
  }
}

void bootstrap()

export {}
