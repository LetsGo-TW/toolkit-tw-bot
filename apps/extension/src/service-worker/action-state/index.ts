/// <reference types="chrome" />

import { getParamsUrl } from '@toolkit-tw-bot/core'
import { syncTabAction } from '../action'
import { POPUP_REFRESH_MESSAGE_TYPE } from '../message/types'
import {
  getOpenTwTabIds,
  getTabContext,
  getTabUrl,
  getWorldFromUrl,
  isTribalWarsUrl,
} from '../prepared-context'
import {
  getRunnerForTab,
  type RunnerByScope,
} from '../runner-tabs'
import { evaluateWorldPlayerState } from '../resolved-state'
import {
  ensureWorldPlayersLoaded,
  getWorldPlayerByScopeKey,
} from '../world-players'
import { hasErrorAlarmForTab } from '../prepared-context/error-tabId'

async function notifyPopupRefresh(payload: Record<string, unknown> = {}) {
  try {
    await chrome.runtime.sendMessage({
      type: POPUP_REFRESH_MESSAGE_TYPE,
      ...payload,
    })
  } catch {
    // Popup closed or no receiver registered.
  }
}

export async function syncTabActionByTabId(tabId?: number | null) {
  if (typeof tabId !== 'number') {
    return
  }

  await ensureWorldPlayersLoaded()

  let tab: chrome.tabs.Tab | null = null

  try {
    tab = await chrome.tabs.get(tabId)
  } catch {
    return
  }

  const tabUrl = getTabUrl(tab)
  const context = getTabContext(tabId)
  const currentRunner = getRunnerForTab(tabId, tab?.windowId)
  const runnerWorldPlayer = currentRunner
    ? getWorldPlayerByScopeKey(currentRunner.scopeKey)
    : null
  const urlParams = tabUrl ? getParamsUrl(tabUrl) : {}
  const enabled = isTribalWarsUrl(tabUrl)
  const isActiveRunner = Boolean(
    enabled
    && currentRunner
    && currentRunner.tabId === tabId
    && currentRunner.windowId === tab?.windowId
  )
  const world = context?.world ?? (isActiveRunner ? currentRunner?.world ?? runnerWorldPlayer?.world ?? null : getWorldFromUrl(tabUrl))
  const playerId = context?.playerId ?? runnerWorldPlayer?.playerId ?? null
  const evaluatedState = await evaluateWorldPlayerState({
    scopeKey: currentRunner?.scopeKey ?? context?.scopeKey ?? null,
    world,
    t: context?.t ?? (isActiveRunner ? currentRunner?.t ?? null : urlParams.t ?? null),
    playerId,
    playerName: context?.playerName ?? runnerWorldPlayer?.playerName ?? null,
    worldPlayer: runnerWorldPlayer,
  })
  const isNetError = await hasErrorAlarmForTab(tabId)
  const isConnectServerError = context?.isConnectServerError === true

  await syncTabAction({
    tabId,
    enabled,
    enabledByUser: evaluatedState.enabledByUser,
    active: isActiveRunner,
    context: context?.context ?? (urlParams.isInLogin ? 'LOGIN' : urlParams.isInGame ? 'GAME' : null),
    world: evaluatedState.world,
    t: evaluatedState.t,
    playerName: evaluatedState.playerName,
    isTryConfirm: context?.isTryConfirm === true || urlParams.isTryConfirm === true,
    botProtect: context?.isBotProtected === true,
    isConnectServerError,
    isNetError,
    license: evaluatedState.license,
  })

  await notifyPopupRefresh({
    tabId,
    windowId: tab.windowId ?? null,
    context: context?.context ?? (urlParams.isInLogin ? 'LOGIN' : urlParams.isInGame ? 'GAME' : null),
    world: evaluatedState.world,
    t: evaluatedState.t,
    playerId: evaluatedState.playerId,
    playerName: evaluatedState.playerName,
    features: context?.features ?? null,
    points: context?.points ?? null,
    rank: context?.rank ?? null,
    villages: context?.villages ?? null,
    dateStarted: context?.dateStarted ?? null,
    updatedAt: context?.updatedAt ?? null,
    enabledByUser: evaluatedState.enabledByUser,
    isBotProtected: context?.isBotProtected === true,
    isConnectServerError,
    isNetError,
    isTryConfirm: context?.isTryConfirm === true || urlParams.isTryConfirm === true,
    active: isActiveRunner,
    license: evaluatedState.license,
  })
}

export async function syncRunnerActions(
  previousRunnerByScope: RunnerByScope,
  nextRunnerByScope: RunnerByScope,
) {
  const tabIds = new Set<number>()

  Object.values(previousRunnerByScope).forEach((runner) => {
    if (typeof runner?.tabId === 'number') {
      tabIds.add(runner.tabId)
    }
  })

  Object.values(nextRunnerByScope).forEach((runner) => {
    if (typeof runner?.tabId === 'number') {
      tabIds.add(runner.tabId)
    }
  })

  await Promise.all(
    Array.from(tabIds).map((tabId) => syncTabActionByTabId(tabId)),
  )
}

export async function syncKnownTabActions() {
  const openTwTabIds = await getOpenTwTabIds()

  await Promise.all(
    openTwTabIds.map((tabId) => syncTabActionByTabId(tabId)),
  )
}
