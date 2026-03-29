/// <reference types="chrome" />

import { syncTabActionByTabId } from '../action-state'
import {
  ensureEnabledByUserLoaded,
  ensurePlayerEnabledByUserRecord,
  getPlayerEnabledByUser,
} from '../enabled-by-user'
import { PREPARED_MESSAGE_TYPE } from '../message/types'
import { getCurrentRunner, isSameRunner, type RunnerRecord } from '../runner-tabs'
import { reconcileActiveRunner, syncSelectedRunnerState } from '../runtime'
import { type PreparedMessageData, upsertPreparedContext } from './index'

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

export async function registerPreparedContext(
  received: { data?: PreparedMessageData },
  sender: chrome.runtime.MessageSender,
) {
  await ensureEnabledByUserLoaded()

  const tabContext = await upsertPreparedContext(sender, received.data || {})

  if (!tabContext) {
    return {
      ok: false,
      error: 'Missing sender tab context',
      type: PREPARED_MESSAGE_TYPE,
    }
  }

  await ensurePlayerEnabledByUserRecord(tabContext.playerId)

  const previousRunner = getCurrentRunner()
  const nextRunner = await reconcileActiveRunner(PREPARED_MESSAGE_TYPE)
  const isActive = isRunnerForSender(nextRunner, sender)

  if (isActive && isSameRunner(previousRunner, nextRunner) && nextRunner) {
    await syncSelectedRunnerState(nextRunner)
  }

  await syncTabActionByTabId(tabContext.tabId)

  return {
    ok: true,
    type: PREPARED_MESSAGE_TYPE,
    active: isActive,
    scopeKey: tabContext.scopeKey,
    context: tabContext.context,
    world: tabContext.world,
    t: tabContext.t,
    enabledByUser: getPlayerEnabledByUser(tabContext.playerId),
    tabId: tabContext.tabId,
    windowId: tabContext.windowId,
  }
}
