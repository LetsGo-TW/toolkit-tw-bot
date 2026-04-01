/// <reference types="chrome" />

import { CurrentGameData } from "./current"
import {
  infoPlayer,
  isSupportInfoPlayerMessage,
  syncPlayerAvatar,
} from "./info-player"

const CS = 'SUPPORT'
const BOOTSTRAP_KEY = '__toolkitTwBotIsolatedTopIdleSupport__'

type ToolkitWindow = Window & {
  [BOOTSTRAP_KEY]?: boolean
}

type Received = {
  isRunningTab: boolean
}

type Response = {
  gameData: CurrentGameData
  isBotProtected: boolean
  avatarUrl?: string | null
}

function onExtensionMessage(
  received: unknown,
  sender: chrome.runtime.MessageSender,
  sendResponse: (response: any) => void,
) {
  if (sender.id !== chrome.runtime.id) {
    return false
  }

  if (!isSupportInfoPlayerMessage(received)) {
    return false
  }

  void syncPlayerAvatar()
    .then((response) => sendResponse(response))
    .catch((error) => {
      sendResponse({
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      })
    })

  return true
}

async function bootstrap() {
  const scope = window as ToolkitWindow

  if (scope[BOOTSTRAP_KEY]) {
    return
  }

  scope[BOOTSTRAP_KEY] = true

  console.log('[CS][SUPPORT] bootstrap')

  chrome.runtime.onMessage.addListener(onExtensionMessage)

  // se estiver em info_player screen e a imagem for atualizada
  await infoPlayer()
}

void bootstrap()

export {};
