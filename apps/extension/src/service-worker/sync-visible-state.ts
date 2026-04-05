/// <reference types="chrome" />

import { extensionId as RELEASE_EXTENSION_ID } from '@toolkit-tw-bot/release'
import { getParamsUrl } from '@toolkit-tw-bot/core'
import { syncTabActionByTabId } from './action-state'
import {
  ensureEnabledByUserLoaded,
  getPlayerEnabledByUser,
} from './enabled-by-user'
import { cleanupLoginTabsForScope } from './prepared-context/cleanup-login-tabs'
import { hasErrorAlarmForTab } from './prepared-context/error-tabId'
import { type PreparedMessageData, upsertPreparedContext } from './prepared-context'
import { START_MESSAGE_TYPE, STOP_MESSAGE_TYPE } from './message/types'
import { getRunnerByScope, type RunnerRecord } from './runner-tabs'
import { reconcileActiveRunner } from './runtime'
import { getWorldPlayer, upsertWorldPlayer, type WorldPlayerRecord } from './world-players'
import { runtimeAllowedByLicense } from './world-players/runtime'

type RunnerCommandData = {
  isRunningTab: boolean
  enabledByUser: boolean
  isAllowedByLicense: boolean
  isLicenseExpiring: boolean
  isBotProtected: boolean
  isNetError: boolean
  isTryConfirm: boolean
  isIntro: boolean
  isMdfScope: boolean
}

type SyncSenderVisibleStateArgs = {
  sender: chrome.runtime.MessageSender
  reason: string
  context?: PreparedMessageData['context']
  world?: string | null
  t?: number | null
  playerId?: number | null
  playerName?: string | null
  features?: unknown
  points?: unknown
  rank?: unknown
  villages?: unknown
  dateStarted?: unknown
  isBotProtected?: boolean
  avatarUrl?: string | null
  avatarUpdatedAt?: string | null
  reconcileRunner?: boolean
  cleanupLoginTabs?: boolean
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
  isNetError = false,
  isIntro = false,
  isMdfScope = false,
}: {
  isRunningTab: boolean
  world?: string | null
  playerId?: number | null
  worldPlayer?: WorldPlayerRecord | null
  isTryConfirm?: boolean
  isNetError?: boolean
  isIntro?: boolean
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
    isNetError,
    isTryConfirm,
    isIntro,
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

export async function syncSenderVisibleState({
  sender,
  reason,
  context = 'GAME',
  world = null,
  t = null,
  playerId = null,
  playerName = null,
  features = null,
  points = null,
  rank = null,
  villages = null,
  dateStarted = null,
  isBotProtected = false,
  avatarUrl = null,
  avatarUpdatedAt = null,
  reconcileRunner: shouldReconcileRunner = false,
  cleanupLoginTabs: shouldCleanupLoginTabs = false,
}: SyncSenderVisibleStateArgs) {
  await ensureEnabledByUserLoaded()

  const tabContext = await upsertPreparedContext(sender, {
    context,
    world,
    t,
    isBotProtected,
    playerId,
    playerName,
    features,
    points,
    rank,
    villages,
    dateStarted,
  })

  if (!tabContext) {
    return {
      ok: false,
      error: 'Missing sender tab context',
      type: reason,
    }
  }

  const worldPlayer = tabContext.world && typeof tabContext.playerId === 'number'
    ? await upsertWorldPlayer({
      world: tabContext.world,
      playerId: tabContext.playerId,
      playerName: tabContext.playerName,
      avatarUrl,
      avatarUpdatedAt,
      dateStarted: tabContext.dateStarted,
      scopeKey: tabContext.scopeKey,
    })
    : null

  if (shouldReconcileRunner) {
    await reconcileActiveRunner({
      preferredWindowId: sender.tab?.windowId ?? null,
      reason,
      targetScopeKey: tabContext.scopeKey,
    })
  }

  const currentRunner = getRunnerByScope(tabContext.scopeKey)
  const isActive = isRunnerForSender(currentRunner, sender)
  const isNetError = await hasErrorAlarmForTab(tabContext.tabId)
  const data = await createRunnerCommandData({
    isRunningTab: isActive,
    world: tabContext.world,
    playerId: tabContext.playerId,
    worldPlayer,
    isNetError,
    isTryConfirm: getParamsUrl(sender.tab?.url || '').isTryConfirm === true,
    isIntro: getParamsUrl(sender.tab?.url || '').isIntro === true,
    isMdfScope: tabContext.t !== null,
  })

  data.isBotProtected = tabContext.isBotProtected === true

  const shouldStart = isActive && data.enabledByUser && data.isAllowedByLicense

  await postRunnerCommandToSender(sender, {
    type: shouldStart ? START_MESSAGE_TYPE : STOP_MESSAGE_TYPE,
    scopeKey: tabContext.scopeKey,
    data,
  })

  await syncTabActionByTabId(tabContext.tabId)

  if (shouldCleanupLoginTabs && tabContext.context === 'GAME' && shouldStart) {
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
    type: reason,
    tabContext,
    worldPlayer,
    currentRunner,
    isActive,
    data,
    shouldStart,
  }
}
