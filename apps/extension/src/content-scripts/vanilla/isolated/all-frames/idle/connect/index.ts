/// <reference types="chrome" />

const CS = 'CONNECT'
const BOOTSTRAP_KEY = '__toolkitTwBotIsolatedAllFramesIdleInstalled__'

type ToolkitWindow = Window & {
  [BOOTSTRAP_KEY]?: boolean
}

function onExtensionMessage(
  received: unknown,
  sender: chrome.runtime.MessageSender,
) {
  if (sender.id === chrome.runtime.id) {
    window.postMessage(received, window.location.origin)
  }

  return false
}

async function postConnectToPage() {
  const response = await chrome.runtime.sendMessage({
    extensionId: chrome.runtime.id,
    type: CS,
  })

  window.postMessage(response, window.location.origin)
}

async function bootstrap() {
  const scope = window as ToolkitWindow

  if (scope[BOOTSTRAP_KEY]) {
    return
  }

  scope[BOOTSTRAP_KEY] = true

  chrome.runtime.onMessage.addListener(onExtensionMessage)

  if (window.top !== window.self) {
    return
  }

  try {
    await postConnectToPage()
  } catch (error) {
    chrome.runtime.onMessage.removeListener(onExtensionMessage)
    delete scope[BOOTSTRAP_KEY]
    console.error(`[CS][${CS}]`, error)
  }
}

void bootstrap()

export {}
