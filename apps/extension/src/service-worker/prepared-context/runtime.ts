/// <reference types="chrome" />

import type { SWMessage } from '../../types'
import { syncTabActionByTabId } from '../action-state'
import {
  ensureEnabledByUserLoaded,
  getPlayerEnabledByUser,
} from '../enabled-by-user'
import {
  CTX_MESSAGE_TYPE,
  START_MESSAGE_TYPE,
  STOP_MESSAGE_TYPE,
} from '../message/types'
import { getRunnerByScope, type RunnerRecord } from '../runner-tabs'
import { reconcileActiveRunner } from '../runtime'
import { type PreparedMessageData, upsertPreparedContext } from './index'

type PreparedContextRequest = SWMessage & {
  data?: PreparedMessageData
}

type RunnerCommandData = {
  isRunningTab: boolean
  enabledByUser: boolean
  isAllowedByLicense: boolean
  isLicenseExpiring: boolean
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

function createRunnerCommandData({
  isRunningTab,
  playerId = null,
  isTryConfirm = false,
  isMdfScope = false,
}: {
  isRunningTab: boolean
  playerId?: number | null
  isTryConfirm?: boolean
  isMdfScope?: boolean
}): RunnerCommandData {
  return {
    isRunningTab,
    enabledByUser: typeof playerId === 'number'
      ? getPlayerEnabledByUser(playerId)
      : true,
    isAllowedByLicense: true,
    isLicenseExpiring: false,
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
      extensionId: chrome.runtime.id,
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

  const data = createRunnerCommandData({
    isRunningTab: isActive,
    playerId: tabContext.playerId,
    isTryConfirm: tabContext.isTryConfirm === true,
    isMdfScope: tabContext.t !== null,
  })
  const shouldStart = isActive && data.enabledByUser && data.isAllowedByLicense

  await postRunnerCommandToSender(sender, {
    type: shouldStart ? START_MESSAGE_TYPE : STOP_MESSAGE_TYPE,
    scopeKey: tabContext.scopeKey,
    data,
  })

  await syncTabActionByTabId(tabContext.tabId)

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
