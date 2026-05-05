/// <reference types="chrome" />

import { getParamsUrl } from '@toolkit-tw-bot/core'
import { extensionId as RELEASE_EXTENSION_ID } from '@toolkit-tw-bot/release'
import {
  PREPARED_READY_ATTRIBUTE,
  STARTER_PREPARED_ERROR,
  STARTER_PREPARED_READY,
} from '../../../../shared/preparedBootstrap'
import { setActiveTitle } from '../../../../shared/setActiveTitle'
import { removeShit } from "./removeShit"
import { RUNNER_CONTROLLER_MESSAGE_TYPE } from '../../../../../../service-worker/message/types'

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

    let forwardedMessage = received

    if (received && typeof received === 'object') {
      const messageData = received as Record<string, unknown>
      
      if (messageData.type === RUNNER_CONTROLLER_MESSAGE_TYPE) {
        console.log('[CS][CONNECT][RUNNER_CONTROLLER] converting and forwarding to page', received)
        forwardedMessage = {
          ...messageData,
          type: 'BOT_RUNNER_CONTROLLER',
        }
      } else if (messageData.action === 'run' && messageData.machine) {
        // Armadilha/Fallback: Se for um comando de run, converte à força!
        console.warn('[CS][CONNECT][RUNNER_CONTROLLER] Fallback ativado! Convertendo forçadamente.', received)
        forwardedMessage = {
          ...messageData,
          type: 'BOT_RUNNER_CONTROLLER',
          extensionId: RELEASE_EXTENSION_ID
        }
      } else if (messageData.type === 'BOT_RUNNER_CONTROLLER') {
        console.log('[CS][CONNECT][RUNNER_CONTROLLER] forwarding to page', received)
      }
    }

    console.log('[CS][CONNECT] disparando window.postMessage:', forwardedMessage)
    if (window.top === window.self && received && typeof received === 'object') {
      setActiveTitle((received as { data?: Record<string, unknown> }).data || {})
    }

    window.postMessage(forwardedMessage, window.location.origin)

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

function isValidStarterConnectServerErrorMessage(event: MessageEvent<unknown>) {
  const data = getPageMessageData(event)

  return data?.type === STARTER_PREPARED_ERROR && data?.isConnectServerError === true
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

function onStarterPreparedError(event: MessageEvent<unknown>) {
  if (!isValidStarterConnectServerErrorMessage(event)) {
    return
  }

  const runtimeParams = getParamsUrl(
    window.location.href,
    window.location.origin,
  )

  setActiveTitle({
    isRunningTab: true,
    isConnectServerError: true,
    isMdfScope: runtimeParams.t !== null,
  })
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
    window.addEventListener('message', onStarterPreparedError, true)
    await postConnectWhenPreparedReady()
  } catch (error) {
    chrome.runtime.onMessage.removeListener(onExtensionMessage)
    window.removeEventListener('message', onStarterPreparedReady, true)
    window.removeEventListener('message', onStarterPreparedError, true)
    delete scope[BOOTSTRAP_KEY]
    delete scope[CONNECT_POSTED_KEY]
    console.error(`[CS][${CS}]`, error)
  }
}

void bootstrap()

export {}
