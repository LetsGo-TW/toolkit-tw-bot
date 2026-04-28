/// <reference types="chrome" />

import type { SWMessage } from '../../types'
import {
  dispatchControllerForScope,
  getRunnerControllerScopeState,
  resolveGameStageInstruction,
} from '../controller/runner-controller'
import {
  CTX_MESSAGE_TYPE,
  GAME_STAGE_MESSAGE_TYPE,
  SUPPORT_SYNC_CTX_MESSAGE_TYPE,
} from '../message/types'
import { type PreparedMessageData } from './index'
import { syncSenderVisibleState } from '../sync-visible-state'
import { runtimeAllowedByLicense } from '../world-players/runtime'
import { ensureInjectedGameBotView } from './view'

type PreparedContextRequest = SWMessage & {
  data?: PreparedMessageData
}

type SupportSyncCtxRequest = Partial<SWMessage> & {
  world?: unknown
  t?: unknown
  playerId?: unknown
  playerName?: unknown
  features?: unknown
  points?: unknown
  rank?: unknown
  villages?: unknown
  dateStarted?: unknown
  isBotProtected?: unknown
  isConnectServerError?: unknown
}

function getScreenFromSenderUrl(sender?: chrome.runtime.MessageSender) {
  if (typeof sender?.url !== 'string' || !sender.url.trim()) {
    return null
  }

  try {
    return new URL(sender.url).searchParams.get('screen')
  } catch {
    return null
  }
}

export async function registerPreparedCtx(
  received: PreparedContextRequest,
  sender: chrome.runtime.MessageSender,
) {
  const result = await syncSenderVisibleState({
    sender,
    reason: CTX_MESSAGE_TYPE,
    context: received.data?.context,
    world: typeof received.data?.world === 'string' ? received.data.world : null,
    t: typeof received.data?.t === 'number' && Number.isFinite(received.data.t)
      ? received.data.t
      : null,
    playerId: typeof received.data?.playerId === 'number' && Number.isFinite(received.data.playerId)
      ? received.data.playerId
      : null,
    playerName: typeof received.data?.playerName === 'string' ? received.data.playerName : null,
    features: received.data?.features,
    points: received.data?.points,
    rank: received.data?.rank,
    villages: received.data?.villages,
    dateStarted: received.data?.dateStarted ?? received.data?.date_started ?? null,
    isBotProtected: received.data?.isBotProtected === true,
    isConnectServerError: false,
    ensureWorldPlayerLicenseSource: 'runtime',
    reconcileRunner: true,
    cleanupLoginTabs: true,
  })

  if (!result.ok) {
    return result
  }

  const { tabContext, currentRunner, isActive, data } = result

  console.log('[SW][CTX] received', {
    tabId: sender.tab?.id ?? null,
    windowId: sender.tab?.windowId ?? null,
    url: sender.tab?.url ?? null,
    currentRunner,
    isActive,
    data: received.data ?? null,
  })

  return {
    ok: true,
    type: CTX_MESSAGE_TYPE,
    active: isActive,
    scopeKey: tabContext?.scopeKey,
    context: tabContext?.context,
    world: tabContext?.world,
    t: tabContext?.t,
    enabledByUser: data?.enabledByUser,
    tabId: tabContext?.tabId,
    windowId: tabContext?.windowId,
    data: {
      ...data,
    },
  }
}

export async function syncSupportCtx(
  received: SupportSyncCtxRequest,
  sender: chrome.runtime.MessageSender,
) {
  const world = typeof received.world === 'string' ? received.world : null
  const playerId = typeof received.playerId === 'number' && Number.isFinite(received.playerId)
    ? received.playerId
    : null
  const playerName = typeof received.playerName === 'string' && received.playerName.trim()
    ? received.playerName.trim()
    : null
  const t = typeof received.t === 'number' && Number.isFinite(received.t)
    ? received.t
    : null
  const isBotProtected = received.isBotProtected === true

  const result = await syncSenderVisibleState({
    sender,
    reason: SUPPORT_SYNC_CTX_MESSAGE_TYPE,
    context: 'GAME',
    world,
    t,
    playerId,
    playerName,
    features: received.features ?? null,
    points: received.points ?? null,
    rank: received.rank ?? null,
    villages: received.villages ?? null,
    dateStarted: received.dateStarted ?? null,
    isBotProtected,
    isConnectServerError: received.isConnectServerError === true,
    ensureWorldPlayerLicenseSource: 'runtime',
  })

  if (!result.ok) {
    return result
  }

  const { tabContext, data } = result

  if (tabContext?.scopeKey) {
    try {
      const controllerScopeState = getRunnerControllerScopeState(tabContext.scopeKey)

      if (isBotProtected) {
        await dispatchControllerForScope(tabContext.scopeKey, {
          reason: 'bot-protect-detected:support-sync',
          source: SUPPORT_SYNC_CTX_MESSAGE_TYPE,
          allowFallback: false,
          executeNow: true,
          screen: getScreenFromSenderUrl(sender),
          isBotProtected: true,
        })
      } else if (!isBotProtected && tabContext?.scopeKey) {
        // Sempre tenta limpar quando botProtect=false
        const scopeState = getRunnerControllerScopeState(tabContext.scopeKey)
        if (scopeState?.botProtectActive === true || scopeState?.current?.machine === 'solver') {
          await dispatchControllerForScope(tabContext.scopeKey, {
            reason: 'bot-protect-cleared:support-sync',
            source: SUPPORT_SYNC_CTX_MESSAGE_TYPE,
            allowFallback: false,
            executeNow: true,
            clearBotProtect: true,
            screen: getScreenFromSenderUrl(sender),
            isBotProtected: false,
          })
        }
      }
    } catch (error) {
      console.error('[SW][SUPPORT_SYNC_CTX][BOT_PROTECT_DISPATCH]', error)
    }
  }

  return {
    ok: true,
    type: SUPPORT_SYNC_CTX_MESSAGE_TYPE,
    scopeKey: tabContext?.scopeKey,
    context: tabContext?.context,
    world: tabContext?.world,
    playerId: tabContext?.playerId,
    playerName: tabContext?.playerName,
    data: {
      ...data,
    },
  }
}

export async function syncGameStage(
  received: Partial<SWMessage>,
  sender: chrome.runtime.MessageSender,
) {
  const world = typeof received.world === 'string' ? received.world : null
  const playerId = typeof received.playerId === 'number' && Number.isFinite(received.playerId)
    ? received.playerId
    : null
  const playerName = typeof received.playerName === 'string' && received.playerName.trim()
    ? received.playerName.trim()
    : null
  const t = typeof received.t === 'number' && Number.isFinite(received.t)
    ? received.t
    : null
  const avatarUrl = typeof received.avatarUrl === 'string' && received.avatarUrl.trim()
    ? received.avatarUrl.trim()
    : null
  const dateStarted = received.dateStarted ?? received.date_started ?? null
  const isBotProtected = received.isBotProtected === true
  const avatarUpdatedAt = avatarUrl ? new Date().toISOString() : null

  const result = await syncSenderVisibleState({
    sender,
    reason: GAME_STAGE_MESSAGE_TYPE,
    context: 'GAME',
    world,
    t,
    playerId,
    playerName,
    dateStarted,
    isBotProtected,
    avatarUrl,
    avatarUpdatedAt,
  })

  if (!result.ok) {
    return result
  }

  const { tabContext, isActive, data } = result
  const screen = getScreenFromSenderUrl(sender)

  const instruction = await resolveGameStageInstruction({
    scopeKey: tabContext?.scopeKey ?? null,
    shouldStart: isActive && data?.enabledByUser === true && data?.isAllowedByLicense === true,
    screen,
    isBotProtected,
    senderTabId: sender.tab?.id ?? null,
    senderWindowId: sender.tab?.windowId ?? null,
  })

  if (instruction) {
    const hasBotView = await ensureInjectedGameBotView(sender, 'running')

    if (!hasBotView) {
      return {
        ok: false,
        type: GAME_STAGE_MESSAGE_TYPE,
        error: 'bot-view-unavailable',
        reason: 'bot-view-unavailable',
        scopeKey: tabContext?.scopeKey ?? null,
      }
    }
  }

  return {
    ok: result?.data?.isAllowedByLicense === true,
    type: GAME_STAGE_MESSAGE_TYPE,
    scopeKey: tabContext?.scopeKey ?? null,
    machine: instruction?.machine ?? null,
    module: instruction?.module ?? null,
    data: instruction?.data ?? null,
    reason: instruction?.reason ?? null,
    source: instruction?.source ?? 'game-stage',
    dispatchId: instruction?.dispatchId ?? null,
  }
}
