/// <reference types="chrome" />

import { getParamsUrl } from '@toolkit-tw-bot/core'
import { extensionId as RELEASE_EXTENSION_ID } from '@toolkit-tw-bot/release'
import { type FeaturesMap, type SWMessage } from '../../types'
import { SUPPORT_GET_POPUP_STATE_MESSAGE_TYPE } from '../../content-scripts/vanilla/isolated/top/idle/support/message-types'
import { ensureEnabledByUserLoaded } from '../enabled-by-user'
import { GET_POPUP_STATE_MESSAGE_TYPE } from '../message/types'
import { normalizeNumber } from '../normalize'
import {
  ensurePreparedContextLoaded,
  getTabContext,
  getTabUrl,
  getWorldFromUrl,
  isTribalWarsUrl,
} from '../prepared-context'
import {
  ensureReconnectOnSessionExpiredLoaded,
} from '../reconnect-on-session-expired'
import { ensureRunnerTabsLoaded, getRunnerForTab } from '../runner-tabs'
import { evaluateWorldPlayerState } from '../resolved-state'
import {
  ensureWorldPlayersLoaded,
  getWorldPlayerByScopeKey,
} from '../world-players'
import { getLicenseDueAt, getLicenseTokenExpiresAt } from '../world-players/license'
import { hasErrorAlarmForTab } from '../prepared-context/error-tabId'

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
  updatedAt?: string | null
  isBotProtected?: boolean
  isConnectServerError?: boolean
  isNetError?: boolean
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
  await ensurePreparedContextLoaded()
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
  const tabContext = isSupported
    ? getTabContext(tab.id)
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
  const world = pageState?.world
    ?? tabContext?.world
    ?? currentRunner?.world
    ?? getWorldFromUrl(tabUrl)
    ?? null
  const t = pageState?.t
    ?? tabContext?.t
    ?? (currentRunner?.tabId === tab.id && currentRunner?.windowId === tab.windowId
      ? currentRunner?.t ?? null
      : urlParams.t ?? null)
  const playerId = pageState?.playerId
    ?? tabContext?.playerId
    ?? runnerWorldPlayer?.playerId
    ?? null
  const evaluatedState = await evaluateWorldPlayerState({
    scopeKey: currentRunner?.scopeKey ?? tabContext?.scopeKey ?? null,
    world,
    t,
    playerId,
    playerName: pageState?.playerName ?? tabContext?.playerName ?? runnerWorldPlayer?.playerName ?? null,
    worldPlayer: runnerWorldPlayer,
  })
  const worldPlayer = evaluatedState.worldPlayer
  const isNetError = await hasErrorAlarmForTab(tab.id)

  return {
    ok: true,
    type: GET_POPUP_STATE_MESSAGE_TYPE,
    supported: isSupported,
    tabId: tab.id,
    windowId: tab.windowId,
    title: tab.title || null,
    url: tabUrl,
    context: pageState?.context ?? tabContext?.context ?? fallbackContext,
    world: evaluatedState.world,
    t: evaluatedState.t,
    playerId: evaluatedState.playerId,
    playerName: evaluatedState.playerName,
    features: (pageState?.features ?? tabContext?.features ?? null) as FeaturesMap | null,
    points: normalizeNumberish(tabContext?.points ?? pageState?.points),
    rank: normalizeNumberish(tabContext?.rank ?? pageState?.rank),
    villages: normalizeNumberish(tabContext?.villages ?? pageState?.villages),
    dateStarted: normalizeNumberish(worldPlayer?.dateStarted ?? tabContext?.dateStarted ?? pageState?.dateStarted ?? null),
    updatedAt: tabContext?.updatedAt ?? null,
    avatarUrl: worldPlayer?.avatarUrl ?? null,
    avatarUpdatedAt: worldPlayer?.avatarUpdatedAt ?? null,
    licenseDueAt: worldPlayer?.license ? getLicenseDueAt(worldPlayer.license) : null,
    tokenExpiresAt: worldPlayer?.license ? getLicenseTokenExpiresAt(worldPlayer.license) : null,
    enabledByUser: evaluatedState.enabledByUser,
    isBotProtected: pageState?.isBotProtected === true || tabContext?.isBotProtected === true,
    isConnectServerError: pageState?.isConnectServerError === true || tabContext?.isConnectServerError === true,
    reconnectOnSessionExpired: evaluatedState.reconnectOnSessionExpired,
    nextPostLicenseButtonAt: worldPlayer?.license.nextPostLicenseButtonAt ?? null,
    isNetError,
    isTryConfirm: pageState?.isTryConfirm === true || tabContext?.isTryConfirm === true || urlParams.isTryConfirm === true,
    active: Boolean(
      currentRunner
      && currentRunner.tabId === tab.id
      && currentRunner.windowId === tab.windowId
    ),
    ready: isSupported,
    license: evaluatedState.license,
  }
}
