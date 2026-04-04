/// <reference types="chrome" />

import { extensionId as RELEASE_EXTENSION_ID } from '@toolkit-tw-bot/release'
import { getParamsUrl } from '@toolkit-tw-bot/core'
import type { SWMessage } from '../../types'
import { syncTabActionByTabId } from '../action-state'
import {
  ensureEnabledByUserLoaded,
  getPlayerEnabledByUser,
} from '../enabled-by-user'
import { cleanupLoginTabsForScope } from './cleanup-login-tabs'
import {
  CTX_MESSAGE_TYPE,
  START_MESSAGE_TYPE,
  STOP_MESSAGE_TYPE,
  SUPPORT_SYNC_CTX_MESSAGE_TYPE,
} from '../message/types'
import { getRunnerByScope, type RunnerRecord } from '../runner-tabs'
import { reconcileActiveRunner } from '../runtime'
import { getWorldPlayer, upsertWorldPlayer, type WorldPlayerRecord } from '../world-players'
import { runtimeAllowedByLicense } from '../world-players/runtime'
import { type PreparedMessageData, upsertPreparedContext } from './index'

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
}

type RunnerCommandData = {
  isRunningTab: boolean
  enabledByUser: boolean
  isAllowedByLicense: boolean
  isLicenseExpiring: boolean
  isBotProtected: boolean
  isTryConfirm: boolean
  isMdfScope: boolean
}

function isRunnerForSender(
  runner: RunnerRecord | null,
  sender: chrome.runtime.MessageSender,
) {
  return (
    runner !== null
    && typeof sender.tab?.id === 'number'
    && typeof sender.tab?.windowId === 'number'
    && runner.tabId === sender.tab.id
    && runner.windowId === sender.tab.windowId
  )
}

async function createRunnerCommandData({
  isRunningTab,
  world = null,
  playerId = null,
  worldPlayer = null,
  isTryConfirm = false,
  isMdfScope = false,
}: {
  isRunningTab: boolean
  world?: string | null
  playerId?: number | null
  worldPlayer?: WorldPlayerRecord | null
  isTryConfirm?: boolean
  isMdfScope?: boolean
}): Promise<RunnerCommandData> {
  const currentWorldPlayer = worldPlayer ?? getWorldPlayer(world, playerId)
  const { isAllowedByLicense, isLicenseExpiring } = await runtimeAllowedByLicense(currentWorldPlayer)

  return {
    isRunningTab,
    enabledByUser: getPlayerEnabledByUser(world, playerId),
    isAllowedByLicense,
    isLicenseExpiring,
    isBotProtected: false,
    isTryConfirm,
    isMdfScope,
  }
}

async function postRunnerCommandToSender(
  sender: chrome.runtime.MessageSender,
  {
    type,
    scopeKey = null,
    data,
  }: {
    type: string
    scopeKey?: string | null
    data: RunnerCommandData
  },
) {
  const tabId = sender.tab?.id

  if (typeof tabId !== 'number') {
    console.warn('[SW][CTX] missing sender tabId for command', {
      type,
      scopeKey,
      data,
    })
    return false
  }

  try {
    await chrome.tabs.sendMessage(tabId, {
      extensionId: RELEASE_EXTENSION_ID,
      type,
      scopeKey,
      data,
    })

    console.log('[SW][CTX] command sent', {
      type,
      tabId,
      windowId: sender.tab?.windowId ?? null,
      scopeKey,
      data,
    })

    return true
  } catch {
    console.warn('[SW][CTX] command failed', {
      type,
      tabId,
      windowId: sender.tab?.windowId ?? null,
      scopeKey,
      data,
    })
    return false
  }
}

export async function registerPreparedCtx(
  received: PreparedContextRequest,
  sender: chrome.runtime.MessageSender,
) {
  await ensureEnabledByUserLoaded()

  const tabContext = await upsertPreparedContext(sender, received.data || {})

  if (!tabContext) {
    return {
      ok: false,
      error: 'Missing sender tab context',
      type: CTX_MESSAGE_TYPE,
    }
  }

  const worldPlayer = tabContext.world && typeof tabContext.playerId === 'number'
    ? await upsertWorldPlayer({
      world: tabContext.world,
      playerId: tabContext.playerId,
      playerName: tabContext.playerName,
      dateStarted: tabContext.dateStarted,
      scopeKey: tabContext.scopeKey,
    })
    : null

  await reconcileActiveRunner({
    preferredWindowId: sender.tab?.windowId ?? null,
    reason: CTX_MESSAGE_TYPE,
    targetScopeKey: tabContext.scopeKey,
  })

  const currentRunner = getRunnerByScope(tabContext.scopeKey)
  const isActive = isRunnerForSender(currentRunner, sender)

  console.log('[SW][CTX] received', {
    tabId: sender.tab?.id ?? null,
    windowId: sender.tab?.windowId ?? null,
    url: sender.tab?.url ?? null,
    currentRunner,
    isActive,
    data: received.data ?? null,
  })

  const data = await createRunnerCommandData({
    isRunningTab: isActive,
    world: tabContext.world,
    playerId: tabContext.playerId,
    worldPlayer,
    isTryConfirm: getParamsUrl(sender.tab?.url || '').isTryConfirm === true,
    isMdfScope: tabContext.t !== null,
  })
  const shouldStart = isActive && data.enabledByUser && data.isAllowedByLicense

  await postRunnerCommandToSender(sender, {
    type: shouldStart ? START_MESSAGE_TYPE : STOP_MESSAGE_TYPE,
    scopeKey: tabContext.scopeKey,
    data,
  })

  await syncTabActionByTabId(tabContext.tabId)

  if (tabContext.context === 'GAME' && shouldStart) {
    try {
      await cleanupLoginTabsForScope({
        scopeKey: tabContext.scopeKey,
        keepTabId: tabContext.tabId,
      })
    } catch (error) {
      console.warn('[SW][CTX] cleanup login tabs failed', {
        tabId: tabContext.tabId,
        scopeKey: tabContext.scopeKey,
        error,
      })
    }
  }

  return {
    ok: true,
    type: CTX_MESSAGE_TYPE,
    active: isActive,
    scopeKey: tabContext.scopeKey,
    context: tabContext.context,
    world: tabContext.world,
    t: tabContext.t,
    enabledByUser: data.enabledByUser,
    tabId: tabContext.tabId,
    windowId: tabContext.windowId,
  }
}

export async function syncSupportCtx(
  received: SupportSyncCtxRequest,
  sender: chrome.runtime.MessageSender,
) {
  await ensureEnabledByUserLoaded()

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

  const tabContext = await upsertPreparedContext(sender, {
    context: 'GAME',
    world,
    t,
    isBotProtected,
    playerId,
    playerName,
    features: received.features,
    points: received.points,
    rank: received.rank,
    villages: received.villages,
    dateStarted: received.dateStarted,
  })

  if (!tabContext) {
    return {
      ok: false,
      error: 'Missing sender tab context',
      type: SUPPORT_SYNC_CTX_MESSAGE_TYPE,
    }
  }

  if (tabContext.world && typeof tabContext.playerId === 'number') {
    await upsertWorldPlayer({
      world: tabContext.world,
      playerId: tabContext.playerId,
      playerName: tabContext.playerName,
      dateStarted: tabContext.dateStarted,
      scopeKey: tabContext.scopeKey,
    })
  }

  const currentRunner = getRunnerByScope(tabContext.scopeKey)
  const isActive = isRunnerForSender(currentRunner, sender)
  const isTryConfirm = getParamsUrl(sender.tab?.url || '').isTryConfirm === true
  const data = await createRunnerCommandData({
    isRunningTab: isActive,
    world: tabContext.world,
    playerId: tabContext.playerId,
    isTryConfirm,
    isMdfScope: tabContext.t !== null,
  })
  data.isBotProtected = isBotProtected

  await syncTabActionByTabId(tabContext.tabId)

  return {
    ok: true,
    type: SUPPORT_SYNC_CTX_MESSAGE_TYPE,
    scopeKey: tabContext.scopeKey,
    context: tabContext.context,
    world: tabContext.world,
    playerId: tabContext.playerId,
    playerName: tabContext.playerName,
    data: {
      ...data,
    },
  }
}
