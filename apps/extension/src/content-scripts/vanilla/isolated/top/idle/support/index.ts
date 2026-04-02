/// <reference types="chrome" />

import ProtectingBot from "@toolkit-tw-bot/document/protectingBot"
import { getParamsUrl } from "@toolkit-tw-bot/core"
import { extensionId as RELEASE_EXTENSION_ID } from '@toolkit-tw-bot/release'
import { SUPPORT_SYNC_CTX_MESSAGE_TYPE } from "../../../../../../service-worker/message/types"
import { setActiveTitle } from "../../../../shared/setActiveTitle"
import { installChangeGlobalSupport } from "./changeGlobal"
import {
  infoPlayer,
  isSupportInfoPlayerMessage,
  syncPlayerAvatar,
} from "./info-player"
import { getCurrentGameData, isFinitePlayerId } from "./current"

const BOOTSTRAP_KEY = '__toolkitTwBotIsolatedTopIdleSupport__'

type ToolkitWindow = Window & {
  [BOOTSTRAP_KEY]?: boolean
}

async function syncCtxAndTitle() {
  const gameData = getCurrentGameData();

  if (!gameData) {
    return null
  }

  const runtimeParams = getParamsUrl(
    window.location.href,
    window.location.origin,
  )
  const response = await chrome.runtime.sendMessage({
    extensionId: RELEASE_EXTENSION_ID,
    type: SUPPORT_SYNC_CTX_MESSAGE_TYPE,
    world: gameData?.world,
    playerId: isFinitePlayerId(gameData?.player?.id),
    playerName: gameData?.player?.name,
    features: gameData?.features ?? null,
    points: gameData?.player?.points ?? null,
    rank: gameData?.player?.rank ?? null,
    villages: gameData?.player?.villages ?? null,
    dateStarted: gameData?.player?.date_started ?? null,
    t: runtimeParams.t ?? null,
    isBotProtected: ProtectingBot['bot-protect-all-in-game'].active(document),
  })

  const data = (response as { data?: Record<string, unknown> } | null)?.data

  if (data) {
    setActiveTitle(data)
  }
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

  await syncCtxAndTitle()
  // se estiver em info_player screen e a imagem for atualizada
  await infoPlayer()
  installChangeGlobalSupport()
}

void bootstrap()

export {};
