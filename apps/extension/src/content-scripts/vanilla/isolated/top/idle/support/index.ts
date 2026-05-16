/// <reference types="chrome" />

import { getParamsUrl } from "@toolkit-tw-bot/core"
import { extensionId as RELEASE_EXTENSION_ID } from '@toolkit-tw-bot/release'
import { SUPPORT_SYNC_CTX_MESSAGE_TYPE } from "../../../../../../service-worker/message/types"
import {
  isPreparedConnectServerError,
  STARTER_PREPARED_ERROR,
  STARTER_PREPARED_READY,
} from "../../../../shared/preparedBootstrap"
import { setActiveTitle } from "../../../../shared/setActiveTitle"
import { installChangeGlobalSupport } from "./changeGlobal"
import {
  SUPPORT_GET_POPUP_STATE_MESSAGE_TYPE,
  SUPPORT_LOGOUT_MESSAGE_TYPE,
  SUPPORT_PROBE_MESSAGE_TYPE,
} from './message-types'
import {
  infoPlayer,
  isSupportInfoPlayerMessage,
  syncPlayerAvatar,
} from "./info-player"
import { getCurrentGameData, getFreshGameBotProtectObservation, getPopupPageSnapshot, isFinitePlayerId } from "./current"
import { isFetchCurrentDocumentTimeoutError } from "./fetchCurrentDocument"
import { maybeHandleLoginReconnect } from './loginReconnect'
import Tooltip from "@toolkit-tw-bot/document/tooltip";

const BOOTSTRAP_KEY = '__toolkitTwBotIsolatedTopIdleSupport__'
const WORLD_PLAYERS_STORAGE_KEY = 'worldPlayers'
const BOT_VIEW_TOOLTIP_SELECTOR = '#go-extension-bot-view [data-go-bot-view-tooltip]'

type ToolkitWindow = Window & {
  [BOOTSTRAP_KEY]?: boolean
}

type SupportAuxiliaryErrorKind = 'timeout' | 'fetch' | 'unknown'

let probedBotProtectState: boolean | null = null
let syncedBotProtectState: boolean | null = null
let botProtectStateSyncTimer: ReturnType<typeof setTimeout> | null = null
let unbindBotViewTooltip: (() => void) | null = null

function getSupportAuxiliaryErrorMeta(error: unknown): {
  kind: SupportAuxiliaryErrorKind
  message: string
} {
  if (isFetchCurrentDocumentTimeoutError(error)) {
    return {
      kind: 'timeout',
      message: error.message,
    }
  }

  if (error instanceof Error) {
    return {
      kind: 'fetch',
      message: error.message || error.name,
    }
  }

  return {
    kind: 'unknown',
    message: String(error),
  }
}

function getChromeStorageApi() {
  try {
    return chrome?.storage ?? null
  } catch {
    return null
  }
}

function requestLogoutToReconnectLogin() {
  const gameData = getCurrentGameData()
  const linkBasePure = typeof gameData?.link_base_pure === 'string'
    ? gameData.link_base_pure.trim()
    : ''
  const csrf = typeof gameData?.csrf === 'string'
    ? gameData.csrf.trim()
    : ''

  if (!linkBasePure || !csrf) {
    return {
      ok: false,
      reason: 'missing-game-data-logout-parts',
      hasLinkBasePure: Boolean(linkBasePure),
      hasCsrf: Boolean(csrf),
    }
  }

  const url = new URL(
    `${linkBasePure}&action=logout&h=${csrf}`,
    window.location.origin,
  )

  window.setTimeout(() => {
    window.location.assign(url.href)
  }, 0)

  return {
    ok: true,
    href: url.href,
    type: SUPPORT_LOGOUT_MESSAGE_TYPE,
  }
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

async function syncCtxAndTitle({
  isBotProtected,
  isConnectServerError,
}: {
  isBotProtected?: boolean | null
  isConnectServerError?: boolean | null
} = {}) {
  const gameData = getCurrentGameData();
  const botProtectObservation = getFreshGameBotProtectObservation(document)

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
      : botProtectObservation.active,
    isConnectServerError: typeof isConnectServerError === 'boolean'
      ? isConnectServerError
      : isPreparedConnectServerError(document),
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
  const isBotProtected = getFreshGameBotProtectObservation(document).active

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

function ensureBotViewTooltipOnce() {
  if (unbindBotViewTooltip) {
    return
  }

  const tooltip = new Tooltip()

  unbindBotViewTooltip = tooltip.bind(document, BOT_VIEW_TOOLTIP_SELECTOR, (el) => {
    const value = String(el?.getAttribute?.('data-go-bot-view-tooltip') || '').trim()
    return value || null
  })
}

async function runSupportProbe() {
  const isBotProtected = getFreshGameBotProtectObservation(document).active
  const isConnectServerError = isPreparedConnectServerError(document)

  probedBotProtectState = isBotProtected
  syncedBotProtectState = isBotProtected

  let avatarThrownErrorKind: SupportAuxiliaryErrorKind | null = null
  const avatarResponse = await syncPlayerAvatar().catch((error) => {
    const meta = getSupportAuxiliaryErrorMeta(error)
    avatarThrownErrorKind = meta.kind

    return {
      ok: false,
      error: meta.message,
    }
  })

  const ctxResponse = await syncCtxAndTitle({
    isBotProtected,
  })

  const avatarError = (
    avatarResponse
    && typeof avatarResponse === 'object'
    && 'ok' in avatarResponse
    && (avatarResponse as { ok?: boolean }).ok === false
    && 'error' in avatarResponse
    && typeof (avatarResponse as { error?: unknown }).error === 'string'
  )
    ? (avatarResponse as { error: string }).error
    : null

  const avatarFetchError = avatarError !== null
  const avatarFetchErrorKind = avatarFetchError
    ? avatarThrownErrorKind ?? 'fetch'
    : null

  return {
    ok: true,
    type: SUPPORT_PROBE_MESSAGE_TYPE,
    isBotProtected,
    isConnectServerError,
    avatarFetchError,
    avatarFetchErrorKind,
    error: avatarError,
    avatarResponse,
    ctxResponse,
    snapshot: getPopupPageSnapshot({
      isBotProtected,
      isConnectServerError,
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
      isConnectServerError: isPreparedConnectServerError(document),
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
    && (received as { type?: string }).type === SUPPORT_LOGOUT_MESSAGE_TYPE
  ) {
    sendResponse(requestLogoutToReconnectLogin())
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

function onPreparedBootstrapStateMessage(event: MessageEvent<unknown>) {
  const data = getPageMessageData(event)

  if (!data) {
    return
  }

  if (data.type === STARTER_PREPARED_READY) {
    void syncCtxAndTitle({
      isConnectServerError: false,
    }).catch((error) => {
      console.error('[CS][SUPPORT][PREPARED_READY]', error)
    })
    return
  }

  if (data.type === STARTER_PREPARED_ERROR && data.isConnectServerError === true) {
    void syncCtxAndTitle({
      isConnectServerError: true,
    }).catch((error) => {
      console.error('[CS][SUPPORT][PREPARED_ERROR]', error)
    })
  }
}

async function bootstrap() {
  const scope = window as ToolkitWindow
  const storageApi = getChromeStorageApi()

  if (scope[BOOTSTRAP_KEY]) {
    return
  }

  scope[BOOTSTRAP_KEY] = true
  probedBotProtectState = null
  syncedBotProtectState = null

  console.log('[CS][SUPPORT] bootstrap')

  chrome.runtime.onMessage.addListener(onExtensionMessage)
  if (storageApi?.onChanged) {
    storageApi.onChanged.addListener(onStorageChanged)
  }
  window.addEventListener('message', onPreparedBootstrapStateMessage, true)
  ensureBotViewTooltipOnce()

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
