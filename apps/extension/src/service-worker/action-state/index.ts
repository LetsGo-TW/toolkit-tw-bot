/// <reference types="chrome" />

import { getParamsUrl } from '@toolkit-tw-bot/core'
import { syncTabAction } from '../action'
import { getPlayerEnabledByUser } from '../enabled-by-user'
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
import {
  ensureWorldPlayersLoaded,
  getWorldPlayer,
  getWorldPlayerByScopeKey,
} from '../world-players'
import { runtimeLicenseState } from '../world-players/runtime'

async function notifyPopupRefresh() {
  try {
    await chrome.runtime.sendMessage({
      type: POPUP_REFRESH_MESSAGE_TYPE,
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
  const worldPlayer = getWorldPlayer(world, playerId) ?? runnerWorldPlayer
  const enabledByUser = world && typeof playerId === 'number'
    ? getPlayerEnabledByUser(world, playerId)
    : null
  const license = await runtimeLicenseState(worldPlayer)

  await syncTabAction({
    tabId,
    enabled,
    enabledByUser,
    active: isActiveRunner,
    context: context?.context ?? (urlParams.isInLogin ? 'LOGIN' : urlParams.isInGame ? 'GAME' : null),
    world,
    t: context?.t ?? (isActiveRunner ? currentRunner?.t ?? null : urlParams.t ?? null),
    playerName: context?.playerName ?? runnerWorldPlayer?.playerName ?? null,
    isTryConfirm: context?.isTryConfirm === true || urlParams.isTryConfirm === true,
    botProtect: context?.isBotProtected === true,
    license,
  })

  await notifyPopupRefresh()
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
