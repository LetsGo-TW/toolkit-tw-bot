/// <reference types="chrome" />

import ProtectingBot from "@toolkit-tw-bot/document/protectingBot"
import { getParamsUrl } from "@toolkit-tw-bot/core"
import { extensionId as RELEASE_EXTENSION_ID } from '@toolkit-tw-bot/release'
import { SUPPORT_SYNC_CTX_MESSAGE_TYPE } from "../../../../../../service-worker/message/types"
import { setActiveTitle } from "../../../../shared/setActiveTitle"
import { installChangeGlobalSupport } from "./changeGlobal"
import { SUPPORT_GET_POPUP_STATE_MESSAGE_TYPE, SUPPORT_PROBE_MESSAGE_TYPE } from './message-types'
import {
  infoPlayer,
  isSupportInfoPlayerMessage,
  syncPlayerAvatar,
} from "./info-player"
import { getCurrentGameData, getPopupPageSnapshot, isFinitePlayerId } from "./current"
import { maybeHandleLoginReconnect } from './loginReconnect'

const BOOTSTRAP_KEY = '__toolkitTwBotIsolatedTopIdleSupport__'
const WORLD_PLAYERS_STORAGE_KEY = 'worldPlayers'

type ToolkitWindow = Window & {
  [BOOTSTRAP_KEY]?: boolean
}

let probedBotProtectState: boolean | null = null
let syncedBotProtectState: boolean | null = null
let botProtectStateSyncTimer: ReturnType<typeof setTimeout> | null = null

async function syncCtxAndTitle({
  isBotProtected,
}: {
  isBotProtected?: boolean | null
} = {}) {
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
    isBotProtected: typeof isBotProtected === 'boolean'
      ? isBotProtected
      : ProtectingBot['bot-protect-all-in-game'].active(document),
    isIntro: runtimeParams?.isIntro ?? null
  })

  const data = (response as { data?: Record<string, unknown> } | null)?.data

  if (data) {
    setActiveTitle(data)
  }

  return response
}

async function syncBotProtectStateIfChanged({
  force = false,
}: {
  force?: boolean
} = {}) {
  const isBotProtected = ProtectingBot['bot-protect-all-in-game'].active(document)

  probedBotProtectState = isBotProtected

  if (!force && syncedBotProtectState === isBotProtected) {
    return null
  }

  syncedBotProtectState = isBotProtected

  return syncCtxAndTitle({
    isBotProtected,
  })
}

function scheduleBotProtectStateSync() {
  if (botProtectStateSyncTimer) {
    clearTimeout(botProtectStateSyncTimer)
  }

  botProtectStateSyncTimer = setTimeout(() => {
    botProtectStateSyncTimer = null
    void syncBotProtectStateIfChanged().catch((error) => {
      console.error('[CS][SUPPORT][BOT_PROTECT_SYNC]', error)
    })
  }, 150)
}

function installBotProtectObserver() {
  if (!document.documentElement) {
    return
  }

  const observer = new MutationObserver(() => {
    scheduleBotProtectStateSync()
  })

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
  })
}

async function runSupportProbe() {
  const isBotProtected = ProtectingBot['bot-protect-all-in-game'].active(document)

  probedBotProtectState = isBotProtected
  syncedBotProtectState = isBotProtected

  const avatarResponse = await syncPlayerAvatar().catch((error) => ({
    ok: false,
    error: error instanceof Error ? error.message : String(error),
  }))

  const ctxResponse = await syncCtxAndTitle({
    isBotProtected,
  })

  return {
    ok: true,
    type: SUPPORT_PROBE_MESSAGE_TYPE,
    isBotProtected,
    avatarResponse,
    ctxResponse,
    snapshot: getPopupPageSnapshot({
      isBotProtected,
    }),
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

  if (
    received
    && typeof received === 'object'
    && (received as { type?: string }).type === SUPPORT_GET_POPUP_STATE_MESSAGE_TYPE
  ) {
    const popupSnapshot = getPopupPageSnapshot({
      isBotProtected: probedBotProtectState,
    })

    sendResponse({
      ...popupSnapshot,
      type: SUPPORT_GET_POPUP_STATE_MESSAGE_TYPE,
    })
    return false
  }

  if (
    received
    && typeof received === 'object'
    && (received as { type?: string }).type === SUPPORT_PROBE_MESSAGE_TYPE
  ) {
    void runSupportProbe()
      .then((response) => sendResponse(response))
      .catch((error) => {
        sendResponse({
          ok: false,
          type: SUPPORT_PROBE_MESSAGE_TYPE,
          error: error instanceof Error ? error.message : String(error),
        })
      })

    return true
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

function onStorageChanged(
  changes: Record<string, chrome.storage.StorageChange>,
  areaName: string,
) {
  if (areaName !== 'local' || !changes[WORLD_PLAYERS_STORAGE_KEY]) {
    return
  }

  void maybeHandleLoginReconnect()
}

async function bootstrap() {
  const scope = window as ToolkitWindow

  if (scope[BOOTSTRAP_KEY]) {
    return
  }

  scope[BOOTSTRAP_KEY] = true
  probedBotProtectState = null
  syncedBotProtectState = null

  console.log('[CS][SUPPORT] bootstrap')

  chrome.runtime.onMessage.addListener(onExtensionMessage)
  chrome.storage.onChanged.addListener(onStorageChanged)

  if (await maybeHandleLoginReconnect()) {
    return
  }

  await syncBotProtectStateIfChanged({
    force: true,
  })
  // se estiver em info_player screen e a imagem for atualizada
  await infoPlayer()
  installBotProtectObserver()
  installChangeGlobalSupport()
}

void bootstrap()

export {};
