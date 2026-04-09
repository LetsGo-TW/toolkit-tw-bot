/// <reference types="chrome" />

import { extensionId as RELEASE_EXTENSION_ID } from '@toolkit-tw-bot/release'
import { getParamsUrl } from '@toolkit-tw-bot/core'
import { syncTabActionByTabId } from './action-state'
import {
  ensureEnabledByUserLoaded,
} from './enabled-by-user'
import { cleanupLoginTabsForScope } from './prepared-context/cleanup-login-tabs'
import { hasErrorAlarmForTab } from './prepared-context/error-tabId'
import {
  getTabIdsByWorldPlayer,
  syncPreparedContextsByWorldPlayer,
  type PreparedMessageData,
  upsertPreparedContext,
} from './prepared-context'
import { START_MESSAGE_TYPE, STOP_MESSAGE_TYPE } from './message/types'
import { getRunnerByScope, type RunnerRecord } from './runner-tabs'
import { evaluateWorldPlayerState } from './resolved-state'
import { reconcileActiveRunner } from './runtime'
import {
  getWorldPlayerByScopeKey,
  upsertWorldPlayer,
  type WorldPlayerRecord,
} from './world-players'
import { ensureWorldPlayerLicense } from './world-players/license/ensure-world-player-license'

type RunnerCommandData = {
  isRunningTab: boolean
  enabledByUser: boolean
  isAllowedByLicense: boolean
  isLicenseExpiring: boolean
  isBotProtected: boolean
  isConnectServerError: boolean
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
  isConnectServerError?: boolean
  avatarUrl?: string | null
  avatarUpdatedAt?: string | null
  ensureWorldPlayerLicenseSource?: 'button' | 'runtime' | null
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
  scopeKey = null,
  world = null,
  playerId = null,
  worldPlayer = null,
  isTryConfirm = false,
  isConnectServerError = false,
  isNetError = false,
  isIntro = false,
  isMdfScope = false,
}: {
  isRunningTab: boolean
  scopeKey?: string | null
  world?: string | null
  playerId?: number | null
  worldPlayer?: WorldPlayerRecord | null
  isTryConfirm?: boolean
  isConnectServerError?: boolean
  isNetError?: boolean
  isIntro?: boolean
  isMdfScope?: boolean
}): Promise<RunnerCommandData> {
  const evaluatedState = await evaluateWorldPlayerState({
    scopeKey,
    world,
    playerId,
    worldPlayer,
  })

  return {
    isRunningTab,
    enabledByUser: evaluatedState.enabledByUser === true,
    isAllowedByLicense: evaluatedState.isAllowedByLicense,
    isLicenseExpiring: evaluatedState.isLicenseExpiring,
    isBotProtected: false,
    isConnectServerError,
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
  isConnectServerError = false,
  avatarUrl = null,
  avatarUpdatedAt = null,
  ensureWorldPlayerLicenseSource = null,
  reconcileRunner: shouldReconcileRunner = false,
  cleanupLoginTabs: shouldCleanupLoginTabs = false,
}: SyncSenderVisibleStateArgs) {
  await ensureEnabledByUserLoaded()

  const tabContext = await upsertPreparedContext(sender, {
    context,
    world,
    t,
    isBotProtected,
    isConnectServerError,
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

  let worldPlayer = tabContext.world && typeof tabContext.playerId === 'number'
    ? await upsertWorldPlayer({
      world: tabContext.world,
      playerId: tabContext.playerId,
      playerName: tabContext.playerName,
      avatarUrl,
      avatarUpdatedAt,
      dateStarted: tabContext.dateStarted,
      scopeKey: tabContext.scopeKey,
    })
    : tabContext.scopeKey
      ? getWorldPlayerByScopeKey(tabContext.scopeKey)
      : null

  const resolvedWorld = tabContext.world ?? worldPlayer?.world ?? null
  const resolvedPlayerId = tabContext.playerId ?? worldPlayer?.playerId ?? null

  if (
    ensureWorldPlayerLicenseSource
    && resolvedWorld
    && typeof resolvedPlayerId === 'number'
  ) {
    const ensured = await ensureWorldPlayerLicense(
      resolvedWorld,
      resolvedPlayerId,
      ensureWorldPlayerLicenseSource,
    )

    worldPlayer = ensured?.worldPlayer ?? worldPlayer
  }

  const evaluatedState = await evaluateWorldPlayerState({
    scopeKey: tabContext.scopeKey,
    world: tabContext.world,
    t: tabContext.t,
    playerId: tabContext.playerId,
    playerName: tabContext.playerName,
    worldPlayer,
  })

  const trackedRunnerBeforeReconcile = getRunnerByScope(tabContext.scopeKey)
  const shouldPreserveTrackedRunner = (
    trackedRunnerBeforeReconcile !== null
    && !isRunnerForSender(trackedRunnerBeforeReconcile, sender)
  )

  if (shouldReconcileRunner) {
    if (shouldPreserveTrackedRunner) {
      console.log('[SW][CTX] skipping reconcile to preserve tracked runner', {
        reason,
        scopeKey: tabContext.scopeKey,
        senderTabId: sender.tab?.id ?? null,
        senderWindowId: sender.tab?.windowId ?? null,
        trackedRunnerTabId: trackedRunnerBeforeReconcile.tabId,
        trackedRunnerWindowId: trackedRunnerBeforeReconcile.windowId,
      })
    } else {
      await reconcileActiveRunner({
        preferredWindowId: sender.tab?.windowId ?? null,
        reason,
        targetScopeKey: tabContext.scopeKey,
      })
    }
  }

  const currentRunner = getRunnerByScope(tabContext.scopeKey)
  const isActive = isRunnerForSender(currentRunner, sender)
  const isNetError = await hasErrorAlarmForTab(tabContext.tabId)
  const data = await createRunnerCommandData({
    isRunningTab: isActive,
    scopeKey: evaluatedState.scopeKey,
    world: evaluatedState.world,
    playerId: evaluatedState.playerId,
    worldPlayer: evaluatedState.worldPlayer,
    isConnectServerError: tabContext.isConnectServerError === true,
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

  const relatedTabIds = (
    evaluatedState.world
    && typeof evaluatedState.playerId === 'number'
  )
    ? await syncPreparedContextsByWorldPlayer({
      world: evaluatedState.world,
      playerId: evaluatedState.playerId,
      playerName: evaluatedState.playerName,
      features: tabContext.features,
      points: tabContext.points,
      rank: tabContext.rank,
      villages: tabContext.villages,
      dateStarted: tabContext.dateStarted,
    })
    : getTabIdsByWorldPlayer(evaluatedState.world || '', evaluatedState.playerId ?? -1)

  const tabIdsToRefresh = Array.from(
    new Set([
      tabContext.tabId,
      ...relatedTabIds,
    ]),
  )

  await Promise.all(
    tabIdsToRefresh.map((tabId) => syncTabActionByTabId(tabId)),
  )

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
    worldPlayer: evaluatedState.worldPlayer,
    currentRunner,
    isActive,
    data,
    shouldStart,
  }
}
