/// <reference types="chrome" />

import { getParamsUrl } from '@toolkit-tw-bot/core'
import { extensionId as RELEASE_EXTENSION_ID } from '@toolkit-tw-bot/release'
import { type FeaturesMap, type SWMessage } from '../../types'
import { SUPPORT_GET_POPUP_STATE_MESSAGE_TYPE } from '../../content-scripts/vanilla/isolated/top/idle/support/message-types'
import { ensureEnabledByUserLoaded, getPlayerEnabledByUser } from '../enabled-by-user'
import { GET_POPUP_STATE_MESSAGE_TYPE } from '../message/types'
import { normalizeNumber } from '../normalize'
import {
  getTabUrl,
  getWorldFromUrl,
  isTribalWarsUrl,
} from '../prepared-context'
import {
  ensureReconnectOnSessionExpiredLoaded,
  getPlayerReconnectOnSessionExpired,
} from '../reconnect-on-session-expired'
import { ensureRunnerTabsLoaded, getRunnerForTab } from '../runner-tabs'
import {
  ensureWorldPlayersLoaded,
  getWorldPlayer,
  getWorldPlayerByScopeKey,
} from '../world-players'
import { runtimeLicenseState } from '../world-players/runtime'

export type PopupStateRequest = Partial<SWMessage> & {
  targetTabId?: unknown
  targetWindowId?: unknown
}

type PopupPageState = {
  ok?: boolean
  context?: 'GAME' | 'LOGIN' | null
  world?: string | null
  t?: number | null
  playerId?: number | null
  playerName?: string | null
  features?: FeaturesMap | null
  points?: number | null
  rank?: number | null
  villages?: number | null
  dateStarted?: number | null
  isBotProtected?: boolean
  isTryConfirm?: boolean
}

function normalizeNumberish(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }

  if (typeof value === 'string' && value.trim()) {
    const numericValue = Number(value)

    if (Number.isFinite(numericValue)) {
      return numericValue
    }
  }

  return null
}

async function getActivePopupTab() {
  const tabs = await chrome.tabs.query({
    active: true,
    lastFocusedWindow: true,
    windowType: 'normal',
  })

  return tabs.find((tab) => typeof tab.id === 'number') || null
}

async function getRequestedPopupTab({ targetTabId, targetWindowId }: PopupStateRequest = {}) {
  const requestedTabId = normalizeNumber(targetTabId)
  const requestedWindowId = normalizeNumber(targetWindowId)

  if (typeof requestedTabId === 'number') {
    try {
      const tab = await chrome.tabs.get(requestedTabId)

      if (
        typeof tab.id === 'number'
        && typeof tab.windowId === 'number'
        && (requestedWindowId === null || tab.windowId === requestedWindowId)
      ) {
        return tab
      }
    } catch {
      // Fall back to the global active tab lookup when the popup target is unavailable.
    }
  }

  return getActivePopupTab()
}

async function getPopupPageState(tabId: number) {
  try {
    const response = await chrome.tabs.sendMessage(tabId, {
      extensionId: RELEASE_EXTENSION_ID,
      type: SUPPORT_GET_POPUP_STATE_MESSAGE_TYPE,
    }) as PopupPageState | null

    return response?.ok ? response : null
  } catch {
    return null
  }
}

export async function getPopupState(request: PopupStateRequest = {}) {
  await ensureEnabledByUserLoaded()
  await ensureRunnerTabsLoaded()
  await ensureReconnectOnSessionExpiredLoaded()
  await ensureWorldPlayersLoaded()

  const tab = await getRequestedPopupTab(request)

  if (!tab || typeof tab.id !== 'number' || typeof tab.windowId !== 'number') {
    return {
      ok: true,
      type: GET_POPUP_STATE_MESSAGE_TYPE,
      supported: false,
      reason: 'NO_ACTIVE_TAB',
    }
  }

  const tabUrl = getTabUrl(tab)
  const isSupported = isTribalWarsUrl(tabUrl)
  const currentRunner = getRunnerForTab(tab.id, tab.windowId)
  const pageState = isSupported
    ? await getPopupPageState(tab.id)
    : null
  const urlParams = tabUrl ? getParamsUrl(tabUrl) : {}
  const fallbackContext = urlParams.isInLogin
    ? 'LOGIN'
    : urlParams.isInGame
      ? 'GAME'
      : null
  const runnerWorldPlayer = currentRunner
    ? getWorldPlayerByScopeKey(currentRunner.scopeKey)
    : null
  const world = pageState?.world ?? currentRunner?.world ?? getWorldFromUrl(tabUrl) ?? null
  const t = pageState?.t ?? (currentRunner?.tabId === tab.id && currentRunner?.windowId === tab.windowId
    ? currentRunner?.t ?? null
    : urlParams.t ?? null)
  const playerId = pageState?.playerId ?? runnerWorldPlayer?.playerId ?? null
  const worldPlayer = getWorldPlayer(
    world,
    playerId,
  )
  const license = await runtimeLicenseState(worldPlayer)

  return {
    ok: true,
    type: GET_POPUP_STATE_MESSAGE_TYPE,
    supported: isSupported,
    tabId: tab.id,
    windowId: tab.windowId,
    title: tab.title || null,
    url: tabUrl,
    context: pageState?.context ?? fallbackContext,
    world,
    t,
    playerId,
    playerName: pageState?.playerName ?? runnerWorldPlayer?.playerName ?? null,
    features: (pageState?.features ?? null) as FeaturesMap | null,
    points: normalizeNumberish(pageState?.points),
    rank: normalizeNumberish(pageState?.rank),
    villages: normalizeNumberish(pageState?.villages),
    dateStarted: normalizeNumberish(worldPlayer?.dateStarted ?? pageState?.dateStarted ?? null),
    avatarUrl: worldPlayer?.avatarUrl ?? null,
    avatarUpdatedAt: worldPlayer?.avatarUpdatedAt ?? null,
    enabledByUser: world && typeof playerId === 'number'
      ? getPlayerEnabledByUser(world, playerId)
      : null,
    isBotProtected: pageState?.isBotProtected === true,
    reconnectOnSessionExpired: world && typeof playerId === 'number'
      ? getPlayerReconnectOnSessionExpired(world, playerId)
      : null,
    isTryConfirm: pageState?.isTryConfirm === true || urlParams.isTryConfirm === true,
    active: Boolean(
      currentRunner
      && currentRunner.tabId === tab.id
      && currentRunner.windowId === tab.windowId
    ),
    ready: isSupported,
    license,
  }
}
